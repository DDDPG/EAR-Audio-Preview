import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { syntheticCases, realCases, realChannels, signal, shift, rng } from '../corpus.mjs';
import * as production from '../operator.mjs';
import { upstream } from '../vendor/loader.mjs';
const home=import.meta.dirname,root=path.resolve(home,'..');
const protocol=JSON.parse(fs.readFileSync(path.join(home,'protocol.json')));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const write=(f,x)=>fs.writeFileSync(path.join(home,f),JSON.stringify(x,null,2));
const read=f=>JSON.parse(fs.readFileSync(path.join(home,f)));
const frozenNames=['operator.mjs','fft.mjs','corpus.mjs','operator.test.mjs','review-regressions.test.mjs','protocol.json','evaluate.mjs','confirm.mjs','timing.mjs','verify.mjs','vendor/audioscope-compareMath.ts','vendor/audioscope-compare-math.test.mts'];
function checkFrozen() {
  const m=read('manifest.json');
  assert.equal(hash(path.join(home,'protocol.json')),m.protocolSha256);
  for(const [f,h]of Object.entries(m.frozen)) assert.equal(hash(path.join(root,f)),h,f);
  for(const [f,h]of Object.entries(m.audio)) assert.equal(hash(path.join(root,'local-audio',f)),h,f);
  for(const [f,h]of Object.entries(m.generated)) assert.equal(hash(path.join(home,'snapshots',f)),h,f);
}
function replace(s,a,b) {assert.equal(s.split(a).length,2,`Expected unique source anchor: ${a.slice(0,80)}`);return s.replace(a,b);}
const downmix=`  const mix = channels => {
    const out = new Float32Array(channels[0].length), weight = 1 / channels.length;
    for (const channel of channels) for (let i=0;i<out.length;i++) out[i] += channel[i] * weight;
    return out;
  };
  const a = mix(aChannels), b = mix(bChannels);
  let bestPower = Math.min(energy(a,0,available,32),energy(b,0,available,32));
  if (bestPower < 1e-12) bestPower = Math.min(energy(a,0,available),energy(b,0,available));
  if (bestPower < 1e-12) return rejected('silent-or-constant');
`;
if(process.argv[2]==='prepare') {
  fs.mkdirSync(path.join(home,'snapshots'),{recursive:true});
  assert.ok(!fs.existsSync(path.join(home,'manifest.json')),'Manifest already frozen; do not overwrite');
  const source=fs.readFileSync(path.join(root,'operator.mjs'),'utf8');
  fs.copyFileSync(path.join(root,'fft.mjs'),path.join(home,'snapshots/fft.mjs'));
  const generated={};
  for(let mask=0;mask<16;mask++) {
    let s=source;
    if(!(mask&1)) {
      const first=s.indexOf('  // Never average L/R:'),last=s.indexOf('  const factor =',first);
      assert.ok(first>=0&&last>first);s=s.slice(0,first)+downmix+s.slice(last);
    }
    if(!(mask&2)) {
      const first=s.indexOf('  let maxPower = 0;'),last=s.indexOf('  for (let i = 0; i < n; i++) {',first);
      assert.ok(first>=0&&last>first);s=s.slice(0,first)+s.slice(last);
      s=replace(s,'    const weight = Math.sqrt(Math.max(floor, Math.hypot(r, v)));\n    ar[i] = r / weight; ai[i] = v / weight;','    ar[i] = r; ai[i] = v;');
    }
    if(!(mask&4)) s=replace(s,'return peaks.slice(0, 3);','return peaks.slice(0, 1);');
    if(!(mask&8)) {
      const first=s.indexOf('  const anchorLength ='),last=s.indexOf('  const count =',first);
      assert.ok(first>=0&&last>first);s=s.slice(0,first)+'  const windowLength = available, start = 0;\n'+s.slice(last);
    }
    const f=`mask-${mask}.mjs`;fs.writeFileSync(path.join(home,'snapshots',f),s);generated[f]=hash(path.join(home,'snapshots',f));
  }
  assert.equal(fs.readFileSync(path.join(home,'snapshots/mask-15.mjs'),'utf8'),source);
  let s=replace(source,'const at = lag < 0 ? n + lag : lag, v = Math.abs(ar[at]);','const at = lag < 0 ? n + lag : lag, v = ar[at];');
  s=replace(s,'v >= Math.abs(ar[(at + n - 1) % n]) && v >= Math.abs(ar[(at + 1) % n])','v >= ar[(at + n - 1) % n] && v >= ar[(at + 1) % n]');
  s=replace(s,'score = Math.abs(rho);','score = rho;');
  s=replace(s,'polarity: best.rho < 0 ? -1 : 1','polarity: 1');
  fs.writeFileSync(path.join(home,'snapshots/no-polarity.mjs'),s);generated['no-polarity.mjs']=hash(path.join(home,'snapshots/no-polarity.mjs'));generated['fft.mjs']=hash(path.join(home,'snapshots/fft.mjs'));
  write('manifest.json',{created:new Date().toISOString(),protocolSha256:hash(path.join(home,'protocol.json')),frozen:Object.fromEntries(frozenNames.map(f=>[f,hash(path.join(root,f))])),audio:Object.fromEntries(['A','B','C','D'].map(f=>[f+'.f32',hash(path.join(root,'local-audio',f+'.f32'))])),generated});
  console.log('Frozen protocol, 16 factorial variants, polarity control, source and audio hashes');process.exit();
}
checkFrozen();
const variants={};
for(let mask=0;mask<16;mask++)variants[mask]=(await import(path.join(home,`snapshots/mask-${mask}.mjs`))).estimateAlignment;
variants.noPolarity=(await import(path.join(home,'snapshots/no-polarity.mjs'))).estimateAlignment;
variants.audioscope=(a,b,rate)=>({...upstream.estimateOffset(upstream.downmixToMono(a,a[0].length),upstream.downmixToMono(b,b[0].length),rate),accepted:true});
function* diagnostics() {
  for(const rate of protocol.diagnosticRates)for(const seed of protocol.diagnosticSeeds) {
    for(const family of protocol.diagnosticFamilies) {
      let a,delay=1105;
      if(family==='dominant-tone') {
        const x=signal(rate*6,rate,seed);for(let i=0;i<x.length;i++)x[i]+=.8*Math.sin(2*Math.PI*200*i/rate);a=[x];
      }else if(family==='sparse-leading') {
        const x=new Float32Array(rate*3),random=rng(seed);for(let i=rate*2+1;i<x.length;i+=32)x[i]=random()*.5;a=[x];
      }else if(family==='quiet-tail') {
        const x=signal(rate,rate,seed);for(let i=0;i<x.length;i++)x[i]*=1e-8;const count=Math.floor(rate/24);x.set(signal(count,rate,seed+1),rate-count);a=[x];delay=53;
      }else {const x=signal(rate*3,rate,seed);a=[x,Float32Array.from(x,v=>-v)];}
      yield {family,rate,seed,a,b:a.map(x=>shift(x,delay,.7)),expected:delay,tolerance:1,positive:true};
    }
  }
}
if(process.argv[2]==='accuracy') {
  const rows=[];let equivalent=0;
  const suites=[['historical',syntheticCases(protocol.historicalSeeds)],['new',syntheticCases(protocol.newSeeds)],['real',realCases()],['diagnostic',diagnostics()]];
  for(const [suite,cases]of suites)for(const c of cases) {
    const row={suite,family:c.family,seed:c.seed,rate:c.rate,positive:c.positive,expected:c.expected,tolerance:c.tolerance,results:{}};
    for(const [key,fn]of Object.entries(variants)) {
      const r=fn(c.a,c.b,c.rate);assert.ok(Number.isFinite(r.confidence));
      row.results[key]={...r,errorSamples:c.positive?Math.abs(r.offsetSamples-c.expected):null,success:c.positive?r.accepted&&Math.abs(r.offsetSamples-c.expected)<=c.tolerance:!r.accepted};
    }
    assert.equal(JSON.stringify(variants[15](c.a,c.b,c.rate)),JSON.stringify(production.estimateAlignment(c.a,c.b,c.rate)));equivalent++;
    rows.push(row);if(rows.length%26===0)console.log('accuracy cases',rows.length,'x',Object.keys(variants).length,'variants');
  }
  checkFrozen();write('accuracy.json',{timestamp:new Date().toISOString(),equivalentFullCases:equivalent,rows});console.log('Accuracy complete:',rows.length,'cases');
}
const median=x=>{const s=[...x].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
if(process.argv[2]==='bench') {
  const keys=[...protocol.speed.masks.map(String),'audioscope'],rows=[];
  for(let pass=1;pass<=protocol.speed.passes;pass++)for(const file of protocol.speed.files)for(const seconds of protocol.speed.seconds) {
    const a=realChannels(file).map(x=>x.slice(0,seconds*48000)),b=a.map(x=>shift(x,523,.7));
    for(let i=0;i<protocol.speed.warmups;i++)for(const key of keys)variants[key](a,b,48000);
    const samples=Object.fromEntries(keys.map(k=>[k,[]])),blocks=[];
    for(let i=0;i<protocol.speed.repeats;i++) {
      global.gc?.();let order=keys.map((_,j)=>keys[(i+j+pass)%keys.length]);if(i%2)order.reverse();
      const block={};for(const key of order) {const t=performance.now(),r=variants[key](a,b,48000);const ms=performance.now()-t;assert.ok(r.accepted&&r.offsetSamples===523,`${key} incorrect timing case`);samples[key].push(ms);block[key]=ms;}
      blocks.push(block);
    }
    rows.push({pass,file,seconds,samples,blocks,medianMs:Object.fromEntries(keys.map(k=>[k,median(samples[k])]))});
    write('timing.json',{timestamp:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,protocol:protocol.speed,rows});
    console.log('timing',pass,file,seconds,JSON.stringify(rows.at(-1).medianMs));
  }
  checkFrozen();console.log('Timing complete');
}
if(process.argv[2]==='report') {
  const {rows}=read('accuracy.json'),timing=read('timing.json');
  const summarize=rs=>Object.fromEntries(Object.keys(variants).map(key=>{const pos=rs.filter(r=>r.positive),neg=rs.filter(r=>!r.positive);return[key,{positiveTotal:pos.length,positiveSuccess:pos.filter(r=>r.results[key].success).length,positiveRejected:pos.filter(r=>!r.results[key].accepted).length,positiveWrongAccepted:pos.filter(r=>r.results[key].accepted&&!r.results[key].success).length,negativeTotal:neg.length,hasRejectionPolicy:key!=='audioscope',negativeFalseAccepted:key==='audioscope'?null:neg.filter(r=>r.results[key].accepted).length,negativeEstimatesReturned:key==='audioscope'?neg.length:null}];}));
  const accuracy={all:summarize(rows),bySuite:Object.fromEntries([...new Set(rows.map(r=>r.suite))].map(s=>[s,summarize(rows.filter(r=>r.suite===s))])),byFamily:Object.fromEntries([...new Set(rows.map(r=>r.family))].map(s=>[s,summarize(rows.filter(r=>r.family===s))]))};
  const factors=protocol.factors.map((name,bit)=>{
    const off=15^(1<<bit),changes=rows.filter(r=>r.results[15].success!==r.results[off].success).map(r=>({suite:r.suite,family:r.family,seed:r.seed,rate:r.rate,positive:r.positive,full:r.results[15],off:r.results[off]}));
    const factorialEdges=[];for(let mask=0;mask<16;mask++)if(!(mask&(1<<bit))) {
      const on=mask|(1<<bit),gains=rows.filter(r=>r.results[on].success&&!r.results[mask].success).length,losses=rows.filter(r=>!r.results[on].success&&r.results[mask].success).length;
      factorialEdges.push({off:mask,on,gains,losses});
    }
    const speed={};for(const seconds of protocol.speed.seconds) {
      const selected=timing.rows.filter(r=>r.seconds===seconds);
      speed[seconds]={medianOffOverFull:median(selected.map(r=>r.medianMs[off]/r.medianMs[15])),minOffOverFull:Math.min(...selected.map(r=>r.medianMs[off]/r.medianMs[15])),maxOffOverFull:Math.max(...selected.map(r=>r.medianMs[off]/r.medianMs[15])),byPass:[1,2,3].map(pass=>({pass,medianOffOverFull:median(selected.filter(r=>r.pass===pass).map(r=>r.medianMs[off]/r.medianMs[15]))})),byFile:protocol.speed.files.map(file=>({file,fullMs:median(selected.filter(r=>r.file===file).map(r=>r.medianMs[15])),offMs:median(selected.filter(r=>r.file===file).map(r=>r.medianMs[off])),ratio:median(selected.filter(r=>r.file===file).map(r=>r.medianMs[off]/r.medianMs[15]))})),pairedBlockRatios:selected.flatMap(r=>r.blocks.map(b=>b[off]/b[15]))};
    }
    return {name,offMask:off,full:accuracy.all[15],off:accuracy.all[off],changes,factorialEdges,speed};
  });
  const pos=rows.filter(r=>r.positive);
  const indexSet=key=>new Set(pos.map((r,i)=>r.results[key].success?-1:i).filter(i=>i>=0));
  const competitorFailures=indexSet('audioscope'),channelFailures=indexSet('14'),polarityFailures=indexSet('noPolarity'),union=new Set([...channelFailures,...polarityFailures]);
  const attribution={competitorPositiveFailures:competitorFailures.size,channelSelectionRecovers:channelFailures.size,polaritySupportRecovers:polarityFailures.size,overlap:[...channelFailures].filter(i=>polarityFailures.has(i)).length,allCompetitorPositiveFailuresAccountedFor:competitorFailures.size===union.size&&[...union].every(i=>competitorFailures.has(i)),ordinaryPositivesBothCorrect:pos.filter(r=>r.results[15].success&&r.results.audioscope.success).length};
  const summary={date:protocol.date,protocolSha256:hash(path.join(home,'protocol.json')),accuracy,factors,attribution,fullEquivalenceCases:read('accuracy.json').equivalentFullCases,limitations:protocol.constraints};write('summary.json',summary);
  console.log(JSON.stringify({all:accuracy.all,factors:factors.map(f=>({name:f.name,changes:f.changes.length,edges:f.factorialEdges,speed:Object.fromEntries(Object.entries(f.speed).map(([k,v])=>[k,{ratio:v.medianOffOverFull,passes:v.byPass,files:v.byFile}]))}))},null,2));
}
if(process.argv[2]==='verify') {
  const a=read('accuracy.json'),t=read('timing.json'),s=read('summary.json');
  assert.equal(a.equivalentFullCases,a.rows.length);assert.equal(t.rows.length,3*4*2);
  for(const row of t.rows)for(const samples of Object.values(row.samples))assert.equal(samples.length,21);
  assert.equal(s.protocolSha256,hash(path.join(home,'protocol.json')));checkFrozen();
  for(const key of Object.keys(variants)) {
    const positives=a.rows.filter(r=>r.positive),negatives=a.rows.filter(r=>!r.positive);
    assert.equal(s.accuracy.all[key].positiveSuccess,positives.filter(r=>r.results[key].accepted&&r.results[key].errorSamples<=r.tolerance).length);
    if(key!=='audioscope')assert.equal(s.accuracy.all[key].negativeFalseAccepted,negatives.filter(r=>r.results[key].accepted).length);
  }
  const interaction=read('interaction.json'),counter=read('work-counts.json');assert.equal(interaction.rows.length,16);assert.equal(interaction.protocolSha256,hash(path.join(home,'interaction-protocol.json')));
  for(const row of interaction.rows)for(const samples of Object.values(row.samples))assert.equal(samples.length,21);
  for(const [f,h]of Object.entries(counter.generated))assert.equal(hash(path.join(home,'snapshots',f)),h);
  assert.ok(s.attribution.allCompetitorPositiveFailuresAccountedFor);
  write('verification.json',{passed:true,timestamp:new Date().toISOString(),accuracyCases:a.rows.length,variants:Object.keys(variants).length,fullEquivalentCases:a.equivalentFullCases,timingBlocks:t.rows.reduce((n,r)=>n+r.blocks.length,0),interactionRows:interaction.rows.length,postHocInstrumentedOutputsEqual:counter.all40OutputsEqual,allFrozenSourcesAndAudioUnchanged:true,runnerSha256:hash(path.join(home,'run.mjs')),summarySha256:hash(path.join(home,'summary.json')),accuracySha256:hash(path.join(home,'accuracy.json')),timingSha256:hash(path.join(home,'timing.json')),interactionSha256:hash(path.join(home,'interaction.json')),workCountsSha256:hash(path.join(home,'work-counts.json'))});console.log('Ablation verification passed');
}

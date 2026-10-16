import fs from 'node:fs';
import { syntheticCases, realChannels } from './corpus.mjs';
import { estimateAlignment, compareResidual } from './operator.mjs';
import { upstream } from './vendor/loader.mjs';
import crypto from 'node:crypto';
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url))).digest('hex');
const seeds=[32452843,49979687]; // New validation inputs, fixed before this run.
const results=[];
for(const c of syntheticCases(seeds)){
 const r=estimateAlignment(c.a,c.b,c.rate);
 results.push({family:c.family,seed:c.seed,rate:c.rate,positive:c.positive,expected:c.expected,...r,pass:c.positive?r.accepted&&Math.abs(r.offsetSamples-c.expected)<=c.tolerance:!r.accepted});
}
const recordings=['A','B','C','D'].map(realChannels);
for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
 const r=estimateAlignment(recordings[i],recordings[j],48000);results.push({family:'real-unrelated',pair:[i,j],...r,pass:!r.accepted});
}
const gainCases=[];
for(const gain of [.25,2,-.5])for(const side of [false,true]){
 const a=recordings[0].map(c=>c.slice(0,48000*3));if(side)a[1]=Float32Array.from(a[0],x=>-x);
 const b=a.map(c=>{const out=new Float32Array(c.length+613);for(let i=0;i<c.length;i++)out[i+613]=c[i]*gain;return out;});
 const candidate=estimateAlignment(a,b,48000),stats=compareResidual(a,b,48000,candidate.offsetSamples);
 const ma=upstream.downmixToMono(a,a[0].length),mb=upstream.downmixToMono(b,b[0].length),base=upstream.estimateOffset(ma,mb,48000);
 const length=Math.max(ma.length,mb.length-base.offsetSamples),aligned=upstream.alignChannel(mb,base.offsetSamples,length),baselineGain=upstream.fitGain(upstream.padChannel(ma,length),aligned);
 gainCases.push({gain,side,expectedGain:1/gain,candidate:{...candidate,...stats},baseline:{...base,gain:baselineGain},pass:candidate.accepted&&candidate.offsetSamples===613&&Math.abs(stats.gain-1/gain)<1e-5&&stats.nullDepthDb>100});
}
const out={timestamp:new Date().toISOString(),operatorSha256:hash('./operator.mjs'),seedProtocol:{seeds,tolerance:'same frozen corpus family tolerances',realUnrelatedPairs:6,gainCases:6},results,gainCases,passed:results.every(x=>x.pass)&&gainCases.every(x=>x.pass)};
fs.writeFileSync(new URL('./results/confirmation.json',import.meta.url),JSON.stringify(out,(_,x)=>x===Infinity?'Infinity':x,2));console.log(JSON.stringify({passed:out.passed,total:results.length,failures:results.filter(x=>!x.pass),gainFailures:gainCases.filter(x=>!x.pass)},null,2));
if(!out.passed)process.exitCode=1;

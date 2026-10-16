/** Compare the shipped TS port against the frozen research checkout, without copying the lab into the product. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=path.resolve(process.argv[2] || '../alignment-dsp-lab/EAR-Audio-Preview/dsp-lab');
const out=process.argv[3];
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
const fftUrl=url(compile(path.join(root,'src/shared/alignmentFft.ts')));
const source=compile(path.join(root,'src/shared/audioAlignment.ts')).replace('"./alignmentFft"',JSON.stringify(fftUrl));
assert.ok(source.includes(fftUrl));
const candidate=await import(url(source)),baseline=await import(pathToFileURL(path.join(lab,'operator.mjs')));
const corpus=await import(pathToFileURL(path.join(lab,'corpus.mjs')));
const protocol=JSON.parse(fs.readFileSync(path.join(lab,'ablation/protocol.json')));
const cases=[...corpus.syntheticCases([...protocol.historicalSeeds,...protocol.newSeeds]),...corpus.realCases()];
for(const rate of protocol.diagnosticRates)for(const seed of protocol.diagnosticSeeds)for(const family of protocol.diagnosticFamilies){
  let a,delay=1105;
  if(family==='dominant-tone'){const x=corpus.signal(rate*6,rate,seed);for(let i=0;i<x.length;i++)x[i]+=.8*Math.sin(2*Math.PI*200*i/rate);a=[x];}
  else if(family==='sparse-leading'){const x=new Float32Array(rate*3),random=corpus.rng(seed);for(let i=rate*2+1;i<x.length;i+=32)x[i]=random()*.5;a=[x];}
  else if(family==='quiet-tail'){const x=corpus.signal(rate,rate,seed);for(let i=0;i<x.length;i++)x[i]*=1e-8;const count=Math.floor(rate/24);x.set(corpus.signal(count,rate,seed+1),rate-count);a=[x];delay=53;}
  else{const x=corpus.signal(rate*3,rate,seed);a=[x,Float32Array.from(x,v=>-v)];}
  cases.push({family,seed,rate,a,b:a.map(x=>corpus.shift(x,delay,.7))});
}
const expected=JSON.parse(fs.readFileSync(path.join(lab,'ablation/accuracy.json'))).rows;
let count=0;const digest=crypto.createHash('sha256');
for(const c of cases){
  const actual=candidate.estimateAlignment(c.a,c.b,c.rate),original=baseline.estimateAlignment(c.a,c.b,c.rate);
  assert.deepEqual(actual,original,`${c.family} ${c.seed} ${c.rate}`);
  const saved=expected.find(r=>r.family===c.family&&r.seed===c.seed&&r.rate===c.rate).results['15'];
  for(const key of ['accepted','offsetSamples','polarity','confidence','reason'])assert.equal(actual[key],saved[key]);
  const residual=candidate.compareResidual(c.a,c.b,c.rate,actual.offsetSamples);
  assert.deepEqual(residual,baseline.compareResidual(c.a,c.b,c.rate,actual.offsetSamples),'residual '+c.family);
  digest.update(JSON.stringify([actual,residual]));count++;
}
assert.equal(count,318);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={passed:true,cases:count,exactAlignmentAndResidual:true,comparedWithSavedAblation:true,outputSha256:digest.digest('hex'),researchOperatorSha256:hash(path.join(lab,'operator.mjs')),typescriptOperatorSha256:hash(path.join(root,'src/shared/audioAlignment.ts')),timestamp:new Date().toISOString()};
if(out)fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));

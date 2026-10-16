import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { upstream } from './vendor/loader.mjs';
import { estimateAlignment } from './operator.mjs';
import { realChannels, shift } from './corpus.mjs';
const protocol=JSON.parse(fs.readFileSync(new URL('./protocol.json',import.meta.url)));
const functions={audioscope:(a,b)=>upstream.estimateOffset(upstream.downmixToMono(a,a[0].length),upstream.downmixToMono(b,b[0].length),48000),candidate:(a,b)=>estimateAlignment(a,b,48000)};
const stats=x=>{const s=[...x].sort((a,b)=>a-b);return{medianMs:s[Math.floor(s.length/2)],minMs:s[0],maxMs:s.at(-1),samplesMs:x}};
const rows=[];
for(const file of ['A','B','C','D'])for(const seconds of [3,30]){
 const a=realChannels(file).map(c=>c.slice(0,seconds*48000)),b=a.map(c=>shift(c,523,.7));
 for(let i=0;i<protocol.timing.warmups;i++)for(const f of Object.values(functions))f(a,b);
 const samples={audioscope:[],candidate:[]};let allAccurate=true;
 for(let i=0;i<protocol.timing.repeats;i++)for(const key of i%2?['candidate','audioscope']:['audioscope','candidate']){
  global.gc?.();const t=performance.now(),r=functions[key](a,b);samples[key].push(performance.now()-t);if(Math.abs(r.offsetSamples-523)>1||(key==='candidate'&&!r.accepted))allAccurate=false;
 }
 const result={file,seconds,allAccurate,audioscope:stats(samples.audioscope),candidate:stats(samples.candidate)};result.speedup=result.audioscope.medianMs/result.candidate.medianMs;rows.push(result);console.log(file,seconds,result.speedup.toFixed(2),result.audioscope.medianMs.toFixed(2),result.candidate.medianMs.toFixed(2),allAccurate);
}
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url))).digest('hex');
fs.writeFileSync(new URL('./results/timing.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,arch:os.arch(),protocolSha256:hash('./protocol.json'),operatorSha256:hash('./operator.mjs'),baselineSha256:hash('./vendor/audioscope-compareMath.ts'),scope:protocol.timing,rows},null,2));

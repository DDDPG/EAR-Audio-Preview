import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {realChannels,shift} from '../corpus.mjs';
const p=JSON.parse(fs.readFileSync(new URL('./interaction-protocol.json',import.meta.url)));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(fs.readFileSync(new URL('./manifest.json',import.meta.url)));
const funcs={},rows=[];
for(const mask of p.masks) {
  const f=new URL(`./snapshots/mask-${mask}.mjs`,import.meta.url);
  assert.equal(hash(fs.readFileSync(f)),manifest.generated[`mask-${mask}.mjs`]);
  funcs[mask]=(await import(f)).estimateAlignment;
}
const median=x=>[...x].sort((a,b)=>a-b)[Math.floor(x.length/2)];
for(let pass=1;pass<=p.passes;pass++)for(const file of p.files)for(const seconds of p.seconds) {
  const a=realChannels(file).map(x=>x.slice(0,seconds*48000)),b=a.map(x=>shift(x,523,.7));
  for(let i=0;i<p.warmups;i++)for(const mask of p.masks)funcs[mask](a,b,48000);
  const samples=Object.fromEntries(p.masks.map(x=>[x,[]]));
  for(let i=0;i<p.repeats;i++) {
    global.gc?.();let order=p.masks.map((_,j)=>p.masks[(i+j+pass)%p.masks.length]);if(i%2)order.reverse();
    for(const mask of order){const t=performance.now(),r=funcs[mask](a,b,48000);samples[mask].push(performance.now()-t);assert.ok(r.accepted&&r.offsetSamples===523);}
  }
  const medianMs=Object.fromEntries(p.masks.map(x=>[x,median(samples[x])]));
  rows.push({pass,file,seconds,samples,medianMs,whiteningOffOverOnWithMulti:medianMs[13]/medianMs[15],whiteningOffOverOnSingle:medianMs[9]/medianMs[11]});
  console.log(pass,file,seconds,JSON.stringify(rows.at(-1).medianMs));
}
fs.writeFileSync(new URL('./interaction.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),postHoc:true,protocolSha256:hash(fs.readFileSync(new URL('./interaction-protocol.json',import.meta.url))),rows},null,2));

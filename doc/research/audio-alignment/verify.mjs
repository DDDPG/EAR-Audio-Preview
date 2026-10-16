import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=f=>JSON.parse(fs.readFileSync(new URL(f,import.meta.url)));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url))).digest('hex');
const protocol=read('./protocol.json'),gates={};
for(const phase of ['dev','heldout','real']){
 const r=read(`./results/${phase}.json`);assert.equal(r.operatorSha256,hash('./operator.mjs'));assert.equal(r.protocolSha256,hash('./protocol.json'));assert.equal(r.baselineSha256,hash('./vendor/audioscope-compareMath.ts'));
 const positive=r.rows.filter(r=>r.positive),negative=r.rows.filter(r=>!r.positive);
 gates[phase]={positiveWithin1Sample:positive.filter(r=>r.candidate.accepted&&r.candidate.errorSamples<=1).length/positive.length,negativeFalseAccepts:negative.filter(r=>r.candidate.accepted).length};
 assert.ok(gates[phase].positiveWithin1Sample>=protocol.gates.positiveAcceptedWithin1Sample);assert.equal(gates[phase].negativeFalseAccepts,0);
}
const confirmation=read('./results/confirmation.json');assert.equal(confirmation.operatorSha256,hash('./operator.mjs'));assert.equal(confirmation.passed,true);
for(const file of ['timing-pass-1.json','timing.json']){
 const t=read('./results/'+file);assert.equal(t.operatorSha256,hash('./operator.mjs'));assert.equal(t.protocolSha256,hash('./protocol.json'));assert.equal(t.baselineSha256,hash('./vendor/audioscope-compareMath.ts'));assert.ok(t.rows.every(r=>r.allAccurate));
 gates[file]={minLongInputSpeedup:Math.min(...t.rows.filter(r=>r.seconds===30).map(r=>r.speedup)),maxLongInputSpeedup:Math.max(...t.rows.filter(r=>r.seconds===30).map(r=>r.speedup)),shortInputSpeedup:t.rows.filter(r=>r.seconds===3).map(r=>r.speedup)};
 assert.ok(gates[file].minLongInputSpeedup>=protocol.gates.medianSpeedupLongInputs);
}
const artifactFiles=['./protocol.json','./operator.mjs','./fft.mjs','./corpus.mjs','./evaluate.mjs','./timing.mjs','./confirm.mjs','./operator.test.mjs','./vendor/audioscope-compareMath.ts','./vendor/audioscope-compare-math.test.mts'];
fs.writeFileSync(new URL('./results/final-verification.json',import.meta.url),JSON.stringify({passed:true,timestamp:new Date().toISOString(),gates,sha256:Object.fromEntries(artifactFiles.map(f=>[f,hash(f)]))},null,2));
console.log(JSON.stringify(gates,null,2));

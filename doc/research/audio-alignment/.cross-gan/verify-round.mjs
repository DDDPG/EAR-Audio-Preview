import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),round=Number(process.argv[2]),dir=path.join(import.meta.dirname,`round_${round}`);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const frozen=JSON.parse(fs.readFileSync(new URL('./frozen.json',import.meta.url)));for(const [f,h]of Object.entries(frozen))assert.equal(hash(f),h,'Frozen input changed: '+f);
const run=(name,args)=>{const output=execFileSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:120000});fs.writeFileSync(path.join(dir,name+'.log'),output);};
run('unit',['--test','operator.test.mjs',...(fs.existsSync(path.join(root,'review-regressions.test.mjs'))?['review-regressions.test.mjs']:[])]);run('upstream',['upstream-tests.mjs']);
for(const phase of ['dev','heldout','real']){run(phase,['evaluate.mjs',phase]);const r=JSON.parse(fs.readFileSync(path.join(root,`results/${phase}.json`)));assert.ok(r.rows.filter(x=>x.positive).every(x=>x.candidate.accepted&&x.candidate.errorSamples<=1));assert.ok(r.rows.filter(x=>!x.positive).every(x=>!x.candidate.accepted));fs.copyFileSync(path.join(root,`results/${phase}.json`),path.join(dir,phase+'.json'));}
run('confirmation',['confirm.mjs']);assert.ok(JSON.parse(fs.readFileSync(path.join(root,'results/confirmation.json'))).passed);
fs.writeFileSync(path.join(dir,'verify.json'),JSON.stringify({passed:true,frozenInputsUnchanged:true,operatorSha256:hash('operator.mjs'),fftSha256:hash('fft.mjs'),checks:['original unit tests','added regressions','8 unchanged upstream tests','dev/heldout/real unchanged corpus','58 confirmation cases + 6 gain checks'],timestamp:new Date().toISOString()},null,2));
console.log('Round',round,'verification passed');

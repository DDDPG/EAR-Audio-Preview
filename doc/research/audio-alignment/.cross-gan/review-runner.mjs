import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),round=Number(process.argv[2]),phase=process.argv[3];
const dir=path.join(import.meta.dirname,`round_${round}`);fs.mkdirSync(dir,{recursive:true});
const run=(role,prompt)=>new Promise((resolve,reject)=>{
 const log=fs.openSync(path.join(dir,role+'-run.log'),'w');
 const child=spawn('codex',['exec','--ephemeral','--sandbox','read-only','-C',path.dirname(root),'-o',path.join(dir,role+'.md'),prompt],{stdio:['ignore',log,log]});
 const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(Error(role+' timed out'));},180000);
 child.on('exit',code=>{clearTimeout(timeout);fs.closeSync(log);code===0?resolve(role):reject(Error(role+' exited '+code));});
});
const shared=`Cross-GAN round ${round}. READ ONLY. Scope ONLY ${root}. Do not edit files, spawn agents, or browse. Existing tests/protocol/vendor immutable. Report at most 2 issues with exact file:line and reproducible node inline evidence. Ignore unrelated repo. Read relevant role file in /Users/lertoon/.agents/skills/cross-gan-review/agents/. No need to use any other skills. Keep response compact. Previous rounds are in ${import.meta.dirname}; don't repeat resolved findings. `;
if(phase==='find')await Promise.all(['correctness','efficiency','robustness'].map(role=>run(role,shared+`Act as cgr-${role}-finder. For efficiency only byte-identical behavior-preserving measurable wins qualify. For correctness/robustness actual reachable defect required. Review current operator.mjs/fft.mjs and lab validation harness.`)));
if(phase==='refute'){
 const findings=['correctness','efficiency','robustness'].map(role=>`\n${role}:\n`+fs.readFileSync(path.join(dir,role+'.md'),'utf8')).join('');
 await run('discriminator',shared+`Act as cgr-discriminator. You did NOT propose these findings. Default REFUTED; independently reproduce or inspect, then give CONFIRMED/REFUTED per finding, reason, minimal safe scope. Do not propose unrelated issues. Candidate reports:\n${findings}`);
}
console.log('Completed',round,phase);

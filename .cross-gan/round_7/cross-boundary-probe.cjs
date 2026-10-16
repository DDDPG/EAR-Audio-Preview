const fs = require('fs');
const vm = require('vm');
const ts = require(require('node:path').resolve(__dirname, '../../node_modules/typescript'));
const file=require('node:path').resolve(__dirname, '../../src/webview/comparison/comparisonMeasurements.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText + '\nexports.probeSamplePosition=samplePosition;';
const sandbox={exports:{},performance:{now:()=>0},setTimeout};
vm.runInNewContext(code,sandbox,{filename:file});
const {probeSamplePosition:snap,measureRms,measureResidual,commonMeasurementRange}=sandbox.exports;
const rates=[8000,11025,16000,22050,24000,32000,44100,48000,88200,96000,192000,384000];
let cases=0, fractionCases=0, failures=[];
let seed=0x173a918f;
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;}
for(const rate of rates){
  for(let i=0;i<25000;i++){
    const n=i<500?i:random();
    if(snap(n/rate,rate)!==n) failures.push({rate,n,got:snap(n/rate,rate)});
    cases++;
    for(const fraction of [0.25,0.5,1e-4]){
      const expected=n+fraction;
      const position=(expected/rate)*rate;
      if(snap(expected/rate,rate)!==position) failures.push({rate,n,fraction,got:snap(expected/rate,rate),position});
      fractionCases++;
    }
  }
}
function audio(length,rate,tailValue=1){const data=new Float32Array(length);data[length-1]=tailValue;return{sampleRate:rate,length,duration:length/rate,numberOfChannels:2,getChannelData:()=>data};}
(async()=>{
  const a=audio(44109,44100), b=audio(48010,48000);
  const range=commonMeasurementRange([a,b],{start:0,end:0});
  const rmsA=await measureRms(a,range);
  const rmsB=await measureRms(b,range);
  const mismatchedResidual=await measureResidual(a,b,range).then(()=>false,e=>/matching sample rates/.test(e.message));
  const sharedBFrames=Math.floor(snap(range.end,b.sampleRate));
  if(Math.abs(rmsA-Math.sqrt(1/a.length))>1e-15||rmsB!==0||!mismatchedResidual) failures.push({rmsA,rmsB,mismatchedResidual});
  const result={integerRoundtripCases:cases,fractionalCases:fractionCases,failed:failures.length,firstFailures:failures.slice(0,4),mixedRate:{aFrames:a.length,bFrames:b.length,sharedBFrames,rmsA,rmsB,mismatchedResidual},scope:'Actual transpiled samplePosition implementation; seeded lengths 0..2^32-1 across 12 native rates. Fractions 0.25, 0.5, 1e-4 stay strictly outside tolerance at that length limit.'};
  console.log(JSON.stringify(result,null,2));
  if(failures.length) process.exitCode=1;
})();

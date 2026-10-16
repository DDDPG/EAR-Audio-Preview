const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root='/Users/lertoon/vscProjects/EAR-Audio-Preview',req=require('node:module').createRequire(root+'/package.json'),ts=req('typescript');
function compile(file,imports=()=>({}),extra=''){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(imports,m,m.exports);return m.exports;}
const measurements=compile(root+'/src/webview/comparison/comparisonMeasurements.ts',undefined,'\nexports.probeSamplePosition = samplePosition;');
let seed=59,integerCases=0,fractionCases=0;
for(const rate of [8000,44100,48000,96000,192000]){
 for(let i=0;i<20000;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;const n=(seed>>>0)%2147483647;assert.equal(measurements.probeSamplePosition(n/rate,rate),n);integerCases++;}
 for(const [n,fraction] of [[7,1e-7],[27,0.25],[1000000,1e-5],[2000000000,1e-3]]){assert.equal(Math.ceil(measurements.probeSamplePosition((n+fraction)/rate,rate)),n+1);assert.equal(Math.floor(measurements.probeSamplePosition((n-fraction)/rate,rate)),n-1);fractionCases+=2;}
}
const App=compile(root+'/src/webview/comparison/comparisonApp.ts',name=>name==='./comparisonMeasurements'?measurements:{}).ComparisonApp;
function buffer(value){const data=new Float32Array(480).fill(value);return{sampleRate:48000,numberOfChannels:2,length:data.length,duration:data.length/48000,getChannelData:()=>data};}
function appFor(values){const app=Object.create(App.prototype);const tracks=values.map((v,i)=>({id:String(i),name:String(i),revision:1,buffer:buffer(v)}));app.session={activeTracks:tracks,selection:{start:0,end:0},focus:tracks[0],playbackGain:()=>1,setPlaybackGains:g=>{app.gains=g;}};app._disposed=false;app._measurementBusy=false;app._measurementDialog=null;app.messages=[];app.status=text=>app.messages.push(text);return app;}
(async()=>{
 const empty=appFor([]);await empty.runMeasurement(false);assert.equal(empty._measurementBusy,false);assert.equal(empty.messages.length,0);
 const missingFocus=appFor([.5,.25]);missingFocus.session.focus=undefined;await missingFocus.runMeasurement(true);assert.equal(missingFocus._measurementBusy,false);assert.equal(missingFocus.messages.length,0);
 const silence=appFor([0,.25]);await silence.runMeasurement(false);assert.equal(silence._measurementBusy,false);assert.match(silence.messages.at(-1),/non-silent/);assert.equal(silence.gains,undefined);
 const invalid=appFor([.5,.25]);invalid.session.selection={start:1,end:2};await invalid.runMeasurement(false);assert.equal(invalid._measurementBusy,false);assert.match(invalid.messages.at(-1),/shared/);
 const cancelled=appFor([.5,.25]);const pending=cancelled.runMeasurement(false);cancelled.session.selection={start:.001,end:.005};await pending;assert.equal(cancelled._measurementBusy,false);assert.match(cancelled.messages.at(-1),/cancelled/);assert.equal(cancelled.gains,undefined);
 const success=appFor([.5,.25]);await success.runMeasurement(false);assert.equal(success._measurementBusy,false);assert.deepEqual([...success.gains],[['0',.5],['1',1]]);
 console.log(JSON.stringify({integerRoundTrips:integerCases,fractionalBoundaryChecks:fractionCases,terminalStates:['insufficient tracks','missing residual focus','silent input error','invalid range error','cancelled dependency','successful RMS commit'],allPassed:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

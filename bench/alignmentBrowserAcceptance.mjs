/** Real production bundle + Blob workers + Web Audio + exported WAV samples.
 * Set EAR_PLAYWRIGHT_MODULE to an installed Playwright package when it is not locally available.
 * VS Code file/save dialogs are mocked; host protocol is unchanged and separately unit-tested.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.EAR_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2] || '/tmp/ear-alignment-acceptance');fs.mkdirSync(output,{recursive:true});
let state=7,low=0;
const signal=Float32Array.from({length:144000},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;low=.85*low+.15*(state/4294967296-.5);return low;});
const tone=Float32Array.from({length:144000},(_,i)=>.3*Math.sin(2*Math.PI*200*i/48000));
const shift=(x,d,g)=>Float32Array.from({length:x.length+d},(_,i)=>(x[i-d]??0)*g);
function wav(x,rate=48000){
  const data=Buffer.alloc(44+x.length*8);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(3,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*8,28);data.writeUInt16LE(8,32);data.writeUInt16LE(32,34);data.write('data',36);data.writeUInt32LE(x.length*8,40);
  for(let i=0;i<x.length;i++){data.writeFloatLE(x[i],44+i*8);data.writeFloatLE(-x[i],48+i*8);}return data;
}
const fixtures=new Map([
  ['reference.wav',wav(signal)],['delayed-inverted.wav',wav(shift(signal,523,-.5))],
  ['tone.wav',wav(tone)],['tone-delayed.wav',wav(shift(tone,220,1))],
  ['different-rate.wav',wav(signal,44100)],
]);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const originalHashes=Object.fromEntries([...fixtures].map(([name,data])=>[name,hash(data)]));
const exports=[],errors=[],screenshots=[];
const shim=`const manifest=await(await fetch('/manifest'+location.search)).json();
const send=data=>window.postMessage(data,location.origin);
window.acquireVsCodeApi=()=>({getState:()=>({onboardingSeen:true}),setState:()=>{},postMessage:async m=>{
try{
if(m.type==='compare.ready')send({type:'compare.files',initial:true,onboardingSeen:true,files:manifest,workerUri:'/dist/comparisonWorker.js',loudnessWorkerUri:'/dist/comparisonLoudnessWorker.js',loudnessWorkletUri:'/dist/loudness.worklet.js'});
else if(m.type==='compare.read'){const f=manifest.find(f=>f.id===m.id),r=await fetch('/audio?name='+encodeURIComponent(f.name)+'&offset='+m.offset);send({type:'compare.data',id:m.id,revision:m.revision,offset:m.offset,length:Number(r.headers.get('X-Audio-Length')),samples:await r.arrayBuffer()});}
else if(m.type==='compare.confirm')send({type:'compare.confirmed',requestId:m.requestId,accepted:true});
else if(m.type==='compare.export'){await fetch('/export',{method:'POST',body:m.samples});send({type:'compare.exported',requestId:m.requestId,path:'session-export.wav'});}
else if(m.type==='compare.sequence')send({type:'compare.sequenceResult',message:{type:'sequenceFeatures',data:{requestId:m.requestId,error:'Sequence features are outside this acceptance test'}}});
}catch(e){send({type:'compare.failure',message:String(e)});}}});
const script=document.createElement('script');script.src='/dist/comparison.js';document.body.append(script);`;
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://local');
    if(url.pathname==='/manifest'){
      const names=url.searchParams.has('mixed')?['reference.wav','different-rate.wav']:['reference.wav','delayed-inverted.wav','tone.wav','tone-delayed.wav'];
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(names.map((name,i)=>({id:`track-${i+1}`,uri:name,name,ext:'wav',revision:1}))));
    }else if(url.pathname==='/audio'){
      const data=fixtures.get(url.searchParams.get('name'));assert.ok(data);const offset=Number(url.searchParams.get('offset'));assert.ok(Number.isSafeInteger(offset)&&offset>=0);res.setHeader('X-Audio-Length',data.length);res.end(data.subarray(offset,offset+3000000));
    }else if(url.pathname==='/export'){
      const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;assert.ok(size<64000000);parts.push(chunk);}const data=Buffer.concat(parts);exports.push(data);fs.writeFileSync(path.join(output,`export-${exports.length}.wav`),data);res.end('saved');
    }else if(url.pathname==='/'){
      res.setHeader('Content-Type','text/html');
      res.setHeader('Content-Security-Policy',"default-src 'none'; connect-src 'self'; script-src 'self' 'nonce-alignment'; style-src 'self' 'unsafe-inline'; worker-src blob:; img-src 'self' data:; media-src blob:;");
      res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>EAR alignment acceptance</title><style>:root{--vscode-editor-background:#19191b;--vscode-foreground:#eee;--vscode-font-size:13px;--vscode-font-weight:400;--vscode-font-family:system-ui;--vscode-focusBorder:#78b9ed}body{margin:12px;background:#19191b;color:#eee;font:13px system-ui}</style><div id="root"></div><script type="module" nonce="alignment">${shim}</script></html>`);
    }else if(/^\/dist\/[\w.-]+$/.test(url.pathname)){
      res.setHeader('Content-Type',url.pathname.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(fs.readFileSync(path.join(root,url.pathname.slice(1))));
    }else res.writeHead(404).end();
  }catch(error){res.writeHead(500).end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const chrome=process.env.EAR_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{}),args:['--autoplay-policy=no-user-gesture-required']});
const report={passed:false,scope:'Production webview, actual CSP Blob worker, Web Audio, STFT/Live/Edit panes and WAV export. Host file/save dialogs mocked.',checks:[],screenshots,errors};
function samples(data){let at=12,channels,rate,depth,payload;while(at+8<=data.length){const name=data.toString('ascii',at,at+4),size=data.readUInt32LE(at+4);if(name==='fmt '){channels=data.readUInt16LE(at+10);rate=data.readUInt32LE(at+12);depth=data.readUInt16LE(at+22);}if(name==='data')payload=data.subarray(at+8,at+8+size);at+=8+size+(size%2);}assert.equal(channels,2);assert.equal(rate,48000);assert.equal(depth,32);assert.ok(payload);return payload;}
try{
  const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base);await page.waitForFunction(()=>document.querySelectorAll('.comparisonTrack').length===4&&document.querySelector('[data-status]').textContent.startsWith('4 /'),null,{timeout:120000});
  await page.locator('[data-open-alignment]').click();await page.locator('[data-alignment-estimate]').click();await page.waitForFunction(()=>document.querySelector('[data-alignment-result]').textContent.includes('523 samples'),null,{timeout:60000});
  assert.equal(await page.locator('[data-alignment-polarity]').isChecked(),false);assert.equal(await page.locator('[data-alignment-apply]').isEnabled(),true);report.checks.push('Side-only stereo: exact +523-sample inverted match; no polarity change without opt-in');
  await page.screenshot({path:path.join(output,'alignment-preview.png')});screenshots.push('alignment-preview.png');console.log('Preview accepted');
  await page.locator('[data-alignment-polarity]').check();await page.locator('[data-alignment-apply]').click();await page.waitForFunction(()=>document.querySelector('[data-alignment-result]').textContent.startsWith('Applied'),null,{timeout:60000});
  await page.locator('[data-alignment-close]').click();
  for (const id of ['track-1','track-2']) { const mute=page.locator('.comparisonTrack[data-track-id="'+id+'"] [data-action="mute"]');await mute.focus();await mute.press('Enter'); }
  await page.locator('[data-pane="live"]').click();await page.locator('[data-play]').click();await page.waitForFunction(()=>Number(document.querySelector('#root').dataset.liveTime)>.05,null,{timeout:30000});await page.locator('[data-play]').click();report.checks.push('Aligned playback and native Live analysis run on the updated session buffer');console.log('Playback and Live passed');
  await page.locator('[data-pane="edit"]').click();
  const exportRegion=async()=>{await page.locator('[data-start]').fill('0');await page.locator('[data-end]').fill('0.1');await page.locator('[data-end]').press('Tab');const count=exports.length;await page.locator('[data-export]').click();await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('session-export.wav'),null,{timeout:30000});assert.equal(exports.length,count+1);return samples(exports.at(-1));};
  const aligned=await exportRegion();let maxError=0;for(let i=0;i<4800;i++){maxError=Math.max(maxError,Math.abs(aligned.readFloatLE(i*8)-signal[i]*.5),Math.abs(aligned.readFloatLE(i*8+4)+signal[i]*.5));}assert.ok(maxError<1e-6,`Aligned WAV error ${maxError}`);report.alignedExportMaxError=maxError;console.log('Aligned export passed',maxError);report.checks.push('Exported float32 stereo WAV matches polarity-corrected, shifted PCM to <1e-6');
  await page.locator('[data-open-alignment]').click();await page.locator('[data-alignment-reset]').click();await page.waitForFunction(()=>document.querySelector('[data-alignment-result]').textContent.startsWith('Original decoded'),null,{timeout:60000});await page.locator('[data-alignment-close]').click();
  const restored=await exportRegion();maxError=0;for(let i=0;i<4800;i++){const expected= i<523 ? 0 : -.5*signal[i-523];maxError=Math.max(maxError,Math.abs(restored.readFloatLE(i*8)-expected));}assert.ok(maxError<1e-6);report.restoredExportMaxError=maxError;console.log('Reset export passed',maxError);report.checks.push('Reset restores original delayed/inverted PCM, verified by a second actual export');
  await page.locator('[data-open-alignment]').click();await page.locator('[data-alignment-reference]').selectOption('track-3');await page.locator('[data-alignment-target]').selectOption('track-4');await page.locator('[data-alignment-estimate]').click();await page.waitForFunction(()=>document.querySelector('[data-alignment-result]').textContent.includes('equally well'),null,{timeout:60000});assert.equal(await page.locator('[data-alignment-apply]').isDisabled(),true);report.checks.push('Periodic multi-solution signal rejected; Apply disabled');
  await page.setViewportSize({width:640,height:800});const bounds=await page.locator('dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=640);await page.screenshot({path:path.join(output,'alignment-rejected-narrow.png')});screenshots.push('alignment-rejected-narrow.png');
  await page.locator('[data-alignment-reference]').selectOption('track-1');await page.locator('[data-alignment-target]').selectOption('track-2');await page.locator('[data-alignment-estimate]').click();await page.waitForFunction(()=>!document.querySelector('[data-alignment-apply]').disabled,null,{timeout:60000});await page.evaluate(()=>window.postMessage({type:'compare.changed',id:'track-2'},location.origin));await page.waitForFunction(()=>document.querySelector('[data-alignment-apply]').disabled);report.checks.push('Source-change notification invalidates a previously accepted preview');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.comparisonAlignment'));
  await page.goto(base+'/?mixed');await page.waitForFunction(()=>document.querySelectorAll('.comparisonTrack').length===2&&document.querySelector('[data-status]').textContent.startsWith('2 /'),null,{timeout:120000});await page.locator('[data-open-alignment]').click();await page.locator('[data-alignment-estimate]').click();await page.waitForFunction(()=>document.querySelector('[data-alignment-result]').textContent.includes('same decoded sample rate'));assert.equal(await page.locator('[data-alignment-apply]').isDisabled(),true);report.checks.push('Mixed native sample rates rejected without implicit resampling');
  assert.deepEqual(Object.fromEntries([...fixtures].map(([name,data])=>[name,hash(data)])),originalHashes);assert.deepEqual(errors,[]);report.checks.push('No browser exceptions; original fixture bytes unchanged');
  report.passed=true;report.timestamp=new Date().toISOString();report.productionBundleSha256=hash(fs.readFileSync(path.join(root,'dist/comparison.js')));report.workerBundleSha256=hash(fs.readFileSync(path.join(root,'dist/comparisonWorker.js')));console.log(JSON.stringify(report,null,2));
}finally{if(!report.passed){const p=browser.contexts()[0]?.pages()[0];if(p){report.lastText=await p.locator('body').innerText().catch(()=>null);await p.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}}fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}

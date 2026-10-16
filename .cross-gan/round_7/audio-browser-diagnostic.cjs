const fs=require('fs'),http=require('http'),path=require('path');
const{chromium}=require('/Users/lertoon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root='/tmp/ear-refine-fixes-20261016',repo='/Users/lertoon/vscProjects/EAR-Audio-Preview';
const server=http.createServer((req,res)=>{if(req.url==='/')return res.end('<!doctype html><script src="/test.js"></script>');const p=path.join(req.url==='/loudness.worklet.js'?repo+'/dist':root+'/audio-browser-dist',path.basename(req.url));if(!fs.existsSync(p))return res.writeHead(404).end();res.setHeader('Content-Type','text/javascript');fs.createReadStream(p).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.audioReviewApi);const result=await page.evaluate(async()=>{
const a=window.audioReviewApi;a.setLoudnessWorkletModuleUrl('/loudness.worklet.js');a.setBaselineWorkletUrl('/loudness.worklet.js');
const arrays={};const results=[];
const rms=data=>Math.sqrt(data.reduce((e,v)=>e+v*v,0)/data.length);
for(const [name,baseline,visible,prewarm] of [['current-hidden',false,false,false],['current-visible',false,true,false],['baseline-visible',true,true,false],['baseline-hidden',true,false,false],['current-hidden-warm',false,false,true],['current-visible-warm',false,true,true],['baseline-visible-warm',true,true,true]]){
 const ctx=new OfflineAudioContext(2,4800,48000),buf=ctx.createBuffer(2,4800,48000);
 for(let c=0;c<2;c++)for(let i=0;i<4800;i++)buf.getChannelData(c)[i]=.25*Math.sin(2*Math.PI*1000*i/48000);
 const settings=a.AnalyzeSettingsService.fromDefaultSetting({hearingProtectionEnabled:false,showLiveAnalysis:visible},buf);settings.liveMonitoringMode='s';
 const Player=baseline?a.BaselinePlayerService:a.PlayerService;
 const player=new Player(ctx,buf,a.PlayerSettingsService.fromDefaultSetting({},buf),settings);
 player.play();
 if(prewarm){await player._loudnessWorkletPromise;await Promise.resolve();}
 const workletBefore=!!player._loudnessWorklet;
 const out=await ctx.startRendering(),l=out.getChannelData(0),r=out.getChannelData(1);arrays[name]=Array.from(l);
 let last=-1;for(let i=0;i<l.length;i++)if(Math.abs(l[i])>1e-9)last=i;
 results.push({name,workletBefore,rms:rms(l),rmsR:rms(r),lastNonZeroFrame:last,tailRmsAfter256:rms(l.slice(256)),tailRmsAfter512:rms(l.slice(512)),chunks:Array.from({length:6},(_,i)=>({start:i*128,rms:rms(l.slice(i*128,(i+1)*128)),peak:Math.max(...l.slice(i*128,(i+1)*128).map(Math.abs))})),first16:Array.from(l.slice(0,16)),first16R:Array.from(r.slice(0,16))});
 player.dispose();
}
const compare=(x,y)=>Math.max(...arrays[x].map((v,i)=>Math.abs(v-arrays[y][i])));
return{results,exactComparisons:{currentHiddenToBaselineVisible:compare('current-hidden','baseline-visible'),currentVisibleToBaselineVisible:compare('current-visible','baseline-visible'),warmCurrentHiddenToBaselineVisible:compare('current-hidden-warm','baseline-visible-warm')}};
});const report={browser:await browser.version(),...result,pageErrors:errors};fs.writeFileSync(root+'/audio-browser-diagnostic.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

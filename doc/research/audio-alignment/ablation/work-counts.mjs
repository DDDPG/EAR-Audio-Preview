// Post-hoc explanatory instrumentation; never used for timing or tuning.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { realChannels, shift } from '../corpus.mjs';
const home=import.meta.dirname, rows=[], generated={};
for(const mask of [15,14,13,11,7]) {
  let source=fs.readFileSync(new URL(`./snapshots/mask-${mask}.mjs`,import.meta.url),'utf8');
  source=source.replace("import { fft } from './fft.mjs';", "import { fft } from './fft.mjs';\nconst stats={}; export const workCounts=()=>({...stats});");
  source=source.replace('  validate(aChannels, rate); validate(bChannels, rate);','  Object.assign(stats,{fftLength:0,firOutputSamples:0,firMultiplyAdds:0,correlateCalls:0,correlatedSamples:0,coarsePeaks:0,earlyExit:false});\n  validate(aChannels, rate); validate(bChannels, rate);');
  source=source.replace('  const out = new Float64Array(count);','  stats.firOutputSamples += count;\n  const out = new Float64Array(count);');
  source=source.replace('    for (let j = first; j <= last; j++) sum +=','    stats.firMultiplyAdds += Math.max(0,last-first+1);\n    for (let j = first; j <= last; j++) sum +=');
  source=source.replace('  const n = 2 ** Math.ceil(Math.log2(a.length + b.length));','  const n = 2 ** Math.ceil(Math.log2(a.length + b.length));\n  stats.fftLength = n;');
  source=source.replace('  if (n < 128) return 0;','  stats.correlateCalls++; stats.correlatedSamples += Math.max(0,n);\n  if (n < 128) return 0;');
  source=source.replace("  if (!peaks.length) return rejected('no-peak');","  stats.coarsePeaks=peaks.length;\n  if (!peaks.length) return rejected('no-peak');");
  source=source.replace('(peaks[1]?.value ?? 0) < peaks[0].value * 0.5) break;','(peaks[1]?.value ?? 0) < peaks[0].value * 0.5) { stats.earlyExit=true; break; }');
  const file=new URL(`./snapshots/trace-${mask}.mjs`,import.meta.url);fs.writeFileSync(file,source);generated[`trace-${mask}.mjs`]=crypto.createHash('sha256').update(source).digest('hex');
  const traced=await import(file.href),original=await import(new URL(`./snapshots/mask-${mask}.mjs`,import.meta.url));
  for(const name of ['A','B','C','D'])for(const seconds of [3,30]) {
    const a=realChannels(name).map(x=>x.slice(0,seconds*48000)),b=a.map(x=>shift(x,523,.7));
    const result=traced.estimateAlignment(a,b,48000),counts=traced.workCounts();
    assert.equal(JSON.stringify(result),JSON.stringify(original.estimateAlignment(a,b,48000)));
    rows.push({mask,file:name,seconds,...counts});
  }
}
fs.writeFileSync(new URL('./work-counts.json',import.meta.url),JSON.stringify({postHoc:true,notUsedForTimingOrTuning:true,all40OutputsEqual:true,generated,rows},null,2));
console.log('40 diagnostic counter outputs match uninstrumented variants');

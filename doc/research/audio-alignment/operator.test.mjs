import test from 'node:test';
import assert from 'node:assert/strict';
import { fft } from './fft.mjs';
import { estimateAlignment, compareResidual } from './operator.mjs';
import { signal, shift } from './corpus.mjs';
test('FFT agrees with direct DFT, and inverts without mutation error', () => {
  for (const n of [2, 8, 64]) {
    const re = Float64Array.from({length:n},(_,i)=>Math.sin(i*1.7)), im = Float64Array.from({length:n},(_,i)=>Math.cos(i*.8));
    const a = re.slice(), b = im.slice(); fft(re,im);
    for(let k=0;k<n;k++){let r=0,v=0;for(let j=0;j<n;j++){const t=-2*Math.PI*j*k/n;r+=a[j]*Math.cos(t)-b[j]*Math.sin(t);v+=a[j]*Math.sin(t)+b[j]*Math.cos(t);}assert.ok(Math.abs(re[k]-r)<1e-9);assert.ok(Math.abs(im[k]-v)<1e-9);}
    fft(re,im,true);for(let i=0;i<n;i++){assert.ok(Math.abs(re[i]-a[i])<1e-12);assert.ok(Math.abs(im[i]-b[i])<1e-12);}
  }
});
test('invalid inputs and limits fail explicitly', () => {
  assert.throws(()=>estimateAlignment([],[],48000));
  assert.throws(()=>estimateAlignment([new Float32Array([NaN])],[new Float32Array(1)],48000));
  assert.throws(()=>estimateAlignment([new Float32Array(1)],[new Float32Array(1)],Infinity));
  assert.throws(()=>estimateAlignment([new Float32Array(1)],[new Float32Array(1)],48000,{maxLagSeconds:-1}));
  assert.throws(()=>estimateAlignment([new Float32Array(2),new Float32Array(3)],[new Float32Array(2)],48000));
  assert.throws(()=>compareResidual([new Float32Array(10)],[new Float32Array(10)],48000,.5));
});
test('no-overlap and sub-100ms recordings are explicit non-results',()=>{
  assert.equal(estimateAlignment([new Float32Array(12)],[new Float32Array(12)],48000).reason,'too-short');
  assert.equal(compareResidual([new Float32Array(12)],[new Float32Array(12)],48000,20).valid,false);
});
test('stereo Side survives, signed least-squares preserves the stereo ratio, PCM stays unchanged',()=>{
  const x=signal(48000,48000,19937),a=[x,Float32Array.from(x,v=>-v)],b=a.map(c=>shift(c,613,-.5));
  const before=a.map(c=>c.slice()),beforeB=b.map(c=>c.slice());
  const result=estimateAlignment(a,b,48000);assert.equal(result.accepted,true);assert.equal(result.offsetSamples,613);assert.equal(result.polarity,-1);
  const stats=compareResidual(a,b,48000,result.offsetSamples);assert.ok(Math.abs(stats.gain+2)<1e-6);assert.equal(stats.nullDepthDb,Infinity);
  a.forEach((c,i)=>assert.deepEqual(c,before[i]));b.forEach((c,i)=>assert.deepEqual(c,beforeB[i]));
});
test('gain uses all channel energy rather than a cancellable mono downmix',()=>{
  const a=[new Float32Array([1,2,3]),new Float32Array([-1,-2,-3])];
  const b=a.map(c=>Float32Array.from(c,v=>v/4));
  const r=compareResidual(a,b,48000,0);assert.equal(r.gain,4);assert.equal(r.nullDepthDb,Infinity);
});
test('zero-width search never moves the source and silence is not accepted',()=>{
  const x=signal(48000,48000,257),r=estimateAlignment([x],[shift(x,1)],48000,{maxLagSeconds:0});assert.equal(r.offsetSamples,0);
  const s=estimateAlignment([new Float32Array(48000)],[new Float32Array(48000)],48000);assert.equal(s.accepted,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateAlignment, compareResidual } from './operator.mjs';
import { rng, shift, signal } from './corpus.mjs';

test('sparse PCM between energy probes is aligned rather than classified as silence', () => {
  for (const phase of [1, 7, 15, 31]) {
    const x = new Float32Array(48000), random = rng(7);
    for (let i = phase; i < x.length; i += 32) x[i] = random() * .5;
    for (const delay of [0, 523, -523]) {
      const result = estimateAlignment([x], [shift(x, delay)], 48000);
      assert.ok(result.accepted, JSON.stringify({phase, delay, result}));
      assert.equal(result.offsetSamples, delay);
      assert.equal(result.polarity, 1);
    }
  }
  for (const level of [0, .3]) {
    const x = new Float32Array(48000).fill(level);
    assert.equal(estimateAlignment([x], [x.slice()], 48000).reason, 'silent-or-constant');
  }
});

test('quiet nonzero background cannot hide informative tail audio', () => {
  for (const background of [1e-8, 1e-6]) {
    const x = signal(48000,48000,7);
    for (let i=0;i<x.length;i++) x[i] *= background;
    x.set(signal(2000,48000,8),46000);
    for (const delay of [0, 53, -53]) for (const gain of [1, -.5]) {
      const result = estimateAlignment([x],[shift(x,delay,gain)],48000);
      assert.ok(result.accepted,JSON.stringify({background,delay,gain,result}));
      assert.equal(result.offsetSamples,delay);
      assert.equal(result.polarity,Math.sign(gain));
    }
  }
});

test('unrolled validation checks every lane and scalar tail in either input', () => {
  for (let length = 1; length <= 25; length++) for (let index = 0; index < length; index++) {
    for (const value of [NaN, Infinity, -Infinity]) {
      const good = new Float32Array(length), bad = good.slice(); bad[index] = value;
      for (const [a,b] of [[[bad],[good]],[[good],[bad]],[[good,bad],[good,good]],[[good,good],[good,bad]]]) {
        for (const fn of [() => estimateAlignment(a,b,48000), () => compareResidual(a,b,48000,0)]) {
          assert.throws(fn, {name:'TypeError', message:'Non-finite PCM'});
        }
      }
    }
  }
});

test('dense audio confined to the previously unvisited tail can align', () => {
  for (const rate of [8000, 44100, 48000, 192000]) {
    const x = new Float32Array(rate);
    x.set(signal(Math.floor(rate / 24), rate, 7), rate - Math.floor(rate / 24));
    for (const delay of [0, 53, -53]) {
      const result = estimateAlignment([x], [shift(x, delay)], rate);
      assert.ok(result.accepted, JSON.stringify({rate,delay,result}));
      assert.equal(result.offsetSamples, delay);
    }
  }
});

test('sparse activity after leading silence selects an informative refinement window', () => {
  for (const phase of [1, 7, 15, 31]) {
    const x = new Float32Array(48000), random = rng(7);
    for (let i = 24000 + phase; i < x.length; i += 32) x[i] = random() * .5;
    for (const delay of [0, 523, -523]) {
      const result = estimateAlignment([x], [shift(x, delay)], 48000);
      assert.ok(result.accepted, JSON.stringify({phase, delay, result}));
      assert.equal(result.offsetSamples, delay);
    }
  }
});

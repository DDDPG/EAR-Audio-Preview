import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateAlignment } from './operator.mjs';
import { rng, shift } from './corpus.mjs';
import { fft, fftPair } from './fft.mjs';

test('paired FFT is byte-identical to two independent forward transforms', () => {
  const random = rng(9871);
  for (const n of [1, 2, 8, 64, 16384, 32768, 65536]) {
    const expected = Array.from({length: 4}, () => Float64Array.from({length:n}, random));
    const actual = expected.map(x => x.slice());
    fft(expected[0], expected[1]); fft(expected[2], expected[3]);
    fftPair(...actual);
    for (let i=0;i<4;i++) assert.deepEqual(Buffer.from(actual[i].buffer), Buffer.from(expected[i].buffer));
  }
});

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

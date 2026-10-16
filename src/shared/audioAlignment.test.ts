import { estimateAlignment, compareResidual } from "./audioAlignment";
import { fft } from "./alignmentFft";

function signal(length = 48000): Float32Array {
  let state = 7,
    low = 0;
  return Float32Array.from({ length }, (_, i) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    low = 0.8 * low + 0.2 * (state / 4294967296 - 0.5);
    return low * (0.3 + 0.7 * ((i % 12000) / 12000));
  });
}
function shift(x: Float32Array, delay: number, gain = 1): Float32Array {
  return Float32Array.from(
    { length: x.length + Math.max(0, delay) },
    (_, i) => (x[i - delay] ?? 0) * gain,
  );
}
test.each([0, 523, -523, 96000, -96000])(
  "recovers signed integer delay %s without mutating PCM",
  (delay) => {
    const x = signal(144000),
      y = shift(x, delay, 0.5),
      before = y.slice();
    const result = estimateAlignment([x], [y], 48000);
    expect(result.accepted).toBe(true);
    expect(result.offsetSamples).toBe(delay);
    expect(y).toEqual(before);
  },
);
test("Side-only stereo and negative gain retain delay, polarity and linked gain", () => {
  const x = signal(),
    a = [x, Float32Array.from(x, (v) => -v)],
    b = a.map((c) => shift(c, 613, -0.5));
  const result = estimateAlignment(a, b, 48000);
  expect(result).toMatchObject({
    accepted: true,
    offsetSamples: 613,
    polarity: -1,
  });
  const residual = compareResidual(a, b, 48000, 613);
  expect(residual.gain).toBe(-2);
  expect(residual.rmsDiff).toBe(0);
  expect(residual.nullDepthDb).toBe(Infinity);
});
test("periodic multisolutions and noninformative inputs are rejected", () => {
  const tone = Float32Array.from(
    { length: 96000 },
    (_, i) => 0.3 * Math.sin((i * 2 * Math.PI * 200) / 48000),
  );
  expect(estimateAlignment([tone], [shift(tone, 220)], 48000).reason).toBe(
    "ambiguous-peaks",
  );
  for (const level of [0, 0.3]) {
    const x = new Float32Array(48000).fill(level);
    expect(estimateAlignment([x], [x], 48000).accepted).toBe(false);
  }
  expect(
    estimateAlignment([new Float32Array(12)], [new Float32Array(12)], 48000)
      .reason,
  ).toBe("too-short");
});
test.each([1, 7, 15, 31])(
  "sparse phase %s after leading silence is not missed",
  (phase) => {
    const x = new Float32Array(48000),
      random = signal();
    for (let i = 24000 + phase; i < x.length; i += 32) {
      x[i] = random[i];
    }
    expect(estimateAlignment([x], [shift(x, 523)], 48000)).toMatchObject({
      accepted: true,
      offsetSamples: 523,
    });
  },
);
test.each([8000, 44100, 48000, 192000])(
  "quiet tail at %s Hz selects an informative window",
  (rate) => {
    const x = new Float32Array(rate),
      count = Math.floor(rate / 24);
    for (let i = 0; i < x.length; i++) {
      x[i] = Math.sin(i) * 1e-10;
    }
    x.set(signal(count), rate - count);
    expect(estimateAlignment([x], [shift(x, 53, -0.5)], rate)).toMatchObject({
      accepted: true,
      offsetSamples: 53,
      polarity: -1,
    });
  },
);
test("all unrolled lanes and tails reject nonfinite PCM on either side", () => {
  for (let length = 1; length <= 25; length++) {
    for (let index = 0; index < length; index++) {
      for (const value of [NaN, Infinity, -Infinity]) {
        const good = new Float32Array(length),
          bad = good.slice();
        bad[index] = value;
        for (const [a, b] of [
          [[bad], [good]],
          [[good], [bad]],
        ]) {
          expect(() => estimateAlignment(a, b, 48000)).toThrow(
            "Non-finite PCM",
          );
          expect(() => compareResidual(a, b, 48000, 0)).toThrow(
            "Non-finite PCM",
          );
        }
      }
    }
  }
});
test("bounds, no overlap and zero-width search remain explicit", () => {
  const x = signal();
  expect(
    estimateAlignment([x], [shift(x, 1)], 48000, { maxLagSeconds: 0 })
      .offsetSamples,
  ).toBe(0);
  expect(compareResidual([x], [x], 48000, x.length).valid).toBe(false);
  expect(() =>
    estimateAlignment([x], [x], 48000, { maxLagSeconds: 11 }),
  ).toThrow();
  expect(() =>
    estimateAlignment([x, new Float32Array(1)], [x], 48000),
  ).toThrow();
  expect(() => compareResidual([x], [x], 48000, 0.5)).toThrow();
});
test("FFT agrees with direct DFT and inverse for small complex vectors", () => {
  const re = Float64Array.from({ length: 8 }, (_, i) => Math.sin(i)),
    im = Float64Array.from({ length: 8 }, (_, i) => Math.cos(i));
  const originalRe = re.slice(),
    originalIm = im.slice();
  fft(re, im);
  for (let k = 0; k < 8; k++) {
    let expectedRe = 0,
      expectedIm = 0;
    for (let j = 0; j < 8; j++) {
      const theta = (-2 * Math.PI * j * k) / 8;
      expectedRe +=
        originalRe[j] * Math.cos(theta) - originalIm[j] * Math.sin(theta);
      expectedIm +=
        originalRe[j] * Math.sin(theta) + originalIm[j] * Math.cos(theta);
    }
    expect(re[k]).toBeCloseTo(expectedRe, 10);
    expect(im[k]).toBeCloseTo(expectedIm, 10);
  }
  fft(re, im, true);
  for (let i = 0; i < 8; i++) {
    expect(re[i]).toBeCloseTo(originalRe[i], 12);
    expect(im[i]).toBeCloseTo(originalIm[i], 12);
  }
});

import { NativeSpectrum } from "./comparisonDsp";
import type { AnalysisOptions } from "./comparisonDsp";
const options = {
  windowMs: 100,
  minHz: 1000,
  maxHz: 2000,
  bins: 1,
  tiltDbPerOct: 0,
  weighting: "none" as const,
};
test.each([44100, 48000, 96000])(
  "native %i Hz tone preserves amplitude dBFS",
  (sampleRate) => {
    const left = Float32Array.from(
      { length: sampleRate },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate),
    );
    const frame = new NativeSpectrum().compute(
      { left, sampleRate, origin: 0 },
      0.5,
      options,
    );
    expect(frame.db[0]).toBeCloseTo(-6.0206, 0);
  },
);
test("correlation sign and Nyquist coverage come from each native source", () => {
  const sampleRate = 44100;
  const left = Float32Array.from({ length: sampleRate }, (_, i) =>
    Math.sin((2 * Math.PI * 1000 * i) / sampleRate),
  );
  const right = Float32Array.from(left, (x) => -x);
  const frame = new NativeSpectrum().compute(
    { left, right, sampleRate, origin: 0 },
    0.5,
    options,
  );
  expect(frame.rho[0]).toBeCloseTo(-1, 5);
  const unsupported = new NativeSpectrum().compute(
    { left, sampleRate, origin: 0 },
    0.5,
    { ...options, minHz: 23000, maxHz: 24000 },
  );
  expect(Number.isNaN(unsupported.db[0])).toBe(true);
});
test("an STFT frame beyond a short source is missing data, not digital silence", () => {
  const frame = new NativeSpectrum().compute(
    {
      left: new Float32Array(480),
      sampleRate: 48000,
      origin: 0,
      duration: 0.01,
    },
    0.2,
    options,
  );
  expect(Number.isNaN(frame.db[0])).toBe(true);
});

test.each(["hann", "hamming", "blackman-harris", "triangular"] as const)(
  "%s window retains coherent tone amplitude after a window change",
  (windowType) => {
    const sampleRate = 48000;
    const audio = {
      left: Float32Array.from(
        { length: sampleRate },
        (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate),
      ),
      sampleRate,
      origin: 0,
    };
    const engine = new NativeSpectrum();
    engine.compute(audio, 0.5, options);
    const frame = engine.compute(audio, 0.5, { ...options, windowType });
    expect(frame.db[0]).toBeCloseTo(-6.0206, 0);
  },
);

test.each([
  ["linear", 200, 1800, 1000, 0.5],
  ["log", 1, 10000, 800, 0.5],
  ["mel", 0, 2100, 700, 0.5],
  ["hybrid", 100, 10000, 1000, 1],
] as const)(
  "%s spectrum and selection agree on the middle frequency",
  (frequencyScale, minHz, maxHz, hz, hybridRatio) => {
    const sampleRate = 48000;
    const left = Float32Array.from(
      { length: sampleRate },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sampleRate),
    );
    const frame = new NativeSpectrum().compute(
      { left, sampleRate, origin: 0 },
      0.5,
      { ...options, minHz, maxHz, bins: 3, frequencyScale, hybridRatio },
    );
    expect(frame.db[1]).toBeCloseTo(-6.0206, 0);
    expect(frame.db[1]).toBeGreaterThan(frame.db[0] + 20);
    expect(frame.db[1]).toBeGreaterThan(frame.db[2] + 20);
  },
);

test("reusing a spectrum engine across settings and rate changes matches fresh analysis", () => {
  const engine = new NativeSpectrum();
  for (const sampleRate of [44100, 48000, 96000, 192000, 48000]) {
    const left = Float32Array.from(
      { length: sampleRate / 2 },
      (_, i) => Math.sin((2 * Math.PI * 997 * i) / sampleRate) * 0.25,
    );
    const audio = { left, sampleRate, origin: 0.125 };
    for (const windowMs of [8, 80, 320]) {
      for (const weighting of ["none", "a"] as const) {
        const config: AnalysisOptions = {
          ...options,
          windowMs,
          minHz: 10,
          maxHz: 96000,
          bins: 256,
          tiltDbPerOct: weighting === "a" ? -3 : 6,
          weighting,
          frequencyScale: weighting === "a" ? "hybrid" : "log",
          hybridRatio: 0.7,
        };
        const expected = new NativeSpectrum().compute(audio, 0.4, config);
        for (const time of [0.4, 0.4]) {
          const actual = engine.compute(audio, time, config);
          for (const key of ["db", "rho", "polarL", "polarR"] as const) {
            expect(new Uint8Array(actual[key].buffer)).toEqual(
              new Uint8Array(expected[key].buffer),
            );
          }
          expect(actual.broadbandRho).toBe(expected.broadbandRho);
        }
      }
    }
  }
});

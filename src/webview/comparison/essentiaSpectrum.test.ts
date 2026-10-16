/** @jest-environment node */
import { Essentia, EssentiaWASM } from "essentia.js";
import { NativeSpectrum } from "./comparisonDsp";
import { essentiaSpectrum } from "./essentiaSpectrum";

test("real Essentia and Ooura retain the same dBFS calibration", () => {
  const essentia = new Essentia(EssentiaWASM);
  try {
    const audio = {
      left: Float32Array.from(
        { length: 48000 },
        (_, i) => 0.5 * Math.sin((2 * Math.PI * 984.375 * i) / 48000),
      ),
      sampleRate: 48000,
      origin: 0,
    };
    const options = {
      windowMs: 80,
      minHz: 984.375,
      maxHz: 2000,
      bins: 1,
      tiltDbPerOct: 0,
      weighting: "none" as const,
    };
    const ooura = new NativeSpectrum().compute(audio, 0.5, options, false);
    const actual = new NativeSpectrum(essentiaSpectrum(essentia)).compute(
      audio,
      0.5,
      { ...options, fftBackend: "essentia" },
      false,
    );
    expect(actual.db[0]).toBeCloseTo(ooura.db[0], 3);
    expect(actual.db[0]).toBeCloseTo(-6.02, 0);
  } finally {
    essentia.delete();
  }
});

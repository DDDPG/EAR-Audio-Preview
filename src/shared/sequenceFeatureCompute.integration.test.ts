/** @jest-environment node */
import { Essentia, EssentiaWASM } from "essentia.js";
import { computeSequenceFeatures } from "./sequenceFeatureCompute";

test("real Essentia: steady phase-aligned sine has zero spectral flux", async () => {
  const essentia = new Essentia(EssentiaWASM);
  try {
    const data = Float32Array.from({ length: 8192 }, (_, i) =>
      Math.sin((2 * Math.PI * i) / 64),
    );
    const result = await computeSequenceFeatures(
      essentia,
      data,
      48000,
      1024 / 48000,
    );
    expect(result.onsetFlux.length).toBe(7);
    for (const flux of result.onsetFlux) {
      expect(flux).toBeCloseTo(0, 5);
    }
  } finally {
    essentia.shutdown();
    essentia.delete();
  }
});

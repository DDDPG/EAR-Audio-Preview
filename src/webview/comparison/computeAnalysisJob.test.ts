import { computeAnalysisJob } from "./computeAnalysisJob";
import type { AnalysisJob } from "./analysisProtocol";
import type { NativeSpectrum } from "./comparisonDsp";

const job: AnalysisJob = {
  id: 1,
  trackId: "a",
  audioRevision: 1,
  settingsRevision: 1,
  kind: "stft",
  audio: { left: new Float32Array(800), sampleRate: 8000, origin: 0 },
  options: {
    windowMs: 10,
    minHz: 20,
    maxHz: 4000,
    bins: 16,
    weighting: "none",
    tiltDbPerOct: 0,
  },
  time: 0,
  end: 0.04,
  columns: 2,
  hopMs: 5,
};

test("STFT peak-pools every real hop into the same display columns", async () => {
  const compute = jest.fn((_audio, center: number) => ({
    db: new Float32Array(16).fill(center),
  }));
  const result = await computeAnalysisJob(
    job,
    { compute } as unknown as NativeSpectrum,
    () => false,
  );
  expect(compute).toHaveBeenCalledTimes(8);
  expect(result.tile.columns).toBe(2);
  expect(result.tile.values[0]).toBeCloseTo(0.02);
  expect(result.tile.values[16]).toBeCloseTo(0.04);
});

test("cancellation stops between hop computations without returning a partial tile", async () => {
  const compute = jest.fn(() => ({ db: new Float32Array(16) }));
  const result = await computeAnalysisJob(
    job,
    { compute } as unknown as NativeSpectrum,
    () => compute.mock.calls.length >= 2,
  );
  expect(result).toBeNull();
  expect(compute).toHaveBeenCalledTimes(2);
});

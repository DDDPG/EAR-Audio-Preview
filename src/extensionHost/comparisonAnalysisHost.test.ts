/** @jest-environment node */
/* eslint-disable @typescript-eslint/naming-convention -- Essentia API names. */
import { ComparisonAnalysisHost } from "./comparisonAnalysisHost";
import { loadEssentiaInNode } from "./essentiaHost";
import { NativeSpectrum } from "../webview/comparison/comparisonDsp";
import { essentiaSpectrum } from "../webview/comparison/essentiaSpectrum";
import { computeAnalysisJob } from "../webview/comparison/computeAnalysisJob";
import type { AnalysisJob } from "../webview/comparison/analysisProtocol";
import type { EssentiaInstance } from "../shared/essentiaTypes";

jest.mock("./essentiaHost", () => ({ loadEssentiaInNode: jest.fn() }));

const job: AnalysisJob = {
  id: 1,
  trackId: "track",
  audioRevision: 2,
  settingsRevision: 3,
  kind: "stft",
  audio: {
    left: Float32Array.from({ length: 800 }, (_, n) => Math.sin(n * 0.2)),
    sampleRate: 8000,
    origin: 0,
  },
  options: {
    windowMs: 10,
    fftBackend: "essentia",
    minHz: 20,
    maxHz: 4000,
    bins: 16,
    weighting: "none",
    tiltDbPerOct: 0,
  },
  time: 0,
  end: 0.08,
  columns: 4,
  hopMs: 10,
};

function mockEssentia(): EssentiaInstance {
  return {
    arrayToVector: (value: Float32Array) => value,
    vectorToArray: (value: unknown) => value as Float32Array,
    Spectrum: (value: unknown) => ({
      spectrum: Float32Array.from(value as Float32Array)
        .map(Math.abs)
        .slice(0, (value as Float32Array).length / 2 + 1),
    }),
  } as EssentiaInstance;
}

test("host Essentia preserves the same job windowing and peak pooling", async () => {
  const essentia = mockEssentia();
  jest.mocked(loadEssentiaInNode).mockResolvedValue(essentia);
  const expected = await computeAnalysisJob(
    job,
    new NativeSpectrum(essentiaSpectrum(essentia)),
    () => false,
  );
  const host = new ComparisonAnalysisHost();
  const actual = await host.analyze(job, () => false);
  expect(actual).toEqual(expected);
  expect(actual.tile.values.some(Number.isFinite)).toBe(true);
  host.dispose();
});

test("host skips cancelled work and reports a missing runtime", async () => {
  jest.mocked(loadEssentiaInNode).mockResolvedValue(null);
  const host = new ComparisonAnalysisHost();
  await expect(host.analyze(job, () => true)).resolves.toBeNull();
  await expect(host.analyze(job, () => false)).rejects.toThrow(
    "Essentia is unavailable",
  );
});

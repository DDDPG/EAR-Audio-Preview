import {
  hybridHzFromNorm,
  piecewiseLogAxisBoundaries,
  piecewiseYNormToHz,
} from "../spectrogramFrequencyLayout";

export type ComparisonFrequencyScale = "linear" | "log" | "mel" | "hybrid";
export interface ComparisonStftSettings {
  fftBackend: "ooura" | "essentia";
  visible: boolean;
  highResolution: boolean;
  windowSamples: number;
  windowType: "hann" | "hamming" | "blackman-harris" | "triangular";
  frequencyScale: ComparisonFrequencyScale;
  hybridRatio: number;
  dbLow: number;
  dbHigh: number;
  height: number;
}
export function defaultStftSettings(): ComparisonStftSettings {
  return {
    fftBackend: "ooura",
    visible: true,
    highResolution: false,
    windowSamples: 0,
    windowType: "hann",
    frequencyScale: "log",
    hybridRatio: 0.5,
    dbLow: -100,
    dbHigh: 0,
    height: 260,
  };
}
/** Shared by the worker and pointer interaction, including zoomed viewports. */
export function comparisonFrequencyAt(
  fraction: number,
  minHz: number,
  maxHz: number,
  scale: ComparisonFrequencyScale = "linear",
  hybridRatio = 0.5,
): number {
  const t = Math.max(0, Math.min(1, fraction));
  if (scale === "log") {
    return piecewiseYNormToHz(t, piecewiseLogAxisBoundaries(minHz, maxHz));
  }
  if (scale === "mel") {
    const low = Math.log1p(minHz / 700),
      high = Math.log1p(maxHz / 700);
    return 700 * Math.expm1(low + (high - low) * t);
  }
  if (scale === "hybrid") {
    return hybridHzFromNorm(t, minHz, maxHz, hybridRatio);
  }
  return minHz + (maxHz - minHz) * t;
}

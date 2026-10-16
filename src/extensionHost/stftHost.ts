import {
  computeEssentiaStftSpectrogram,
  type StftSettingsWire,
  type StftSpectrogramWire,
} from "../shared/stftEssentiaCompute";
import { loadEssentiaInNode } from "./essentiaHost";

export async function analyzeStftInHost(
  channelData: Float32Array,
  sampleRate: number,
  settings: StftSettingsWire,
  shouldCancel?: () => boolean,
): Promise<StftSpectrogramWire | null> {
  const essentia = await loadEssentiaInNode();
  if (!essentia || shouldCancel?.()) {
    return null;
  }
  try {
    return await computeEssentiaStftSpectrogram(
      essentia,
      channelData,
      sampleRate,
      settings,
      undefined,
      shouldCancel,
    );
  } catch (err) {
    if (shouldCancel?.()) {
      return null;
    }
    console.warn(
      "[stftHost] STFT failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

import { applyExportEq, type ExportEqSnapshot } from "./headphoneEqService";
import { encodeToWav } from "../encoder";
import { EditExportSettingsProps } from "./editExportSettingsService";
import PlayerSettingsService from "./playerSettingsService";
import {
  encodeRenderedWav,
  renderMix,
  type WavExportFormat,
  type OverloadHandler,
} from "./wavExportFormat";

export { applyChannelMode } from "./audioBufferTransforms";
import {
  applyChannelMode,
  createEmptyBuffer,
  type OfflineFilterOptions,
} from "./audioBufferTransforms";
export type { OfflineFilterOptions } from "./audioBufferTransforms";

const filterQ = Math.SQRT1_2;

export function extractRegion(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): AudioBuffer {
  const duration = buffer.duration;
  const start = Math.max(0, Math.min(startSec, duration));
  const end = Math.max(start, Math.min(endSec, duration));
  const sampleRate = buffer.sampleRate;
  const minIndex = Math.floor(start * sampleRate);
  const maxIndex = Math.min(
    buffer.length,
    Math.max(minIndex + 1, Math.floor(end * sampleRate)),
  );
  const length = Math.max(1, maxIndex - minIndex);
  const out = createEmptyBuffer(buffer.numberOfChannels, length, sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(minIndex, maxIndex));
  }
  return out;
}

export async function applyOfflineFilters(
  buffer: AudioBuffer,
  options: OfflineFilterOptions,
): Promise<AudioBuffer> {
  if (!options.enableHpf && !options.enableLpf) {
    return buffer;
  }

  const { numberOfChannels, length, sampleRate } = buffer;
  const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  let node: AudioNode = source;
  if (options.enableHpf) {
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = options.hpfHz;
    hpf.Q.value = filterQ;
    node.connect(hpf);
    node = hpf;
  }
  if (options.enableLpf) {
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = options.lpfHz;
    lpf.Q.value = filterQ;
    node.connect(lpf);
    node = lpf;
  }
  node.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

export async function renderExportBuffer(
  buffer: AudioBuffer,
  settings: EditExportSettingsProps,
): Promise<AudioBuffer> {
  const sliced = extractRegion(
    buffer,
    settings.regionStartSec,
    settings.regionEndSec,
  );
  const channeled = applyChannelMode(sliced, settings.channelMode);
  return applyOfflineFilters(channeled, {
    enableHpf: settings.enableHpf,
    hpfHz: settings.hpfHz,
    enableLpf: settings.enableLpf,
    lpfHz: settings.lpfHz,
  });
}

export async function renderExportWav(
  buffer: AudioBuffer,
  settings: EditExportSettingsProps,
  sourceBitDepth: number | null = null,
  format?: WavExportFormat,
  onOverload?: OverloadHandler,
  headphoneEq?: ExportEqSnapshot,
): Promise<Uint8Array> {
  let rendered = await renderExportBuffer(buffer, settings);
  rendered = await applyExportEq(rendered, headphoneEq);
  if (format) {
    if (format.sampleRate && format.sampleRate !== rendered.sampleRate) {
      rendered = await renderMix(
        [rendered],
        0,
        rendered.duration,
        format.sampleRate,
        { enableHpf: false, hpfHz: 0, enableLpf: false, lpfHz: 0 },
      );
    }
    return encodeRenderedWav(
      rendered,
      { ...format, channelMode: "as_is" },
      sourceBitDepth,
      onOverload,
    );
  }
  const audioData: Float32Array[] = [];
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    audioData.push(rendered.getChannelData(ch));
  }
  const bitDepth =
    sourceBitDepth === 8 || sourceBitDepth === 16 || sourceBitDepth === 24
      ? sourceBitDepth
      : 32;
  return encodeToWav(
    audioData,
    rendered.sampleRate,
    rendered.numberOfChannels,
    bitDepth,
  );
}

export function bufferRms(buffer: AudioBuffer, channel = 0): number {
  const data = buffer.getChannelData(channel);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / Math.max(1, data.length));
}

/** Resolve effective filter settings (respects player sync at render time). */
export function resolveExportSettings(
  settings: EditExportSettingsProps,
  player?: PlayerSettingsService,
): EditExportSettingsProps {
  if (!settings.syncFiltersFromPlayer || !player) {
    return settings;
  }
  return {
    ...settings,
    enableHpf: player.enableHpf,
    hpfHz: player.hpfFrequency,
    enableLpf: player.enableLpf,
    lpfHz: player.lpfFrequency,
  };
}

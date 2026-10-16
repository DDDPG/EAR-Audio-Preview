import { encodeToWav } from "../encoder";
import {
  applyChannelMode,
  type OfflineFilterOptions,
} from "./audioExportService";
import type { ExportChannelMode } from "./editExportSettingsService";

export interface WavExportFormat {
  sampleRate: number | null;
  bitDepth: 8 | 16 | 24 | 32 | "auto";
  channelMode: ExportChannelMode;
}
export const exportSampleRates = [
  8000, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400, 192000,
] as const;
export type OverloadChoice = "float" | "attenuate" | "clip" | "cancel";
export type OverloadHandler = (peak: number) => Promise<OverloadChoice>;

export function defaultBitDepth(sourceDepth: number | null): 8 | 16 | 24 | 32 {
  return sourceDepth === 8 || sourceDepth === 16 || sourceDepth === 24
    ? sourceDepth
    : 32;
}

export async function renderMix(
  buffers: readonly AudioBuffer[],
  start: number,
  end: number,
  sampleRate: number,
  filters: OfflineFilterOptions,
  monoPan = false,
): Promise<AudioBuffer> {
  if (
    !buffers.length ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    !Number.isSafeInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000
  ) {
    throw new Error(
      "Choose a nonempty region, source audio, and a supported sample rate",
    );
  }
  const channels =
    monoPan || buffers.some((b) => b.numberOfChannels === 2)
      ? 2
      : buffers[0].numberOfChannels;
  const context = new OfflineAudioContext(
    channels,
    Math.ceil((end - start) * sampleRate),
    sampleRate,
  );
  const bus = context.createGain();
  let tail: AudioNode = bus;
  for (const [enabled, hz, type] of [
    [filters.enableHpf, filters.hpfHz, "highpass"],
    [filters.enableLpf, filters.lpfHz, "lowpass"],
  ] as const) {
    if (enabled) {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = Math.max(1, Math.min(sampleRate * 0.49, hz));
      filter.Q.value = Math.SQRT1_2;
      tail.connect(filter);
      tail = filter;
    }
  }
  tail.connect(context.destination);
  const sources: AudioBufferSourceNode[] = [];
  for (const buffer of buffers) {
    if (start >= buffer.duration) {
      continue;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value =
      monoPan && buffer.numberOfChannels === 1 ? Math.SQRT1_2 : 1;
    source.connect(gain).connect(bus);
    source.start(0, start, Math.min(end, buffer.duration) - start);
    sources.push(source);
  }
  try {
    return await context.startRendering();
  } finally {
    sources.forEach((s) => s.disconnect());
    bus.disconnect();
  }
}

export async function encodeRenderedWav(
  buffer: AudioBuffer,
  format: WavExportFormat,
  sourceDepth: number | null,
  onOverload?: OverloadHandler,
): Promise<Uint8Array | null> {
  const output = applyChannelMode(buffer, format.channelMode);
  const samples = Array.from({ length: output.numberOfChannels }, (_, ch) =>
    output.getChannelData(ch),
  );
  let depth =
    format.bitDepth === "auto" ? defaultBitDepth(sourceDepth) : format.bitDepth;
  let peak = 0;
  for (const channel of samples) {
    for (const sample of channel) {
      if (!Number.isFinite(sample)) {
        throw new Error("Cannot export non-finite audio samples");
      }
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  let gain = 1;
  if (depth !== 32 && peak > 1) {
    if (!onOverload) {
      throw new Error(
        "Mix exceeds 0 dBFS. Choose float32, attenuation, or clipping.",
      );
    }
    const choice = await onOverload(peak);
    if (choice === "cancel") {
      return null;
    }
    if (choice === "float") {
      depth = 32;
    }
    if (choice === "attenuate") {
      gain = 1 / peak;
    }
  }
  const data =
    gain === 1
      ? samples
      : samples.map((channel) =>
          Float32Array.from(channel, (value) => value * gain),
        );
  return encodeToWav(data, output.sampleRate, output.numberOfChannels, depth);
}

import type { ExportChannelMode } from "./editExportSettingsService";

export function createEmptyBuffer(
  numberOfChannels: number,
  length: number,
  sampleRate: number,
): AudioBuffer {
  if (typeof OfflineAudioContext !== "undefined") {
    const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    return ctx.createBuffer(numberOfChannels, length, sampleRate);
  }
  const audioContextCtor = globalThis.AudioContext;
  if (typeof audioContextCtor === "function") {
    const ctx = new audioContextCtor({ sampleRate });
    return ctx.createBuffer(numberOfChannels, length, sampleRate);
  }
  throw new Error("Web Audio API is not available");
}

function createBufferLike(
  sampleRate: number,
  numberOfChannels: number,
  length: number,
): AudioBuffer {
  return createEmptyBuffer(numberOfChannels, length, sampleRate);
}

export function applyChannelMode(
  buffer: AudioBuffer,
  mode: ExportChannelMode,
): AudioBuffer {
  const { sampleRate, length } = buffer;
  const channels = buffer.numberOfChannels;

  if (mode === "as_is") {
    return buffer;
  }

  if (mode === "mono_mix") {
    const out = createBufferLike(sampleRate, 1, length);
    const dst = out.getChannelData(0);
    if (channels === 1) {
      dst.set(buffer.getChannelData(0));
      return out;
    }
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      dst[i] = (left[i] + right[i]) * 0.5;
    }
    return out;
  }

  if (mode === "mono_left") {
    const out = createBufferLike(sampleRate, 1, length);
    out.copyToChannel(buffer.getChannelData(0), 0);
    return out;
  }

  if (mode === "mono_right") {
    const out = createBufferLike(sampleRate, 1, length);
    const srcCh = channels > 1 ? 1 : 0;
    out.copyToChannel(buffer.getChannelData(srcCh), 0);
    return out;
  }

  if (mode === "fake_stereo") {
    const out = createBufferLike(sampleRate, 2, length);
    const mono =
      channels === 1
        ? buffer.getChannelData(0)
        : (() => {
            const mixed = new Float32Array(length);
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            for (let i = 0; i < length; i++) {
              mixed[i] = (left[i] + right[i]) * 0.5;
            }
            return mixed;
          })();
    out.copyToChannel(mono, 0);
    out.copyToChannel(mono, 1);
    return out;
  }

  return buffer;
}

export interface OfflineFilterOptions {
  enableHpf: boolean;
  hpfHz: number;
  enableLpf: boolean;
  lpfHz: number;
}

import { IAudioDecoder } from "./audioDecoderInterface";
import { parseFlacBitsPerSample } from "../utils/audioFileBitDepth";

type WasmDecoderResult = {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
};

type DecoderWorker = {
  ready: Promise<unknown>;
  decode(data: Uint8Array): WasmDecoderResult | Promise<WasmDecoderResult>;
  free(): void | Promise<void>;
};

async function decodeAndFree(
  decoder: DecoderWorker,
  data: Uint8Array,
): Promise<WasmDecoderResult> {
  try {
    await decoder.ready;
    const result = await decoder.decode(data);
    await decoder.free();
    return result;
  } catch (error) {
    // All four implementations inherit WASMAudioDecoderWorker (Worker).
    // free() waits for a worker reply; a failed worker may never reply.
    (decoder as unknown as Worker).terminate();
    throw error;
  }
}

/* eslint-disable @typescript-eslint/naming-convention */
async function decodeWithWasm(
  data: Uint8Array,
  ext: string,
): Promise<WasmDecoderResult | null> {
  const lowerExt = ext.toLowerCase();
  try {
    if (lowerExt === "mp3") {
      const { MPEGDecoderWebWorker } = await import("mpg123-decoder");
      const decoder = new MPEGDecoderWebWorker();
      return await decodeAndFree(decoder, data);
    }
    if (lowerExt === "flac") {
      const { FLACDecoderWebWorker } = await import(
        "@wasm-audio-decoders/flac"
      );
      const decoder = new FLACDecoderWebWorker();
      return await decodeAndFree(decoder, data);
    }
    if (lowerExt === "ogg") {
      // Try Vorbis first, fall back to Opus
      try {
        const { OggVorbisDecoderWebWorker } = await import(
          "@wasm-audio-decoders/ogg-vorbis"
        );
        const decoder = new OggVorbisDecoderWebWorker();
        return await decodeAndFree(decoder, data);
      } catch {
        const { OggOpusDecoderWebWorker } = await import("ogg-opus-decoder");
        const decoder = new OggOpusDecoderWebWorker();
        // ogg-opus-decoder's decode signature varies; cast to access it
        return await decodeAndFree(decoder as unknown as DecoderWorker, data);
      }
    }
    if (lowerExt === "opus") {
      const { OggOpusDecoderWebWorker } = await import("ogg-opus-decoder");
      const decoder = new OggOpusDecoderWebWorker();
      return await decodeAndFree(decoder as unknown as DecoderWorker, data);
    }
  } catch {
    return null;
  }
  return null;
}
/* eslint-enable @typescript-eslint/naming-convention */

export function wasmDecoderSupports(ext: string): boolean {
  return ["mp3", "flac", "ogg", "opus"].includes(ext.toLowerCase());
}

export class WasmDecoder implements IAudioDecoder {
  private _data: Uint8Array;
  private _ext: string;
  private _result: WasmDecoderResult | null = null;
  private _fileBitDepth: number | null = null;

  constructor(data: Uint8Array, ext: string) {
    this._data = data;
    this._ext = ext;
  }

  get numChannels() {
    return this._result?.channelData.length ?? 0;
  }
  get sampleRate() {
    return this._result?.sampleRate ?? 0;
  }
  get sourceSampleRate() {
    return this.sampleRate || null;
  }
  get duration() {
    const sr = this.sampleRate;
    return sr > 0 ? (this._result?.samplesDecoded ?? 0) / sr : 0;
  }
  get length() {
    return this._result?.samplesDecoded ?? 0;
  }
  get format() {
    return this._ext.toUpperCase();
  }
  get encoding() {
    return "PCM";
  }
  get bitDepth() {
    return this._fileBitDepth;
  }
  get fileSize() {
    return this._data.byteLength;
  }
  get samples(): Float32Array[] {
    return this._result?.channelData ?? [];
  }

  readAudioInfo() {
    // populated after decodeAsync
  }

  decode() {
    // no-op; async path used
  }

  async decodeAsync(): Promise<void> {
    this._result = await decodeWithWasm(this._data, this._ext);
    if (!this._result) {
      throw new Error(`WasmDecoder: failed to decode .${this._ext}`);
    }
    const ext = this._ext.toLowerCase().replace(/^\./, "");
    this._fileBitDepth =
      ext === "flac" ? parseFlacBitsPerSample(this._data) : null;
  }

  dispose() {
    this._result = null;
    this._fileBitDepth = null;
  }
}

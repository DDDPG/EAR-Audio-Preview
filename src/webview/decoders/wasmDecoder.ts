import {
  sequentialOggOpusStreams,
  singleOggOpusLength,
  trimSingleOggOpus,
} from "./oggOpusLength";
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
  decode = () => decoder.decode(data),
): Promise<WasmDecoderResult> {
  try {
    await decoder.ready;
    const result = await decode();
    await decoder.free();
    return result;
  } catch (error) {
    // All four implementations inherit WASMAudioDecoderWorker (Worker).
    // free() waits for a worker reply; a failed worker may never reply.
    (decoder as unknown as Worker).terminate();
    throw error;
  }
}

async function decodeOggOpus(data: Uint8Array): Promise<WasmDecoderResult> {
  const streams = sequentialOggOpusStreams(data) ?? [data];
  // eslint-disable-next-line @typescript-eslint/naming-convention -- External codec export.
  const { OggOpusDecoderWebWorker } = await import("ogg-opus-decoder");
  const decoded: WasmDecoderResult[] = [];
  for (const stream of streams) {
    const decoder = new OggOpusDecoderWebWorker();
    const result = trimSingleOggOpus(
      stream,
      await decodeAndFree(decoder as unknown as DecoderWorker, stream, () =>
        decoder.decodeFile(stream),
      ),
    );
    const expected = singleOggOpusLength(
      stream,
      result.sampleRate,
      result.channelData.length,
    );
    if (expected !== null && result.samplesDecoded !== expected) {
      throw new Error("Incomplete Ogg Opus stream");
    }
    if (
      decoded.length &&
      (result.sampleRate !== decoded[0].sampleRate ||
        result.channelData.length !== decoded[0].channelData.length)
    ) {
      throw new Error(
        "Chained Ogg Opus streams must have matching sample rates and channels",
      );
    }
    decoded.push(result);
  }
  if (decoded.length === 1) {
    return decoded[0];
  }
  const samplesDecoded = decoded.reduce(
    (sum, result) => sum + result.samplesDecoded,
    0,
  );
  const channelData = decoded[0].channelData.map(
    () => new Float32Array(samplesDecoded),
  );
  let offset = 0;
  for (const result of decoded) {
    result.channelData.forEach((channel, index) =>
      channelData[index].set(channel, offset),
    );
    offset += result.samplesDecoded;
  }
  return { sampleRate: decoded[0].sampleRate, samplesDecoded, channelData };
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
      // Streaming decode() retains the last frame until flush; this is a complete file.
      return await decodeAndFree(decoder, data, () => decoder.decodeFile(data));
    }
    if (lowerExt === "ogg") {
      // Try Vorbis first, fall back to Opus
      try {
        const { OggVorbisDecoderWebWorker } = await import(
          "@wasm-audio-decoders/ogg-vorbis"
        );
        const decoder = new OggVorbisDecoderWebWorker();
        return await decodeAndFree(decoder, data, () =>
          decoder.decodeFile(data),
        );
      } catch {
        return await decodeOggOpus(data);
      }
    }
    if (lowerExt === "opus") {
      return await decodeOggOpus(data);
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

import type { IAudioDecoder } from "./audioDecoderInterface";

type HeaderField = { type: string; value: string };

/** Uncompressed, interleaved signed PCM in a NIST SPHERE container. */
export class SphereDecoder implements IAudioDecoder {
  private _samples: Float32Array[] = [];
  private _sampleRate = 0;
  private _length = 0;
  private _bitDepth = 0;

  constructor(private readonly _data: Uint8Array) {}

  get numChannels(): number {
    return this._samples.length;
  }
  get sampleRate(): number {
    return this._sampleRate;
  }
  get sourceSampleRate(): number | null {
    return this._sampleRate || null;
  }
  get duration(): number {
    return this._sampleRate ? this._length / this._sampleRate : 0;
  }
  get length(): number {
    return this._length;
  }
  get format(): string {
    return "SPH";
  }
  get encoding(): string {
    return "PCM";
  }
  get bitDepth(): number | null {
    return this._bitDepth || null;
  }
  get fileSize(): number {
    return this._data.byteLength;
  }
  get samples(): Float32Array[] {
    return this._samples;
  }
  readAudioInfo(): void {
    /* Available after decode(). */
  }

  decode(): void {
    this.dispose();
    const ascii = (data: Uint8Array): string => {
      let text = "";
      for (const byte of data) {
        if (byte > 127) {
          throw new Error("Invalid SPHERE ASCII header");
        }
        text += String.fromCharCode(byte);
      }
      return text;
    };
    const prefix = ascii(this._data.subarray(0, 16));
    if (!/^NIST_1A\n *[0-9]+\n$/.test(prefix)) {
      throw new Error("Invalid NIST SPHERE signature");
    }
    const headerSize = Number(prefix.slice(8).trim());
    if (
      !Number.isSafeInteger(headerSize) ||
      headerSize < 1024 ||
      headerSize % 1024 !== 0 ||
      headerSize > 1048576 ||
      headerSize > this._data.length
    ) {
      throw new Error("Invalid SPHERE header size");
    }
    const lines = ascii(this._data.subarray(16, headerSize)).split("\n");
    const fields = new Map<string, HeaderField>();
    let ended = false;
    for (const line of lines) {
      if (line === "end_head") {
        ended = true;
        break;
      }
      const match = /^(\w+)[ \t]+-(i|r|s[0-9]+)[ \t]+(.*)$/.exec(line);
      if (!match || fields.has(match[1])) {
        throw new Error("Invalid or duplicate SPHERE header field");
      }
      if (
        match[2].startsWith("s") &&
        Number(match[2].slice(1)) !== match[3].length
      ) {
        throw new Error("Invalid SPHERE string field length");
      }
      fields.set(match[1], { type: match[2], value: match[3] });
    }
    if (!ended) {
      throw new Error("Missing SPHERE end_head marker");
    }
    const integer = (name: string): number => {
      const field = fields.get(name);
      if (
        field?.type !== "i" ||
        !/^-?[0-9]+$/.test(field.value) ||
        !Number.isSafeInteger(Number(field.value))
      ) {
        throw new Error(`Invalid SPHERE ${name}`);
      }
      return Number(field.value);
    };
    const string = (name: string): string => {
      const field = fields.get(name);
      if (!field?.type.startsWith("s")) {
        throw new Error(`Invalid SPHERE ${name}`);
      }
      return field.value;
    };
    const channels = integer("channel_count");
    const count = integer("sample_count");
    const rate = integer("sample_rate");
    const bytes = integer("sample_n_bytes");
    const coding = fields.has("sample_coding")
      ? string("sample_coding")
      : "pcm";
    if (coding !== "pcm") {
      throw new Error(
        `Unsupported SPHERE coding: ${coding}; convert to PCM WAV or FLAC`,
      );
    }
    if (
      channels < 1 ||
      channels > 32 ||
      count < 1 ||
      rate < 1 ||
      rate > 768000 ||
      bytes < 1 ||
      bytes > 4
    ) {
      throw new Error("Unsupported SPHERE PCM dimensions");
    }
    const bits = bytes * 8;
    if (fields.has("sample_sig_bits") && integer("sample_sig_bits") !== bits) {
      throw new Error("Unsupported SPHERE significant-bit packing");
    }
    if (
      fields.has("channels_interleaved") &&
      integer("channels_interleaved") !== 1
    ) {
      throw new Error("Unsupported non-interleaved SPHERE channels");
    }
    const order = string("sample_byte_format");
    const ascending = Array.from({ length: bytes }, (_, i) => i).join("");
    const descending = Array.from(
      { length: bytes },
      (_, i) => bytes - i - 1,
    ).join("");
    if (
      order !== ascending &&
      order !== descending &&
      !(bytes === 1 && order === "1")
    ) {
      throw new Error("Unsupported SPHERE sample byte order");
    }
    const payloadSize = channels * count * bytes;
    if (
      !Number.isSafeInteger(payloadSize) ||
      this._data.length - headerSize !== payloadSize
    ) {
      throw new Error("SPHERE sample count does not match PCM payload");
    }
    const samples = Array.from(
      { length: channels },
      () => new Float32Array(count),
    );
    const littleEndian = order === ascending;
    const sign = 2 ** (bits - 1);
    const modulus = 2 ** bits;
    let offset = headerSize;
    for (let frame = 0; frame < count; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        let value = 0;
        for (let byte = 0; byte < bytes; byte++) {
          const index = littleEndian ? byte : bytes - byte - 1;
          value += this._data[offset + byte] * 2 ** (index * 8);
        }
        samples[channel][frame] =
          (value >= sign ? value - modulus : value) / sign;
        offset += bytes;
      }
    }
    this._samples = samples;
    this._sampleRate = rate;
    this._length = count;
    this._bitDepth = bits;
  }

  dispose(): void {
    this._samples = [];
    this._sampleRate = 0;
    this._length = 0;
    this._bitDepth = 0;
  }
}

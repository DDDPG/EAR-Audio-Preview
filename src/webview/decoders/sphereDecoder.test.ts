/* eslint-disable @typescript-eslint/naming-convention -- NIST header field names. */
import fs from "fs";
import path from "path";
import { SphereDecoder } from "./sphereDecoder";

function sphere(
  options: {
    bytes?: number;
    bigEndian?: boolean;
    overrides?: Record<string, string>;
    payload?: Uint8Array;
  } = {},
): Uint8Array {
  const bytes = options.bytes ?? 2;
  const fields = {
    channel_count: "-i 2",
    sample_count: "-i 2",
    sample_rate: "-i 16000",
    sample_n_bytes: `-i ${bytes}`,
    sample_sig_bits: `-i ${bytes * 8}`,
    sample_byte_format: `-s${bytes} ${Array.from({ length: bytes }, (_, i) => (options.bigEndian ? bytes - 1 - i : i)).join("")}`,
    sample_coding: "-s3 pcm",
    ...options.overrides,
  };
  const text =
    "NIST_1A\n   1024\n" +
    Object.entries(fields)
      .map(([name, value]) => `${name} ${value}\n`)
      .join("") +
    "end_head\n";
  const data = new Uint8Array(1024 + (options.payload?.length ?? bytes * 4));
  data.fill(32, 0, 1024);
  data.set(Uint8Array.from(text, (ch) => ch.charCodeAt(0)));
  if (options.payload) {
    data.set(options.payload, 1024);
  } else {
    const values = [
      -(2 ** (bytes * 8 - 1)),
      0,
      2 ** (bytes * 8 - 2),
      2 ** (bytes * 8 - 1) - 1,
    ];
    values.forEach((value, index) => {
      const unsigned = value < 0 ? value + 2 ** (bytes * 8) : value;
      for (let i = 0; i < bytes; i++) {
        data[1024 + index * bytes + i] =
          Math.floor(
            unsigned / 2 ** ((options.bigEndian ? bytes - 1 - i : i) * 8),
          ) & 255;
      }
    });
  }
  return data;
}

test.each([1, 2, 3, 4])(
  "decodes signed %s-byte PCM with correct channel interleaving in either byte order",
  (bytes) => {
    for (const bigEndian of [false, true]) {
      const decoder = new SphereDecoder(sphere({ bytes, bigEndian }));
      decoder.decode();
      expect(decoder.numChannels).toBe(2);
      expect(decoder.sampleRate).toBe(16000);
      expect(decoder.sourceSampleRate).toBe(16000);
      expect(decoder.bitDepth).toBe(bytes * 8);
      expect(decoder.length).toBe(2);
      expect(decoder.duration).toBe(2 / 16000);
      expect(Array.from(decoder.samples[0])).toEqual([-1, 0.5]);
      expect(decoder.samples[1][0]).toBe(0);
      expect(decoder.samples[1][1]).toBeCloseTo(
        1 - 1 / 2 ** (bytes * 8 - 1),
        7,
      );
    }
  },
);

test.each([
  { sample_coding: "-s5 ulaw" },
  { sample_byte_format: "-s2 11" },
  { sample_count: "-i 100" },
  { channel_count: "-i 0" },
  { sample_rate: "-i NaN" },
  { sample_n_bytes: "-i 5" },
  { sample_sig_bits: "-i 12" },
  { channels_interleaved: "-i 0" },
])("rejects unsupported or inconsistent header fields %p", (overrides) => {
  expect(() => new SphereDecoder(sphere({ overrides })).decode()).toThrow(
    /SPHERE/,
  );
});

test("rejects missing end marker, invalid string lengths, duplicate fields and truncated headers", () => {
  const original = sphere();
  const mutate = (search: string, replacement: string) => {
    const text = Array.from(original.subarray(0, 1024), (byte) =>
      String.fromCharCode(byte),
    )
      .join("")
      .replace(search, replacement);
    const data = original.slice();
    data.fill(32, 0, 1024);
    data.set(Uint8Array.from(text.slice(0, 1024), (ch) => ch.charCodeAt(0)));
    return data;
  };
  for (const data of [
    original.slice(0, 800),
    mutate("end_head", "no_end!!"),
    mutate("-s3 pcm", "-s2 pcm"),
    mutate("end_head", "sample_count -i 2\nend_head"),
  ]) {
    expect(() => new SphereDecoder(data).decode()).toThrow(/SPHERE/);
  }
});

test("decodes a real NIST PCM fixture using byte-offset views and clears owned PCM", () => {
  const file = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../__fixtures__/codec-compatibility/pcm16-mono.sph",
    ),
  );
  const storage = new Uint8Array(file.length + 12);
  storage.set(file, 7);
  const decoder = new SphereDecoder(storage.subarray(7, 7 + file.length));
  decoder.decode();
  expect(decoder.length).toBe(1600);
  expect(decoder.sampleRate).toBe(16000);
  expect(decoder.numChannels).toBe(1);
  expect(decoder.samples[0][1599]).toBeCloseTo(
    Math.trunc(12000 * Math.sin((1599 * Math.PI) / 16)) / 32768,
    7,
  );
  decoder.dispose();
  expect(decoder.samples).toEqual([]);
  expect(decoder.duration).toBe(0);
});

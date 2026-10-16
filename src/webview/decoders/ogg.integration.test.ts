/** @jest-environment node */
import { execFileSync } from "child_process";
import path from "path";

const fixtureDirectory = path.resolve(
  __dirname,
  "../../__fixtures__/codec-compatibility",
);

function decodeRealFiles(): Array<{
  name: string;
  streaming: number;
  tail: number;
  complete: number;
  sampleRate: number;
  channels: number;
  sourceSamples: number;
  errors: unknown[];
}> {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import fs from "node:fs";
    import { OggVorbisDecoder } from "@wasm-audio-decoders/ogg-vorbis";
    import { OggOpusDecoder } from "ogg-opus-decoder";
    const directory = process.argv[1];
    const manifest = JSON.parse(fs.readFileSync(directory + "/manifest.json"));
    const results = [];
    for (const file of manifest.files.filter(file => file.codec === "vorbis" || file.codec === "opus")) {
      const bytes = fs.readFileSync(directory + "/" + file.name);
      const Decoder = file.codec === "vorbis" ? OggVorbisDecoder : OggOpusDecoder;
      const decoder = new Decoder(); await decoder.ready;
      try {
        const streaming = await decoder.decode(bytes);
        const tail = await decoder.flush();
        const complete = await decoder.decodeFile(bytes);
        let offset = 0, granule = 0;
        while (offset < bytes.length) {
          const segments = bytes[offset + 26];
          const size = [...bytes.subarray(offset + 27, offset + 27 + segments)].reduce((a, b) => a + b, 0);
          if (bytes[offset + 5] & 4) granule = Number(bytes.readBigInt64LE(offset + 6));
          offset += 27 + segments + size;
        }
        const preSkip = file.codec === "opus" ? bytes.readUInt16LE(bytes.indexOf("OpusHead") + 10) : 0;
        results.push({ name: file.name, streaming: streaming.samplesDecoded,
          tail: tail.samplesDecoded, complete: complete.samplesDecoded,
          sampleRate: complete.sampleRate, channels: complete.channelData.length,
          sourceSamples: granule - preSkip, errors: complete.errors });
      } finally { decoder.free(); }
    }
    const vorbis = new OggVorbisDecoder(); await vorbis.ready;
    let rejectedOpus = false;
    try { await vorbis.decodeFile(fs.readFileSync(directory + "/reference-mono-48000-opus-container.ogg")); }
    catch { rejectedOpus = true; } finally { vorbis.free(); }
    if (!rejectedOpus) throw new Error("Vorbis must reject Opus so the codec fallback runs");
    console.log(JSON.stringify(results));
  `,
        fixtureDirectory,
      ],
      { encoding: "utf8", cwd: path.resolve(__dirname, "../../..") },
    ),
  );
}

test("real Ogg decoders require complete-file parsing and support Opus in an .ogg container", () => {
  const results = decodeRealFiles();
  expect(results).toHaveLength(8);
  for (const result of results) {
    expect(result.sampleRate).toBe(48000);
    expect(result.channels).toBe(result.name.includes("stereo") ? 2 : 1);
    const expectedSamples = result.name.includes("12s") ? 576000 : 10000;
    expect(result.sourceSamples).toBe(expectedSamples);
    expect(result.streaming).toBeLessThan(result.sourceSamples);
    expect(result.streaming + result.tail).toBe(result.complete);
    // The raw Opus dependency can retain encoder padding on a one-page stream.
    // Production-wrapper tests must enforce granule/pre-skip trimming separately.
    expect(result.complete).toBeGreaterThanOrEqual(result.sourceSamples);
    expect(result.errors).toEqual([]);
    if (!result.name.includes("opus")) {
      expect(result.complete).toBe(expectedSamples);
    }
  }
});

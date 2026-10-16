/** @jest-environment node */
import fs from "fs";
import path from "path";
import { createDecoder } from "./decoderFactory";

test("factory decodes real NIST SPHERE PCM without a browser AudioContext", async () => {
  const file = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../__fixtures__/codec-compatibility/pcm16-mono.sph",
    ),
  );
  const decoder = await createDecoder(file, ".SPH");
  expect(decoder.format).toBe("SPH");
  expect(decoder.encoding).toBe("PCM");
  expect(decoder.sampleRate).toBe(16000);
  expect(decoder.sourceSampleRate).toBe(16000);
  expect(decoder.bitDepth).toBe(16);
  expect(decoder.numChannels).toBe(1);
  expect(decoder.length).toBe(1600);
  expect(decoder.duration).toBe(0.1);
  expect(decoder.samples[0][8]).toBeCloseTo(12000 / 32768, 7);
  expect(decoder.samples[0][1599]).toBeCloseTo(
    Math.trunc(12000 * Math.sin((1599 * Math.PI) / 16)) / 32768,
    7,
  );
  decoder.dispose();
  expect(decoder.samples).toEqual([]);
});

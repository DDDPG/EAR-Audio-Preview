/** @jest-environment node */
import * as fs from "fs";
import * as path from "path";
import { decodeAacLocally } from "./aacDecodeCore";

jest.mock("aac/src/ics", () =>
  jest.requireActual("../../../third-party/aac/ics.js"),
);
jest.mock("av", () =>
  jest.requireActual("../../../scripts/aurora-runtime.cjs"),
);

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    fs.readFileSync(
      path.join(__dirname, "../../__fixtures__/codec-compatibility", name),
    ),
  );
}

test("local AAC-LC decodes ADTS without the browser audio API", async () => {
  const result = await decodeAacLocally(
    fixture("reference-mono-48000.aac"),
    "aac",
  );
  expect(result.sampleRate).toBe(48000);
  expect(result.channelData).toHaveLength(1);
  expect(result.samplesDecoded).toBeGreaterThanOrEqual(10000);
  expect(result.channelData[0].every(Number.isFinite)).toBe(true);
  expect(result.channelData[0].some((value) => Math.abs(value) > 0.001)).toBe(
    true,
  );
});

test("M4A applies the container edit instead of exposing AAC priming and final padding", async () => {
  const result = await decodeAacLocally(
    fixture("reference-stereo-48000.m4a"),
    "m4a",
  );
  expect(result.sampleRate).toBe(48000);
  expect(result.channelData).toHaveLength(2);
  // elst declares 208 / 1000 seconds. Its media_time skips 1024 priming samples.
  expect(result.samplesDecoded).toBe(9984);
  expect(result.channelData[0]).toHaveLength(9984);
  expect(result.channelData[0].some((value) => Math.abs(value) > 0.001)).toBe(
    true,
  );
});

test("non-LC ADTS profiles fail explicitly rather than returning incorrect audio", async () => {
  const data = fixture("reference-mono-48000.aac");
  data[2] = data[2] & 0x3f; // ADTS object type 1: AAC Main, not LC.
  await expect(decodeAacLocally(data, "aac")).rejects.toThrow(/AAC-LC only/);
});

function tonePower(samples: Float32Array, frequency: number): number {
  let real = 0,
    imag = 0;
  for (let i = 2048; i < samples.length - 1024; i++) {
    const angle = (2 * Math.PI * frequency * i) / 48000;
    real += samples[i] * Math.cos(angle);
    imag += samples[i] * Math.sin(angle);
  }
  return real * real + imag * imag;
}

test("PNS compatibility fix preserves the encoded 440 / 880 Hz stereo tones", async () => {
  const result = await decodeAacLocally(
    fixture("reference-stereo-48000.m4a"),
    "m4a",
  );
  expect(tonePower(result.channelData[0], 440)).toBeGreaterThan(
    tonePower(result.channelData[0], 880) * 100,
  );
  expect(tonePower(result.channelData[1], 880)).toBeGreaterThan(
    tonePower(result.channelData[1], 440) * 100,
  );
});

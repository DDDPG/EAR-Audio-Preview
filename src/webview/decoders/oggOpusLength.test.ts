/** @jest-environment node */
import fs from "fs";
import path from "path";
import {
  singleOggOpusLength,
  trimSingleOggOpus,
  sequentialOggOpusStreams,
} from "./oggOpusLength";
const fixture = (name = "reference-mono-48000.opus") =>
  new Uint8Array(
    fs.readFileSync(
      path.resolve(__dirname, "../../__fixtures__/codec-compatibility", name),
    ),
  );

test("single-stream EOS and pre-skip give exact source length without changing PCM", () => {
  const bytes = fixture();
  expect(singleOggOpusLength(bytes, 48000, 1)).toBe(10000);
  expect(singleOggOpusLength(bytes, 24000, 1)).toBe(5000);
  const channel = Float32Array.from({ length: 10248 }, (_, sample) => sample);
  const decoded = {
    channelData: [channel],
    samplesDecoded: 10248,
    sampleRate: 48000,
  };
  const trimmed = trimSingleOggOpus(bytes, decoded);
  expect(trimmed.samplesDecoded).toBe(10000);
  expect(trimmed.channelData[0]).toEqual(channel.subarray(0, 10000));
  expect(trimmed.channelData[0].buffer).toBe(channel.buffer);
  expect(decoded.samplesDecoded).toBe(10248);
});

test("malformed, partial, other-codec and chained streams cannot cause trimming", () => {
  const valid = fixture();
  const corrupt = valid.slice();
  corrupt[corrupt.length - 1] ^= 1;
  const chained = new Uint8Array(valid.length * 2);
  chained.set(valid);
  chained.set(valid, valid.length);
  const changedSerial = valid.slice();
  changedSerial[14] ^= 1;
  const decoded = {
    channelData: [new Float32Array(20496)],
    samplesDecoded: 20496,
    sampleRate: 48000,
  };
  for (const bytes of [
    valid.subarray(0, 10),
    valid.subarray(0, valid.length - 1),
    corrupt,
    chained,
    changedSerial,
    fixture("reference-mono-48000.ogg"),
  ]) {
    expect(singleOggOpusLength(bytes, 48000, 1)).toBeNull();
    expect(trimSingleOggOpus(bytes, decoded)).toBe(decoded);
  }
  expect(singleOggOpusLength(valid, 48000, 2)).toBeNull();
  expect(singleOggOpusLength(valid, NaN, 1)).toBeNull();
  expect(
    trimSingleOggOpus(valid, { ...decoded, samplesDecoded: 9000 }),
  ).toEqual({ ...decoded, samplesDecoded: 9000 });
});

test("sequential streams split only at validated EOS/BOS boundaries", () => {
  const chain = fixture("reference-chained-mono-48000.opus");
  expect(singleOggOpusLength(chain, 48000, 1)).toBeNull();
  const streams = sequentialOggOpusStreams(chain);
  expect(streams).toHaveLength(2);
  expect(
    streams.map((stream) => singleOggOpusLength(stream, 48000, 1)),
  ).toEqual([10000, 10000]);
  const invalid = chain.slice();
  invalid[invalid.length - 1] ^= 1;
  expect(() => sequentialOggOpusStreams(invalid)).toThrow(/Invalid/);
  expect(() =>
    sequentialOggOpusStreams(chain.subarray(0, chain.length - 1)),
  ).toThrow(/Truncated/);
});

test("concurrent logical streams are rejected instead of treated as a sequential chain", () => {
  const streams = sequentialOggOpusStreams(
    fixture("reference-chained-mono-48000.opus"),
  );
  const headerEnd = (bytes: Uint8Array) => {
    const lacingEnd = 27 + bytes[26];
    return (
      lacingEnd +
      bytes.subarray(27, lacingEnd).reduce((sum, size) => sum + size, 0)
    );
  };
  const firstHead = headerEnd(streams[0]);
  const secondHead = headerEnd(streams[1]);
  const parts = [
    streams[0].subarray(0, firstHead),
    streams[1].subarray(0, secondHead),
    streams[0].subarray(firstHead),
    streams[1].subarray(secondHead),
  ];
  const multiplexed = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    multiplexed.set(part, offset);
    offset += part.length;
  }
  expect(() => sequentialOggOpusStreams(multiplexed)).toThrow(/Multiplexed/);
});

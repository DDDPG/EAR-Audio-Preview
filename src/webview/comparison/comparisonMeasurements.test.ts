import { MockAudioBuffer } from "../../__mocks__/helper";
import {
  commonMeasurementRange,
  measureRms,
  matchingGains,
  measureResidual,
} from "./comparisonMeasurements";

function audio(values: number[], channels = 2, rate = 8000): AudioBuffer {
  const buffer = new MockAudioBuffer(channels, values.length, rate);
  buffer.data.forEach((data) => data.set(values));
  return buffer as unknown as AudioBuffer;
}
test("RMS matches only overlapping samples, preserving mono pan and stereo energy", async () => {
  const a = audio([0.5, -0.5, 0.5, -0.5]);
  const b = audio([0.25, -0.25, 0.25, -0.25, 1, 1]);
  const range = commonMeasurementRange([a, b], { start: 0, end: 0 });
  const levels = [await measureRms(a, range), await measureRms(b, range)];
  expect(levels).toEqual([0.5, 0.25]);
  expect(matchingGains(levels)).toEqual([0.5, 1]);
  const mono = audio([0.5, -0.5, 0.5, -0.5], 1);
  expect(await measureRms(mono, range)).toBeCloseTo(0.5 * Math.SQRT1_2, 10);
  expect(Array.from(a.getChannelData(0))).toEqual([0.5, -0.5, 0.5, -0.5]);
});
test("selection and silence validation prevent meaningless or amplifying matches", async () => {
  expect(() => matchingGains([0, 1])).toThrow(/non-silent/);
  expect(() => matchingGains([NaN, 1])).toThrow();
  expect(() =>
    commonMeasurementRange([audio([0])], { start: 1, end: 2 }),
  ).toThrow(/shared/);
  const a = audio([1, 0.25, -0.25, 1]);
  expect(await measureRms(a, { start: 1 / 8000, end: 3 / 8000 })).toBe(0.25);
  await expect(measureRms(audio([NaN]), { start: 0, end: 1 })).rejects.toThrow(
    /non-finite/,
  );
  await expect(measureRms(a, { start: 0, end: 1 }, () => true)).rejects.toThrow(
    /cancelled/,
  );
});
test("residual is sample-exact with matching gain, stereo cancellation is not downmixed away", async () => {
  const a = audio([0.5, -0.5, 0.5, -0.5]);
  const b = audio([0.25, -0.25, 0.25, -0.25]);
  const range = { start: 0, end: a.duration };
  const nullTest = await measureResidual(a, b, range, 0.5, 1);
  expect(nullTest.rmsDbfs).toBe(-Infinity);
  expect(nullTest.peakDbfs).toBe(-Infinity);
  expect(nullTest.frames).toBe(4);
  b.getChannelData(1).fill(-0.25);
  const result = await measureResidual(a, b, range);
  // Errors: left [+0.25,-0.25,...], right [+0.75,-0.25,...].
  expect(result.rmsDbfs).toBeCloseTo(10 * Math.log10(0.1875), 10);
  expect(result.peakDbfs).toBeCloseTo(20 * Math.log10(0.75), 10);
  await expect(measureResidual(a, audio([1], 2, 48000), range)).rejects.toThrow(
    /sample rates/,
  );
  await expect(measureResidual(a, b, range, 1, 1, () => true)).rejects.toThrow(
    /cancelled/,
  );
});

test.each([
  [44100, 44109],
  [48000, 48005],
  [96000, 96001],
])(
  "full %i Hz files retain their last frame (%i frames)",
  async (rate, length) => {
    const values = new Array<number>(length).fill(0);
    values[length - 1] = 1;
    const reference = audio(values, 2, rate);
    const candidate = audio(new Array<number>(length).fill(0), 2, rate);
    const range = commonMeasurementRange([reference, candidate], {
      start: 0,
      end: 0,
    });
    expect(await measureRms(reference, range)).toBeCloseTo(
      Math.sqrt(1 / length),
      12,
    );
    const residual = await measureResidual(reference, candidate, range);
    expect(residual.frames).toBe(length);
    expect(residual.peakDbfs).toBe(0);
    expect(residual.rmsDbfs).toBeCloseTo(-10 * Math.log10(length), 12);
  },
);

test.each([
  [44100, 13, 15],
  [48000, 7, 27],
  [96000, 7, 27],
])(
  "integer selection boundaries at %i Hz retain both edge frames",
  async (rate, start, end) => {
    const values = new Array<number>(end + 2).fill(0);
    values[start] = 1;
    values[end - 1] = 0.5;
    const reference = audio(values, 2, rate);
    const candidate = audio(new Array<number>(values.length).fill(0), 2, rate);
    const range = { start: start / rate, end: end / rate };
    expect(await measureRms(reference, range)).toBeCloseTo(
      Math.sqrt(1.25 / (end - start)),
      12,
    );
    const residual = await measureResidual(reference, candidate, range);
    expect(residual.frames).toBe(end - start);
    expect(residual.peakDbfs).toBe(0);
    expect(residual.rmsDbfs).toBeCloseTo(
      10 * Math.log10(1.25 / (end - start)),
      12,
    );
  },
);

test.each([0.25, 1e-7])(
  "fractional boundaries still exclude incomplete samples (%s frame)",
  async (fraction) => {
    const rate = 48000;
    const values = new Array<number>(32).fill(0.25);
    values[7] = 1;
    values[26] = 1;
    const reference = audio(values, 2, rate);
    const candidate = audio(new Array<number>(values.length).fill(0), 2, rate);
    const range = { start: (7 + fraction) / rate, end: (27 - fraction) / rate };
    expect(await measureRms(reference, range)).toBe(0.25);
    const residual = await measureResidual(reference, candidate, range);
    expect(residual.frames).toBe(18);
    expect(residual.peakDbfs).toBeCloseTo(20 * Math.log10(0.25), 12);
  },
);

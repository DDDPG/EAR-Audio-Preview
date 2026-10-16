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

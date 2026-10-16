import { MockAudioBuffer } from "../../__mocks__/helper";
import AnalyzeService from "./analyzeService";

describe("analyzeService", () => {
  test("Mel reuse preserves outputs when spectrum or any filter parameter changes", () => {
    const buffer = new MockAudioBuffer(1, 128, 48000) as unknown as AudioBuffer;
    const cached = new AnalyzeService(buffer);
    const cases: Array<[number, number, number, number, number]> = [
      [8, 128, 48000, 0, 64],
      [8, 128, 48000, 0, 64],
      [12, 128, 48000, 0, 64],
      [12, 256, 48000, 0, 64],
      [12, 256, 44100, 0, 64],
      [12, 256, 44100, 2, 64],
      [12, 256, 44100, 2, 80],
      [8, 128, 48000, 0, 64],
    ];
    for (const [index, [filters, length, rate, low, high]] of cases.entries()) {
      const spectrum = Array.from(
        { length },
        (_, bin) => Math.sin(bin + index) ** 2,
      );
      const fresh = new AnalyzeService(buffer);
      const expected = fresh["applyMelFilterBank"](
        filters,
        spectrum,
        rate,
        low,
        high,
      );
      const actual = cached["applyMelFilterBank"](
        filters,
        spectrum,
        rate,
        low,
        high,
      );
      expect(new Uint8Array(new Float64Array(actual).buffer)).toEqual(
        new Uint8Array(new Float64Array(expected).buffer),
      );
    }
    // Skipping zero-weight terms would change NaN/Infinity behavior.
    const invalid = Array(128).fill(0);
    invalid[127] = Infinity;
    expect(cached["applyMelFilterBank"](8, invalid, 48000, 0, 64)).toEqual(
      new AnalyzeService(buffer)["applyMelFilterBank"](
        8,
        invalid,
        48000,
        0,
        64,
      ),
    );
  });
  test("roundToNearestNiceNumber", () => {
    const examples = [
      { input: -5, expNice: 0, expDigs: 0 },
      { input: 0, expNice: 0, expDigs: 0 },
      { input: 0.0011, expNice: 0.001, expDigs: 3 },
      { input: 0.061, expNice: 0.05, expDigs: 2 },
      { input: 0.084, expNice: 0.1, expDigs: 1 },
      { input: 0.12, expNice: 0.1, expDigs: 1 },
      { input: 0.19, expNice: 0.2, expDigs: 1 },
      { input: 0.38, expNice: 0.5, expDigs: 1 },
      { input: 0.85, expNice: 1.0, expDigs: 0 },
      { input: 1.12, expNice: 1.0, expDigs: 0 },
      { input: 9.3, expNice: 10, expDigs: 0 },
      { input: 10.5, expNice: 10, expDigs: 0 },
      { input: 265, expNice: 200, expDigs: 0 },
      { input: 6890, expNice: 5000, expDigs: 0 },
    ];

    for (const example of examples) {
      const [nice, dig] = AnalyzeService.roundToNearestNiceNumber(
        example.input,
      );
      expect(nice).toBe(example.expNice);
      expect(dig).toBe(example.expDigs);
    }
  });

  test("ANALYZE event should be dispatched", () => {
    const audioBuffer = new MockAudioBuffer(
      1,
      44100,
      44100,
    ) as unknown as AudioBuffer;
    const analyzeService = new AnalyzeService(audioBuffer);
    const spy = jest.spyOn(analyzeService, "dispatchEvent");
    analyzeService.analyze();
    expect(spy).toHaveBeenCalledWith(new CustomEvent("ANALYZE"));
    spy.mockReset();
    spy.mockRestore();
  });

  test("windowRmsPeak", () => {
    const data = new Float32Array([0.6, -0.8, 0, 0.6]);
    const { rms, peak } = AnalyzeService.windowRmsPeak(data, 1, 4);
    expect(peak).toBeCloseTo(0.8, 5);
    const meanSq = (0.36 + 0.64 + 0 + 0.36) / 4;
    expect(rms).toBeCloseTo(Math.sqrt(meanSq), 5);
  });
});

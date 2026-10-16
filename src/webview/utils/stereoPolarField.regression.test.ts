import {
  computeInstantPolarBins,
  interpolatePolarRmsAtAngle,
  isInPhaseStereoAngle,
  polarBinToAngleRad,
  polarFieldCanvasXY,
  stereoFieldAngleRad,
} from "./stereoPolarField";

describe("polar geometry contracts", () => {
  test.each([
    [1, 0],
    [0, 1],
  ])("deposition, lookup and canvas agree for L=%s R=%s", (left, right) => {
    const bins = new Float32Array(120);
    computeInstantPolarBins(
      new Float32Array([left]),
      new Float32Array([right]),
      bins,
      1,
    );
    const index = bins.findIndex((v) => v > 0);
    const source = stereoFieldAngleRad(left, right);
    const projected = polarBinToAngleRad(index, bins.length);
    expect(Math.abs(projected - source)).toBeLessThanOrEqual(
      Math.PI / bins.length,
    );
    expect(interpolatePolarRmsAtAngle(bins, source)).toBeGreaterThan(0);
    const point = polarFieldCanvasXY(100, 100, 80, projected, 1);
    expect(left ? point.x < 100 : point.x > 100).toBe(true);
  });

  test.each([
    [1, 1],
    [1, 0],
    [0, 1],
    [1, -0.5],
    [-0.5, 1],
    [1e-20, 0],
  ])(
    "common polarity does not change stereo direction: %s, %s",
    (left, right) => {
      expect(stereoFieldAngleRad(-left, -right)).toBeCloseTo(
        stereoFieldAngleRad(left, right),
        12,
      );
    },
  );

  test("both half-cycles of centered mono remain centered and in phase", () => {
    const signal = Float32Array.from({ length: 1024 }, (_, i) =>
      Math.sin(i * 0.13),
    );
    for (const sample of signal) {
      expect(stereoFieldAngleRad(sample, sample)).toBeCloseTo(Math.PI / 2, 12);
      expect(isInPhaseStereoAngle(stereoFieldAngleRad(sample, sample))).toBe(
        true,
      );
    }
    const bins = new Float32Array(120);
    computeInstantPolarBins(signal, signal, bins, 1);
    expect(bins.filter((v) => v > 0).length).toBe(1);
    expect(bins[60]).toBeGreaterThan(0);
  });

  test("anti-phase keeps both baseline wings", () => {
    expect(stereoFieldAngleRad(1, -1)).toBe(Math.PI);
    expect(stereoFieldAngleRad(-1, 1)).toBe(0);
  });

  test("interpolation never extrapolates beyond nonnegative RMS bins", () => {
    for (const bins of [
      new Float32Array([0, 1]),
      new Float32Array([1, 0]),
      new Float32Array([0.2, 0.8, 0.4]),
    ]) {
      for (let step = 0; step <= 120; step++) {
        const value = interpolatePolarRmsAtAngle(bins, (Math.PI * step) / 120);
        expect(value).toBeGreaterThanOrEqual(Math.min(...bins));
        expect(value).toBeLessThanOrEqual(Math.max(...bins));
      }
      expect(interpolatePolarRmsAtAngle(bins, 0)).toBe(bins[0]);
      expect(interpolatePolarRmsAtAngle(bins, Math.PI)).toBe(
        bins[bins.length - 1],
      );
    }
  });
});

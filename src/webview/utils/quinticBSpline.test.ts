import {
  quinticBSplineSmooth,
  quinticBSplineSmoothInto,
} from "./quinticBSpline";

describe("quinticBSplineSmooth", () => {
  test("returns empty array for empty input", () => {
    expect(quinticBSplineSmooth([]).length).toBe(0);
  });

  test("output has same length as input", () => {
    const data = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.2));
    const out = quinticBSplineSmooth(data);
    expect(out.length).toBe(50);
  });

  test("constant signal is preserved", () => {
    const data = new Float32Array(20).fill(3.14);
    const out = quinticBSplineSmooth(data);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(3.14, 4);
    }
  });

  test("output is smoother than input (reduces high-frequency noise)", () => {
    // Alternating +1/-1 is the highest-frequency signal possible;
    // the B-spline should strongly attenuate it.
    const data = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const out = quinticBSplineSmooth(data);
    const rmsIn = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
    const rmsOut = Math.sqrt(
      Array.from(out).reduce((s, v) => s + v * v, 0) / out.length,
    );
    // Smoothed RMS should be substantially lower than input RMS.
    expect(rmsOut).toBeLessThan(rmsIn * 0.5);
  });
});

describe("quinticBSplineSmoothInto", () => {
  test("matches the clamped convolution bit-for-bit, including short arrays", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 33, 300, 4096]) {
      for (const typed of [false, true]) {
        const values = Array.from(
          { length },
          (_, i) => Math.sin(i * 1.37) * 120,
        );
        const data = typed ? new Float32Array(values) : values;
        const expected = new Float32Array(length);
        for (let i = 0; i < length; i++) {
          expected[i] =
            (1 / 120) * data[Math.max(0, i - 2)] +
            (26 / 120) * data[Math.max(0, i - 1)] +
            (66 / 120) * data[i] +
            (26 / 120) * data[Math.min(length - 1, i + 1)] +
            (1 / 120) * data[Math.min(length - 1, i + 2)];
        }
        expect(new Uint8Array(quinticBSplineSmooth(data).buffer)).toEqual(
          new Uint8Array(expected.buffer),
        );
        const out = new Float32Array(length);
        quinticBSplineSmoothInto(data, out);
        expect(new Uint8Array(out.buffer)).toEqual(
          new Uint8Array(expected.buffer),
        );
        expect(Array.from(data)).toEqual(
          typed ? Array.from(new Float32Array(values)) : values,
        );
      }
    }
  });

  test("matches the allocating variant element-for-element", () => {
    const data = Array.from({ length: 33 }, (_, i) => Math.sin(i * 0.37) * 5);
    const out = new Float32Array(data.length);
    quinticBSplineSmoothInto(data, out);
    expect(Array.from(out)).toEqual(Array.from(quinticBSplineSmooth(data)));
  });
});

import { colorStftColumns } from "./stftColor";
test("incremental STFT pixels equal full coloring byte for byte", () => {
  const columns = 121,
    bins = 33;
  const values = Float32Array.from({ length: columns * bins }, (_, i) =>
    i % 19 === 0 ? NaN : -120 + 130 * Math.sin(i) ** 2,
  );
  const whole = new Uint8ClampedArray(columns * bins * 4),
    incremental = whole.slice();
  colorStftColumns(values, columns, bins, 0, columns, whole);
  for (let column = 0; column < columns; column += 11) {
    colorStftColumns(values, columns, bins, column, 11, incremental);
  }
  expect(incremental).toEqual(whole);
});

test("display range changes color without changing spectral samples", () => {
  const values = new Float32Array([-50]);
  const full = new Uint8ClampedArray(4),
    narrow = new Uint8ClampedArray(4);
  colorStftColumns(values, 1, 1, 0, 1, full, -100, 0);
  colorStftColumns(values, 1, 1, 0, 1, narrow, -50, 0);
  expect(full[0]).toBeGreaterThan(0);
  expect(narrow[0]).toBe(0);
  expect(values[0]).toBe(-50);
});

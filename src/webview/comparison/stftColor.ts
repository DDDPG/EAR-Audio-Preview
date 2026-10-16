/** Incremental column coloring keeps the exact original transfer function. */
export function colorStftColumns(
  values: Float32Array,
  columns: number,
  bins: number,
  first: number,
  count: number,
  pixels: Uint8ClampedArray,
  dbLow = -100,
  dbHigh = 0,
): void {
  for (let col = first; col < Math.min(columns, first + count); col++) {
    for (let bin = 0; bin < bins; bin++) {
      const db = values[col * bins + bin],
        p = ((bins - 1 - bin) * columns + col) * 4;
      const level = Math.min(
        1,
        Math.max(0, (db - dbLow) / Math.max(1, dbHigh - dbLow)),
      );
      pixels[p] = Number.isFinite(db) ? Math.round(255 * level ** 0.65) : 18;
      pixels[p + 1] = Number.isFinite(db) ? Math.round(220 * level ** 2.4) : 18;
      pixels[p + 2] = Number.isFinite(db)
        ? Math.round(130 * (1 - level) * Math.sqrt(level))
        : 20;
      pixels[p + 3] = 255;
    }
  }
}

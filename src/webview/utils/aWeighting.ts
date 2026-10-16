export function aWeightDb(hz: number): number {
  if (hz <= 0) {
    return -120;
  }
  const f2 = hz * hz;
  const ratio =
    (12194 ** 2 * f2 * f2) /
    ((f2 + 20.6 ** 2) *
      Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
      (f2 + 12194 ** 2));
  return 20 * Math.log10(ratio) + 2;
}

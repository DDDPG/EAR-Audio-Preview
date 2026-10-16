/** Iterative radix-2 complex FFT; independently implemented, no per-butterfly allocations. */
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  for (let span = 2; span <= n; span *= 2) {
    const theta = (inverse ? 2 : -2) * Math.PI / span;
    const stepR = Math.cos(theta), stepI = Math.sin(theta), half = span / 2;
    for (let start = 0; start < n; start += span) {
      let wr = 1, wi = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k, b = a + half;
        const br = re[b] * wr - im[b] * wi, bi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - br; im[b] = im[a] - bi; re[a] += br; im[a] += bi;
        const next = wr * stepR - wi * stepI;
        wi = wi * stepR + wr * stepI; wr = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

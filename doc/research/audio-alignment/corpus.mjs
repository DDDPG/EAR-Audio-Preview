import fs from 'node:fs';
export function rng(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 * 2 - 1; };
}
export function signal(n, rate, seed) {
  const random = rng(seed), x = new Float32Array(n);
  let low = 0;
  for (let i = 0; i < n; i++) {
    low = 0.85 * low + 0.15 * random();
    const t = i / rate, envelope = 0.2 + 0.8 * ((Math.floor(t * 7) % 5) / 4);
    x[i] = envelope * (low * 0.6 + 0.12 * Math.sin(2 * Math.PI * (130 * t + 17 * t * t)) + 0.08 * Math.sin(2 * Math.PI * 370 * t));
  }
  return x;
}
export function shift(x, delay, gain = 1, dc = 0, noise = 0, seed = 1) {
  const out = new Float32Array(x.length + Math.max(0, delay)), random = rng(seed);
  for (let i = 0; i < out.length; i++) out[i] = (x[i - delay] ?? 0) * gain + dc + random() * noise;
  return out;
}
function lowpass(x) { let z = 0; return Float32Array.from(x, v => z = 0.6 * z + 0.4 * v); }
export function* syntheticCases(seeds) {
  for (const seed of seeds) for (const rate of [44100, 48000]) {
    const x = signal(rate * 3, rate, seed), y = signal(rate * 3, rate, seed + 10000);
    const base = { rate, seed };
    for (const family of ['copy', 'negative-delay', 'gain-dc-noise', 'polarity', 'side-only', 'unequal-stereo', 'lowpass', 'leading-silence', 'edge-delay']) {
      let a = [x], delay = family === 'negative-delay' ? -523 : family === 'edge-delay' ? rate * 2 : 1105;
      if (family === 'leading-silence') { const p = new Float32Array(rate * 16); p.set(x, rate * 13); a = [p]; }
      if (family === 'side-only') a = [x, Float32Array.from(x, v => -v)];
      if (family === 'unequal-stereo') a = [Float32Array.from(x, v => v * 0.001), y];
      const b = a.map(c => shift(family === 'lowpass' ? lowpass(c) : c, delay, family === 'polarity' ? -0.5 : family === 'gain-dc-noise' ? 0.5 : 1, family === 'gain-dc-noise' ? 0.4 : 0, family === 'gain-dc-noise' ? 0.002 : 0, seed + 1));
      yield { ...base, family, a, b, expected: delay, tolerance: family === 'lowpass' ? 2 : 1, positive: true };
    }
    yield { ...base, family: 'unrelated', a: [x], b: [y], positive: false };
    yield { ...base, family: 'silence', a: [new Float32Array(rate)], b: [new Float32Array(rate)], positive: false };
    yield { ...base, family: 'constant', a: [new Float32Array(rate).fill(0.3)], b: [new Float32Array(rate).fill(0.5)], positive: false };
    const tone = Float32Array.from({ length: rate * 2 }, (_, i) => Math.sin(i * 2 * Math.PI * 200 / rate) * 0.3);
    yield { ...base, family: 'periodic-ambiguous', a: [tone], b: [shift(tone, 220)], positive: false };
  }
}
export function realChannels(name) {
  const raw = fs.readFileSync(new URL(`./local-audio/${name}.f32`, import.meta.url));
  const n = raw.length / 8, a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { a[i] = raw.readFloatLE(i * 8); b[i] = raw.readFloatLE(i * 8 + 4); }
  return [a, b];
}
export function* realCases() {
  for (const name of ['A', 'B', 'C', 'D']) {
    const a = realChannels(name), rate = 48000;
    for (const [family, delay, gain, noise] of [['real-copy', 523, 0.7, 0], ['real-negative', -2307, 1, 0], ['real-polarity', 2112, -0.5, 0], ['real-noise', 777, 0.6, 0.001]]) {
      yield { family, seed: name, rate, a, b: a.map(c => shift(c, delay, gain, 0, noise, 117)), expected: delay, tolerance: 1, positive: true };
    }
  }
}

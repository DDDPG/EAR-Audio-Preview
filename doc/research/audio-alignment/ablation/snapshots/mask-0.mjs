import { fft } from './fft.mjs';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function validate(channels, rate) {
  if (!Number.isFinite(rate) || rate < 8000 || rate > 192000 || !channels.length || channels.length > 2) throw new RangeError('Expected 1–2 channels and 8–192 kHz PCM');
  if (!channels.every(c => c instanceof Float32Array && c.length === channels[0].length)) throw new TypeError('Equal-length Float32Array channels required');
  // Keep every PCM check, but amortize the loop branch over eight samples.
  for (const channel of channels) {
    let i = 0;
    for (; i + 7 < channel.length; i += 8) {
      if (!Number.isFinite(channel[i]) || !Number.isFinite(channel[i + 1]) || !Number.isFinite(channel[i + 2]) || !Number.isFinite(channel[i + 3]) ||
          !Number.isFinite(channel[i + 4]) || !Number.isFinite(channel[i + 5]) || !Number.isFinite(channel[i + 6]) || !Number.isFinite(channel[i + 7])) throw new TypeError('Non-finite PCM');
    }
    for (; i < channel.length; i++) if (!Number.isFinite(channel[i])) throw new TypeError('Non-finite PCM');
  }
}
function energy(x, start, end, stride = 1) {
  let sum = 0, square = 0, n = 0;
  for (let i = start; i < end; i += stride) { const v = x[i]; sum += v; square += v * v; n++; }
  return n ? Math.max(0, square - sum * sum / n) / n : 0;
}
function loudestStart(x, rate, length, limit = x.length) {
  let best = 0, power = -1;
  const end = Math.max(0, Math.min(limit, x.length) - length), step = Math.max(1, Math.floor(length / 2));
  for (let start = 0; start <= end; start += step) {
    const e = energy(x, start, start + length, 16);
    if (e > power) { power = e; best = start; }
  }
  if (power < 1e-12) {
    for (let start = 0; start <= end; start += step) {
      const e = energy(x, start, start + length);
      if (e > power) { power = e; best = start; }
    }
    // Half-window stepping can leave an unvisited tail shorter than one step.
    const tailPower = energy(x, end, end + length);
    if (tailPower > power) best = end;
  }
  return best;
}
function decimate(x, start, count, factor) {
  const radius = 4 * factor, taps = 2 * radius + 1, kernel = new Float64Array(taps);
  let total = 0;
  for (let j = -radius; j <= radius; j++) {
    const z = j * 0.8 / factor;
    const sinc = z === 0 ? 1 : Math.sin(Math.PI * z) / (Math.PI * z);
    const window = 0.42 + 0.5 * Math.cos(Math.PI * j / radius) + 0.08 * Math.cos(2 * Math.PI * j / radius);
    kernel[j + radius] = sinc * window; total += kernel[j + radius];
  }
  const out = new Float64Array(count);
  let mean = 0;
  for (let i = 0; i < count; i++) {
    const center = start + i * factor;
    let sum = 0;
    const first = Math.max(-radius, -center), last = Math.min(radius, x.length - center - 1);
    for (let j = first; j <= last; j++) sum += x[center + j] * kernel[j + radius];
    out[i] = sum / total; mean += out[i];
  }
  mean /= Math.max(1, count);
  for (let i = 0; i < count; i++) out[i] -= mean;
  return out;
}
function coarseCandidates(a, b, limit, factor) {
  const n = 2 ** Math.ceil(Math.log2(a.length + b.length));
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b); fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i], v = ar[i] * bi[i] - ai[i] * br[i];
    ar[i] = r; ai[i] = v;
  }
  fft(ar, ai, true);
  const peaks = [];
  for (let lag = -limit; lag <= limit; lag++) {
    const at = lag < 0 ? n + lag : lag, v = Math.abs(ar[at]);
    if (v >= Math.abs(ar[(at + n - 1) % n]) && v >= Math.abs(ar[(at + 1) % n])) peaks.push({ lag: lag * factor, value: v });
  }
  peaks.sort((a, b) => b.value - a.value);
  return peaks.slice(0, 1);
}
function correlate(a, b, lag, start, count) {
  const first = Math.max(0, start, -lag), end = Math.min(a.length, b.length - lag, start + count), n = end - first;
  if (n < 128) return 0;
  let sa = 0, sb = 0, aa = 0, bb = 0, ab = 0;
  for (let i = first; i < end; i++) {
    const x = a[i], y = b[i + lag]; sa += x; sb += y; aa += x * x; bb += y * y; ab += x * y;
  }
  const va = Math.max(0, aa - sa * sa / n), vb = Math.max(0, bb - sb * sb / n), norm = Math.sqrt(va * vb);
  return norm > n * 1e-14 ? clamp((ab - sa * sb / n) / norm, -1, 1) : 0;
}
/** A[n] ~= polarity * B[n + offsetSamples]; no samples changed by this estimate. */
export function estimateAlignment(aChannels, bChannels, rate, { maxLagSeconds = 2 } = {}) {
  validate(aChannels, rate); validate(bChannels, rate);
  if (!Number.isFinite(maxLagSeconds) || maxLagSeconds < 0 || maxLagSeconds > 10) throw new RangeError('Search range must be 0–10 seconds');
  const rejected = (reason, confidence = 0) => ({ accepted: false, offsetSamples: 0, polarity: 1, confidence, reason });
  const available = Math.min(aChannels[0].length, bChannels[0].length, Math.floor(rate * 60));
  if (available < rate * 0.1) return rejected('too-short');
  const mix = channels => {
    const out = new Float32Array(channels[0].length), weight = 1 / channels.length;
    for (const channel of channels) for (let i=0;i<out.length;i++) out[i] += channel[i] * weight;
    return out;
  };
  const a = mix(aChannels), b = mix(bChannels);
  let bestPower = Math.min(energy(a,0,available,32),energy(b,0,available,32));
  if (bestPower < 1e-12) bestPower = Math.min(energy(a,0,available),energy(b,0,available));
  if (bestPower < 1e-12) return rejected('silent-or-constant');
  const factor = Math.max(1, Math.floor(rate / 2000)), maxLag = Math.floor(rate * maxLagSeconds);
  const windowLength = available, start = 0;
  const count = Math.floor(windowLength / factor);
  const ca = decimate(a, start, count, factor), cb = decimate(b, start, count, factor);
  const peaks = coarseCandidates(ca, cb, Math.min(Math.ceil(maxLag / factor), count - 1), factor);
  if (!peaks.length) return rejected('no-peak');
  const refineLength = Math.min(16384, available);
  const refineStart = loudestStart(a, rate, refineLength, available);
  const candidates = [];
  for (const peak of peaks) {
    let best = { lag: 0, score: -1, rho: 0 };
    for (let lag = Math.max(-maxLag, peak.lag - factor * 2); lag <= Math.min(maxLag, peak.lag + factor * 2); lag++) {
      const rho = correlate(a, b, lag, refineStart, refineLength), score = Math.abs(rho);
      if (score > best.score) best = { lag, score, rho };
    }
    if (!candidates.some(c => Math.abs(c.lag - best.lag) <= factor * 2)) candidates.push(best);
    // Exact-like unique first peak cannot be improved meaningfully by distant candidates.
    if (candidates.length === 1 && best.score > 0.999 && (peaks[1]?.value ?? 0) < peaks[0].value * 0.5) break;
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best.score < 0.75) return rejected('low-correlation', best.score);
  if (candidates[1]?.score > best.score * 0.985) return rejected('ambiguous-peaks', best.score);
  return { accepted: true, offsetSamples: best.lag || 0, polarity: best.rho < 0 ? -1 : 1, confidence: best.score, reason: 'accepted' };
}
/** Stereo linked gain and residual over the valid overlap; excludes zero-padded tails. */
export function compareResidual(aChannels, bChannels, rate, offsetSamples, gainMatch = true) {
  validate(aChannels, rate); validate(bChannels, rate);
  if (!Number.isSafeInteger(offsetSamples)) throw new RangeError('Integer offset required');
  const first = Math.max(0, -offsetSamples), end = Math.min(aChannels[0].length, bChannels[0].length - offsetSamples);
  if (end <= first) return { valid: false, gain: 1, nullDepthDb: null, rmsDiff: null };
  const channels = Math.max(aChannels.length, bChannels.length);
  let ab = 0, aa = 0, bb = 0;
  for (let ch = 0; ch < channels; ch++) {
    const a = aChannels[Math.min(ch, aChannels.length - 1)], b = bChannels[Math.min(ch, bChannels.length - 1)];
    for (let i = first; i < end; i++) { aa += a[i] * a[i]; bb += b[i + offsetSamples] ** 2; ab += a[i] * b[i + offsetSamples]; }
  }
  const gain = gainMatch && bb > 0 ? ab / bb : 1;
  let residual = 0, peak = 0;
  for (let ch = 0; ch < channels; ch++) {
    const a = aChannels[Math.min(ch, aChannels.length - 1)], b = bChannels[Math.min(ch, bChannels.length - 1)];
    for (let i = first; i < end; i++) { const d = a[i] - gain * b[i + offsetSamples]; residual += d * d; peak = Math.max(peak, Math.abs(d)); }
  }
  return { valid: true, gain, nullDepthDb: aa > 0 ? residual > 0 ? 10 * Math.log10(aa / residual) : Infinity : null, rmsDiff: Math.sqrt(residual / ((end - first) * channels)), peakDiff: peak, overlapSamples: end - first };
}

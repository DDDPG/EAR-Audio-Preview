import {
  comparisonFrequencyAt,
  type ComparisonFrequencyScale,
  type ComparisonStftSettings,
} from "./stftSettings";
import { aWeightDb } from "../utils/aWeighting";
export { aWeightDb } from "../utils/aWeighting";
import Ooura from "ooura";

export interface NativeAudioWindow {
  left: Float32Array;
  right?: Float32Array;
  sampleRate: number;
  /** Global time of the first sample in these bounded window arrays. */
  origin: number;
  duration?: number;
}
export interface AnalysisOptions {
  windowMs: number;
  fftBackend?: "ooura" | "essentia";
  windowType?: ComparisonStftSettings["windowType"];
  frequencyScale?: ComparisonFrequencyScale;
  hybridRatio?: number;
  minHz: number;
  maxHz: number;
  bins: number;
  tiltDbPerOct: number;
  weighting: "none" | "a";
}
export interface SpectrumFrame {
  broadbandRho?: number;
  timeL?: Float32Array;
  timeR?: Float32Array;
  db: Float32Array;
  rho: Float32Array;
  polarL: Float32Array;
  polarR: Float32Array;
}

/** Native-rate window; padding affects FFT resolution, not coherent gain. */
export class NativeSpectrum {
  private _size = 0;
  private _count = 0;
  private _windowType = "";
  private _frequencyKey = "";
  private _frequencies = new Float64Array(0);
  private _fft: Ooura;
  private _window: Float64Array;
  private _sum = 1;
  private _data: Float64Array;
  private _reL: Float64Array;
  private _imL: Float64Array;
  private _reR: Float64Array;
  private _imR: Float64Array;
  constructor(
    private readonly spectrum?: (frame: Float64Array) => Float32Array,
  ) {}
  public compute(
    audio: NativeAudioWindow,
    endTime: number,
    options: AnalysisOptions,
    phase = true,
  ): SpectrumFrame {
    if (
      audio.duration !== undefined &&
      endTime - options.windowMs / 2000 >= audio.duration
    ) {
      return {
        db: new Float32Array(options.bins).fill(NaN),
        rho: new Float32Array(options.bins).fill(NaN),
        polarL: new Float32Array(0),
        polarR: new Float32Array(0),
      };
    }
    const count = Math.max(
      8,
      Math.min(65536, Math.round((options.windowMs * audio.sampleRate) / 1000)),
    );
    const size = 2 ** Math.ceil(Math.log2(count));
    if (
      this._count !== count ||
      this._windowType !== (options.windowType ?? "hann")
    ) {
      this._windowType = options.windowType ?? "hann";
      this._count = count;
      this._size = size;
      this._fft = new Ooura(size, { type: "real", radix: 4 });
      this._window = Float64Array.from({ length: count }, (_, i) => {
        const phase = (2 * Math.PI * i) / (count - 1);
        switch (this._windowType) {
          case "hamming":
            return 0.54 - 0.46 * Math.cos(phase);
          case "blackman-harris":
            return (
              0.35875 -
              0.48829 * Math.cos(phase) +
              0.14128 * Math.cos(2 * phase) -
              0.01168 * Math.cos(3 * phase)
            );
          case "triangular":
            return 1 - Math.abs((i - (count - 1) / 2) / (count / 2));
          default:
            return 0.5 - 0.5 * Math.cos(phase);
        }
      });
      this._sum = this._window.reduce((a, b) => a + b, 0);
      this._data = this._fft.scalarArrayFactory();
      this._reL = this._fft.vectorArrayFactory();
      this._imL = this._fft.vectorArrayFactory();
      this._reR = this._fft.vectorArrayFactory();
      this._imR = this._fft.vectorArrayFactory();
    }
    const first =
      Math.round((endTime - audio.origin) * audio.sampleRate) - count;
    const run = (channel: Float32Array, re: Float64Array, im: Float64Array) => {
      this._data.fill(0);
      for (let i = 0; i < count; i++) {
        this._data[i] = (channel[first + i] ?? 0) * this._window[i];
      }
      if (options.fftBackend === "essentia" && this.spectrum) {
        const magnitudes = this.spectrum(this._data);
        re.fill(0);
        im.fill(0);
        re.set(magnitudes.subarray(0, re.length));
      } else {
        this._fft.fft(this._data.buffer, re.buffer, im.buffer);
      }
    };
    run(audio.left, this._reL, this._imL);
    if (audio.right) {
      run(audio.right, this._reR, this._imR);
    } else {
      this._reR.set(this._reL);
      this._imR.set(this._imL);
    }
    const db = new Float32Array(options.bins),
      rho = new Float32Array(options.bins);
    const low = Math.max(0, options.minHz),
      high = Math.max(low + 1, options.maxHz);
    const frequencyKey = JSON.stringify([
      low,
      high,
      options.bins,
      options.frequencyScale,
      options.hybridRatio,
    ]);
    if (frequencyKey !== this._frequencyKey) {
      this._frequencyKey = frequencyKey;
      this._frequencies = Float64Array.from({ length: options.bins }, (_, i) =>
        comparisonFrequencyAt(
          i / Math.max(1, options.bins - 1),
          low,
          high,
          options.frequencyScale,
          options.hybridRatio,
        ),
      );
    }
    for (let i = 0; i < options.bins; i++) {
      const hz = this._frequencies[i];
      if (hz > audio.sampleRate / 2) {
        db[i] = rho[i] = NaN;
        continue;
      }
      const bin = Math.max(
        1,
        Math.min(
          this._reL.length - 1,
          Math.round((hz * size) / audio.sampleRate),
        ),
      );
      const lr = this._reL[bin],
        li = this._imL[bin],
        rr = this._reR[bin],
        ri = this._imR[bin];
      const lp = lr * lr + li * li,
        rp = rr * rr + ri * ri;
      const amplitude = (Math.sqrt((lp + rp) * 0.5) * 2) / this._sum;
      db[i] =
        20 * Math.log10(Math.max(1e-8, amplitude)) +
        options.tiltDbPerOct * Math.log2(Math.max(1, hz) / 1000) +
        (options.weighting === "a" ? aWeightDb(hz) : 0);
      if (phase) {
        rho[i] =
          lp * rp > 1e-20
            ? Math.max(
                -1,
                Math.min(1, (lr * rr + li * ri) / Math.sqrt(lp * rp)),
              )
            : NaN;
      }
    }
    let weightSum = 0,
      crossSum = 0;
    if (phase) {
      for (let bin = 1; bin < this._reL.length; bin++) {
        const hz = ((bin + 0.5) * audio.sampleRate) / size;
        if (hz < 10 || hz > Math.min(20000, audio.sampleRate / 2)) {
          continue;
        }
        const lr = this._reL[bin],
          li = this._imL[bin],
          rr = this._reR[bin],
          ri = this._imR[bin];
        const weight = Math.hypot(lr, li) * Math.hypot(rr, ri);
        if (weight > 1e-12) {
          weightSum += weight;
          crossSum += lr * rr + li * ri;
        }
      }
    }
    const broadbandRho =
      weightSum > 1e-12 ? Math.max(-1, Math.min(1, crossSum / weightSum)) : 0;
    const points = phase ? Math.min(512, count) : 0;
    const polarL = new Float32Array(points),
      polarR = new Float32Array(points);
    for (let i = 0; i < points; i++) {
      const index = first + Math.floor((i * count) / points);
      polarL[i] = audio.left[index] ?? 0;
      polarR[i] = (audio.right ?? audio.left)[index] ?? 0;
    }
    return { db, rho, polarL, polarR, broadbandRho };
  }
}

export interface StftTile {
  values: Float32Array;
  columns: number;
  bins: number;
  start: number;
  end: number;
}

export function sliceNativeWindow(
  buffer: AudioBuffer,
  start: number,
  end: number,
): NativeAudioWindow {
  const first = Math.max(0, Math.floor(start * buffer.sampleRate));
  const last = Math.min(
    buffer.length,
    Math.max(first, Math.ceil(end * buffer.sampleRate)),
  );
  return {
    left: buffer.getChannelData(0).slice(first, last),
    right:
      buffer.numberOfChannels > 1
        ? buffer.getChannelData(1).slice(first, last)
        : undefined,
    sampleRate: buffer.sampleRate,
    origin: first / buffer.sampleRate,
    duration: buffer.duration,
  };
}

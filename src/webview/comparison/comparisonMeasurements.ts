/** Measurements use a common, non-padded interval and preserve decoded PCM. */
export interface MeasurementRange {
  start: number;
  end: number;
}

export function commonMeasurementRange(
  buffers: readonly AudioBuffer[],
  selection: MeasurementRange,
): MeasurementRange {
  const duration = Math.min(...buffers.map((buffer) => buffer.duration));
  const selected = selection.end > selection.start;
  const start = selected ? selection.start : 0;
  const end = selected ? Math.min(selection.end, duration) : duration;
  if (
    !buffers.length ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start
  ) {
    throw new Error("Choose a region shared by all active files");
  }
  return { start, end };
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Undo division/multiplication roundoff at exact sample boundaries only. */
function samplePosition(time: number, sampleRate: number): number {
  const position = time * sampleRate;
  const nearest = Math.round(position);
  const tolerance = 2 * Number.EPSILON * Math.max(1, Math.abs(position));
  return Math.abs(position - nearest) <= tolerance ? nearest : position;
}

/** RMS at the stereo mix bus: mono uses the same equal-power pan as playback. */
export async function measureRms(
  buffer: AudioBuffer,
  range: MeasurementRange,
  cancelled: () => boolean = () => false,
): Promise<number> {
  const start = Math.ceil(samplePosition(range.start, buffer.sampleRate));
  const end = Math.min(
    buffer.length,
    Math.floor(samplePosition(range.end, buffer.sampleRate)),
  );
  if (end <= start) {
    throw new Error("The selected region contains no complete samples");
  }
  let energy = 0;
  let yieldAt = performance.now();
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let offset = start; offset < end; offset += 65536) {
      if (cancelled()) {
        throw new Error("Measurement cancelled: comparison changed");
      }
      for (let i = offset; i < Math.min(end, offset + 65536); i++) {
        if (!Number.isFinite(data[i])) {
          throw new Error("Cannot measure non-finite samples");
        }
        energy += data[i] * data[i];
      }
      if (performance.now() - yieldAt >= 8) {
        await yieldToUi();
        yieldAt = performance.now();
      }
    }
  }
  return Math.sqrt(energy / (2 * (end - start)));
}

/** Attenuation only; silence has no meaningful matching level. */
export function matchingGains(levels: readonly number[]): number[] {
  if (
    levels.length < 2 ||
    levels.some((level) => !Number.isFinite(level) || level <= 1e-8)
  ) {
    throw new Error(
      "RMS matching needs at least two non-silent files in the shared region",
    );
  }
  const target = Math.min(...levels);
  return levels.map((level) => target / level);
}

export interface ResidualMeasurement {
  rmsDbfs: number;
  peakDbfs: number;
  relativeDb: number;
  frames: number;
}

/** Sample-exact subtraction at equal native rates, without implicit alignment/resampling. */
export async function measureResidual(
  reference: AudioBuffer,
  candidate: AudioBuffer,
  range: MeasurementRange,
  referenceGain = 1,
  candidateGain = 1,
  cancelled: () => boolean = () => false,
): Promise<ResidualMeasurement> {
  if (reference.sampleRate !== candidate.sampleRate) {
    throw new Error("Residual measurement requires matching sample rates");
  }
  const start = Math.ceil(samplePosition(range.start, reference.sampleRate));
  const end = Math.min(
    reference.length,
    candidate.length,
    Math.floor(samplePosition(range.end, reference.sampleRate)),
  );
  if (end <= start) {
    throw new Error("The shared region contains no complete samples");
  }
  let errorEnergy = 0,
    referenceEnergy = 0,
    peak = 0;
  const left = [reference.getChannelData(0), candidate.getChannelData(0)];
  const right = [reference, candidate].map((b) =>
    b.getChannelData(b.numberOfChannels > 1 ? 1 : 0),
  );
  const gainA =
    referenceGain * (reference.numberOfChannels === 1 ? Math.SQRT1_2 : 1);
  const gainB =
    candidateGain * (candidate.numberOfChannels === 1 ? Math.SQRT1_2 : 1);
  const pairs = [left, right];
  let yieldAt = performance.now();
  for (let offset = start; offset < end; offset += 65536) {
    if (cancelled()) {
      throw new Error("Measurement cancelled: comparison changed");
    }
    for (let i = offset; i < Math.min(end, offset + 65536); i++) {
      for (const pair of pairs) {
        const a = pair[0][i] * gainA,
          b = pair[1][i] * gainB;
        if (!Number.isFinite(a) || !Number.isFinite(b)) {
          throw new Error("Cannot measure non-finite samples");
        }
        const diff = a - b;
        errorEnergy += diff * diff;
        referenceEnergy += a * a;
        peak = Math.max(peak, Math.abs(diff));
      }
    }
    if (performance.now() - yieldAt >= 8) {
      await yieldToUi();
      yieldAt = performance.now();
    }
  }
  return {
    rmsDbfs: 10 * Math.log10(errorEnergy / (2 * (end - start))),
    peakDbfs: 20 * Math.log10(peak),
    relativeDb:
      referenceEnergy > 0
        ? 10 * Math.log10(errorEnergy / referenceEnergy)
        : NaN,
    frames: end - start,
  };
}

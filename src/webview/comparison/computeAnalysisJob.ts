import type { NativeSpectrum } from "./comparisonDsp";
import type { AnalysisJob, AnalysisReply } from "./analysisProtocol";

/** Shared job orchestration; both backends retain identical windowing and pooling. */
export async function computeAnalysisJob(
  job: AnalysisJob,
  engine: NativeSpectrum,
  shouldCancel: () => boolean,
): Promise<AnalysisReply | null> {
  const reply: AnalysisReply = {
    id: job.id,
    trackId: job.trackId,
    audioRevision: job.audioRevision,
    settingsRevision: job.settingsRevision,
    time: job.time,
  };
  if (shouldCancel()) {
    return null;
  }
  if (job.kind === "live") {
    reply.frame = engine.compute(job.audio, job.time, job.options);
    reply.frame.timeL = job.audio.left;
    reply.frame.timeR = job.audio.right;
  } else {
    const columns = Math.max(1, Math.min(2048, job.columns ?? 600));
    const bins = Math.max(16, Math.min(512, job.options.bins));
    const values = new Float32Array(columns * bins);
    const end = job.end ?? job.time;
    let yieldAt = performance.now();
    for (let col = 0; col < columns; col++) {
      if (shouldCancel()) {
        return null;
      }
      const from = job.time + ((end - job.time) * col) / columns;
      const to = job.time + ((end - job.time) * (col + 1)) / columns;
      const hop = Math.max(0.005, (job.hopMs ?? 20) / 1000);
      const firstFrame = Math.ceil(from / hop - 1e-9);
      const lastFrame = Math.ceil(to / hop - 1e-9);
      const pooled = new Float32Array(bins).fill(NaN);
      // Peak-pool every real hop into its display pixel, retaining brief events.
      const frames = Math.max(1, lastFrame - firstFrame);
      for (let n = 0; n < frames; n++) {
        if (shouldCancel()) {
          return null;
        }
        const center =
          lastFrame > firstFrame ? (firstFrame + n) * hop : (from + to) / 2;
        const frame = engine.compute(
          job.audio,
          center + job.options.windowMs / 2000,
          { ...job.options, bins },
          false,
        );
        for (let bin = 0; bin < bins; bin++) {
          if (Number.isFinite(frame.db[bin])) {
            pooled[bin] = Number.isNaN(pooled[bin])
              ? frame.db[bin]
              : Math.max(pooled[bin], frame.db[bin]);
          }
        }
        if (performance.now() - yieldAt > 10) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          yieldAt = performance.now();
        }
      }
      values.set(pooled, col * bins);
    }
    reply.tile = { values, columns, bins, start: job.time, end };
  }

  return shouldCancel() ? null : reply;
}

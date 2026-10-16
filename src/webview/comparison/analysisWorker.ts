import { essentiaSpectrum } from "./essentiaSpectrum";
import { type EssentiaInstance } from "../../shared/essentiaTypes";
import { NativeSpectrum } from "./comparisonDsp";
import type { AnalysisJob, AnalysisReply } from "./analysisProtocol";
import type { AlignmentJob, AlignmentReply } from "./alignmentProtocol";
import {
  estimateAlignment,
  compareResidual,
} from "../../shared/audioAlignment";

const scope = self as unknown as {
  onmessage: (
    e: MessageEvent<AnalysisJob | AlignmentJob | { cancel: number }>,
  ) => void;
  postMessage: (
    data: AnalysisReply | AlignmentReply,
    transfer: ArrayBuffer[],
  ) => void;
};
const cancelled = new Set<number>();
const running = new Set<number>();
const engines = new Map<string, NativeSpectrum>();
let essentiaReady: Promise<EssentiaInstance> | undefined;
const loadEssentia = () =>
  (essentiaReady ??= import(/* webpackMode: "eager" */ "essentia.js").then(
    async (pkg) => {
      // The UMD package exports Module directly in Node and wraps it in workers.
      const wasm = (Reflect.get(pkg.EssentiaWASM, "EssentiaWASM") ??
        pkg.EssentiaWASM) as {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Emscripten runtime export.
        EssentiaJS?: unknown;
        onRuntimeInitialized?: () => void;
        onAbort?: (reason: unknown) => void;
      };
      if (typeof wasm.EssentiaJS !== "function") {
        await new Promise<void>((resolve, reject) => {
          const ready = wasm.onRuntimeInitialized;
          wasm.onRuntimeInitialized = () => {
            ready?.();
            resolve();
          };
          wasm.onAbort = (reason) => reject(new Error(String(reason)));
        });
      }
      return new pkg.Essentia(wasm);
    },
  ));
scope.onmessage = async (event) => {
  const job = event.data;
  if ("cancel" in job) {
    if (running.has(job.cancel)) {
      cancelled.add(job.cancel);
    }
    return;
  }
  // Alignment runs in a dedicated instance of this existing CSP-safe bundle.
  // Terminating that instance cancels the CPU-bound operation without STFT IPC changes.
  if (job.kind === "alignment") {
    try {
      const estimate = estimateAlignment(job.a, job.b, job.sampleRate);
      const residual = estimate.accepted
        ? compareResidual(job.a, job.b, job.sampleRate, estimate.offsetSamples)
        : undefined;
      scope.postMessage({ kind: "alignment", estimate, residual }, []);
    } catch (error) {
      scope.postMessage({ kind: "alignment", error: String(error) }, []);
    }
    return;
  }
  running.add(job.id);
  const reply: AnalysisReply = {
    id: job.id,
    trackId: job.trackId,
    audioRevision: job.audioRevision,
    settingsRevision: job.settingsRevision,
    time: job.time,
  };
  try {
    const key = `${job.kind}-${job.trackId}-${job.options.fftBackend ?? "ooura"}`;
    let engine = engines.get(key);
    if (!engine) {
      const essentia =
        job.options.fftBackend === "essentia" ? await loadEssentia() : null;
      if (cancelled.has(job.id)) {
        return;
      }
      engine = new NativeSpectrum(
        essentia ? essentiaSpectrum(essentia) : undefined,
      );
      engines.set(key, engine);
      if (engines.size > 8) {
        engines.delete(engines.keys().next().value);
      }
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
        if (cancelled.has(job.id)) {
          return;
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
          if (cancelled.has(job.id)) {
            return;
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
    if (!cancelled.has(job.id)) {
      const transfer = reply.frame
        ? [
            reply.frame.db.buffer,
            reply.frame.rho.buffer,
            reply.frame.polarL.buffer,
            reply.frame.polarR.buffer,
            reply.frame.timeL.buffer,
            ...(reply.frame.timeR ? [reply.frame.timeR.buffer] : []),
          ]
        : [reply.tile.values.buffer];
      scope.postMessage(reply, transfer);
    }
  } catch (error) {
    reply.error = String(error);
    scope.postMessage(reply, []);
  } finally {
    running.delete(job.id);
    cancelled.delete(job.id);
  }
};

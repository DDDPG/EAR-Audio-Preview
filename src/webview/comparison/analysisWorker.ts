import { computeAnalysisJob } from "./computeAnalysisJob";
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
      if (job.options.fftBackend === "essentia") {
        throw new Error("Essentia analysis must run in the extension host");
      }
      engine = new NativeSpectrum();
      engines.set(key, engine);
      if (engines.size > 8) {
        engines.delete(engines.keys().next().value);
      }
    }
    const result = await computeAnalysisJob(job, engine, () =>
      cancelled.has(job.id),
    );
    if (!result) {
      return;
    }
    Object.assign(reply, result);
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

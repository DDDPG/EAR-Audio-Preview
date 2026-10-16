import {
  mergeSnapshots,
  type LoudnessProfile,
} from "../services/loudnessService";
import type { LoudnessSnapshot } from "loudness-worklet";

/** Executes the same streaming worklet kernel without rendering a full copy. */
export async function analyzeNativeLoudness(
  buffer: AudioBuffer,
  workerUrl: string,
  signal: AbortSignal,
): Promise<LoudnessProfile> {
  const worker = new Worker(workerUrl);
  let nextId = 0;
  let rejectCurrent: (reason: Error) => void;
  const aborted = () => {
    worker.terminate();
    rejectCurrent?.(new Error("Analysis cancelled"));
  };
  signal.addEventListener("abort", aborted, { once: true });
  const request = (
    message: Record<string, unknown>,
    transfer: ArrayBuffer[] = [],
  ) =>
    new Promise<{ snapshots?: LoudnessSnapshot[] }>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("Analysis cancelled"));
        return;
      }
      rejectCurrent = reject;
      const id = ++nextId;
      worker.onmessage = (event) => {
        if (event.data.id === id) {
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data);
          }
        }
      };
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({ ...message, id }, transfer);
    });
  try {
    await request({
      type: "init",
      sampleRate: buffer.sampleRate,
      duration: buffer.duration,
      hop: Math.max(0.1, buffer.duration / 7200),
    });
    for (let offset = 0; offset < buffer.length; offset += 262144) {
      const left = buffer.getChannelData(0).slice(offset, offset + 262144);
      const right =
        buffer.numberOfChannels > 1
          ? buffer.getChannelData(1).slice(offset, offset + 262144)
          : undefined;
      await request(
        { type: "chunk", left, right },
        right ? [left.buffer, right.buffer] : [left.buffer],
      );
    }
    const result = await request({ type: "finish" });
    return mergeSnapshots(result.snapshots);
  } finally {
    signal.removeEventListener("abort", aborted);
    worker.terminate();
  }
}

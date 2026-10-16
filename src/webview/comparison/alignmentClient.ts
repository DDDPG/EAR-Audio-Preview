import type { AlignmentJob, AlignmentReply } from "./alignmentProtocol";

/** One bounded, cancellable worker job. Original AudioBuffer storage is never transferred. */
export class AlignmentClient {
  public workerUri = "";
  private _generation = 0;
  private _abort: AbortController | undefined;
  private _cancel: (() => void) | undefined;

  public cancel(): void {
    this._generation++;
    this._abort?.abort();
    this._abort = undefined;
    this._cancel?.();
    this._cancel = undefined;
  }

  public async analyze(
    a: AudioBuffer,
    b: AudioBuffer,
  ): Promise<AlignmentReply> {
    this.cancel();
    if (a.sampleRate !== b.sampleRate) {
      throw new Error(
        "Alignment requires the same decoded sample rate. No resampling is applied.",
      );
    }
    if (!this.workerUri) {
      throw new Error("Audio analysis is not ready yet");
    }
    const generation = this._generation;
    const abort = (this._abort = new AbortController());
    const response = await fetch(this.workerUri, { signal: abort.signal });
    if (!response.ok) {
      throw new Error(`Cannot load alignment worker: ${response.status}`);
    }
    const source = await response.text();
    if (generation !== this._generation) {
      throw new Error("Alignment cancelled");
    }
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (reply?: AlignmentReply, error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        if (generation === this._generation) {
          this._cancel = undefined;
        }
        if (error) {
          reject(error);
        } else {
          resolve(reply);
        }
      };
      const timer = setTimeout(
        () => finish(undefined, new Error("Alignment timed out")),
        60000,
      );
      this._cancel = () => finish(undefined, new Error("Alignment cancelled"));
      worker.onerror = () =>
        finish(undefined, new Error("Alignment worker failed"));
      worker.onmessageerror = () =>
        finish(undefined, new Error("Invalid alignment worker reply"));
      worker.onmessage = (event: MessageEvent<AlignmentReply>) => {
        const reply = event.data;
        if (reply?.kind !== "alignment") {
          return;
        }
        if (reply.error || !reply.estimate) {
          finish(
            undefined,
            new Error(reply.error || "Missing alignment estimate"),
          );
        } else {
          finish(reply);
        }
      };
      try {
        // Search is capped at the first 60s; retain 2s extra for the default lag.
        // Gain/residual displayed by the dialog describes this excerpt only.
        const channels = (buffer: AudioBuffer) =>
          Array.from({ length: buffer.numberOfChannels }, (_, ch) =>
            buffer
              .getChannelData(ch)
              .slice(0, Math.ceil(buffer.sampleRate * 62)),
          );
        const job: AlignmentJob = {
          kind: "alignment",
          a: channels(a),
          b: channels(b),
          sampleRate: a.sampleRate,
        };
        worker.postMessage(
          job,
          [...job.a, ...job.b].map((x) => x.buffer),
        );
      } catch (error) {
        finish(
          undefined,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });
  }
}

/** Session-only shift; retain the original buffer for reset and never mutate its channels. */
export async function alignedBuffer(
  input: AudioBuffer,
  offsetSamples: number,
  polarity: number,
  cancelled: () => boolean = () => false,
): Promise<AudioBuffer> {
  const length = input.length - offsetSamples;
  if (
    !Number.isSafeInteger(offsetSamples) ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > 0x7fffffff ||
    ![1, -1].includes(polarity)
  ) {
    throw new Error("Invalid alignment transform");
  }
  const result = new AudioBuffer({
    length,
    numberOfChannels: input.numberOfChannels,
    sampleRate: input.sampleRate,
  });
  const first = Math.max(0, offsetSamples),
    destination = Math.max(0, -offsetSamples);
  for (let ch = 0; ch < input.numberOfChannels; ch++) {
    const data = input.getChannelData(ch),
      out = result.getChannelData(ch);
    for (let from = first; from < data.length; from += 262144) {
      if (cancelled()) {
        throw new Error("Alignment cancelled");
      }
      const end = Math.min(data.length, from + 262144);
      if (polarity === 1) {
        out.set(data.subarray(from, end), destination + from - first);
      } else {
        for (let i = from; i < end; i++) {
          out[destination + i - first] = -data[i];
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return result;
}

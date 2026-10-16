import type { ComparisonRequest } from "../../comparison/protocol";
import type { AnalysisJob, AnalysisReply } from "./analysisProtocol";

export class ComparisonAnalysisClient {
  private _next = 0;
  private _failed = false;
  private _disposed = false;
  private _pending = new Map<
    number,
    {
      resolve: (reply: AnalysisReply | null) => void;
      trackId: string;
      host: boolean;
    }
  >();
  constructor(
    private readonly _worker: Worker,
    private readonly _postHost?: (
      message: Extract<
        ComparisonRequest,
        { type: "compare.analysis" | "compare.cancelAnalysis" }
      >,
    ) => void,
  ) {
    _worker.onmessage = (event: MessageEvent<AnalysisReply>) => {
      this.handleHostResponse(event.data);
    };
    const fail = () => {
      this._failed = true;
      this.cancel();
    };
    _worker.onerror = fail;
    _worker.onmessageerror = fail;
  }
  public handleHostResponse(reply: AnalysisReply): void {
    const pending = this._pending.get(reply.id);
    if (!pending) {
      return;
    }
    this._pending.delete(reply.id);
    pending.resolve(reply);
  }
  public request(job: Omit<AnalysisJob, "id">): Promise<AnalysisReply | null> {
    if (this._failed || this._disposed) {
      return Promise.resolve(null);
    }
    const id = ++this._next;
    return new Promise((resolve) => {
      const host = job.options.fftBackend === "essentia";
      this._pending.set(id, { resolve, trackId: job.trackId, host });
      const transfer = [job.audio.left.buffer];
      if (job.audio.right) {
        transfer.push(job.audio.right.buffer);
      }
      try {
        if (host) {
          if (!this._postHost) {
            throw new Error("Essentia analysis requires the extension host");
          }
          this._postHost({
            type: "compare.analysis",
            job: { ...job, id },
            revision: job.audioRevision,
          });
        } else {
          this._worker.postMessage({ ...job, id }, transfer);
        }
      } catch (error) {
        this._pending.delete(id);
        resolve({
          id,
          trackId: job.trackId,
          audioRevision: job.audioRevision,
          settingsRevision: job.settingsRevision,
          time: job.time,
          error: String(error),
        });
      }
    });
  }
  public cancel(trackId?: string): void {
    for (const [id, item] of this._pending) {
      if (!trackId || item.trackId === trackId) {
        this._pending.delete(id);
        item.resolve(null);
        if (item.host) {
          try {
            this._postHost?.({ type: "compare.cancelAnalysis", id });
          } catch {
            /* The panel may already have closed. */
          }
        } else if (!this._failed && !this._disposed) {
          try {
            this._worker.postMessage({ cancel: id });
          } catch {
            // Local cancellation must settle even if the worker is unavailable.
          }
        }
      }
    }
  }
  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this.cancel();
    this._worker.terminate();
  }
}

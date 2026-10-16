import type { AnalysisJob, AnalysisReply } from "./analysisProtocol";

export class ComparisonAnalysisClient {
  private _next = 0;
  private _failed = false;
  private _disposed = false;
  private _pending = new Map<
    number,
    { resolve: (reply: AnalysisReply | null) => void; trackId: string }
  >();
  constructor(private readonly _worker: Worker) {
    _worker.onmessage = (event: MessageEvent<AnalysisReply>) => {
      const pending = this._pending.get(event.data.id);
      if (!pending) {
        return;
      }
      this._pending.delete(event.data.id);
      pending.resolve(event.data);
    };
    const fail = () => {
      this._failed = true;
      this.cancel();
    };
    _worker.onerror = fail;
    _worker.onmessageerror = fail;
  }
  public request(job: Omit<AnalysisJob, "id">): Promise<AnalysisReply | null> {
    if (this._failed || this._disposed) {
      return Promise.resolve(null);
    }
    const id = ++this._next;
    return new Promise((resolve) => {
      this._pending.set(id, { resolve, trackId: job.trackId });
      const transfer = [job.audio.left.buffer];
      if (job.audio.right) {
        transfer.push(job.audio.right.buffer);
      }
      try {
        this._worker.postMessage({ ...job, id }, transfer);
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
        if (!this._failed && !this._disposed) {
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

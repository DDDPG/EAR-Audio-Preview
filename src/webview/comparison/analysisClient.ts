import type { AnalysisJob, AnalysisReply } from "./analysisProtocol";

export class ComparisonAnalysisClient {
  private _next = 0;
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
    _worker.onerror = () => this.cancel();
  }
  public request(job: Omit<AnalysisJob, "id">): Promise<AnalysisReply | null> {
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
        this._worker.postMessage({ cancel: id });
        this._pending.delete(id);
        item.resolve(null);
      }
    }
  }
  public dispose(): void {
    this.cancel();
    this._worker.terminate();
  }
}

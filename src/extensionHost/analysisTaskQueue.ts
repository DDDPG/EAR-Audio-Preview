interface AnalysisTask {
  owner: object;
  requestId: string;
  cancelled: boolean;
  execute: (shouldCancel: () => boolean) => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** Serialize access to the host's shared Essentia instance across editor pages. */
export class AnalysisTaskQueue {
  private _queued: AnalysisTask[] = [];
  private _running: AnalysisTask | null = null;

  public run(
    owner: object,
    requestId: string,
    execute: (shouldCancel: () => boolean) => Promise<void>,
  ): Promise<void> {
    this.cancel(owner, requestId);
    return new Promise((resolve, reject) => {
      this._queued.push({
        owner,
        requestId,
        execute,
        resolve,
        reject,
        cancelled: false,
      });
      this._startNext();
    });
  }

  public cancel(owner: object, requestId?: string): void {
    const matches = (task: AnalysisTask) =>
      task.owner === owner &&
      (requestId === undefined || task.requestId === requestId);
    if (this._running && matches(this._running)) {
      this._running.cancelled = true;
    }
    this._queued = this._queued.filter((task) => {
      if (!matches(task)) {
        return true;
      }
      task.cancelled = true;
      task.resolve();
      return false;
    });
  }

  private _startNext(): void {
    if (this._running) {
      return;
    }
    const task = this._queued.shift();
    if (!task) {
      return;
    }
    this._running = task;
    void Promise.resolve()
      .then(() =>
        task.cancelled ? undefined : task.execute(() => task.cancelled),
      )
      .then(
        () => {
          this._running = null;
          this._startNext();
          task.resolve();
        },
        (error) => {
          this._running = null;
          this._startNext();
          task.reject(error);
        },
      );
  }
}

export const hostAnalysisTasks = new AnalysisTaskQueue();

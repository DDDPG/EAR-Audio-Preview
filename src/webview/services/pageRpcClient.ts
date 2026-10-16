import {
  WebviewMessageType,
  type PostMessage,
  type WebviewMessage,
} from "../../message";

interface RpcReply {
  type: string;
  data: { requestId: string; payload?: unknown; error?: string };
}
interface PendingRpc {
  type: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  onCancel?: () => void;
}
let nextRequestId = 0;

/** One page owns its request table. Replies from a previous page cannot settle it. */
export class PageRpcClient {
  private _pending = new Map<string, PendingRpc>();
  private _disposed = false;

  constructor(private readonly _postMessage: PostMessage) {}

  public request(
    replyType: string,
    message: (requestId: string) => WebviewMessage,
    timeoutMs: number | null = 30000,
    onCancel?: () => void,
    send: PostMessage = this._postMessage,
  ): Promise<unknown> {
    if (this._disposed) {
      return Promise.reject(new Error("Page RPC disposed"));
    }
    const requestId = `rpc-${++nextRequestId}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const pending: PendingRpc = {
        type: replyType,
        resolve,
        reject,
        onCancel,
      };
      this._pending.set(requestId, pending);
      if (timeoutMs !== null) {
        pending.timer = setTimeout(() => {
          this.cancel(requestId, new Error(`${replyType} request timed out`));
        }, timeoutMs);
      }
      try {
        send(message(requestId));
      } catch (error) {
        this.remove(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public handleResponse(message: RpcReply): boolean {
    const pending = this._pending.get(message.data.requestId);
    if (!pending || pending.type !== message.type) {
      return false;
    }
    this.remove(message.data.requestId);
    if (message.data.error) {
      pending.reject(new Error(message.data.error));
    } else {
      pending.resolve(message.data.payload);
    }
    return true;
  }

  private remove(id: string): void {
    const pending = this._pending.get(id);
    if (pending?.timer !== undefined) {
      clearTimeout(pending.timer);
    }
    this._pending.delete(id);
  }

  public postCancellation(
    requestId: string,
    send: PostMessage = this._postMessage,
  ): void {
    try {
      send({ type: WebviewMessageType.CANCEL_ANALYSIS, data: { requestId } });
    } catch {
      // Closing a page can tear down its bridge before cancellation is sent.
    }
  }

  public cancel(
    requestId: string,
    error = new Error("Page RPC request cancelled"),
  ): void {
    const pending = this._pending.get(requestId);
    if (!pending) {
      return;
    }
    this.remove(requestId);
    try {
      pending.onCancel?.();
    } catch {
      // Cancellation must settle every wait even if the host bridge is gone.
    }
    pending.reject(error);
  }

  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    for (const id of this._pending.keys()) {
      this.cancel(id, new Error("Page RPC disposed"));
    }
  }
}

import { ExtMessageType, WebviewMessageType } from "../../message";
import type { AutoEqHostRequest } from "./autoEqApiClient";
import type { PageRpcClient } from "./pageRpcClient";

/** Business API over the page-owned host connection. */
export default class AutoEqHostClient {
  constructor(private readonly _rpc: PageRpcClient) {}

  public request(req: AutoEqHostRequest): Promise<unknown> {
    return this._rpc.request(ExtMessageType.AUTOEQ_RESULT, (requestId) => ({
      type: WebviewMessageType.AUTOEQ_REQUEST,
      data: { requestId, endpoint: req.endpoint, body: req.body },
    }));
  }
}

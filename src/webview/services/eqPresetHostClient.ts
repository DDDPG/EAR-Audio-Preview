import {
  ExtMessageType,
  WebviewMessageType,
  type EqPresetOp,
} from "../../message";
import type { PageRpcClient } from "./pageRpcClient";

/** File-dialog waits have no timeout; read/list operations are bounded. */
export default class EqPresetHostClient {
  constructor(private readonly _rpc: PageRpcClient) {}

  private _request(op: EqPresetOp, payload?: unknown): Promise<unknown> {
    return this._rpc.request(
      ExtMessageType.EQ_PRESET_OP_RESULT,
      (requestId) => ({
        type: WebviewMessageType.EQ_PRESET_OP,
        data: { requestId, op, payload },
      }),
      op === "import" || op === "write_library" ? null : 30000,
    );
  }

  public importFile(): Promise<{ content: string; fileName: string }> {
    return this._request("import") as Promise<{
      content: string;
      fileName: string;
    }>;
  }

  public listWorkspacePresets(): Promise<{
    presets: Array<{ fileName: string; displayName: string }>;
    hasWorkspace: boolean;
  }> {
    return this._request("list") as Promise<{
      presets: Array<{ fileName: string; displayName: string }>;
      hasWorkspace: boolean;
    }>;
  }

  public readWorkspacePreset(fileName: string): Promise<unknown> {
    return this._request("read", { fileName });
  }

  public writeWorkspacePreset(profile: unknown): Promise<{ fileName: string }> {
    return this._request("write_library", { profile }) as Promise<{
      fileName: string;
    }>;
  }
}

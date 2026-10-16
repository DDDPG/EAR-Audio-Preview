import * as vscode from "vscode";
import { WebviewMessageType, ExtMessageType } from "../message";
import type { ComparisonEqRequest, ComparisonEqResponse } from "./protocol";
import {
  fetchAutoEqEntriesInHost,
  fetchAutoEqTargetsInHost,
  equalizeAutoEqInHost,
} from "../extensionHost/autoEqHost";
import {
  listWorkspaceEqPresetsInHost,
  readWorkspaceEqPresetInHost,
  writeWorkspaceEqPresetInHost,
  pickEqPresetFileInHost,
} from "../extensionHost/eqPresetHost";
import type { HeadphoneEqProfile } from "../webview/types/headphoneEq";

/** Route the reused editor through the same host services as single-file preview. */
export async function handleComparisonEqRequest(
  message: ComparisonEqRequest,
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder | undefined,
): Promise<ComparisonEqResponse | void> {
  if (WebviewMessageType.isAutoEqRequest(message)) {
    const { requestId, endpoint, body } = message.data;
    try {
      const payload =
        endpoint === "entries"
          ? await fetchAutoEqEntriesInHost()
          : endpoint === "targets"
            ? await fetchAutoEqTargetsInHost()
            : endpoint === "equalize" && body
              ? await equalizeAutoEqInHost(body)
              : (() => {
                  throw new Error("Invalid AutoEq request");
                })();
      return {
        type: ExtMessageType.AUTOEQ_RESULT,
        data: { requestId, endpoint, payload },
      };
    } catch (error) {
      return {
        type: ExtMessageType.AUTOEQ_RESULT,
        data: { requestId, endpoint, error: String(error) },
      };
    }
  }
  if (WebviewMessageType.isEqPresetOp(message)) {
    const { requestId, op, payload } = message.data;
    try {
      let result: unknown;
      if (op === "import") {
        result = await pickEqPresetFileInHost();
      } else if (op === "list") {
        result = {
          presets: folder ? await listWorkspaceEqPresetsInHost(folder.uri) : [],
          hasWorkspace: !!folder,
        };
      } else if (op === "read") {
        const fileName = (payload as { fileName?: string })?.fileName;
        if (
          !folder ||
          !fileName ||
          /[\\/]/.test(fileName) ||
          fileName === ".."
        ) {
          throw new Error("Invalid workspace preset name");
        }
        result = await readWorkspaceEqPresetInHost(folder.uri, fileName);
      } else if (op === "write_library") {
        const profile = (payload as { profile?: HeadphoneEqProfile })?.profile;
        if (!folder || !profile) {
          throw new Error("Workspace and profile required");
        }
        result = {
          fileName: await writeWorkspaceEqPresetInHost(folder.uri, profile),
        };
      } else {
        throw new Error("Unknown EQ preset operation");
      }
      return {
        type: ExtMessageType.EQ_PRESET_OP_RESULT,
        data: { requestId, payload: result },
      };
    } catch (error) {
      return {
        type: ExtMessageType.EQ_PRESET_OP_RESULT,
        data: { requestId, error: String(error) },
      };
    }
  }
  if (
    WebviewMessageType.isSaveEqSettings(message) ||
    WebviewMessageType.isWriteEqProfile(message)
  ) {
    if (message.type === WebviewMessageType.SAVE_EQ_SETTINGS) {
      await context.globalState.update(
        "earAudioPreview.headphoneEq.v1",
        message.data,
      );
    } else {
      if (!folder) {
        throw new Error("No workspace folder available to save EQ profile");
      }
      const directory = vscode.Uri.joinPath(folder.uri, ".vscode");
      await vscode.workspace.fs.createDirectory(directory);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(directory, "ear-headphone-eq.json"),
        new TextEncoder().encode(JSON.stringify(message.data, null, 2)),
      );
    }
  }
}

import * as vscode from "vscode";
import { AudioPreviewEditorProvider } from "./audioPreviewEditor";
import { ComparisonHost } from "./comparison/comparisonHost";

export function activate(context: vscode.ExtensionContext) {
  const extension = vscode.extensions.getExtension(
    "Eps-Acoustic-Revolution-Lab.ear-audio-preview",
  );
  console.log("version", extension?.packageJSON?.version);
  console.log("extension.extensionKind", extension?.extensionKind);
  console.log("vscode.env.uiKind", vscode.env.uiKind);
  console.log("vscode.env.remoteName", vscode.env.remoteName);
  context.subscriptions.push(AudioPreviewEditorProvider.register(context));
  const comparison = new ComparisonHost(context);
  context.subscriptions.push(
    comparison,
    vscode.commands.registerCommand(
      "earAudioPreview.compare",
      (uri?: vscode.Uri, selected?: vscode.Uri[]) =>
        comparison.open(selected?.length ? selected : uri ? [uri] : []),
    ),
  );
}

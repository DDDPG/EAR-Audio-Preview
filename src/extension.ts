import * as vscode from "vscode";
import { AudioPreviewEditorProvider } from "./audioPreviewEditor";
import { ComparisonHost } from "./comparison/comparisonHost";

export function activate(context: vscode.ExtensionContext) {
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

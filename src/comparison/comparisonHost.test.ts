/** @jest-environment node */
/* eslint-disable @typescript-eslint/naming-convention -- Mock properties match the VS Code API. */
import * as vscode from "vscode";
import { ComparisonHost } from "./comparisonHost";
import type { ComparisonRequest } from "./protocol";

jest.mock(
  "vscode",
  () => ({
    Uri: { joinPath: jest.fn() },
    RelativePattern: jest.fn(),
    ViewColumn: { Active: 1 },
    workspace: {
      isTrusted: true,
      getWorkspaceFolder: jest.fn(),
      createFileSystemWatcher: jest.fn(),
      fs: { readFile: jest.fn() },
    },
    window: {
      createWebviewPanel: jest.fn(),
      showErrorMessage: jest.fn(),
    },
  }),
  { virtual: true },
);
jest.mock("./comparisonEqHost", () => ({
  handleComparisonEqRequest: jest.fn(),
}));
jest.mock("../extensionHost/sequenceFeatureHost", () => ({
  analyzeSequenceFeaturesInHost: jest.fn(),
}));

function uri(path: string): vscode.Uri {
  return { path, toString: () => `file://${path}` } as vscode.Uri;
}
function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness() {
  let receive: (message: ComparisonRequest) => Promise<void>;
  let closed = false;
  const disposeHandlers: Array<() => void> = [];
  const listener = { dispose: jest.fn() };
  const watcher = {
    dispose: jest.fn(),
    onDidChange: jest.fn(),
    onDidDelete: jest.fn(),
  };
  const webview = {
    html: "",
    cspSource: "test:",
    postMessage: jest.fn(),
    asWebviewUri: jest.fn((value) => {
      if (closed) {
        throw new Error("Webview is disposed");
      }
      return value;
    }),
    onDidReceiveMessage: jest.fn((callback) => {
      receive = callback;
      return listener;
    }),
  };
  const panel = {
    webview,
    onDidDispose: jest.fn((callback) => {
      disposeHandlers.push(callback);
    }),
    dispose: jest.fn(() => {
      if (closed) {
        return;
      }
      closed = true;
      disposeHandlers.forEach((callback) => callback());
    }),
  };
  jest
    .mocked(vscode.Uri.joinPath)
    .mockImplementation((base, ...parts) =>
      uri([base.path, ...parts].join("/")),
    );
  jest
    .mocked(vscode.window.createWebviewPanel)
    .mockReturnValue(panel as unknown as vscode.WebviewPanel);
  jest
    .mocked(vscode.workspace.createFileSystemWatcher)
    .mockReturnValue(watcher as unknown as vscode.FileSystemWatcher);
  const host = new ComparisonHost({
    extensionUri: uri("/extension"),
    globalState: { get: () => undefined },
  } as unknown as vscode.ExtensionContext);
  return {
    host,
    panel,
    watcher,
    listener,
    webview,
    receive: (message: ComparisonRequest) => receive(message),
  };
}
beforeEach(() => jest.resetAllMocks());

test("closing during workspace EQ initialization leaves no watchers or stale comparison", async () => {
  const h = harness();
  jest
    .mocked(vscode.workspace.getWorkspaceFolder)
    .mockReturnValue({ uri: uri("/workspace") } as vscode.WorkspaceFolder);
  const read = deferred<Uint8Array>();
  jest.mocked(vscode.workspace.fs.readFile).mockReturnValue(read.promise);
  const opening = h.host.open([uri("/workspace/a.wav")]);
  h.panel.dispose();
  read.resolve(new Uint8Array());
  await expect(opening).resolves.toBeUndefined();
  expect(h.host["_panels"].size).toBe(0);
  expect(h.host["_append"].size).toBe(0);
  expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
});

test("invalid initial resources dispose their partially initialized panel", async () => {
  const h = harness();
  await expect(h.host.open([uri("/workspace/not-audio.txt")])).rejects.toThrow(
    "Unsupported audio file",
  );
  expect(h.panel.dispose).toHaveBeenCalled();
  expect(h.host["_panels"].size).toBe(0);
  expect(h.host["_append"].size).toBe(0);
});

test("removal during a file read returns cancellation and later files remain readable", async () => {
  const h = harness();
  await h.host.open([uri("/workspace/a.wav"), uri("/workspace/b.wav")]);
  const read = deferred<Uint8Array>();
  jest
    .mocked(vscode.workspace.fs.readFile)
    .mockReturnValueOnce(read.promise)
    .mockResolvedValue(new Uint8Array([3, 4]));
  const reading = h.receive({
    type: "compare.read",
    id: "track-1",
    revision: 1,
    offset: 0,
  });
  await h.receive({ type: "compare.remove", id: "track-1" });
  read.resolve(new Uint8Array([1, 2]));
  await reading;
  expect(h.webview.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "compare.failure",
      id: "track-1",
      revision: 1,
    }),
  );
  expect(
    h.webview.postMessage.mock.calls.some(
      ([message]) =>
        message.type === "compare.data" && message.id === "track-1",
    ),
  ).toBe(false);
  await h.receive({
    type: "compare.read",
    id: "track-2",
    revision: 1,
    offset: 0,
  });
  expect(h.webview.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: "compare.data", id: "track-2" }),
  );
  h.host.dispose();
  expect(h.host["_panels"].size).toBe(0);
  expect(h.listener.dispose).toHaveBeenCalled();
});

test("host accepts eight files and rejects a ninth without creating a panel", async () => {
  const h = harness();
  await h.host.open(
    Array.from({ length: 9 }, (_, i) => uri(`/audio/${i}.wav`)),
  );
  expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
    "Select at most eight audio files.",
  );
  await h.host.open(
    Array.from({ length: 8 }, (_, i) => uri(`/audio/${i}.wav`)),
  );
  expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
  await h.receive({ type: "compare.ready" });
  const manifest = h.webview.postMessage.mock.calls
    .map(([message]) => message)
    .find((message) => message.type === "compare.files");
  expect(manifest.files).toHaveLength(8);
  h.host.dispose();
});

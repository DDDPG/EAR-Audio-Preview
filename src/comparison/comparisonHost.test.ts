/** @jest-environment node */
/* eslint-disable @typescript-eslint/naming-convention -- Mock properties match the VS Code API. */
import * as vscode from "vscode";
import { ComparisonAnalysisHost } from "../extensionHost/comparisonAnalysisHost";
import { analyzeSequenceFeaturesInHost } from "../extensionHost/sequenceFeatureHost";
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
    get webview() {
      if (closed) {
        throw new Error("Webview is disposed");
      }
      return webview;
    },
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

test("sequence cancellation stops running host work and removes queued work", async () => {
  const h = harness();
  await h.host.open([uri("/workspace/a.wav")]);
  const gate = deferred<null>();
  jest.mocked(analyzeSequenceFeaturesInHost).mockReturnValueOnce(gate.promise);
  const request = (requestId: string): ComparisonRequest => ({
    type: "compare.sequence",
    requestId,
    trackId: "track-1",
    revision: 1,
    samples: new Float32Array(8).buffer,
    sampleRate: 48000,
    hopSec: 0.02,
  });
  const first = h.receive(request("running"));
  const second = h.receive(request("queued"));
  await Promise.resolve();
  const shouldCancel = jest.mocked(analyzeSequenceFeaturesInHost).mock
    .calls[0][4]!;
  expect(shouldCancel()).toBe(false);
  await h.receive({ type: "compare.cancelSequence", requestId: "queued" });
  await second;
  expect(analyzeSequenceFeaturesInHost).toHaveBeenCalledTimes(1);
  await h.receive({ type: "compare.cancelSequence", requestId: "running" });
  expect(shouldCancel()).toBe(true);
  gate.resolve(null);
  await first;
  expect(
    h.webview.postMessage.mock.calls.some(
      ([message]) => message.type === "compare.sequenceResult",
    ),
  ).toBe(false);
  h.host.dispose();
});

test("disposal cancels queued work without reading the disposed panel webview", async () => {
  const h = harness();
  await h.host.open([uri("/workspace/a.wav")]);
  const gate = deferred<null>();
  jest.mocked(analyzeSequenceFeaturesInHost).mockReturnValueOnce(gate.promise);
  const request = (requestId: string): ComparisonRequest => ({
    type: "compare.sequence",
    requestId,
    trackId: "track-1",
    revision: 1,
    samples: new Float32Array(8).buffer,
    sampleRate: 48000,
    hopSec: 0.02,
  });
  const first = h.receive(request("running"));
  const second = h.receive(request("queued"));
  await Promise.resolve();
  expect(() => h.panel.dispose()).not.toThrow();
  await second;
  const shouldCancel = jest.mocked(analyzeSequenceFeaturesInHost).mock
    .calls[0][4]!;
  expect(shouldCancel()).toBe(true);
  expect(h.listener.dispose).toHaveBeenCalledTimes(1);
  expect(h.watcher.dispose).toHaveBeenCalledTimes(1);
  gate.resolve(null);
  await first;
  expect(analyzeSequenceFeaturesInHost).toHaveBeenCalledTimes(1);
});

test("Essentia comparison jobs run in the cancellable host queue", async () => {
  const h = harness();
  await h.host.open([uri("/workspace/a.wav")]);
  const gate = deferred<null>();
  const analyze = jest
    .spyOn(ComparisonAnalysisHost.prototype, "analyze")
    .mockReturnValueOnce(gate.promise);
  const job = {
    id: 7,
    trackId: "track-1",
    audioRevision: 2,
    settingsRevision: 3,
    kind: "stft" as const,
    audio: { left: new Float32Array(8), sampleRate: 48000, origin: 0 },
    options: {
      windowMs: 10,
      fftBackend: "essentia" as const,
      minHz: 20,
      maxHz: 24000,
      bins: 16,
      weighting: "none" as const,
      tiltDbPerOct: 0,
    },
    time: 0,
  };
  const result = h.receive({ type: "compare.analysis", revision: 1, job });
  await Promise.resolve();
  expect(analyze).toHaveBeenCalledWith(job, expect.any(Function));
  const shouldCancel = analyze.mock.calls[0][1];
  expect(shouldCancel()).toBe(false);
  await h.receive({ type: "compare.cancelAnalysis", id: 7 });
  expect(shouldCancel()).toBe(true);
  gate.resolve(null);
  await result;
  expect(
    h.webview.postMessage.mock.calls.some(
      ([message]) => message.type === "compare.analysisResult",
    ),
  ).toBe(false);
  h.host.dispose();
  analyze.mockRestore();
});

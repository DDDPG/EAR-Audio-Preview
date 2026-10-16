/** @jest-environment node */
/* eslint-disable @typescript-eslint/naming-convention -- Mock properties match the VS Code API. */
import * as vscode from "vscode";
import { AudioPreviewEditorProvider } from "./audioPreviewEditor";
import { fetchAutoEqEntriesInHost } from "./extensionHost/autoEqHost";
import { analyzeStftInHost } from "./extensionHost/stftHost";
import { analyzeSequenceFeaturesInHost } from "./extensionHost/sequenceFeatureHost";
import { pickEqPresetFileInHost } from "./extensionHost/eqPresetHost";
import { WebviewMessage, WebviewMessageType } from "./message";

jest.mock(
  "vscode",
  () => ({
    EventEmitter: class {
      handlers: Array<() => void> = [];
      event = (handler: () => void) => {
        this.handlers.push(handler);
        return {
          dispose: () => {
            this.handlers = this.handlers.filter((h) => h !== handler);
          },
        };
      };
      fire() {
        this.handlers.slice().forEach((handler) => handler());
      }
      dispose() {
        this.handlers = [];
      }
    },
    Uri: { joinPath: (base: vscode.Uri) => base },
    workspace: {
      isTrusted: true,
      getConfiguration: () => ({ get: () => undefined }),
      getWorkspaceFolder: jest.fn(),
      createFileSystemWatcher: jest.fn(),
      fs: { readFile: jest.fn() },
    },
    window: { showErrorMessage: jest.fn() },
  }),
  { virtual: true },
);
jest.mock("./extensionHost/autoEqHost", () => ({
  fetchAutoEqEntriesInHost: jest.fn(),
}));
jest.mock("./extensionHost/sequenceFeatureHost", () => ({
  analyzeSequenceFeaturesInHost: jest.fn(),
}));
jest.mock("./extensionHost/stftHost", () => ({ analyzeStftInHost: jest.fn() }));
jest.mock("./extensionHost/eqPresetHost", () => ({
  pickEqPresetFileInHost: jest.fn(),
}));

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness() {
  const uri = {
    fsPath: "/workspace/test.wav",
    toString: () => "file:///workspace/test.wav",
  } as vscode.Uri;
  const provider = new AudioPreviewEditorProvider({
    extensionUri: uri,
    globalState: { get: () => undefined },
  } as unknown as vscode.ExtensionContext);
  let closed = false;
  let receive: (message: WebviewMessage) => Promise<void>;
  const closedHandlers: Array<() => void> = [];
  const cancelHandlers: Array<() => void> = [];
  const listener = { dispose: jest.fn() };
  const watcher = {
    onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
    dispose: jest.fn(),
  };
  jest
    .mocked(vscode.workspace.createFileSystemWatcher)
    .mockReturnValue(watcher as unknown as vscode.FileSystemWatcher);
  jest
    .mocked(vscode.workspace.fs.readFile)
    .mockResolvedValue(new Uint8Array([1]));
  const webview = {
    options: {},
    html: "",
    cspSource: "test:",
    postMessage: jest.fn(() => Promise.resolve(true)),
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
    onDidDispose: (handler: () => void) => {
      closedHandlers.push(handler);
      return { dispose: jest.fn() };
    },
  } as unknown as vscode.WebviewPanel;
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: (handler: () => void) => {
      cancelHandlers.push(handler);
      return { dispose: jest.fn() };
    },
  } as unknown as vscode.CancellationToken;
  return {
    provider,
    uri,
    panel,
    token,
    webview,
    listener,
    watcher,
    receive: (message: WebviewMessage) => receive(message),
    close: () => {
      closed = true;
      closedHandlers.slice().forEach((h) => h());
    },
    cancel: () => cancelHandlers.slice().forEach((h) => h()),
    async open() {
      const document = await provider.openCustomDocument(uri, {}, token);
      await provider.resolveCustomEditor(document, panel, token);
      return document;
    },
  };
}
const request: WebviewMessage = {
  type: WebviewMessageType.AUTOEQ_REQUEST,
  data: { requestId: "old", endpoint: "entries" },
};
beforeEach(() => jest.resetAllMocks());

test.each(["stft", "sequence", "preset"])(
  "late %s analysis/picker completion is dropped after close",
  async (kind) => {
    const h = harness();
    await h.open();
    const pending = deferred<never>();
    let message: WebviewMessage;
    if (kind === "stft") {
      jest.mocked(analyzeStftInHost).mockReturnValueOnce(pending.promise);
      message = {
        type: WebviewMessageType.ANALYZE_STFT,
        data: {
          requestId: "old",
          cacheKey: "old",
          channel: 0,
          samples: new Float32Array(8).buffer,
          sampleRate: 48000,
          settings: {
            windowSize: 8,
            windowType: "hann",
            hopSize: 4,
            minTime: 0,
            maxTime: 1,
            minFrequency: 0,
            maxFrequency: 24000,
          },
        },
      };
    } else if (kind === "sequence") {
      jest
        .mocked(analyzeSequenceFeaturesInHost)
        .mockReturnValueOnce(pending.promise);
      message = {
        type: WebviewMessageType.ANALYZE_SEQUENCE_FEATURES,
        data: {
          requestId: "old",
          samples: new Float32Array(8).buffer,
          sampleRate: 48000,
          hopSec: 0.02,
        },
      };
    } else {
      jest.mocked(pickEqPresetFileInHost).mockReturnValueOnce(pending.promise);
      message = {
        type: WebviewMessageType.EQ_PRESET_OP,
        data: { requestId: "old", op: "import" },
      };
    }
    const receiving = h.receive(message);
    h.close();
    pending.reject(new Error("late failure"));
    await receiving;
    expect(h.webview.postMessage).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  },
);

test("already cancelled editors do not initialize a webview or receive messages", async () => {
  const h = harness();
  Object.assign(h.token, { isCancellationRequested: true });
  await h.open();
  expect(h.webview.html).toBe("");
  expect(h.webview.onDidReceiveMessage).not.toHaveBeenCalled();
});

test("active synchronous transport failures are reported", async () => {
  const h = harness();
  await h.open();
  h.webview.postMessage.mockImplementationOnce(() => {
    throw new Error("transport failed");
  });
  await h.receive({
    type: WebviewMessageType.DATA,
    data: { start: 0, end: 1 },
  });
  expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
    "transport failed",
  );
});

test.each(["success", "failure"])(
  "late AutoEq %s after close is dropped and cannot reach a reopened panel",
  async (result) => {
    const h = harness();
    await h.open();
    const pending = deferred<unknown>();
    jest.mocked(fetchAutoEqEntriesInHost).mockReturnValueOnce(pending.promise);
    const receiving = h.receive(request);
    h.close();
    const next = harness();
    await next.open();
    if (result === "success") {
      pending.resolve({ entries: [] });
    } else {
      pending.reject(new Error("network timeout"));
    }
    await receiving;
    expect(h.webview.postMessage).not.toHaveBeenCalled();
    expect(next.webview.postMessage).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    expect(h.listener.dispose).toHaveBeenCalledTimes(1);
  },
);

test("closing during CONFIG loading avoids disposed URI access", async () => {
  const h = harness();
  await h.open();
  jest
    .mocked(vscode.workspace.getWorkspaceFolder)
    .mockReturnValue({ uri: h.uri } as vscode.WorkspaceFolder);
  const read = deferred<Uint8Array>();
  jest.mocked(vscode.workspace.fs.readFile).mockReturnValueOnce(read.promise);
  const receiving = h.receive({ type: WebviewMessageType.CONFIG });
  h.close();
  read.resolve(new Uint8Array());
  await receiving;
  expect(h.webview.postMessage).not.toHaveBeenCalled();
  expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
});

test("cancellation drops pending replies and disposes listeners", async () => {
  const h = harness();
  await h.open();
  const pending = deferred<unknown>();
  jest.mocked(fetchAutoEqEntriesInHost).mockReturnValueOnce(pending.promise);
  const receiving = h.receive(request);
  h.cancel();
  pending.resolve({ entries: [] });
  await receiving;
  expect(h.webview.postMessage).not.toHaveBeenCalled();
  expect(h.listener.dispose).toHaveBeenCalledTimes(1);
});

test("active request failures still return a structured error", async () => {
  const h = harness();
  await h.open();
  jest
    .mocked(fetchAutoEqEntriesInHost)
    .mockRejectedValueOnce(new Error("network timeout"));
  await h.receive(request);
  expect(h.webview.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { requestId: "old", endpoint: "entries", error: "network timeout" },
    }),
  );
});

test.each([false, true])(
  "postMessage rejection respects panel lifetime (closed=%s)",
  async (close) => {
    const h = harness();
    await h.open();
    const send = deferred<boolean>();
    h.webview.postMessage.mockReturnValueOnce(send.promise);
    await h.receive({
      type: WebviewMessageType.DATA,
      data: { start: 0, end: 1 },
    });
    if (close) {
      h.close();
    }
    send.reject(new Error("transport failed"));
    await new Promise((resolve) => setImmediate(resolve));
    if (close) {
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    } else {
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "transport failed",
      );
    }
  },
);

test("document disposal releases its file watcher once", async () => {
  const h = harness();
  const document = await h.open();
  document.dispose();
  document.dispose();
  expect(h.watcher.dispose).toHaveBeenCalledTimes(1);
});

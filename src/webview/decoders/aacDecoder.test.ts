import { AacDecoder, aacDecoderWorkerUrl } from "./aacDecoder";

const originalFetch = globalThis.fetch;
const originalWorker = globalThis.Worker;
let workers: Array<{
  onmessage: (event: unknown) => void;
  onerror: () => void;
  onmessageerror: () => void;
  postMessage: jest.Mock;
  terminate: jest.Mock;
}>;
beforeEach(() => {
  document.head.innerHTML =
    '<script src="https://test.vscode-cdn.net/extension/dist/audioPreview.js"></script>';
  workers = [];
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, text: async () => "local worker source" });
  URL.createObjectURL = jest.fn(() => "blob:test");
  URL.revokeObjectURL = jest.fn();
  globalThis.Worker = jest.fn().mockImplementation(() => {
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: jest.fn(),
      terminate: jest.fn(),
    };
    workers.push(worker);
    return worker;
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.Worker = originalWorker;
  jest.useRealTimers();
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test.each(["audioPreview", "comparison"])(
  "%s locates its own packaged worker",
  (bundle) => {
    document.head.innerHTML = `<script src="https://test.vscode-cdn.net/extension/dist/${bundle}.js"></script>`;
    expect(aacDecoderWorkerUrl()).toBe(
      "https://test.vscode-cdn.net/extension/dist/aacDecoderWorker.js",
    );
  },
);

test("worker success retains native-rate PCM and releases all resources", async () => {
  jest.useFakeTimers();
  const decoder = new AacDecoder(new Uint8Array([1, 2]), "aac");
  const pending = decoder.decodeAsync();
  await flush();
  const samples = new Float32Array([0.2, -0.2]);
  workers[0].onmessage({
    data: {
      result: { channelData: [samples], sampleRate: 44100, samplesDecoded: 2 },
    },
  });
  await pending;
  expect(decoder.samples).toEqual([samples]);
  expect(decoder.sourceSampleRate).toBe(44100);
  expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  expect(jest.getTimerCount()).toBe(0);
  decoder.dispose();
});

test("disposing an active worker settles decoding and clears timeout", async () => {
  jest.useFakeTimers();
  const decoder = new AacDecoder(new Uint8Array(4), "m4a");
  const pending = decoder.decodeAsync();
  const rejected = expect(pending).rejects.toThrow(/disposed/);
  await flush();
  decoder.dispose();
  await rejected;
  expect(workers[0].terminate).toHaveBeenCalled();
  expect(decoder.samples).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
});

test("send failure clears the timer and terminates the worker", async () => {
  jest.useFakeTimers();
  const terminate = jest.fn();
  jest.mocked(globalThis.Worker).mockImplementationOnce(
    () =>
      ({
        postMessage() {
          throw new Error("send failed");
        },
        terminate,
      }) as unknown as Worker,
  );
  const decoder = new AacDecoder(new Uint8Array(4), "aac");
  await expect(decoder.decodeAsync()).rejects.toThrow("send failed");
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

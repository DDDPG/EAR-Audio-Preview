import { AlignmentClient, alignedBuffer } from "./alignmentClient";
import { MockAudioBuffer } from "../../__mocks__/helper";
import type { AlignmentJob } from "./alignmentProtocol";

const buffer = (length = 16, rate = 48000) =>
  new MockAudioBuffer(2, length, rate) as unknown as AudioBuffer;
const nativeBuffer = globalThis.AudioBuffer,
  nativeWorker = globalThis.Worker,
  nativeFetch = globalThis.fetch;
let worker: {
  onmessage: (e: MessageEvent) => void;
  onerror: () => void;
  postMessage: jest.Mock;
  terminate: jest.Mock;
};
beforeEach(() => {
  globalThis.AudioBuffer = class extends MockAudioBuffer {
    constructor(o: AudioBufferOptions) {
      super(o.numberOfChannels, o.length, o.sampleRate);
    }
  } as unknown as typeof AudioBuffer;
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, text: async () => "worker" });
  URL.createObjectURL = jest.fn(() => "blob:alignment");
  URL.revokeObjectURL = jest.fn();
  globalThis.Worker = jest.fn().mockImplementation(
    () =>
      (worker = {
        onmessage: undefined,
        onerror: undefined,
        postMessage: jest.fn(),
        terminate: jest.fn(),
      }),
  );
});
afterEach(() => {
  globalThis.AudioBuffer = nativeBuffer;
  globalThis.Worker = nativeWorker;
  globalThis.fetch = nativeFetch;
  jest.restoreAllMocks();
});
test.each([3, -3])(
  "shift %s preserves original stereo samples and retains all remaining content",
  async (offset) => {
    const x = buffer();
    x.getChannelData(0).set([1, 2, 3, 4, 5]);
    x.getChannelData(1).set([-1, -2, -3, -4, -5]);
    const original = x.getChannelData(0).slice(),
      out = await alignedBuffer(x, offset, -1);
    expect(out.length).toBe(x.length - offset);
    expect(out.sampleRate).toBe(48000);
    const start = Math.max(0, -offset);
    for (let i = start; i < out.length; i++) {
      expect(out.getChannelData(0)[i]).toBe(-original[i + offset]);
      expect(out.getChannelData(1)[i]).toBe(-x.getChannelData(1)[i + offset]);
    }
    expect(x.getChannelData(0)).toEqual(original);
  },
);
test("cancelled transform leaves original untouched", async () => {
  const x = buffer();
  x.getChannelData(0).fill(0.5);
  await expect(alignedBuffer(x, 0, 1, () => true)).rejects.toThrow("cancelled");
  expect(x.getChannelData(0)[0]).toBe(0.5);
});
test("mixed rates never create a worker or implicitly resample", async () => {
  const c = new AlignmentClient();
  c.workerUri = "worker.js";
  await expect(c.analyze(buffer(), buffer(16, 44100))).rejects.toThrow(
    "same decoded sample rate",
  );
  expect(Worker).not.toHaveBeenCalled();
});
test("worker transfers bounded copies and cancellation terminates pending work", async () => {
  const c = new AlignmentClient();
  c.workerUri = "worker.js";
  const x = buffer(48000 * 63),
    y = buffer(48000 * 63);
  x.getChannelData(0)[0] = 0.5;
  const pending = c.analyze(x, y);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const [job, transfer] = worker.postMessage.mock.calls[0] as [
    AlignmentJob,
    ArrayBuffer[],
  ];
  expect(job.a[0].length).toBe(48000 * 62);
  expect(job.a[0].buffer).not.toBe(x.getChannelData(0).buffer);
  expect(transfer).toHaveLength(4);
  c.cancel();
  await expect(pending).rejects.toThrow("cancelled");
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:alignment");
  expect(x.getChannelData(0)[0]).toBe(0.5);
});
test("success releases worker and blob, failed fetch surfaces an error", async () => {
  const c = new AlignmentClient();
  c.workerUri = "worker.js";
  const pending = c.analyze(buffer(), buffer());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const reply = {
    kind: "alignment",
    estimate: {
      accepted: false,
      offsetSamples: 0,
      polarity: 1,
      confidence: 0,
      reason: "low-correlation",
    },
  };
  worker.onmessage({ data: reply } as MessageEvent);
  await expect(pending).resolves.toEqual(reply);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });
  await expect(c.analyze(buffer(), buffer())).rejects.toThrow("404");
});

import { ComparisonFileLoader } from "./comparisonFileLoader";
import { ComparisonSession } from "./comparisonSession";
import { createDecoder } from "../decoders/decoderFactory";
import { MockAudioBuffer } from "../../__mocks__/helper";
import type { ComparisonRequest } from "../../comparison/protocol";

jest.mock("../decoders/decoderFactory", () => ({ createDecoder: jest.fn() }));

test("a partially successful batch keeps every decode failure in its final status", async () => {
  const originalAudioBuffer = globalThis.AudioBuffer;
  globalThis.AudioBuffer = class extends MockAudioBuffer {
    constructor(options: AudioBufferOptions) {
      super(options.numberOfChannels, options.length, options.sampleRate);
    }
  } as unknown as typeof AudioBuffer;
  const session = new ComparisonSession();
  const status = jest.fn();
  const post = (message: ComparisonRequest) => {
    if (message.type === "compare.read") {
      loader.receive({
        type: "compare.data",
        id: message.id,
        revision: message.revision,
        offset: 0,
        length: 1,
        samples: new Uint8Array([message.id === "good" ? 1 : 0]).buffer,
      });
    }
  };
  const loader = new ComparisonFileLoader(
    session,
    post,
    status,
    () => Promise.resolve(),
    jest.fn(),
    async () => undefined,
  );
  jest.mocked(createDecoder).mockImplementation(async (bytes) => {
    if (!bytes[0]) {
      throw new Error("invalid audio");
    }
    return {
      numChannels: 1,
      length: 480,
      sampleRate: 48000,
      sourceSampleRate: 48000,
      bitDepth: 24,
      samples: [new Float32Array(480)],
      dispose: jest.fn(),
    } as unknown as Awaited<ReturnType<typeof createDecoder>>;
  });
  try {
    loader.receive({
      type: "compare.files",
      initial: true,
      files: ["bad1", "good", "bad2"].map((id) => ({
        id,
        uri: id,
        name: id,
        ext: "flac",
        revision: 1,
      })),
      workerUri: "",
      loudnessWorkerUri: "",
      loudnessWorkletUri: "",
    });
    await loader["_queue"];
    expect(session.tracks.map((track) => track.id)).toEqual(["good"]);
    const finalStatus = status.mock.calls[status.mock.calls.length - 1][0];
    expect(finalStatus).toContain("1 / 8 audio files");
    expect(finalStatus).toContain("Failed to load bad1: Error: invalid audio");
    expect(finalStatus).toContain("Failed to load bad2: Error: invalid audio");
  } finally {
    loader.dispose();
    globalThis.AudioBuffer = originalAudioBuffer;
    jest.restoreAllMocks();
  }
});

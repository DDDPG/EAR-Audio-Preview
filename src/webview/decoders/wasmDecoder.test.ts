/** @jest-environment node */
/* eslint-disable @typescript-eslint/naming-convention -- Mocks mirror external decoder exports. */
import { WasmDecoder } from "./wasmDecoder";

const pcm = {
  channelData: [new Float32Array([0.1, -0.2])],
  samplesDecoded: 2,
  sampleRate: 48000,
};

function worker() {
  return {
    ready: Promise.resolve(),
    decode: jest.fn().mockResolvedValue(pcm),
    free: jest.fn().mockResolvedValue(undefined),
    terminate: jest.fn(),
  };
}

let workers: Record<string, ReturnType<typeof worker>>;
beforeEach(() => {
  jest.resetModules();
  workers = { mp3: worker(), flac: worker(), ogg: worker(), opus: worker() };
  jest.doMock("mpg123-decoder", () => ({
    MPEGDecoderWebWorker: jest.fn(() => workers.mp3),
  }));
  jest.doMock("@wasm-audio-decoders/flac", () => ({
    FLACDecoderWebWorker: jest.fn(() => workers.flac),
  }));
  jest.doMock("@wasm-audio-decoders/ogg-vorbis", () => ({
    OggVorbisDecoderWebWorker: jest.fn(() => workers.ogg),
  }));
  jest.doMock("ogg-opus-decoder", () => ({
    OggOpusDecoderWebWorker: jest.fn(() => workers.opus),
  }));
});

test.each(["mp3", "flac", "ogg", "opus"])(
  "%s releases a successful decoder without changing PCM",
  async (ext) => {
    const decoder = new WasmDecoder(new Uint8Array([1, 2]), ext);
    await decoder.decodeAsync();
    expect(decoder.samples).toEqual(pcm.channelData);
    expect(decoder.sampleRate).toBe(48000);
    expect(workers[ext].free).toHaveBeenCalledTimes(1);
    expect(workers[ext].terminate).not.toHaveBeenCalled();
  },
);

test.each(["mp3", "flac", "opus"])(
  "%s terminates a failed worker so native fallback can continue",
  async (ext) => {
    workers[ext].decode.mockRejectedValue(new Error("invalid audio"));
    // Cleanup must not wait for a broken worker to answer a free() message.
    workers[ext].free.mockImplementation(() => new Promise(() => undefined));
    const decoder = new WasmDecoder(new Uint8Array([1, 2]), ext);
    await expect(decoder.decodeAsync()).rejects.toThrow("failed to decode");
    expect(workers[ext].terminate).toHaveBeenCalledTimes(1);
    expect(workers[ext].free).not.toHaveBeenCalled();
  },
);

test("failed Vorbis worker terminates before Opus fallback", async () => {
  workers.ogg.decode.mockRejectedValue(new Error("not Vorbis"));
  workers.opus.decode.mockImplementation(async () => {
    expect(workers.ogg.terminate).toHaveBeenCalledTimes(1);
    return pcm;
  });
  const decoder = new WasmDecoder(new Uint8Array([1, 2]), "ogg");
  await decoder.decodeAsync();
  expect(decoder.samples).toEqual(pcm.channelData);
  expect(workers.opus.free).toHaveBeenCalledTimes(1);
});

test("initialization and free failures terminate the worker", async () => {
  workers.mp3.ready = Promise.reject(new Error("init failed"));
  await expect(
    new WasmDecoder(new Uint8Array(), "mp3").decodeAsync(),
  ).rejects.toThrow("failed to decode");
  expect(workers.mp3.terminate).toHaveBeenCalledTimes(1);
  workers.flac.free.mockRejectedValue(new Error("free failed"));
  await expect(
    new WasmDecoder(new Uint8Array(), "flac").decodeAsync(),
  ).rejects.toThrow("failed to decode");
  expect(workers.flac.terminate).toHaveBeenCalledTimes(1);
});

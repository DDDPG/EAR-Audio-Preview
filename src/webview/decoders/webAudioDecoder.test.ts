import { WebAudioDecoder } from "./webAudioDecoder";

describe("WebAudioDecoder cleanup", () => {
  const original = globalThis.AudioContext;
  afterEach(() => {
    globalThis.AudioContext = original;
  });
  test.each([false, true])(
    "closes the context when decode rejects=%s",
    async (fails) => {
      const close = jest.fn().mockResolvedValue(undefined);
      const error = new Error("Invalid audio");
      const decodeAudioData = jest
        .fn()
        .mockImplementation(() =>
          fails ? Promise.reject(error) : Promise.resolve({}),
        );
      globalThis.AudioContext = jest.fn(() => ({
        close,
        decodeAudioData,
      })) as unknown as typeof AudioContext;
      const decoder = new WebAudioDecoder(new Uint8Array([0, 1, 2]), "wav");
      if (fails) {
        await expect(decoder.decodeAsync()).rejects.toBe(error);
      } else {
        await decoder.decodeAsync();
      }
      decoder.dispose();
      expect(close).toHaveBeenCalledTimes(1);
    },
  );
});

import { createDecoder } from "./decoderFactory";
import { AacDecoder } from "./aacDecoder";
import { WebAudioDecoder } from "./webAudioDecoder";

jest.mock("./aacDecoder");
jest.mock("./webAudioDecoder");

beforeEach(() => jest.clearAllMocks());

test.each(["aac", "M4A", ".m4a"])(
  "%s uses local AAC decoding before browser decoding",
  async (ext) => {
    jest.spyOn(AacDecoder.prototype, "decodeAsync").mockResolvedValueOnce();
    const decoder = await createDecoder(new Uint8Array(4), ext);
    expect(decoder).toBeInstanceOf(AacDecoder);
    expect(AacDecoder).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      ext.toLowerCase().replace(/^\./, ""),
    );
    expect(WebAudioDecoder).not.toHaveBeenCalled();
    decoder.dispose();
  },
);

test("unsupported local AAC profiles release the worker before browser fallback", async () => {
  jest
    .spyOn(AacDecoder.prototype, "decodeAsync")
    .mockRejectedValueOnce(new Error("AAC-LC only"));
  jest.spyOn(WebAudioDecoder.prototype, "decodeAsync").mockResolvedValueOnce();
  const decoder = await createDecoder(new Uint8Array(4), "aac");
  expect(AacDecoder.prototype.dispose).toHaveBeenCalledTimes(1);
  expect(decoder).toBeInstanceOf(WebAudioDecoder);
  decoder.dispose();
});

test("dual AAC failure cleans both decoders and preserves the local support error", async () => {
  jest
    .spyOn(AacDecoder.prototype, "decodeAsync")
    .mockRejectedValueOnce(new Error("AAC-LC only"));
  jest
    .spyOn(WebAudioDecoder.prototype, "decodeAsync")
    .mockRejectedValueOnce(new Error("browser codec unavailable"));
  await expect(createDecoder(new Uint8Array(4), "m4a")).rejects.toThrow(
    /AAC-LC only.*browser codec unavailable/,
  );
  expect(AacDecoder.prototype.dispose).toHaveBeenCalledTimes(1);
  expect(WebAudioDecoder.prototype.dispose).toHaveBeenCalledTimes(1);
});

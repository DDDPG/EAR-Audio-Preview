import { IAudioDecoder } from "./audioDecoderInterface";
import { WasmDecoder, wasmDecoderSupports } from "./wasmDecoder";
import { WebAudioDecoder } from "./webAudioDecoder";
import { SphereDecoder } from "./sphereDecoder";
import { AacDecoder } from "./aacDecoder";

/**
 * Creates an appropriate audio decoder for the given file extension and data.
 *
 * Local decoders: MP3, FLAC, Ogg Vorbis/Opus, AAC-LC (ADTS/M4A), SPHERE PCM.
 * Web Audio remains the fallback for browser-supported codec variants.
 *
 * The returned decoder has already called decodeAsync(); callers may use
 * .samples, .sampleRate etc. directly without calling .decode() again.
 */
export async function createDecoder(
  data: Uint8Array,
  ext: string,
): Promise<IAudioDecoder> {
  const lowerExt = ext.toLowerCase().replace(/^\./, "");

  if (lowerExt === "sph") {
    const decoder = new SphereDecoder(data);
    decoder.decode();
    return decoder;
  }

  if (lowerExt === "aac" || lowerExt === "m4a") {
    const decoder = new AacDecoder(data, lowerExt);
    try {
      await decoder.decodeAsync();
      return decoder;
    } catch (localError) {
      decoder.dispose();
      const fallback = new WebAudioDecoder(data, lowerExt);
      try {
        await fallback.decodeAsync();
        return fallback;
      } catch (nativeError) {
        fallback.dispose();
        throw new Error(
          `Cannot decode .${lowerExt}: ${String(localError)}; browser fallback: ${String(nativeError)}`,
        );
      }
    }
  }

  if (wasmDecoderSupports(lowerExt)) {
    const decoder = new WasmDecoder(data, lowerExt);
    try {
      await decoder.decodeAsync();
      return decoder;
    } catch {
      // fall through to Web Audio
    }
  }

  const decoder = new WebAudioDecoder(data, lowerExt);
  await decoder.decodeAsync();
  return decoder;
}

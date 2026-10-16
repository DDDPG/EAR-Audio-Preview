import * as aurora from "av";
import AacRuntime from "aac";
import { m4aPresentation } from "./m4aPresentation";

export interface AacDecodeResult {
  channelData: Float32Array[];
  sampleRate: number;
  samplesDecoded: number;
}
interface AuroraFormat {
  sampleRate: number;
  channelsPerFrame: number;
}
interface AuroraAsset {
  format: AuroraFormat;
  on(type: string, handler: (value: unknown) => void): void;
  decodeToBuffer(handler: (data: Float32Array) => void): void;
  stop(): void;
}

// The upstream runtime also advertises profiles whose tools it cannot decode.
// Reject them before any frame reaches the AAC-LC implementation.
const originalCookie = AacRuntime.prototype.setCookie;
AacRuntime.prototype.setCookie = function (cookie: { data: Uint8Array }) {
  if (cookie.data[0] >>> 3 !== 2) {
    throw new Error(
      "The local decoder supports AAC-LC only; HE-AAC and other AAC profiles require browser support",
    );
  }
  return originalCookie.call(this, cookie);
};

export function decodeAacLocally(
  data: Uint8Array,
  ext: string,
): Promise<AacDecodeResult> {
  return new Promise((resolve, reject) => {
    const asset = aurora.Asset.fromBuffer(data) as AuroraAsset;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      asset.stop();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    asset.on("error", fail);
    try {
      asset.decodeToBuffer((interleaved) => {
        if (settled) {
          return;
        }
        try {
          const { sampleRate, channelsPerFrame: channels } = asset.format;
          if (
            !(sampleRate > 0) ||
            !Number.isInteger(channels) ||
            channels < 1 ||
            channels > 8 ||
            interleaved.length % channels !== 0
          ) {
            throw new Error("Invalid decoded AAC format");
          }
          const decoded = interleaved.length / channels;
          const range =
            ext.toLowerCase() === "m4a"
              ? m4aPresentation(data, sampleRate, decoded)
              : { start: 0, length: decoded };
          if (range.start + range.length > decoded) {
            throw new Error("M4A presentation exceeds decoded audio");
          }
          const channelData = Array.from(
            { length: channels },
            () => new Float32Array(range.length),
          );
          for (let sample = 0; sample < range.length; sample++) {
            for (let ch = 0; ch < channels; ch++) {
              const value = interleaved[(range.start + sample) * channels + ch];
              if (!Number.isFinite(value)) {
                throw new Error("AAC decoder produced a non-finite sample");
              }
              channelData[ch][sample] = value;
            }
          }
          settled = true;
          asset.stop();
          resolve({ channelData, sampleRate, samplesDecoded: range.length });
        } catch (error) {
          fail(error);
        }
      });
    } catch (error) {
      fail(error);
    }
  });
}

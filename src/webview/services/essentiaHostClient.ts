import { PageRpcClient } from "./pageRpcClient";
import {
  WebviewMessageType,
  ExtMessageType,
  type StftSettingsWireMessage,
} from "../../message";
import {
  stftWireToSpectrogram,
  type StftSettingsWire,
  type StftSpectrogramWire,
} from "../../shared/stftEssentiaCompute";

function stftCacheKey(
  ch: number,
  sampleRate: number,
  dataLength: number,
  settings: StftSettingsWire,
  sourceId: number,
): string {
  return JSON.stringify({
    ch,
    sourceId,
    sampleRate,
    dataLength,
    windowSize: settings.windowSize,
    windowType: settings.windowType,
    hopSize: settings.hopSize,
    minTime: settings.minTime,
    maxTime: settings.maxTime,
  });
}

/** Webview client for Essentia STFT in Extension Host (CSP-safe). */
export default class EssentiaHostClient {
  private _requestIds = new Set<string>();
  private _cache = new Map<string, number[][]>();
  private _disposed = false;

  constructor(private _rpc: PageRpcClient) {}

  public dispose(): void {
    this._disposed = true;
    this._cache.clear();
    for (const id of this._requestIds) {
      this._rpc.cancel(id);
    }
    this._requestIds.clear();
  }

  public getCached(
    ch: number,
    sampleRate: number,
    dataLength: number,
    settings: StftSettingsWire,
    sourceId = 0,
  ): number[][] | undefined {
    return this._cache.get(
      stftCacheKey(ch, sampleRate, dataLength, settings, sourceId),
    );
  }

  public requestStft(
    ch: number,
    channelData: Float32Array,
    sampleRate: number,
    settings: StftSettingsWire,
    sourceId = 0,
  ): Promise<number[][] | null> {
    if (this._disposed) {
      return Promise.resolve(null);
    }
    const cacheKey = stftCacheKey(
      ch,
      sampleRate,
      channelData.length,
      settings,
      sourceId,
    );
    const cached = this._cache.get(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const samples = channelData.buffer.slice(
      channelData.byteOffset,
      channelData.byteOffset + channelData.byteLength,
    );
    let requestId = "";
    return this._rpc
      .request(
        ExtMessageType.STFT_RESULT,
        (id) => {
          requestId = id;
          this._requestIds.add(id);
          return {
            type: WebviewMessageType.ANALYZE_STFT,
            data: {
              requestId: id,
              cacheKey,
              channel: ch,
              samples,
              sampleRate,
              settings: settings as StftSettingsWireMessage,
            },
          };
        },
        10 * 60 * 1000,
        () => this._rpc.postCancellation(requestId),
      )
      .then((value) => {
        if (this._disposed || !value) {
          return null;
        }
        const spectrogram = stftWireToSpectrogram(value as StftSpectrogramWire);
        this._cache.set(cacheKey, spectrogram);
        if (this._cache.size > 4) {
          this._cache.delete(this._cache.keys().next().value);
        }
        return spectrogram;
      })
      .catch((error) => {
        if (this._disposed) {
          return null;
        }
        throw error;
      })
      .finally(() => this._requestIds.delete(requestId));
  }
}

export type { StftSettingsWire };

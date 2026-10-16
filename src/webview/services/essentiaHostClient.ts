import {
  WebviewMessageType,
  type ExtStftResultMessage,
  type PostMessage,
  type StftSettingsWireMessage,
} from "../../message";
import {
  stftWireToSpectrogram,
  type StftSettingsWire,
} from "../../shared/stftEssentiaCompute";

interface PendingStft {
  owner: EssentiaHostClient;
  cacheKey: string;
  resolve: (spectrogram: number[][] | null) => void;
  reject: (err: Error) => void;
}

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
  private static _pending = new Map<string, PendingStft>();
  private _cache = new Map<string, number[][]>();
  private _disposed = false;

  constructor(private _postMessage: PostMessage) {}

  public static handleExtensionResponse(msg: ExtStftResultMessage): void {
    const pending = EssentiaHostClient._pending.get(msg.data.requestId);
    if (!pending) {
      return;
    }
    EssentiaHostClient._pending.delete(msg.data.requestId);
    if (msg.data.error) {
      pending.reject(new Error(msg.data.error));
      return;
    }
    if (!msg.data.wire || !msg.data.cacheKey) {
      pending.resolve(null);
      return;
    }
    const spectrogram = stftWireToSpectrogram(msg.data.wire);
    // The request owns the key and audio lifetime; never trust a late response
    // to populate a different document's cache.
    pending.owner._cache.set(pending.cacheKey, spectrogram);
    if (pending.owner._cache.size > 4) {
      pending.owner._cache.delete(pending.owner._cache.keys().next().value);
    }
    pending.resolve(spectrogram);
  }

  public dispose(): void {
    this._disposed = true;
    this._cache.clear();
    for (const [id, pending] of EssentiaHostClient._pending) {
      if (pending.owner === this) {
        EssentiaHostClient._pending.delete(id);
        pending.resolve(null);
      }
    }
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

    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `stft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const samples = channelData.buffer.slice(
      channelData.byteOffset,
      channelData.byteOffset + channelData.byteLength,
    );

    return new Promise((resolve, reject) => {
      EssentiaHostClient._pending.set(requestId, {
        resolve,
        reject,
        owner: this,
        cacheKey,
      });
      try {
        this._postMessage({
          type: WebviewMessageType.ANALYZE_STFT,
          data: {
            requestId,
            cacheKey,
            channel: ch,
            samples,
            sampleRate,
            settings: settings as StftSettingsWireMessage,
          },
        });
      } catch (err) {
        EssentiaHostClient._pending.delete(requestId);
        reject(err);
      }
    });
  }
}

export type { StftSettingsWire };

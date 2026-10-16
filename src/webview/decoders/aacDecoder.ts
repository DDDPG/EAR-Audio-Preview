import type { IAudioDecoder } from "./audioDecoderInterface";
import type { AacDecodeResult } from "./aacDecodeCore";

/** Derive the packaged worker from either of the extension's webview bundles. */
export function aacDecoderWorkerUrl(): string {
  for (const script of Array.from(document.scripts)) {
    if (
      script.src &&
      /\/(audioPreview|comparison)\.js$/.test(new URL(script.src).pathname)
    ) {
      return new URL("aacDecoderWorker.js", script.src).href;
    }
  }
  throw new Error("Cannot locate the packaged AAC decoder worker");
}

export class AacDecoder implements IAudioDecoder {
  private _result: AacDecodeResult | null = null;
  private _worker: Worker | null = null;
  private _abort: AbortController | null = null;
  private _cancel: (() => void) | null = null;
  private _disposed = false;
  constructor(
    private _data: Uint8Array,
    private _ext: string,
  ) {}
  get numChannels() {
    return this._result?.channelData.length ?? 0;
  }
  get sampleRate() {
    return this._result?.sampleRate ?? 0;
  }
  get sourceSampleRate() {
    return this.sampleRate || null;
  }
  get length() {
    return this._result?.samplesDecoded ?? 0;
  }
  get duration() {
    return this.sampleRate ? this.length / this.sampleRate : 0;
  }
  get format() {
    return this._ext.toUpperCase();
  }
  get encoding() {
    return "AAC-LC";
  }
  get bitDepth(): number | null {
    return null;
  }
  get fileSize() {
    return this._data.byteLength;
  }
  get samples() {
    return this._result?.channelData ?? [];
  }
  readAudioInfo(): void {}
  decode(): void {}
  async decodeAsync(): Promise<void> {
    if (this._disposed) {
      throw new Error("AAC decoder disposed");
    }
    if (this._abort) {
      throw new Error("AAC decoding is already running");
    }
    this._abort = new AbortController();
    let url: string | undefined;
    try {
      const response = await fetch(aacDecoderWorkerUrl(), {
        signal: this._abort.signal,
      });
      if (!response.ok) {
        throw new Error(`Cannot load AAC decoder worker: ${response.status}`);
      }
      const source = await response.text();
      if (this._disposed) {
        throw new Error("AAC decoder disposed");
      }
      url = URL.createObjectURL(
        new Blob([source], { type: "text/javascript" }),
      );
      const worker = (this._worker = new Worker(url));
      const result = await new Promise<AacDecodeResult>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("AAC decoding timed out")),
          10 * 60 * 1000,
        );
        const settle = (error?: Error, result?: AacDecodeResult) => {
          clearTimeout(timer);
          this._cancel = null;
          if (error) {
            reject(error);
          } else {
            resolve(result!);
          }
        };
        this._cancel = () => settle(new Error("AAC decoder disposed"));
        worker.onmessage = (
          event: MessageEvent<{ result?: AacDecodeResult; error?: string }>,
        ) => {
          const result = event.data.result;
          if (!result || event.data.error) {
            settle(
              new Error(event.data.error ?? "AAC decoder returned no audio"),
            );
          } else {
            settle(undefined, result);
          }
        };
        worker.onerror = () => settle(new Error("AAC decoder worker failed"));
        worker.onmessageerror = () =>
          settle(new Error("Invalid AAC decoder worker reply"));
        const copy = this._data.slice();
        try {
          worker.postMessage({ data: copy, ext: this._ext }, [copy.buffer]);
        } catch (error) {
          settle(error instanceof Error ? error : new Error(String(error)));
        }
      });
      if (this._disposed) {
        throw new Error("AAC decoder disposed");
      }
      this._result = result;
    } finally {
      this._worker?.terminate();
      this._worker = null;
      this._abort = null;
      this._cancel = null;
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  }
  dispose(): void {
    this._disposed = true;
    this._abort?.abort();
    this._cancel?.();
    this._worker?.terminate();
    this._worker = null;
    this._result = null;
  }
}

import { StftCache } from "./stftCache";
import { inferFftWindowSamplesForTimeRange } from "../services/analyzeSettingsService";
import { ComparisonSession, type ComparisonTrack } from "./comparisonSession";
import type { ComparisonAnalysisClient } from "./analysisClient";
import {
  sliceNativeWindow,
  type AnalysisOptions,
  type StftTile,
} from "./comparisonDsp";

/** STFT pane owns cache keys, shared jobs and stale-result acceptance. Drawing stays in the view. */
export class ComparisonStftController {
  private readonly _stftCache = new StftCache();
  private _signature = "";
  constructor(
    private readonly session: ComparisonSession,
    private readonly analysis: () => ComparisonAnalysisClient | null,
    private readonly disposed: () => boolean,
    private readonly settingsRevision: () => number,
    private readonly options: (bins: number) => AnalysisOptions,
    private readonly invalidateSurface: (canvas: HTMLCanvasElement) => void,
    private readonly draw: (
      canvas: HTMLCanvasElement,
      tile: StftTile,
      first: number,
      count: number,
    ) => void,
    private readonly status: (message: string) => void,
  ) {}
  public beginRender(): void {
    const signature =
      this.session.pane === "stft"
        ? JSON.stringify(
            this.session.activeTracks.map((track) => this.key(track)),
          )
        : "";
    if (signature !== this._signature || this.session.pane !== "stft") {
      this._stftCache.cancelPending();
      this.analysis()?.cancel();
      this._signature = signature;
    }
  }
  public clear(): void {
    this._stftCache.clear();
  }
  private stftOptions(track: ComparisonTrack): AnalysisOptions {
    return {
      ...this.options(this.session.stft.highResolution ? 512 : 256),
      windowMs:
        this.session.stft.windowSamples === -1
          ? (inferFftWindowSamplesForTimeRange(
              this.session.view.end - this.session.view.start,
              track.buffer.sampleRate,
              1200,
            ) /
              track.buffer.sampleRate) *
            1000
          : this.session.stft.windowSamples
            ? (this.session.stft.windowSamples / track.buffer.sampleRate) * 1000
            : this.session.windowMs,
      fftBackend: this.session.stft.fftBackend,
      windowType: this.session.stft.windowType,
      frequencyScale: this.session.stft.frequencyScale,
      hybridRatio: this.session.stft.hybridRatio,
    };
  }
  public key(track: ComparisonTrack): string {
    const { start, end } = this.session.view,
      options = this.stftOptions(track);
    const columns = Math.min(
      1200,
      Math.max(1, Math.ceil(((end - start) * 1000) / this.session.hopMs)),
      1200,
    );
    return JSON.stringify([
      track.id,
      track.revision,
      start,
      end,
      options,
      this.session.hopMs,
      columns,
    ]);
  }
  public async loadStft(
    track: ComparisonTrack,
    canvas: HTMLCanvasElement,
  ): Promise<void> {
    const { start, end } = this.session.view,
      options = this.stftOptions(track);
    const columns = Math.min(
      1200,
      Math.max(1, Math.ceil(((end - start) * 1000) / this.session.hopMs)),
      1200,
    );
    const key = this.key(track);
    if (canvas.dataset.requestedKey !== key) {
      this.invalidateSurface(canvas);
      delete canvas.dataset.drawnKey;
    }
    canvas.dataset.requestedKey = key;
    const draw = (tile: StftTile, first = 0, count = tile.columns) => {
      if (
        !this.disposed() &&
        canvas.isConnected &&
        canvas.dataset.requestedKey === key
      ) {
        this.draw(canvas, tile, first, count);
      }
    };
    const colorKey = JSON.stringify([
      key,
      this.session.stft.dbLow,
      this.session.stft.dbHigh,
    ]);
    if (canvas.dataset.drawnKey === colorKey) {
      return;
    }
    const cached = this._stftCache.get(key);
    if (cached) {
      draw(cached);
      canvas.dataset.drawnKey = colorKey;
      return;
    }
    if (!this.analysis()) {
      return;
    }
    const audioRevision = track.revision;
    const resultTile = await this._stftCache.load(key, async () => {
      const values = new Float32Array(columns * options.bins);
      values.fill(NaN);
      const tile: StftTile = {
        values,
        columns,
        bins: options.bins,
        start,
        end,
      };
      // A tile request only transfers a bounded segment, never the whole track.
      const columnsPerChunk = Math.max(
        1,
        Math.floor((10 * columns) / Math.max(0.001, end - start)),
      );
      for (let first = 0; first < columns; first += columnsPerChunk) {
        if (
          this.disposed() ||
          track.revision !== audioRevision ||
          !this.session.tracks.includes(track)
        ) {
          return null;
        }
        const count = Math.min(columnsPerChunk, columns - first);
        const chunkStart = start + ((end - start) * first) / columns;
        const chunkEnd = start + ((end - start) * (first + count)) / columns;
        if (chunkStart >= track.buffer.duration) {
          break;
        }
        const audio = sliceNativeWindow(
          track.buffer,
          chunkStart - options.windowMs / 1000,
          chunkEnd + options.windowMs / 1000,
        );
        const result = await this.analysis().request({
          kind: "stft",
          trackId: track.id,
          audioRevision: track.revision,
          settingsRevision: this.settingsRevision(),
          audio,
          options,
          time: chunkStart,
          end: chunkEnd,
          columns: count,
          hopMs: this.session.hopMs,
        });
        if (result?.error) {
          this.status(`STFT analysis failed: ${result.error}`);
        }
        if (!result?.tile || track.revision !== audioRevision) {
          return null;
        }
        values.set(result.tile.values, first * options.bins);
        draw(tile, first, count);
      }
      return tile;
    });
    if (
      resultTile &&
      !this.disposed() &&
      canvas.isConnected &&
      canvas.dataset.requestedKey === key
    ) {
      draw(resultTile);
      canvas.dataset.drawnKey = colorKey;
    }
  }
}

import WaveFormComponent from "../components/waveform/waveFormComponent";
import AnalyzeSettingsService from "../services/analyzeSettingsService";
import type { ComparisonSession, ComparisonTrack } from "./comparisonSession";

interface Envelope {
  revision: number;
  channels: Float32Array[];
}
export function canvasContext(
  canvas: HTMLCanvasElement,
  height: number,
): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const width = Math.max(
    200,
    Math.round(canvas.clientWidth || canvas.parentElement?.clientWidth || 800),
  );
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(width * ratio);
  canvas.height = Math.ceil(height * ratio);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return { ctx, width, height };
}

/** Compact native-rate envelopes are reused by overview and export waveforms. */
export class ComparisonWaveforms {
  private _envelopes = new Map<string, Envelope>();
  private _disposed = false;
  constructor(private readonly _session: ComparisonSession) {}
  public async prepare(track: ComparisonTrack): Promise<void> {
    if (this._envelopes.get(track.id)?.revision === track.revision) {
      return;
    }
    const { id, revision, buffer } = track;
    const current = () =>
      !this._disposed &&
      this._session.tracks.some(
        (t) => t.id === id && t.revision === revision && t.buffer === buffer,
      );
    const channels: Float32Array[] = [];
    let yielded = performance.now();
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const envelope = new Float32Array(Math.ceil(data.length / 512) * 2);
      for (let block = 0; block < envelope.length / 2; block++) {
        let low = 0,
          high = 0;
        for (
          let i = block * 512;
          i < Math.min(data.length, (block + 1) * 512);
          i++
        ) {
          low = Math.min(low, data[i]);
          high = Math.max(high, data[i]);
        }
        envelope[block * 2] = low;
        envelope[block * 2 + 1] = high;
        if (block % 256 === 0 && performance.now() - yielded > 10) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          yielded = performance.now();
          if (!current()) {
            return;
          }
        }
      }
      channels.push(envelope);
    }
    if (current()) {
      this._envelopes.set(id, { revision, channels });
    }
  }
  public draw(root: HTMLElement, track: ComparisonTrack): HTMLCanvasElement[] {
    root.className = "waveBand__channels";
    const cached = this._envelopes.get(track.id);
    const envelope = cached?.revision === track.revision ? cached : undefined;
    const canvases: HTMLCanvasElement[] = [];
    const settings = {
      minTime: this._session.view.start,
      maxTime: this._session.view.end,
      minAmplitude: this._session.minAmplitude,
      maxAmplitude: this._session.maxAmplitude,
      waveformVerticalScale: this._session.waveformScale,
    };
    for (let channel = 0; channel < track.buffer.numberOfChannels; channel++) {
      const plot = document.createElement("div");
      plot.className = "canvasBox waveBand__channel";
      root.append(plot);
      const data = track.buffer.getChannelData(channel);
      new WaveFormComponent(
        plot,
        AnalyzeSettingsService.WAVEFORM_CANVAS_WIDTH,
        AnalyzeSettingsService.WAVEFORM_CANVAS_HEIGHT *
          this._session.waveformScale,
        settings,
        track.buffer.sampleRate,
        data,
        channel,
        track.buffer.numberOfChannels,
        {
          color: track.color,
          envelope: (from, to) => {
            let low = Infinity,
              high = -Infinity;
            if (to - from > 1024) {
              if (!envelope) {
                return [low, high];
              }
              const values = envelope.channels[channel];
              for (
                let block = Math.floor(from / 512);
                block < Math.ceil(to / 512);
                block++
              ) {
                low = Math.min(low, values[block * 2] ?? 0);
                high = Math.max(high, values[block * 2 + 1] ?? 0);
              }
            } else {
              for (let i = from; i < to; i++) {
                low = Math.min(low, data[i]);
                high = Math.max(high, data[i]);
              }
            }
            return [low, high];
          },
        },
      );
      canvases.push(plot.querySelector<HTMLCanvasElement>(".axisCanvas"));
    }
    root.style.height = `${track.buffer.numberOfChannels * AnalyzeSettingsService.WAVEFORM_CANVAS_HEIGHT * this._session.waveformScale + (track.buffer.numberOfChannels - 1) * 6}px`;
    return canvases;
  }
  public prune(): void {
    for (const id of this._envelopes.keys()) {
      if (!this._session.tracks.some((t) => t.id === id)) {
        this._envelopes.delete(id);
      }
    }
  }
  public dispose(): void {
    this._disposed = true;
    this._envelopes.clear();
  }
}

import { comparisonTrackLimit } from "../../comparison/limits";
import { defaultStftSettings } from "./stftSettings";
export { comparisonColors, themeVariants } from "./trackTheme";
import { comparisonColors } from "./trackTheme";
export type StftLayout = "auto" | "row" | "column";
export type LiveLayout = "overlay" | "grid";
export type ComparisonPane = "stft" | "live" | "edit" | "loudness";

export interface ComparisonTrack {
  id: string;
  uri: string;
  name: string;
  revision: number;
  color: string;
  buffer: AudioBuffer;
  sourceSampleRate: number | null;
  bitDepth: number | null;
  active: boolean;
  muted: boolean;
  changed: boolean;
}

export interface ComparisonView {
  start: number;
  end: number;
  minHz: number;
  maxHz: number;
}

/** Domain state is independent of canvas, Web Audio graph, and host IPC. */
export class ComparisonSession extends EventTarget {
  private _tracks: ComparisonTrack[] = [];
  private _focus: string | null = null;
  private _revision = 0;
  private _playbackGains = new Map<string, number>();
  public playbackGain(id: string): number {
    return this._playbackGains.get(id) ?? 1;
  }
  public setPlaybackGains(gains: Map<string, number>): void {
    for (const [id, gain] of gains) {
      this.find(id);
      if (!Number.isFinite(gain) || gain < 0 || gain > 1) {
        throw new Error("Invalid matching gain");
      }
    }
    this._playbackGains = new Map(gains);
    this.notify("gain");
  }
  public view: ComparisonView = { start: 0, end: 0, minHz: 20, maxHz: 24000 };
  public selection = { start: 0, end: 0 };
  public readonly stft = defaultStftSettings();
  public waveformVisible = true;
  public minAmplitude = -1;
  public maxAmplitude = 1;
  public windowMs = 80;
  public hopMs = 20;
  public tiltDbPerOct = 0;
  public weighting: "none" | "a" = "none";
  public stftLayout: StftLayout = "auto";
  public liveLayout: LiveLayout = "overlay";
  public pane: ComparisonPane = "stft";
  public expanded = false;
  /** Compressed overview strips: 25% of the single-file waveform height. */
  public waveformScale = 0.25;

  public get tracks(): readonly ComparisonTrack[] {
    return this._tracks;
  }
  public get activeTracks(): ComparisonTrack[] {
    return this._tracks.filter((t) => t.active);
  }
  public get audibleTracks(): ComparisonTrack[] {
    return this._tracks.filter((t) => t.active && !t.muted);
  }
  public get focus(): ComparisonTrack | undefined {
    return this._tracks.find((t) => t.id === this._focus && t.active);
  }
  public get revision(): number {
    return this._revision;
  }
  public get duration(): number {
    return Math.max(0, ...this._tracks.map((t) => t.buffer.duration));
  }
  public get maxFrequency(): number {
    return Math.max(20, ...this._tracks.map((t) => t.buffer.sampleRate / 2));
  }

  public add(
    track: Omit<ComparisonTrack, "color" | "active" | "muted" | "changed">,
    initial = false,
  ): ComparisonTrack {
    if (this._tracks.some((t) => t.uri === track.uri)) {
      throw new Error("This file is already in the comparison");
    }
    if (this._tracks.length >= comparisonTrackLimit) {
      throw new Error("A comparison supports at most eight files");
    }
    if (
      track.buffer.numberOfChannels < 1 ||
      track.buffer.numberOfChannels > 2 ||
      !track.buffer.length
    ) {
      throw new Error("Comparison requires a nonempty mono or stereo file");
    }
    const oldDuration = this.duration;
    const color = comparisonColors.find(
      (c) => !this._tracks.some((t) => t.color === c),
    );
    const item: ComparisonTrack = {
      ...track,
      color,
      active: true,
      muted: !(initial && !this._tracks.length),
      changed: false,
    };
    this._tracks.push(item);
    if (!this.focus) {
      this._focus = item.id;
    }
    this.updateExtent(oldDuration);
    this.notify("tracks");
    return item;
  }

  public remove(id: string): void {
    const oldDuration = this.duration;
    this._playbackGains.delete(id);
    this._tracks = this._tracks.filter((t) => t.id !== id);
    this.repairFocus();
    this.updateExtent(oldDuration);
    this.notify("tracks");
  }

  public replace(
    id: string,
    audio: Pick<
      ComparisonTrack,
      "buffer" | "revision" | "sourceSampleRate" | "bitDepth"
    >,
  ): void {
    const oldDuration = this.duration;
    const track = this.find(id);
    this._playbackGains.delete(id);
    Object.assign(track, audio, { changed: false });
    this.updateExtent(oldDuration);
    this.notify("audio");
  }

  public setActive(id: string, active: boolean): void {
    this.find(id).active = active;
    this.repairFocus();
    this.notify("active");
  }
  public setMuted(id: string, muted: boolean): void {
    const track = this.find(id);
    if (!track.active && !muted) {
      throw new Error("Activate this file before unmuting it");
    }
    track.muted = muted;
    this.notify("mute");
  }
  public setFocus(id: string): void {
    if (!this.find(id).active) {
      return;
    }
    this._focus = id;
    this.notify("focus");
  }
  public markChanged(id: string): void {
    this.find(id).changed = true;
    this.notify("file");
  }
  public setView(view: Partial<ComparisonView>): void {
    const start = Math.max(
      0,
      Math.min(view.start ?? this.view.start, this.duration),
    );
    const end = Math.max(
      start,
      Math.min(view.end ?? this.view.end, this.duration),
    );
    const maxHz = Math.max(
      20,
      Math.min(view.maxHz ?? this.view.maxHz, this.maxFrequency),
    );
    const minHz = Math.max(
      0,
      Math.min(view.minHz ?? this.view.minHz, maxHz - 1),
    );
    this.view = { start, end, minHz, maxHz };
    this.notify("view");
  }
  public resetView(): void {
    this.setView({
      start: 0,
      end: this.duration,
      minHz: 20,
      maxHz: this.maxFrequency,
    });
  }
  public setSelection(start: number, end: number): void {
    this.selection = {
      start: Math.max(0, Math.min(start, end, this.duration)),
      end: Math.max(0, Math.min(Math.max(start, end), this.duration)),
    };
    this.notify("selection");
  }
  public notify(reason: string): void {
    this._revision++;
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { reason, revision: this._revision },
      }),
    );
  }
  private find(id: string): ComparisonTrack {
    const track = this._tracks.find((t) => t.id === id);
    if (!track) {
      throw new Error("Comparison file no longer exists");
    }
    return track;
  }
  private repairFocus(): void {
    if (!this.focus) {
      this._focus = this.activeTracks[0]?.id ?? null;
    }
  }
  private updateExtent(oldDuration: number): void {
    if (this.view.end === oldDuration) {
      this.view.end = this.duration;
    }
    if (this.selection.end === oldDuration) {
      this.selection.end = this.duration;
    }
    this.view.start = Math.min(this.view.start, this.duration);
    this.view.end = Math.min(this.view.end, this.duration);
    this.view.maxHz = this.maxFrequency;
    this.selection.start = Math.min(this.selection.start, this.duration);
    this.selection.end = Math.min(this.selection.end, this.duration);
  }
}

import { comparisonTrackLimit } from "../../comparison/limits";
import {
  type ComparisonStftSettings,
  defaultStftSettings,
} from "./stftSettings";
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

export type ComparisonChangeReason =
  | "gain"
  | "tracks"
  | "audio"
  | "active"
  | "mute"
  | "focus"
  | "file"
  | "view"
  | "selection"
  | "loaded"
  | "pane"
  | "settings"
  | "layout"
  | "display"
  | "waveform";

interface ComparisonChangeEffects {
  readonly cancelProfiles: boolean;
  readonly prune: boolean;
  readonly waves: boolean;
  readonly figures: boolean;
}

/** Adding a change reason requires an explicit cancellation and redraw policy. */
const comparisonEffects: Record<
  ComparisonChangeReason,
  ComparisonChangeEffects
> = {
  gain: { cancelProfiles: false, prune: false, waves: true, figures: false },
  tracks: { cancelProfiles: true, prune: true, waves: true, figures: true },
  audio: { cancelProfiles: true, prune: true, waves: true, figures: true },
  active: { cancelProfiles: true, prune: true, waves: true, figures: true },
  mute: { cancelProfiles: false, prune: false, waves: false, figures: false },
  focus: { cancelProfiles: false, prune: false, waves: true, figures: false },
  file: { cancelProfiles: false, prune: false, waves: false, figures: false },
  view: { cancelProfiles: false, prune: false, waves: true, figures: true },
  selection: {
    cancelProfiles: false,
    prune: false,
    waves: false,
    figures: false,
  },
  loaded: { cancelProfiles: false, prune: false, waves: true, figures: false },
  pane: { cancelProfiles: true, prune: false, waves: true, figures: true },
  settings: { cancelProfiles: false, prune: false, waves: true, figures: true },
  layout: { cancelProfiles: false, prune: false, waves: true, figures: true },
  display: { cancelProfiles: false, prune: false, waves: true, figures: true },
  waveform: {
    cancelProfiles: false,
    prune: false,
    waves: true,
    figures: false,
  },
};
export function comparisonChangeEffects(
  reason: ComparisonChangeReason,
): ComparisonChangeEffects {
  return comparisonEffects[reason];
}
export interface ComparisonWaveformSettings {
  waveformVisible: boolean;
  waveformScale: number;
  minAmplitude: number;
  maxAmplitude: number;
}
export interface ComparisonAnalysisSettings {
  windowMs: number;
  hopMs: number;
  tiltDbPerOct: number;
  weighting: "none" | "a";
}

export interface ComparisonRestoredSettings {
  layout?: StftLayout;
  pane?: ComparisonPane;
  stft?: Partial<ComparisonStftSettings>;
  controls?: Partial<
    ComparisonWaveformSettings &
      ComparisonAnalysisSettings & { expanded: boolean }
  >;
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
  /** Restore one saved snapshot atomically; viewport waits for audio loading. */
  public restoreSettings(state: ComparisonRestoredSettings): void {
    if (["auto", "row", "column"].includes(state.layout)) {
      this.stftLayout = state.layout;
    }
    if (["stft", "live", "edit", "loudness"].includes(state.pane)) {
      this.pane = state.pane;
    }
    if (state.stft) {
      const copy = <K extends keyof ComparisonStftSettings>(key: K): void => {
        if (key in state.stft) {
          this.stft[key] = state.stft[key] as ComparisonStftSettings[K];
        }
      };
      for (const key of Object.keys(defaultStftSettings()) as Array<
        keyof ComparisonStftSettings
      >) {
        copy(key);
      }
    }
    const controls = state.controls;
    if (controls) {
      if ("windowMs" in controls) {
        this.windowMs = controls.windowMs;
      }
      if ("hopMs" in controls) {
        this.hopMs = controls.hopMs;
      }
      if ("tiltDbPerOct" in controls) {
        this.tiltDbPerOct = controls.tiltDbPerOct;
      }
      if ("weighting" in controls) {
        this.weighting = controls.weighting;
      }
      if ("waveformScale" in controls) {
        this.waveformScale = controls.waveformScale;
      }
      if ("waveformVisible" in controls) {
        this.waveformVisible = controls.waveformVisible;
      }
      if ("minAmplitude" in controls) {
        this.minAmplitude = controls.minAmplitude;
      }
      if ("maxAmplitude" in controls) {
        this.maxAmplitude = controls.maxAmplitude;
      }
      if ("expanded" in controls) {
        this.expanded = controls.expanded;
      }
    }
    this.notify("settings");
  }
  public updateWaveform(settings: Partial<ComparisonWaveformSettings>): void {
    Object.assign(this, settings);
    if (this.minAmplitude >= this.maxAmplitude) {
      this.maxAmplitude = this.minAmplitude + 0.1;
    }
    this.notify("waveform");
  }
  public updateStft(settings: Partial<ComparisonStftSettings>): void {
    Object.assign(this.stft, settings);
    if (this.stft.dbLow >= this.stft.dbHigh) {
      this.stft.dbHigh = this.stft.dbLow + 1;
    }
    this.notify("display");
  }
  public updateAnalysis(settings: Partial<ComparisonAnalysisSettings>): void {
    Object.assign(this, settings);
    this.notify("settings");
  }
  public setPane(pane: ComparisonPane): void {
    if (this.pane === pane) {
      return;
    }
    this.pane = pane;
    this.notify("pane");
  }
  public setStftLayout(layout: StftLayout): void {
    this.stftLayout = layout;
    this.notify("layout");
  }
  public notify(reason: ComparisonChangeReason): void {
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

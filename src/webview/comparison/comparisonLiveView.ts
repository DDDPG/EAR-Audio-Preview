import LiveAnalysisComponent from "../components/liveMeters/liveAnalysisComponent";
import type {
  LiveComparisonInput,
  LiveComparisonSnapshot,
  LivePlayback,
} from "../components/liveMeters/liveAnalysisInput";
import AnalyzeSettingsService from "../services/analyzeSettingsService";
import { EventType } from "../events";
import type { ComparisonSession } from "./comparisonSession";
import type { ComparisonTransport } from "./comparisonTransport";
import type { AnalysisOptions, SpectrumFrame } from "./comparisonDsp";

/** Adapts comparison state to the original live widgets; owns no renderer. */
export class ComparisonLiveView implements LiveComparisonInput {
  private _snapshot: LiveComparisonSnapshot | null = null;
  private _revision = 0;
  private _listeners = new Set<() => void>();
  private readonly _component: LiveAnalysisComponent;
  private readonly _port: LivePlayback;
  private readonly _settingsEvents = [
    EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE,
    EventType.AS_UPDATE_LIVE_SPECTRUM_MODE,
    EventType.AS_UPDATE_LIVE_CQT_LF_RES,
    EventType.AS_UPDATE_LIVE_SPECTRUM_TILT,
    EventType.AS_UPDATE_LIVE_SOUND_FIELD_MODE,
    EventType.AS_UPDATE_LIVE_SPECTRUM_SMOOTHING,
    EventType.AS_UPDATE_LIVE_POLAR_FIELD_SMOOTHING,
    EventType.AS_UPDATE_LIVE_POLAR_LEVEL_GATE,
    EventType.AS_UPDATE_LIVE_POLAR_SAMPLE_RADIUS_GAMMA,
    EventType.AS_UPDATE_LIVE_POLAR_SAMPLE_FILL_BRIGHTNESS,
    EventType.AS_UPDATE_LIVE_SPECTRUM_PEAK_HOLD,
  ];
  private readonly _onSettings = (event: Event) => {
    if (event.type === EventType.AS_UPDATE_LIVE_SPECTRUM_TILT) {
      this._session.tiltDbPerOct = this.settings.liveSpectrumTiltDbPerOct;
    }
    if (this._snapshot) {
      this._snapshot = { ...this._snapshot, revision: ++this._revision };
    }
    this.invalidate();
    if (
      [
        EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE,
        EventType.AS_UPDATE_LIVE_SPECTRUM_MODE,
        EventType.AS_UPDATE_LIVE_CQT_LF_RES,
        EventType.AS_UPDATE_LIVE_SPECTRUM_TILT,
      ].includes(event.type)
    ) {
      this._onAnalysisChange?.();
    }
  };
  private readonly _onTransport = () =>
    this._port.dispatchEvent(new Event(EventType.UPDATE_IS_PLAYING));
  constructor(
    root: HTMLElement,
    private readonly _session: ComparisonSession,
    private readonly _transport: ComparisonTransport,
    public readonly settings: AnalyzeSettingsService,
    private readonly _onAnalysisChange?: () => void,
  ) {
    const session = _session,
      transport = _transport;
    this._port = new (class extends EventTarget {
      get isPlaying() {
        return transport.playing;
      }
      get sampleRate() {
        return session.maxFrequency * 2;
      }
      getAnalysers() {
        return null;
      }
    })();
    for (const event of this._settingsEvents) {
      settings.addEventListener(event, this._onSettings);
    }
    this._component = new LiveAnalysisComponent(
      root,
      this._port,
      settings,
      this,
    );
    _transport.addEventListener("change", this._onTransport);
  }
  snapshot(): LiveComparisonSnapshot | null {
    if (!this._snapshot) {
      return null;
    }
    return {
      ...this._snapshot,
      tracks: this._snapshot.tracks.filter((frame) =>
        this._session.activeTracks.some(
          (track) =>
            track.id === frame.id &&
            frame.revision.startsWith(`${track.revision}:`),
        ),
      ),
    };
  }
  subscribe(redraw: () => void): () => void {
    this._listeners.add(redraw);
    return () => this._listeners.delete(redraw);
  }
  invalidate(): void {
    for (const redraw of this._listeners) {
      redraw();
    }
  }
  publish(
    time: number,
    options: AnalysisOptions,
    frames: ReadonlyMap<string, SpectrumFrame>,
    settingsRevision: number,
  ): void {
    const frequencies = Float64Array.from(
      { length: options.bins },
      (_, i) =>
        options.minHz +
        ((options.maxHz - options.minHz) * i) / Math.max(1, options.bins - 1),
    );
    this._snapshot = {
      revision: ++this._revision,
      time,
      tracks: this._session.activeTracks.flatMap((track) => {
        const frame = frames.get(track.id);
        if (!frame?.timeL?.length || time >= track.buffer.duration) {
          return [];
        }
        return [
          {
            id: track.id,
            revision: `${track.revision}:${settingsRevision}`,
            name: track.name,
            color: track.color,
            sampleRate: track.buffer.sampleRate,
            left: frame.timeL,
            right: frame.timeR ?? frame.timeL,
            frequencies,
            spectrumDb: frame.db,
            phaseRho: frame.rho,
            broadbandRho: frame.broadbandRho ?? 0,
            weighting: options.weighting,
          },
        ];
      }),
    };
    this.invalidate();
  }
  resize(): void {
    this._component.refreshLayout();
  }
  dispose(): void {
    for (const event of this._settingsEvents) {
      this.settings.removeEventListener(event, this._onSettings);
    }
    this._transport.removeEventListener("change", this._onTransport);
    this._component.dispose();
    this._listeners.clear();
    this._snapshot = null;
  }
}

export function createComparisonLiveSettings(
  sampleRate: number,
): AnalyzeSettingsService {
  return AnalyzeSettingsService.fromDefaultSetting(
    {
      waveformVisible: true,
      waveformVerticalScale: 1,
      spectrogramVisible: true,
      spectrogramVerticalScale: 1,
      windowSizeIndex: 3,
      minAmplitude: -1,
      maxAmplitude: 1,
      minFrequency: 10,
      maxFrequency: sampleRate / 2,
      spectrogramAmplitudeRange: -90,
      frequencyScale: 1,
      melFilterNum: 40,
    },
    new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate }),
  );
}

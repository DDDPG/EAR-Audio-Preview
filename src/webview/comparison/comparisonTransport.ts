import HeadphoneEqSettingsService from "../services/headphoneEqSettingsService";
import { createEqChain, disposeEqNodes } from "../services/headphoneEqService";
import { ComparisonSession } from "./comparisonSession";
import type { ITransport } from "../services/transportInterface";
import {
  monitoringGainsForMode,
  monitorBandSoloBypassActive,
  sanitizeMonitorBandEdges,
  populationCountBits,
  type LiveMonitoringMode,
} from "../utils/liveMonitoring";

interface PlayingSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
  revision: number;
}

/** One sample clock schedules all tracks, including native-rate buffers. */
export class ComparisonTransport extends EventTarget implements ITransport {
  private _playing = false;
  private _offset = 0;
  private _anchor = 0;
  private _generation = 0;
  private _disposed = false;
  private _sources = new Map<string, PlayingSource>();
  private readonly _bus: GainNode;
  private readonly _hpf: BiquadFilterNode;
  private readonly _lpf: BiquadFilterNode;
  private readonly _master: GainNode;
  private readonly _split: ChannelSplitterNode;
  private readonly _merge: ChannelMergerNode;
  private readonly _matrix: GainNode[];
  public readonly meter: AnalyserNode;
  public readonly meterRight: AnalyserNode;
  private readonly _meterSplit: ChannelSplitterNode;
  public mode: LiveMonitoringMode = "lr";
  public hpfHz = 0;
  public lpfHz = 0;
  public loop = false;
  public bandMask = 0;
  private _bandNodes: AudioNode[] = [];
  private _eqNodes: AudioNode[] = [];
  private _eqSettings: HeadphoneEqSettingsService | null = null;
  private readonly _onChange = (event: Event) => {
    const reason = (event as CustomEvent<{ reason: string }>).detail.reason;
    if (["tracks", "audio", "active", "mute"].includes(reason)) {
      if (
        this._playing &&
        (!this.session.activeTracks.length ||
          this.position >= this.session.duration)
      ) {
        this.pause();
      } else {
        this.syncSources();
      }
    }
  };

  constructor(
    public readonly session: ComparisonSession,
    public readonly context: AudioContext,
  ) {
    super();
    this._bus = context.createGain();
    this._bus.channelCount = 2;
    this._bus.channelCountMode = "explicit";
    this._hpf = context.createBiquadFilter();
    this._hpf.type = "highpass";
    this._lpf = context.createBiquadFilter();
    this._lpf.type = "lowpass";
    this._master = context.createGain();
    this._split = context.createChannelSplitter(2);
    this._merge = context.createChannelMerger(2);
    this._matrix = Array.from({ length: 4 }, () => context.createGain());
    this._split.connect(this._matrix[0], 0);
    this._split.connect(this._matrix[1], 0);
    this._split.connect(this._matrix[2], 1);
    this._split.connect(this._matrix[3], 1);
    this._matrix[0].connect(this._merge, 0, 0);
    this._matrix[1].connect(this._merge, 0, 1);
    this._matrix[2].connect(this._merge, 0, 0);
    this._matrix[3].connect(this._merge, 0, 1);
    this.meter = context.createAnalyser();
    this.meter.fftSize = 2048;
    this.meterRight = context.createAnalyser();
    this.meterRight.fftSize = 2048;
    this._meterSplit = context.createChannelSplitter(2);
    this._merge.connect(this._master).connect(context.destination);
    this._master.connect(this._meterSplit);
    this._meterSplit.connect(this.meter, 0);
    this._meterSplit.connect(this.meterRight, 1);
    this.setMonitoring("lr", 0, 0);
    session.addEventListener("change", this._onChange);
  }
  public get isPlaying(): boolean {
    return this._playing;
  }
  public get playing(): boolean {
    return this._playing;
  }
  public get position(): number {
    return Math.min(
      this.session.duration,
      Math.max(
        0,
        this._offset +
          (this._playing
            ? Math.max(0, this.context.currentTime - this._anchor)
            : 0),
      ),
    );
  }
  public get volume(): number {
    return this._master.gain.value;
  }
  public set volume(gain: number) {
    this.setVolume(gain);
  }
  public setVolume(gain: number): void {
    this._master.gain.setTargetAtTime(
      Math.max(0, Math.min(1.2, gain)),
      this.context.currentTime,
      0.005,
    );
  }
  public setPlaybackPosition(sec: number): void {
    this.seek(sec);
  }
  public setMonitoring(
    mode: LiveMonitoringMode,
    hpfHz: number,
    lpfHz: number,
  ): void {
    this.mode = mode;
    this.hpfHz = hpfHz;
    this.lpfHz = lpfHz;
    // Disconnect disabled filters completely; allpass would still change phase.
    this._bus.disconnect();
    this._hpf.disconnect();
    this._lpf.disconnect();
    let tail: AudioNode = this._bus;
    if (hpfHz > 0) {
      tail.connect(this._hpf);
      tail = this._hpf;
    }
    if (lpfHz > 0) {
      tail.connect(this._lpf);
      tail = this._lpf;
    }
    disposeEqNodes(this._bandNodes);
    this._bandNodes = [];
    if (!monitorBandSoloBypassActive(this.bandMask)) {
      const sum = this.context.createGain();
      sum.gain.value = 1 / populationCountBits(this.bandMask);
      this._bandNodes.push(sum);
      const edges = sanitizeMonitorBandEdges(
        undefined,
        this.context.sampleRate,
      );
      for (let i = 0; i < 5; i++) {
        if (!(this.bandMask & (1 << i))) {
          continue;
        }
        let branch = tail;
        for (const [type, hz] of [
          ["highpass", edges[i]],
          ["highpass", edges[i]],
          ["lowpass", edges[i + 1]],
          ["lowpass", edges[i + 1]],
        ] as const) {
          const filter = this.context.createBiquadFilter();
          filter.type = type;
          filter.frequency.value = Math.min(this.context.sampleRate * 0.49, hz);
          filter.Q.value = Math.SQRT1_2;
          branch.connect(filter);
          branch = filter;
          this._bandNodes.push(filter);
        }
        branch.connect(sum);
      }
      tail = sum;
    }
    tail.connect(this._split);
    this._hpf.frequency.value = Math.max(
      10,
      Math.min(this.context.sampleRate * 0.49, hpfHz),
    );
    this._lpf.frequency.value = Math.max(
      10,
      Math.min(this.context.sampleRate * 0.49, lpfHz || 20000),
    );
    this._hpf.Q.value = this._lpf.Q.value = Math.SQRT1_2;
    const g = monitoringGainsForMode(mode);
    [g.ll, g.lr, g.rl, g.rr].forEach((value, i) =>
      this._matrix[i].gain.setTargetAtTime(
        value,
        this.context.currentTime,
        0.005,
      ),
    );
  }
  public setBandMask(mask: number): void {
    this.bandMask = mask & 31;
    this.setMonitoring(this.mode, this.hpfHz, this.lpfHz);
  }
  public setHeadphoneEq(settings: HeadphoneEqSettingsService): void {
    this._eqSettings = settings;
    this._merge.disconnect();
    disposeEqNodes(this._eqNodes);
    const { nodes, chain } = createEqChain(this.context, settings);
    this._eqNodes = nodes;
    if (chain) {
      this._merge.connect(chain.input);
      chain.output.connect(this._master);
    } else {
      this._merge.connect(this._master);
    }
  }
  public async play(): Promise<void> {
    if (this._disposed || this._playing || !this.session.activeTracks.length) {
      return;
    }
    const generation = ++this._generation;
    await this.context.resume();
    if (
      generation !== this._generation ||
      this._disposed ||
      !this.session.activeTracks.length
    ) {
      return;
    }
    if (this._offset >= this.session.duration) {
      this._offset = 0;
    }
    this._anchor = this.context.currentTime + 0.02;
    this._playing = true;
    this.syncSources();
    this.dispatchEvent(new Event("change"));
  }
  public pause(): void {
    this._offset = this.position;
    this._generation++;
    this._playing = false;
    for (const id of [...this._sources.keys()]) {
      this.stopSource(id);
    }
    this.dispatchEvent(new Event("change"));
  }
  public seek(seconds: number): void {
    const playing = this._playing;
    this.pause();
    this._offset = Math.max(0, Math.min(seconds, this.session.duration));
    if (playing) {
      void this.play();
    }
    this.dispatchEvent(new Event("change"));
  }
  public tick(): void {
    if (this._playing && this.position >= this.session.duration) {
      const loop = this.loop;
      this.pause();
      this._offset = 0;
      if (loop) {
        void this.play();
      }
    }
  }
  private syncSources(): void {
    if (!this._playing || this._disposed) {
      return;
    }
    for (const [id, source] of this._sources) {
      const track = this.session.tracks.find((t) => t.id === id);
      if (!track?.active || track.revision !== source.revision) {
        this.stopSource(id);
      }
    }
    const when = Math.max(this._anchor, this.context.currentTime + 0.005);
    const offset = this._offset + when - this._anchor;
    for (const track of this.session.activeTracks) {
      let entry = this._sources.get(track.id);
      if (!entry && offset < track.buffer.duration) {
        const source = this.context.createBufferSource();
        source.buffer = track.buffer;
        const gain = this.context.createGain();
        gain.gain.value = track.muted
          ? 0
          : track.buffer.numberOfChannels === 1
            ? Math.SQRT1_2
            : 1;
        source.connect(gain).connect(this._bus);
        entry = { source, gain, revision: track.revision };
        this._sources.set(track.id, entry);
        source.start(when, Math.max(0, offset));
      }
      if (entry) {
        entry.gain.gain.setTargetAtTime(
          track.muted
            ? 0
            : track.buffer.numberOfChannels === 1
              ? Math.SQRT1_2
              : 1,
          this.context.currentTime,
          0.003,
        );
      }
    }
  }
  private stopSource(id: string): void {
    const entry = this._sources.get(id);
    if (!entry) {
      return;
    }
    this._sources.delete(id);
    try {
      entry.source.stop();
    } catch {
      /* already stopped */
    }
    entry.source.disconnect();
    entry.gain.disconnect();
  }
  public dispose(): void {
    this.pause();
    this._disposed = true;
    this.session.removeEventListener("change", this._onChange);
    disposeEqNodes(this._eqNodes);
    disposeEqNodes(this._bandNodes);
    this._eqSettings = null;
    [
      this._bus,
      this._hpf,
      this._lpf,
      this._split,
      this._merge,
      ...this._matrix,
      this._master,
      this.meter,
      this.meterRight,
      this._meterSplit,
    ].forEach((n) => n.disconnect());
    void this.context.close();
  }
}

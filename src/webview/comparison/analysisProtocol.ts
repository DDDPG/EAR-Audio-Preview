import type {
  NativeAudioWindow,
  AnalysisOptions,
  SpectrumFrame,
  StftTile,
} from "./comparisonDsp";
export interface AnalysisJob {
  id: number;
  trackId: string;
  audioRevision: number;
  settingsRevision: number;
  kind: "live" | "stft";
  audio: NativeAudioWindow;
  options: AnalysisOptions;
  time: number;
  end?: number;
  columns?: number;
  hopMs?: number;
}
export interface AnalysisReply {
  id: number;
  trackId: string;
  audioRevision: number;
  settingsRevision: number;
  time: number;
  frame?: SpectrumFrame;
  tile?: StftTile;
  error?: string;
}

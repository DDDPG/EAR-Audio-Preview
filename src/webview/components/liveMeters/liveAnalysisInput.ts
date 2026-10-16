import type PlayerService from "../../services/playerService";

/** The existing meters need playback state, not ownership of a playback engine. */
export type LivePlayback = EventTarget &
  Pick<PlayerService, "isPlaying" | "sampleRate" | "getAnalysers">;
export interface LiveTrackFrame {
  id: string;
  revision: string;
  name: string;
  color: string;
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  frequencies: Float64Array;
  spectrumDb: Float32Array;
  phaseRho: Float32Array;
  broadbandRho: number;
  weighting: "none" | "a";
}
export interface LiveComparisonSnapshot {
  revision: number;
  time: number;
  tracks: readonly LiveTrackFrame[];
}
/** Every meter reads the same published batch, including paused seeks and muted sources. */
export interface LiveComparisonInput {
  snapshot(): LiveComparisonSnapshot | null;
  subscribe(redraw: () => void): () => void;
  invalidate?(): void;
}
export function traceColor(
  color: string | null,
  alpha: number,
  fallback: string,
): string {
  return color
    ? `${color}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, "0")}`
    : fallback;
}

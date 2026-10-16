/**
 * Minimal playback surface shared by single-file PlayerService and
 * ComparisonTransport. Comparison panels currently use ComparisonTransport
 * directly (with LivePlayback adapters for live meters); TransportFab remains
 * wired to PlayerService in single-file mode.
 */
export interface ITransport extends EventTarget {
  readonly isPlaying: boolean;
  volume: number;
  play(): void | Promise<void>;
  pause(): void;
  setPlaybackPosition(sec: number): void;
}

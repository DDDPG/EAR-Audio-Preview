/** Playback controls shared by single-file and comparison playback. */
export interface ITransport extends EventTarget {
  readonly isPlaying: boolean;
  volume: number;
  play(): void | Promise<void>;
  pause(): void;
  setPlaybackPosition(sec: number): void;
}

/** Percentage seeking used by the single-file seek control and transport dock. */
export interface ISeekTransport extends ITransport {
  previewSeekFromPercent(value: number): void;
  onSeekbarInput(value: number): void;
}

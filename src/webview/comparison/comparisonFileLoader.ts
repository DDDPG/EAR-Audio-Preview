import type {
  ComparisonFile,
  ComparisonRequest,
  ComparisonResponse,
} from "../../comparison/protocol";
import { ComparisonSession, type ComparisonTrack } from "./comparisonSession";
import { createDecoder } from "../decoders/decoderFactory";
import { comparisonTrackLimit } from "../../comparison/limits";
interface PendingRead {
  file: ComparisonFile;
  bytes?: Uint8Array;
  offset: number;
  resolve: (value: Uint8Array) => void;
  reject: (reason: Error) => void;
}

/** Owns file revisions, chunk reads, decoding and user confirmations. */
export class ComparisonFileLoader {
  private disposed = false;
  private _files = new Map<string, ComparisonFile>();
  private _reads = new Map<string, PendingRead>();
  private _confirmations = new Map<string, (accepted: boolean) => void>();
  private _queue: Promise<void> = Promise.resolve();
  constructor(
    private readonly session: ComparisonSession,
    private readonly _post: (message: ComparisonRequest) => void,
    private readonly status: (message: string) => void,
    private readonly ready: () => Promise<unknown>,
    private readonly beforeReplace: (id: string) => void,
    private readonly prepare: (track: ComparisonTrack) => Promise<void>,
  ) {}
  get size(): number {
    return this._files.size;
  }
  revision(id: string): number | undefined {
    return this._files.get(id)?.revision;
  }
  remove(id: string): void {
    const pending = this._reads.get(id);
    this._reads.delete(id);
    this._files.delete(id);
    pending?.reject(new Error("Audio load cancelled by removal"));
  }
  receive(message: ComparisonResponse): void {
    if (this.disposed) {
      return;
    }
    switch (message.type) {
      case "compare.files": {
        const delta = message.files.filter(
          (file) => this._files.get(file.id)?.revision !== file.revision,
        );
        for (const file of delta) {
          const pending = this._reads.get(file.id);
          if (pending && pending.file.revision !== file.revision) {
            this._reads.delete(file.id);
            pending.reject(
              new Error("Audio load superseded by a newer revision"),
            );
          }
        }
        message.files.forEach((file) => this._files.set(file.id, file));
        this._queue = this._queue
          .then(async () => {
            await this.ready();
            await this.loadFiles(delta, message.initial);
          })
          .catch((error) => this.status(String(error)));
        break;
      }
      case "compare.data": {
        const pending = this._reads.get(message.id);
        if (
          !pending ||
          pending.file.revision !== message.revision ||
          pending.offset !== message.offset
        ) {
          return;
        }
        pending.bytes ??= new Uint8Array(message.length);
        const bytes = new Uint8Array(message.samples);
        pending.bytes.set(bytes, message.offset);
        pending.offset += bytes.length;
        this.status(
          `Loading ${pending.file.name} · ${Math.round((pending.offset / Math.max(1, message.length)) * 100)}%`,
        );
        if (pending.offset >= message.length) {
          this._reads.delete(message.id);
          pending.resolve(pending.bytes);
        } else {
          this._post({
            type: "compare.read",
            id: message.id,
            revision: message.revision,
            offset: pending.offset,
          });
        }
        break;
      }
      case "compare.confirmed":
        this._confirmations.get(message.requestId)?.(message.accepted);
        this._confirmations.delete(message.requestId);
        break;
      case "compare.failure": {
        const pending = this._reads.get(message.id);
        if (
          pending &&
          (!message.revision || message.revision === pending.file.revision)
        ) {
          this._reads.delete(message.id);
          pending.reject(new Error(message.message));
        }
        this.status(message.message);
        break;
      }
    }
  }
  private async loadFiles(
    files: ComparisonFile[],
    initial: boolean,
  ): Promise<void> {
    const staged: Array<
      Omit<ComparisonTrack, "color" | "active" | "muted" | "changed">
    > = [];
    for (const file of files) {
      if (
        this.disposed ||
        this._files.get(file.id)?.revision !== file.revision
      ) {
        continue;
      }
      try {
        const bytes = await new Promise<Uint8Array>((resolve, reject) => {
          this._reads.set(file.id, { file, offset: 0, resolve, reject });
          this._post({
            type: "compare.read",
            id: file.id,
            revision: file.revision,
            offset: 0,
          });
        });
        const decoder = await createDecoder(bytes, file.ext);
        try {
          if (decoder.numChannels < 1 || decoder.numChannels > 2) {
            throw new Error("Comparison supports mono and stereo audio only");
          }
          const buffer = new AudioBuffer({
            numberOfChannels: decoder.numChannels,
            length: decoder.length,
            sampleRate: decoder.sampleRate,
          });
          const channels = decoder.samples;
          for (let channel = 0; channel < decoder.numChannels; channel++) {
            buffer.copyToChannel(channels[channel], channel);
          }
          if (
            this.disposed ||
            this._files.get(file.id)?.revision !== file.revision
          ) {
            continue;
          }
          staged.push({
            ...file,
            buffer,
            sourceSampleRate: decoder.sourceSampleRate ?? null,
            bitDepth: decoder.bitDepth,
          });
        } finally {
          decoder.dispose();
        }
      } catch (error) {
        this.status(`${file.name}: ${String(error)}`);
        if (
          !this.session.tracks.some((t) => t.id === file.id) &&
          this._files.get(file.id)?.revision === file.revision
        ) {
          this._files.delete(file.id);
          this._post({ type: "compare.remove", id: file.id });
        }
      }
    }
    const unchanged = this.session.tracks.filter(
      (t) => !staged.some((s) => s.id === t.id),
    );
    const all = [...unchanged, ...staged];
    const rates = new Set(all.map((t) => t.buffer.sampleRate));
    const warning =
      rates.size > 1 ||
      all.some(
        (t) =>
          !t.sourceSampleRate || t.sourceSampleRate !== t.buffer.sampleRate,
      );
    if (staged.length && warning) {
      const requestId = `rates-${Date.now()}`;
      const detail =
        all
          .map(
            (t) =>
              `${t.name}: ${t.sourceSampleRate ? `${t.sourceSampleRate} Hz source` : "source rate unknown"}; ${t.buffer.sampleRate} Hz decoded`,
          )
          .join("\n") +
        "\n\nAnalysis retains each decoded rate. Playback adapts to the output device; export rate is selectable.";
      const accepted = await new Promise<boolean>((resolve) => {
        this._confirmations.set(requestId, resolve);
        this._post({ type: "compare.confirm", requestId, detail });
      });
      if (!accepted) {
        for (const track of staged) {
          if (!this.session.tracks.some((t) => t.id === track.id)) {
            this._files.delete(track.id);
            this._post({ type: "compare.remove", id: track.id });
          }
        }
        this.status("Comparison change cancelled");
        return;
      }
    }
    for (const track of staged) {
      if (
        this.disposed ||
        this._files.get(track.id)?.revision !== track.revision
      ) {
        continue;
      }
      if (this.session.tracks.some((t) => t.id === track.id)) {
        this.beforeReplace(track.id);
        this.session.replace(track.id, track);
      } else {
        this.session.add(track, initial);
      }
      await this.prepare(this.session.tracks.find((t) => t.id === track.id));
    }
    if (!this.disposed) {
      this.session.notify("loaded");
      this.status(
        `${this.session.tracks.length} / ${comparisonTrackLimit} audio files · analysis uses original decoded signals`,
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const pending of this._reads.values()) {
      pending.reject(new Error("Comparison closed"));
    }
    this._reads.clear();
    for (const resolve of this._confirmations.values()) {
      resolve(false);
    }
    this._confirmations.clear();
  }
}

import { AlignmentClient, alignedBuffer } from "./alignmentClient";
import type { AlignmentReply } from "./alignmentProtocol";
import type { ComparisonSession, ComparisonTrack } from "./comparisonSession";
import type { ComparisonTransport } from "./comparisonTransport";
import "./comparisonAlignment.css";

interface Preview {
  reference: ComparisonTrack;
  target: ComparisonTrack;
  a: AudioBuffer;
  b: AudioBuffer;
  reply: AlignmentReply;
}
interface OriginalAudio {
  buffer: AudioBuffer;
  aligned: AudioBuffer;
}

/** Optional pairwise alignment, isolated from host IPC and the normal analysis pipeline. */
export class ComparisonAlignment {
  public readonly client = new AlignmentClient();
  private readonly _button = document.createElement("button");
  private _dialog: HTMLDialogElement | undefined;
  private _preview: Preview | undefined;
  private _originals = new Map<string, OriginalAudio>();
  private _busy = false;
  private _disposed = false;
  private _generation = 0;
  private readonly _onChange = (event: Event) => {
    const reason = (event as CustomEvent<{ reason: string }>).detail.reason;
    if (["tracks", "audio", "active", "file"].includes(reason)) {
      this.invalidate();
      for (const [id, audio] of this._originals) {
        if (
          this._session.tracks.find((t) => t.id === id)?.buffer !==
          audio.aligned
        ) {
          this._originals.delete(id);
        }
      }
      this.refreshChoices();
    }
    this.refreshButtons();
  };

  constructor(
    private readonly _root: HTMLElement,
    private readonly _session: ComparisonSession,
    private readonly _transport: ComparisonTransport,
    private readonly _changed: (track: ComparisonTrack) => Promise<void>,
  ) {
    this._button.textContent = "Align";
    this._button.className = "workspaceChrome__settingsBtn";
    this._button.dataset.openAlignment = "";
    this._button.title = "Estimate and apply a reversible integer delay";
    this._button.setAttribute("aria-haspopup", "dialog");
    this._button.onclick = () => this.open();
    this._root.querySelector(".comparisonTabs").append(this._button);
    this._session.addEventListener("change", this._onChange);
    this.refreshButtons();
  }

  private element<T extends HTMLElement>(selector: string): T {
    return this._dialog?.querySelector<T>(selector);
  }
  private message(text: string): void {
    const output = this.element<HTMLOutputElement>("[data-alignment-result]");
    if (output) {
      output.textContent = text;
    }
  }
  private invalidate(): void {
    this._generation++;
    this.client.cancel();
    this._preview = undefined;
    this._busy = false;
    this.message("Choose two active files, then estimate the delay.");
    this.refreshButtons();
  }
  private current(preview: Preview): boolean {
    return (
      !this._disposed &&
      !!this._dialog &&
      [preview.reference, preview.target].every(
        (t) => this._session.activeTracks.includes(t) && !t.changed,
      ) &&
      preview.reference.buffer === preview.a &&
      preview.target.buffer === preview.b
    );
  }
  private refreshButtons(): void {
    this._button.disabled =
      this._session.activeTracks.length < 2 && !this._originals.size;
    this._button.textContent = this._originals.size
      ? `Align (${this._originals.size})`
      : "Align";
    const analyze = this.element<HTMLButtonElement>(
      "[data-alignment-estimate]",
    );
    if (!analyze) {
      return;
    }
    analyze.disabled = this._busy || this._session.activeTracks.length < 2;
    this.element<HTMLButtonElement>("[data-alignment-apply]").disabled =
      this._busy ||
      !this._preview?.reply.estimate?.accepted ||
      !this.current(this._preview);
    this.element<HTMLButtonElement>("[data-alignment-reset]").disabled =
      this._busy || !this._originals.size;
    this.element<HTMLSelectElement>("[data-alignment-reference]").disabled =
      this._busy;
    this.element<HTMLSelectElement>("[data-alignment-target]").disabled =
      this._busy;
  }
  private refreshChoices(): void {
    const reference = this.element<HTMLSelectElement>(
      "[data-alignment-reference]",
    );
    const target = this.element<HTMLSelectElement>("[data-alignment-target]");
    if (!reference) {
      return;
    }
    const tracks = this._session.activeTracks;
    const selectedA = reference.value || this._session.focus?.id;
    const selectedB = target.value;
    for (const select of [reference, target]) {
      select.replaceChildren(
        ...tracks.map((track) => {
          const option = document.createElement("option");
          option.value = track.id;
          option.textContent = track.name;
          return option;
        }),
      );
    }
    reference.value = tracks.some((t) => t.id === selectedA)
      ? selectedA
      : tracks[0]?.id ?? "";
    target.value = tracks.some(
      (t) => t.id === selectedB && t.id !== reference.value,
    )
      ? selectedB
      : tracks.find((t) => t.id !== reference.value)?.id ?? "";
  }

  public open(): void {
    if (this._disposed || this._dialog) {
      return;
    }
    const dialog = document.createElement("dialog");
    this._dialog = dialog;
    dialog.className = "comparisonAlignment";
    dialog.setAttribute("aria-label", "Align audio files");
    dialog.innerHTML = `<h2>Align audio files</h2>
      <p>Estimate a constant delay within ±2 seconds using the first 60 seconds. Files must have the same decoded sample rate.</p>
      <label>Reference <select data-alignment-reference></select></label>
      <label>Move this file <select data-alignment-target></select></label>
      <output data-alignment-result role="status" aria-live="polite"></output>
      <label class="comparisonAlignment__polarity"><input type="checkbox" data-alignment-polarity>Also compensate inverted polarity</label>
      <p>Apply changes this comparison session only. Playback, analysis and export use the shifted copy. Moving earlier omits leading samples; moving later adds silence. Reset restores the decoded originals. No file is overwritten.</p>
      <div class="comparisonAlignment__actions"><button data-alignment-estimate>Estimate</button><button data-alignment-apply disabled>Apply alignment</button><button data-alignment-reset>Reset alignments</button><button data-alignment-close>Close</button></div>`;
    this._root.append(dialog);
    this.refreshChoices();
    this.invalidate();
    this.element<HTMLSelectElement>("[data-alignment-reference]").onchange =
      () => {
        this.invalidate();
        this.refreshChoices();
      };
    this.element<HTMLSelectElement>("[data-alignment-target]").onchange = () =>
      this.invalidate();
    this.element<HTMLButtonElement>("[data-alignment-estimate]").onclick =
      () => {
        void this.estimate();
      };
    this.element<HTMLButtonElement>("[data-alignment-apply]").onclick = () => {
      void this.apply();
    };
    this.element<HTMLButtonElement>("[data-alignment-reset]").onclick = () => {
      void this.reset();
    };
    this.element<HTMLButtonElement>("[data-alignment-close]").onclick = () =>
      dialog.close();
    dialog.oncancel = () => this.invalidate();
    dialog.onclose = () => {
      this.invalidate();
      dialog.remove();
      this._dialog = undefined;
      this._button.focus();
    };
    dialog.showModal();
  }

  private async estimate(): Promise<void> {
    this.invalidate();
    const reference = this._session.activeTracks.find(
      (t) =>
        t.id ===
        this.element<HTMLSelectElement>("[data-alignment-reference]").value,
    );
    const target = this._session.activeTracks.find(
      (t) =>
        t.id ===
        this.element<HTMLSelectElement>("[data-alignment-target]").value,
    );
    if (!reference || !target || reference === target) {
      this.message("Choose two different active files.");
      return;
    }
    if (reference.changed || target.changed) {
      this.message(
        "A source file changed. Reload it before estimating alignment.",
      );
      return;
    }
    const snapshot: Preview = {
      reference,
      target,
      a: reference.buffer,
      b: target.buffer,
      reply: { kind: "alignment" },
    };
    const generation = this._generation;
    this._busy = true;
    this.message("Estimating delay…");
    this.refreshButtons();
    try {
      const reply = await this.client.analyze(snapshot.a, snapshot.b);
      if (generation !== this._generation || !this.current(snapshot)) {
        return;
      }
      snapshot.reply = reply;
      this._preview = snapshot;
      const result = reply.estimate;
      if (!result.accepted) {
        const reasons = new Map([
          ["ambiguous-peaks", "Several delays match equally well"],
          ["silent-or-constant", "Not enough changing audio"],
          ["low-correlation", "The audio does not match reliably"],
          ["too-short", "At least 100 ms of audio is required"],
          ["no-peak", "No matching delay was found"],
        ]);
        this.message(
          `${reasons.get(result.reason) ?? result.reason}. Nothing was moved.`,
        );
      } else {
        const samples = result.offsetSamples,
          ms = (samples / snapshot.a.sampleRate) * 1000;
        let text = `${samples > 0 ? "Move earlier" : samples < 0 ? "Move later" : "No time shift"}: ${Math.abs(samples)} samples (${Math.abs(ms).toFixed(3)} ms). ${result.polarity < 0 ? "Inverted" : "Same"} polarity. |Correlation|: ${result.confidence.toFixed(4)} (not a probability).`;
        const residual = reply.residual;
        if (residual?.valid) {
          const depth =
            residual.nullDepthDb === Infinity
              ? "∞"
              : residual.nullDepthDb?.toFixed(1) ?? "n/a";
          text += ` Analysis excerpt, signed gain fit: ${residual.gain.toFixed(4)}; null depth: ${depth} dB. Gain is measured only, not applied.`;
        }
        this.message(text);
      }
    } catch (error) {
      if (generation === this._generation) {
        this.message(String(error));
      }
    } finally {
      if (generation === this._generation) {
        this._busy = false;
        this.refreshButtons();
      }
    }
  }

  private async apply(): Promise<void> {
    const preview = this._preview;
    if (
      !preview?.reply.estimate?.accepted ||
      !this.current(preview) ||
      this._busy
    ) {
      return;
    }
    const compensate = this.element<HTMLInputElement>(
      "[data-alignment-polarity]",
    ).checked;
    const result = preview.reply.estimate;
    this._busy = true;
    this.refreshButtons();
    try {
      const shifted = await alignedBuffer(
        preview.b,
        result.offsetSamples,
        compensate ? result.polarity : 1,
        () => this._preview !== preview || !this.current(preview),
      );
      if (this._preview !== preview || !this.current(preview)) {
        return;
      }
      this._transport.pause();
      const original =
        this._originals.get(preview.target.id)?.buffer ?? preview.b;
      this._originals.set(preview.target.id, {
        buffer: original,
        aligned: shifted,
      });
      this.replace(preview.target, shifted);
      await this._changed(preview.target);
      if (preview.target.buffer === shifted) {
        this.message(
          `Applied to ${preview.target.name} in this session. Reset alignments restores the original audio.`,
        );
      }
    } catch (error) {
      this.message(String(error));
    } finally {
      this._busy = false;
      this.refreshButtons();
    }
  }
  private replace(track: ComparisonTrack, buffer: AudioBuffer): void {
    const changed = track.changed;
    // Local audio revisions are negative, separate from host file revisions.
    this._session.replace(track.id, {
      buffer,
      revision: -this._session.revision - 1,
      sourceSampleRate: track.sourceSampleRate,
      bitDepth: track.bitDepth,
    });
    if (changed) {
      this._session.markChanged(track.id);
    }
  }
  private async reset(): Promise<void> {
    this.invalidate();
    this._transport.pause();
    const originals = [...this._originals];
    this._originals.clear();
    for (const [id, audio] of originals) {
      const track = this._session.tracks.find((t) => t.id === id);
      if (track?.buffer === audio.aligned) {
        this.replace(track, audio.buffer);
        await this._changed(track);
      }
    }
    this.message(
      "Original decoded audio restored. Source files were not changed.",
    );
    this.refreshButtons();
  }
  public dispose(): void {
    this._disposed = true;
    this.invalidate();
    this._session.removeEventListener("change", this._onChange);
    this._dialog?.remove();
    this._dialog = undefined;
    this._button.remove();
    this._originals.clear();
  }
}

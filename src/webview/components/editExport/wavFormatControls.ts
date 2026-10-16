import type {
  WavExportFormat,
  OverloadChoice,
} from "../../services/wavExportFormat";
import { exportSampleRates } from "../../services/wavExportFormat";
import "./wavFormatControls.css";

/** Shared by single-file export and the comparison mixer. */
export class WavFormatControls {
  public readonly element = document.createElement("div");
  private readonly _rate: HTMLSelectElement;
  private readonly _depth: HTMLSelectElement;
  constructor(defaults: Partial<WavExportFormat> = {}) {
    this.element.className = "wavFormatControls";
    this.element.innerHTML = `<label>Sample rate <select aria-label="Export sample rate"><option value="auto">Source / mix rate</option>${exportSampleRates.map((rate) => `<option value="${rate}">${rate / 1000} kHz</option>`).join("")}</select></label><label>WAV encoding <select aria-label="WAV encoding"><option value="auto">Source depth / float32</option><option value="8">8-bit PCM</option><option value="16">16-bit PCM</option><option value="24">24-bit PCM</option><option value="32">32-bit float</option></select></label><label title="Bake the enabled headphone correction into the WAV; master volume is excluded"><input type="checkbox" data-export-eq>Apply headphone EQ to WAV</label>`;
    [this._rate, this._depth] = Array.from(
      this.element.querySelectorAll("select"),
    );
    this._rate.value = defaults.sampleRate
      ? String(defaults.sampleRate)
      : "auto";
    this._depth.value = String(defaults.bitDepth ?? "auto");
  }
  public get applyHeadphoneEq(): boolean {
    return this.element.querySelector<HTMLInputElement>("[data-export-eq]")
      .checked;
  }
  public get value(): WavExportFormat {
    return {
      sampleRate: this._rate.value === "auto" ? null : Number(this._rate.value),
      bitDepth:
        this._depth.value === "auto"
          ? "auto"
          : (Number(this._depth.value) as 8 | 16 | 24 | 32),
      channelMode: "as_is",
    };
  }
}

export function chooseOverload(peak: number): Promise<OverloadChoice> {
  return new Promise((resolve) => {
    const prior = document.activeElement as HTMLElement;
    const backdrop = document.createElement("div");
    backdrop.className = "earExportDialogBackdrop";
    const dialog = document.createElement("div");
    dialog.className = "earExportDialog";
    dialog.role = "dialog";
    dialog.setAttribute("aria-modal", "true");
    const title = document.createElement("h3");
    title.textContent = "Mix exceeds integer WAV headroom";
    const description = document.createElement("p");
    description.textContent = `Peak: +${(20 * Math.log10(peak)).toFixed(2)} dBFS. Choose how to export.`;
    dialog.append(title, description);
    const finish = (choice: OverloadChoice) => {
      document.removeEventListener("keydown", key, true);
      backdrop.remove();
      if (prior?.isConnected) {
        prior.focus();
      }
      resolve(choice);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish("cancel");
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const buttons = Array.from(dialog.querySelectorAll("button"));
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        buttons[
          (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus();
      }
    };
    for (const [label, choice] of [
      ["Use float32", "float"],
      ["Attenuate mix", "attenuate"],
      ["Accept clipping", "clip"],
      ["Cancel", "cancel"],
    ] as const) {
      const button = document.createElement("button");
      button.className = "earEqPill";
      button.textContent = label;
      button.onclick = () => finish(choice);
      dialog.append(button);
    }
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.addEventListener("keydown", key, true);
    dialog.querySelector("button")?.focus();
  });
}

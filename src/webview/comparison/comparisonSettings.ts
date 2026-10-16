import { colorStftColumns } from "./stftColor";
import type { ComparisonSession } from "./comparisonSession";

/** Comparison controls keep physical window duration common across sample rates. */
export class ComparisonSettings {
  constructor(
    private readonly root: HTMLElement,
    private readonly session: ComparisonSession,
  ) {
    const number = (
      key: string,
      label: string,
      min: number,
      max: number,
      step = 1,
    ) =>
      `<label>${label} <input data-compare-setting="${key}" type="number" min="${min}" max="${max}" step="${step}"></label>`;
    const check = (key: string, label: string) =>
      `<label><input data-compare-setting="${key}" type="checkbox">${label}</label>`;
    const select = (key: string, label: string, options: [string, string][]) =>
      `<label>${label} <select data-compare-setting="${key}">${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select></label>`;
    root.innerHTML = `<div class="panelGroup"><h3>Time range</h3>${number("start", "Start (s)", 0, 1e9, 0.001)}${number("end", "End (s)", 0, 1e9, 0.001)}</div>
      <div class="panelGroup"><h3>Waveform</h3>${check("waveformVisible", "Visible")}${number("waveformScale", "Height scale", 0.2, 2, 0.05)}${number("minAmplitude", "Minimum amplitude", -10, 10, 0.1)}${number("maxAmplitude", "Maximum amplitude", -10, 10, 0.1)}</div>
      <div class="panelGroup workspacePaneSection workspacePaneSection--stft"><h3>Spectrogram</h3>
      ${check("visible", "Visible")}${check("highResolution", "High resolution")}
      ${number("height", "Height (px)", 130, 1080, 10)}
      ${select("windowSamples", "Window size", [
        ["0", "Time window (ms, above)"],
        ["-1", "Auto (visible time range)"],
        ...[256, 512, 1024, 2048, 4096, 8192, 16384, 32768].map(
          (n) => [String(n), `${n} samples`] as [string, string],
        ),
      ])}
      ${select("fftBackend", "FFT backend", [
        ["ooura", "Ooura (faster)"],
        ["essentia", "Essentia WASM"],
      ])}
      ${select("windowType", "Window type", [
        ["hann", "Hann"],
        ["hamming", "Hamming"],
        ["blackman-harris", "Blackman-Harris"],
        ["triangular", "Triangular"],
      ])}
      ${select("frequencyScale", "Frequency scale", [
        ["linear", "Linear"],
        ["log", "Log"],
        ["mel", "Mel"],
        ["hybrid", "Hybrid (linear–log)"],
      ])}
      ${number("hybridRatio", "Hybrid blend", 0, 1, 0.05)}
      ${number("minHz", "Minimum frequency (Hz)", 0, 1e6)}${number("maxHz", "Maximum frequency (Hz)", 20, 1e6)}
      ${number("dbLow", "Minimum level (dBFS)", -160, 20)}${number("dbHigh", "Maximum level (dBFS)", -159, 40)}
      <label>Color map <canvas data-color-map width="256" height="16" aria-label="STFT color scale"></canvas></label><p data-color-range></p>
      <p>Native-rate FFT · shared absolute dBFS scale. Mel changes the frequency axis; it does not apply a mel filter bank.</p></div>`;
    root.onchange = (event) => {
      const input = event.target as HTMLInputElement;
      const key = input.dataset.compareSetting;
      if (!key) {
        return;
      }
      let value: string | number | boolean = input.value;
      if (input.type === "checkbox") {
        value = input.checked;
      } else if (input.type === "number") {
        value = input.valueAsNumber;
        if (!Number.isFinite(value)) {
          this.sync();
          return;
        }
        value = Math.max(Number(input.min), Math.min(Number(input.max), value));
      } else if (key === "windowSamples") {
        value = Number(value);
      }
      if (["start", "end", "minHz", "maxHz"].includes(key)) {
        session.setView({ [key]: value });
      } else {
        const target = key in session.stft ? session.stft : session;
        Reflect.set(target, key, value);
        if (session.minAmplitude >= session.maxAmplitude) {
          session.maxAmplitude = session.minAmplitude + 0.1;
        }
        if (session.stft.dbLow >= session.stft.dbHigh) {
          session.stft.dbHigh = session.stft.dbLow + 1;
        }
        session.notify(key in session.stft ? "display" : "waveform");
      }
      this.sync();
    };
    this.sync();
  }
  sync(): void {
    this.drawColorScale();
    const values = {
      ...this.session,
      ...this.session.stft,
      ...this.session.view,
    };
    for (const input of this.root.querySelectorAll<HTMLInputElement>(
      "[data-compare-setting]",
    )) {
      const value = Reflect.get(values, input.dataset.compareSetting);
      if (input.type === "checkbox") {
        input.checked = Boolean(value);
      } else {
        input.value = String(value);
      }
    }
  }
  private drawColorScale(): void {
    const canvas =
      this.root.querySelector<HTMLCanvasElement>("[data-color-map]");
    const ctx = canvas.getContext("2d");
    const { dbLow, dbHigh } = this.session.stft;
    const image = ctx.createImageData(256, 1);
    const values = Float32Array.from(
      { length: 256 },
      (_, i) => dbLow + ((dbHigh - dbLow) * i) / 255,
    );
    colorStftColumns(values, 256, 1, 0, 256, image.data, dbLow, dbHigh);
    for (let row = 0; row < 16; row++) {
      ctx.putImageData(image, 0, row);
    }
    this.root.querySelector("[data-color-range]").textContent =
      `${dbLow} … ${dbHigh} dBFS`;
  }
  dispose(): void {
    this.root.onchange = null;
  }
}

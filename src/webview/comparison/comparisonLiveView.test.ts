/* eslint-disable @typescript-eslint/naming-convention -- Private state assertions cover canvas state isolation. */
import {
  ComparisonLiveView,
  createComparisonLiveSettings,
} from "./comparisonLiveView";
import { ComparisonSession } from "./comparisonSession";
import type { ComparisonTransport } from "./comparisonTransport";
import type { AnalysisOptions, SpectrumFrame } from "./comparisonDsp";
import { MockAudioBuffer } from "../../__mocks__/helper";
import { aWeightDb } from "../utils/aWeighting";

const originalAudioBuffer = globalThis.AudioBuffer;
let session: ComparisonSession;
let view: ComparisonLiveView;
const options: AnalysisOptions = {
  windowMs: 80,
  minHz: 10,
  maxHz: 48000,
  bins: 300,
  tiltDbPerOct: 0,
  weighting: "none",
};
const signal = Float32Array.from(
  { length: 4096 },
  (_, i) => 0.4 * Math.sin((2 * Math.PI * 100 * i) / 44100),
);
const frame: SpectrumFrame = {
  timeL: signal,
  timeR: signal,
  db: new Float32Array(300).fill(-20),
  rho: new Float32Array(300).fill(1),
  broadbandRho: 1,
  polarL: signal,
  polarR: signal,
};
beforeEach(() => {
  globalThis.AudioBuffer = class extends MockAudioBuffer {
    constructor(o: AudioBufferOptions) {
      super(o.numberOfChannels ?? 1, o.length, o.sampleRate);
    }
  } as unknown as typeof AudioBuffer;
  jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);
  jest.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  document.body.innerHTML = '<div id="live"></div>';
  session = new ComparisonSession();
  for (const [id, sr] of [
    ["a", 44100],
    ["b", 96000],
  ] as const) {
    session.add(
      {
        id,
        uri: id,
        name: id,
        revision: 1,
        buffer: new MockAudioBuffer(2, sr * 2, sr) as unknown as AudioBuffer,
        sourceSampleRate: sr,
        bitDepth: 24,
      },
      true,
    );
  }
});
afterEach(() => {
  view?.dispose();
  globalThis.AudioBuffer = originalAudioBuffer;
  jest.restoreAllMocks();
});
function mount(onChange = jest.fn()) {
  const transport = Object.assign(new EventTarget(), { playing: false });
  view = new ComparisonLiveView(
    document.getElementById("live"),
    session,
    transport as ComparisonTransport,
    createComparisonLiveSettings(96000),
    onChange,
  );
  view.publish(
    1,
    options,
    new Map([
      ["a", frame],
      [
        "b",
        {
          ...frame,
          db: new Float32Array(300).fill(-55),
          rho: new Float32Array(300).fill(-1),
          broadbandRho: -1,
        },
      ],
    ]),
    1,
  );
  return onChange;
}
test("two sources share original canvases with independent ballistics and phase state", () => {
  mount();
  const component = view["_component"],
    spectrum = component["_spectrum"],
    phase = component["_phaseCorrelation"];
  expect(document.querySelectorAll("#liveAnalysisInner canvas")).toHaveLength(
    3,
  );
  const traces = spectrum["_comparisonTraces"];
  expect(traces.size).toBe(2);
  expect(traces.get("a").state._emaRms).not.toBe(traces.get("b").state._emaRms);
  expect(traces.get("a").state._emaPeakLogical[100]).toBeCloseTo(-20);
  expect(traces.get("b").state._emaPeakLogical[100]).toBeCloseTo(-55);
  expect(traces.get("a").state._emaRms[100]).toBeGreaterThan(
    traces.get("b").state._emaRms[100],
  );
  expect(phase["_comparisonTraces"].get("a").broadband).toBeGreaterThan(0);
  expect(phase["_comparisonTraces"].get("b").broadband).toBeLessThan(0);
  expect(component["_overlaySpectrum"]["_comparisonTraces"].size).toBe(0);
  session.setActive("b", false);
  view.invalidate();
  expect(traces.size).toBe(1);
});
test("paused CQT and LF changes rebuild every native source and use ascending knots", () => {
  mount();
  view.settings.liveSpectrumMode = "cqt";
  const spectrum = view["_component"]["_spectrum"];
  for (const trace of spectrum["_comparisonTraces"].values()) {
    const knots = trace.state._cqtSrcXs;
    expect(knots.length).toBeGreaterThan(2);
    expect([...knots].every((x, i) => !i || x > knots[i - 1])).toBe(true);
    expect(knots[knots.length - 1]).toBe(trace.track.sampleRate / 2);
  }
  const old = spectrum["_comparisonTraces"].get("a").state._cqtCache;
  view.settings.liveCqtLfRes = 10;
  expect(spectrum["_comparisonTraces"].get("a").state._cqtCache).not.toBe(old);
  expect(spectrum["_comparisonTraces"].get("b").state._nativeCqtLayout.lf).toBe(
    10,
  );
});
test("CQT applies A weighting at native band frequencies and preserves user tilt", () => {
  mount();
  view.settings.liveSpectrumMode = "cqt";
  const spectrum = view["_component"]["_spectrum"];
  const before = spectrum["_comparisonTraces"].get("a").state;
  const unweighted = before._cqtSrcYs.slice();
  const frequencies = before._nativeCqtLayout.layout.freqs;
  view.publish(1, { ...options, weighting: "a" }, new Map([["a", frame]]), 2);
  const after = spectrum["_comparisonTraces"].get("a").state;
  const index = frequencies.findIndex((f, i) => f >= 80 && unweighted[i] > -50);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(after._cqtSrcYs[index] - unweighted[index]).toBeCloseTo(
    aWeightDb(frequencies[index]),
    3,
  );
  view.settings.liveSpectrumTiltDbPerOct = 6;
  expect(session.tiltDbPerOct).toBe(6);
  view.publish(1, options, new Map([["a", frame]]), 3);
  expect(view.settings.liveSpectrumTiltDbPerOct).toBe(6);
});
test("FFT UI and paused sound-field mode changes request fresh processing", () => {
  const onChange = mount();
  const revision = view.snapshot().revision;
  view.settings.liveAnalysisFftSize = 8192;
  expect(onChange).toHaveBeenCalled();
  expect(view.snapshot().revision).toBeGreaterThan(revision);
  const gonio = view["_component"]["_goniometer"];
  const update = jest.spyOn(gonio as never, "_updateAudioData" as never);
  view.settings.liveSoundFieldMode = "lissajous";
  expect(
    update.mock.calls.slice(-2).map((call) => (call[0] as { id: string }).id),
  ).toEqual(["a", "b"]);
  expect(gonio["_comparisonTraces"].size).toBe(2);
});

/* eslint-disable @typescript-eslint/naming-convention -- Mock keys must match the Web Audio and ES module interfaces. */
import * as exportFormat from "../services/wavExportFormat";
import { ComparisonApp } from "./comparisonApp";
import { MockAudioBuffer } from "../../__mocks__/helper";
import { canvasContext } from "./waveformStrip";
import { analyzeNativeLoudness } from "./loudnessAnalysis";
import type { LoudnessProfile } from "../services/loudnessService";
import * as sequenceService from "../services/sequenceFeatureService";

jest.mock("./comparisonTransport", () => ({
  ComparisonTransport: class extends EventTarget {
    public position = 0;
    public playing = false;
    public loop = false;
    public hpfHz = 0;
    public lpfHz = 0;
    public meter = {
      getFloatTimeDomainData: (out: Float32Array) => out.fill(0),
    };
    public meterRight = this.meter;
    public setHeadphoneEq() {}
    public setBandMask() {}
    public tick() {}
    public dispose() {}
    public seek() {}
    public setVolume() {}
    public setMonitoring() {}
  },
}));
jest.mock("./loudnessAnalysis", () => ({ analyzeNativeLoudness: jest.fn() }));
jest.mock("../services/sequenceFeatureService", () => ({
  __esModule: true,
  default: class {
    public analyzeProfile() {
      return Promise.resolve({
        timeSec: new Float32Array(0),
        f0Hz: new Float32Array(0),
        onsetFlux: new Float32Array(0),
      });
    }
    public dispose() {}
  },
}));
let app: ComparisonApp;
const add = (id: string) =>
  app.session.add(
    {
      id,
      uri: id,
      name: id,
      revision: 1,
      buffer: new MockAudioBuffer(2, 480, 48000) as unknown as AudioBuffer,
      sourceSampleRate: 48000,
      bitDepth: 24,
    },
    true,
  );
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const originalAudioBuffer = globalThis.AudioBuffer;
beforeEach(() => {
  // jsdom lacks PointerEvent; route it through MouseEvent so pointer handlers fire.
  for (const type of ["pointerdown", "pointermove", "pointerup"]) {
    document.addEventListener(type, (event) => {
      if (!(event instanceof PointerEvent)) {
        return;
      }
    });
  }
  globalThis.PointerEvent =
    globalThis.PointerEvent ||
    (class extends MouseEvent {
      public pointerId = 1;
      constructor(type: string, init: MouseEventInit = {}) {
        super(type, init);
      }
    } as unknown as typeof PointerEvent);
  globalThis.AudioBuffer = class extends MockAudioBuffer {
    constructor(options: AudioBufferOptions) {
      super(options.numberOfChannels ?? 1, options.length, options.sampleRate);
    }
  } as unknown as typeof AudioBuffer;
  document.body.innerHTML = '<div id="root"></div>';
  app = new ComparisonApp(
    document.getElementById("root"),
    jest.fn(),
    {} as AudioContext,
  );
});
afterEach(() => {
  app.dispose();
  globalThis.AudioBuffer = originalAudioBuffer;
  jest.restoreAllMocks();
});

describe("measurement input snapshots", () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  );
  beforeEach(() => {
    for (const [id, level] of [
      ["a", 0.5],
      ["b", 0.25],
    ] as const) {
      const track = add(id);
      for (let channel = 0; channel < 2; channel++) {
        track.buffer.getChannelData(channel).fill(level);
      }
    }
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: jest.fn(),
    });
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockReturnValue(0);
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalShowModal) {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        "showModal",
        originalShowModal,
      );
    } else {
      Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    }
  });

  const changes = {
    view: () => app.session.setView({ end: 0.005 }),
    mute: () => app.session.setMuted("a", true),
    layout: () => {
      app.session.stftLayout = "column";
      app.session.notify("layout");
    },
    display: () => {
      app.session.stft.dbLow = -60;
      app.session.notify("display");
    },
    file: () => app.session.markChanged("a"),
    focus: () => app.session.setFocus("b"),
    gains: () => app.session.setPlaybackGains(new Map([["a", 0.75]])),
    selection: () => app.session.setSelection(0.001, 0.005),
    active: () => app.session.setActive("b", false),
    remove: () => app.session.remove("b"),
    add: () => {
      add("c");
    },
    revision: () => {
      const track = app.session.tracks[0];
      app.session.replace(track.id, { ...track, revision: track.revision + 1 });
    },
    buffer: () => {
      const track = app.session.tracks[0];
      app.session.replace(track.id, {
        ...track,
        buffer: new MockAudioBuffer(2, 480, 48000) as unknown as AudioBuffer,
      });
    },
  };

  const finishAtLastYield = async (residual: boolean, change: () => void) => {
    const measurement = app["runMeasurement"](residual);
    await Promise.resolve();
    if (!residual) {
      // RMS yields after each of the two files; residual has just one pair.
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    }
    change();
    jest.runOnlyPendingTimers();
    await measurement;
    expect(app["_measurementBusy"]).toBe(false);
  };

  test.each([
    "view",
    "mute",
    "layout",
    "display",
    "file",
    "focus",
    "gains",
  ] as const)("RMS matching survives a %s change", async (change) => {
    await finishAtLastYield(false, changes[change]);
    expect(app.session.playbackGain("a")).toBe(0.5);
    expect(app.session.playbackGain("b")).toBe(1);
    expect(document.querySelector("[data-status]").textContent).toMatch(
      /^RMS matched/,
    );
  });

  test.each(["view", "mute", "layout", "display", "file"] as const)(
    "residual measurement survives a %s change",
    async (change) => {
      await finishAtLastYield(true, changes[change]);
      expect(document.querySelector("[data-status]").textContent).toBe(
        "Residual measurements ready",
      );
      expect(app["_measurementDialog"]?.textContent).toContain("Residual vs a");
    },
  );

  describe.each([false, true])("changed inputs (residual=%s)", (residual) => {
    test.each([
      "selection",
      "active",
      "remove",
      "add",
      "revision",
      "buffer",
    ] as const)(
      "%s cancels measurement even at the final yield",
      async (change) => {
        await finishAtLastYield(residual, changes[change]);
        expect(app.session.playbackGain("a")).toBe(1);
        expect(app["_measurementDialog"]).toBeNull();
        expect(document.querySelector("[data-status]").textContent).toMatch(
          /Measurement cancelled/,
        );
      },
    );
  });

  test.each(["focus", "gains"] as const)(
    "residual cancels when %s changes",
    async (change) => {
      await finishAtLastYield(true, changes[change]);
      expect(app["_measurementDialog"]).toBeNull();
      expect(document.querySelector("[data-status]").textContent).toMatch(
        /Measurement cancelled/,
      );
    },
  );

  test.each([false, true])(
    "disposed measurements do not update the UI (residual=%s)",
    async (residual) => {
      const status = jest.spyOn(
        app as unknown as { status(message: string): void },
        "status",
      );
      await finishAtLastYield(residual, () => {
        app.dispose();
        status.mockClear();
      });
      expect(status).not.toHaveBeenCalled();
      expect(app["_measurementDialog"]).toBeNull();
    },
  );
});

test("removing a reloading track releases the serial file-loading queue", async () => {
  add("a");
  const reject = jest.fn();
  app["_reads"].set("a", {
    file: { id: "a", uri: "a", name: "a", ext: "wav", revision: 2 },
    offset: 0,
    resolve: jest.fn(),
    reject,
  });
  const continueLoading = jest.fn();
  app["_queue"] = new Promise<void>((resolve) => {
    reject.mockImplementation(resolve);
  }).then(continueLoading);
  document.querySelector<HTMLButtonElement>('[data-action="remove"]').click();
  await Promise.resolve();
  expect(reject).toHaveBeenCalledWith(expect.any(Error));
  expect(app["_reads"].has("a")).toBe(false);
  expect(continueLoading).toHaveBeenCalled();
  app["receive"]({
    type: "compare.data",
    id: "a",
    revision: 2,
    offset: 0,
    length: 2,
    samples: new ArrayBuffer(2),
  });
  expect(app.session.tracks).toHaveLength(0);
});
test("loudness hover displays special filenames as text", () => {
  const track = add("mix<img src=x>.wav");
  app["_profiles"].set(track.id, {
    revision: track.revision,
    complete: true,
    sequence: {
      timeSec: new Float32Array([0]),
      f0Hz: new Float32Array([100]),
      f0Confidence: new Float32Array([1]),
      onsetFlux: new Float32Array([0]),
      sampleRate: 48000,
      hopSec: 0.1,
    },
  });
  const host = document.createElement("div");
  host.innerHTML =
    '<div class="comparisonFigure__frequencies"></div><canvas data-feature="f0"></canvas>';
  document.body.append(host);
  const canvas = host.querySelector("canvas");
  app["bindLoudnessHover"](canvas);
  canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: 0 }));
  const readout = host.querySelector(".comparisonFigure__frequencies");
  expect(readout.textContent).toContain("mix<img src=x>.wav 100.0 Hz");
  expect(readout.querySelector("img")).toBeNull();
});
test("mute toggles refresh Edit export availability immediately", () => {
  add("a");
  app.session.setMuted("a", true);
  app.session.pane = "edit";
  app.session.notify("pane");
  const button = document.querySelector<HTMLButtonElement>("[data-export]");
  expect(button.disabled).toBe(true);
  app.session.setMuted("a", false);
  expect(button.disabled).toBe(false);
  app.session.setActive("a", false);
  expect(document.querySelector(".comparisonEmpty")).not.toBeNull();
});

test("aligned audio revisions invalidate profiles but keep the real host file revision in sequence IPC", async () => {
  const track = add("aligned");
  track.revision = -7;
  app["_files"].set(track.id, {
    id: track.id,
    uri: track.uri,
    name: track.name,
    ext: "wav",
    revision: 3,
  });
  jest.spyOn(sequenceService, "default").mockImplementation(
    (_buffer, post) =>
      ({
        analyzeProfile: async () => {
          post({
            type: "ANALYZE_SEQUENCE_FEATURES",
            data: {
              requestId: "aligned-sequence",
              samples: new ArrayBuffer(16),
              sampleRate: 48000,
              hopSec: 0.1,
            },
          });
          return {
            timeSec: new Float32Array(0),
            f0Hz: new Float32Array(0),
            onsetFlux: new Float32Array(0),
          };
        },
        dispose: () => undefined,
      }) as unknown as sequenceService.default,
  );
  jest.mocked(analyzeNativeLoudness).mockResolvedValue({} as LoudnessProfile);
  app.session.pane = "loudness";
  await app["loadProfiles"]();
  expect(app["_post"]).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "compare.sequence",
      trackId: "aligned",
      revision: 3,
    }),
  );
  expect(app["_profiles"].get("aligned")?.revision).toBe(-7);
});
test("STFT uses logical canvas dimensions on Retina", () => {
  const oldRatio = window.devicePixelRatio;
  Object.defineProperty(window, "devicePixelRatio", {
    value: 2,
    configurable: true,
  });
  const parent = document.createElement("div"),
    canvas = document.createElement("canvas");
  Object.defineProperty(parent, "clientWidth", { value: 800 });
  parent.append(canvas);
  document.body.append(parent);
  const { ctx } = canvasContext(canvas, 260);
  app["drawTile"](canvas, {
    values: new Float32Array(4),
    columns: 2,
    bins: 2,
    start: 0,
    end: 1,
  });
  expect(ctx.drawImage).toHaveBeenLastCalledWith(
    expect.any(HTMLCanvasElement),
    0,
    0,
    800,
    260,
  );
  Object.defineProperty(window, "devicePixelRatio", {
    value: oldRatio,
    configurable: true,
  });
});
test("new active audio gets profiles even when another track is still analyzing", async () => {
  const profile: LoudnessProfile = {
    timeSec: new Float32Array(0),
    momentaryLufs: new Float32Array(0),
    shortTermLufs: new Float32Array(0),
    truePeakDbTp: new Float32Array(0),
    integratedLufs: -20,
    loudnessRangeLu: 0,
    maxTruePeakDbTp: -10,
    plrLu: 10,
  };
  const analyze = jest.mocked(analyzeNativeLoudness);
  analyze.mockImplementationOnce(
    (_buffer, _url, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        });
      }),
  );
  analyze.mockResolvedValue(profile);
  add("a");
  app.session.pane = "loudness";
  app.session.notify("pane");
  await flush();
  add("b");
  await flush();
  await flush();
  expect(app["_profiles"].get("a")?.complete).toBe(true);
  expect(app["_profiles"].get("b")?.complete).toBe(true);
});

test("Edit export choices survive zoom, pane switches and active changes", () => {
  add("a");
  add("b");
  app.session.pane = "edit";
  app.session.notify("pane");
  const change = (selector: string, value: string | boolean) => {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (typeof value === "boolean") {
      input.checked = value;
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("change"));
  };
  change("[data-channels]", "mono_left");
  change("[data-sync]", true);
  change("[data-export-hpf]", "123");
  change("[data-export-lpf]", "4567");
  app.session.setView({ end: 0.005 });
  app.session.setActive("b", false);
  app.session.pane = "live";
  app.session.notify("pane");
  app.session.pane = "edit";
  app.session.notify("pane");
  expect(
    document.querySelector<HTMLSelectElement>("[data-channels]").value,
  ).toBe("mono_left");
  expect(document.querySelector<HTMLInputElement>("[data-sync]").checked).toBe(
    true,
  );
  expect(
    document.querySelector<HTMLInputElement>("[data-export-hpf]").value,
  ).toBe("123");
  expect(
    document.querySelector<HTMLInputElement>("[data-export-lpf]").value,
  ).toBe("4567");
});
test("STFT view choices only appear in a checked context menu with fullscreen", () => {
  add("a");
  add("b");
  expect(document.querySelector("[data-deck]").textContent).not.toContain(
    "Horizontal row",
  );
  const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-stft]");
  canvas.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 30,
    }),
  );
  const menu = document.querySelector('[role="menu"]');
  expect(menu.querySelector('[aria-checked="true"]').textContent).toContain(
    "Automatic grid",
  );
  const row = [...menu.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Horizontal row"),
  );
  row.click();
  expect(app.session.stftLayout).toBe("row");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  document
    .querySelector<HTMLCanvasElement>("canvas[data-stft]")
    .dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
  [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')]
    .find((b) => b.textContent.includes("Fullscreen"))
    .click();
  expect(
    document
      .querySelector("[data-deck]")
      .classList.contains("comparisonFullscreen"),
  ).toBe(true);
});

test("a rebuilt Export button is re-enabled when a pending render is cancelled", async () => {
  add("a");
  app.session.pane = "edit";
  app.session.notify("pane");
  let resolveRender: (buffer: AudioBuffer) => void;
  jest.spyOn(exportFormat, "renderMix").mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRender = resolve;
      }),
  );
  jest.spyOn(exportFormat, "encodeRenderedWav").mockResolvedValue(null);
  const original = document.querySelector<HTMLButtonElement>("[data-export]");
  const promise = app["exportMix"](original.parentElement);
  app.session.pane = "live";
  app.session.notify("pane");
  app.session.pane = "edit";
  app.session.notify("pane");
  const replacement =
    document.querySelector<HTMLButtonElement>("[data-export]");
  expect(replacement).not.toBe(original);
  expect(replacement.disabled).toBe(true);
  resolveRender(app.session.tracks[0].buffer);
  await promise;
  expect(replacement.disabled).toBe(false);
});
test("new revisions settle old reads and ignore late chunks", async () => {
  const file = { id: "a", uri: "a", name: "a", ext: "wav", revision: 1 };
  const reject = jest.fn(),
    resolve = jest.fn();
  app["_analysisReady"] = Promise.resolve(null);
  app["_loudnessWorkerReady"] = Promise.resolve("");
  app["_files"].set("a", file);
  app["_reads"].set("a", { file, offset: 0, reject, resolve });
  app["receive"]({
    type: "compare.files",
    files: [{ ...file, revision: 2 }],
    initial: false,
    workerUri: "worker",
    loudnessWorkerUri: "loudness",
    loudnessWorkletUri: "worklet",
  });
  expect(reject).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining("superseded") }),
  );
  await flush();
  expect(app["_reads"].get("a").file.revision).toBe(2);
  app["receive"]({
    type: "compare.data",
    id: "a",
    revision: 1,
    offset: 0,
    length: 1,
    samples: new Uint8Array([1]).buffer,
  });
  expect(app["_reads"].get("a").offset).toBe(0);
  expect(resolve).not.toHaveBeenCalled();
});
test("wheel scroll leaves axes alone; drag zoom updates all STFT figures", () => {
  add("a");
  add("b");
  app.session.replace("a", {
    buffer: new MockAudioBuffer(2, 48000, 48000) as unknown as AudioBuffer,
    revision: 2,
    sourceSampleRate: 48000,
    bitDepth: 24,
  });
  const selection = { ...app.session.selection };
  const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-stft]");
  jest
    .spyOn(canvas, "getBoundingClientRect")
    .mockReturnValue({ left: 0, top: 0, width: 800, height: 260 } as DOMRect);
  const originalView = { ...app.session.view };
  for (const modifiers of [
    {},
    { shiftKey: true },
    { altKey: true },
    { ctrlKey: true },
  ]) {
    const wheel = new WheelEvent("wheel", {
      deltaY: -1,
      clientX: 400,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(app.session.view).toEqual(originalView);
  }
  canvas.onpointerdown(
    new PointerEvent("pointerdown", {
      button: 0,
      clientX: 200,
      clientY: 20,
      ctrlKey: true,
    }),
  );
  canvas.onpointerup(
    new PointerEvent("pointerup", {
      button: 0,
      clientX: 600,
      clientY: 200,
      ctrlKey: true,
    }),
  );
  expect(app.session.view.end - app.session.view.start).toBeLessThan(1);
  expect(app.session.selection).toEqual(selection);
  const labels = [...document.querySelectorAll(".comparisonFigure__axis")].map(
    (el) => el.textContent,
  );
  expect(labels).toHaveLength(2);
  expect(labels[0]).toBe(labels[1]);
});

test("Live keeps the original widgets and split state across active changes and Escape", () => {
  add("a");
  add("b");
  app.session.pane = "live";
  app.session.notify("pane");
  const original = document.querySelector("#liveAnalysisInner");
  expect(original.querySelectorAll("canvas")).toHaveLength(3);
  expect(original.querySelector(".liveAnalysis__resizeHandle")).not.toBeNull();
  expect(
    original.querySelector(".liveAnalysis__gonioColHandle"),
  ).not.toBeNull();
  app.session.setActive("b", false);
  expect(document.querySelector("#liveAnalysisInner")).toBe(original);
  expect(
    [...document.querySelectorAll("[data-legend-track]")].map(
      (el) => (el as HTMLElement).dataset.legendTrack,
    ),
  ).toEqual(["a"]);
  original.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
  [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')]
    .find((el) => el.textContent.includes("Fullscreen"))
    .click();
  expect(
    document.querySelector("#liveOverlay").classList.contains("hidden"),
  ).toBe(false);
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
    }),
  );
  expect(document.querySelector("#liveAnalysisInner")).toBe(original);
  expect(
    document.querySelector("#liveOverlay").classList.contains("hidden"),
  ).toBe(true);
});

test("track filenames occupy the banner; controls live in a separate hover layer", () => {
  add("an extremely long original audio filename.wav");
  add("second.wav");
  const items = [...document.querySelectorAll(".comparisonTrack")];
  expect(items).toHaveLength(2);
  expect(items[0].firstElementChild.className).toBe("comparisonTrack__active");
  expect(items[0].querySelector(".comparisonTrack__name").textContent).toBe(
    "an extremely long original audio filename.wav",
  );
  expect(
    items[0].querySelectorAll(".comparisonTrack__actions button"),
  ).toHaveLength(3);
  const before = document.querySelector<HTMLButtonElement>(
    ".comparisonTrack__actions button",
  );
  before.focus();
  before.click();
  expect((document.activeElement as HTMLElement).dataset.action).toBe("mute");
});

test("comparison session defaults to compressed 25% waveform strips", () => {
  expect(app.session.waveformScale).toBeCloseTo(0.25);
  add("a");
  const rows = document.querySelectorAll(".comparisonWave__row");
  expect(rows.length).toBeGreaterThan(0);
});
test("drag-zoom on a timeline zooms the shared view; click seeks", () => {
  add("a");
  const canvas = document.querySelector<HTMLCanvasElement>(
    "canvas[data-timeline='true']",
  );
  expect(canvas).not.toBeNull();
  app.session.setView({ start: 0, end: 10 });
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      width: 1000,
      right: 1000,
      top: 0,
      height: 50,
      bottom: 50,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  const seekSpy = jest.spyOn(app["transport"], "seek");
  const down = new MouseEvent("pointerdown", {
    clientX: 100,
    clientY: 10,
    bubbles: true,
  }) as PointerEvent;
  const up = new MouseEvent("pointerup", {
    clientX: 500,
    clientY: 12,
    bubbles: true,
  }) as PointerEvent;
  expect(down.clientX).toBe(100);
  expect(up.clientX).toBe(500);
  canvas.onpointerdown(down);
  const host = canvas.closest(
    ".comparisonFigure, .canvasBox, .comparisonWave__row",
  );
  expect(host).not.toBeNull();
  const overlay = host.querySelector(".figureSelectionOverlay");
  expect(overlay).not.toBeNull();
  canvas.onpointermove(
    new MouseEvent("pointermove", {
      clientX: 250,
      clientY: 11,
    }) as PointerEvent,
  );
  expect(host.querySelector(".figureSelection__band")).not.toBeNull();
  const timeSpy = jest.spyOn(app.session, "setView");
  canvas.onpointerup(up);
  expect(timeSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      start: expect.any(Number),
      end: expect.any(Number),
    }),
  );
  const calls = timeSpy.mock.calls.filter(
    (c) => c[0].start !== undefined && c[0].end !== undefined,
  );
  expect(calls.length).toBeGreaterThan(0);
  const patch = calls.at(-1)[0] as { start: number; end: number };
  expect(patch).toEqual({
    start: expect.any(Number),
    end: expect.any(Number),
  });
  expect(patch.end - patch.start).toBeGreaterThan(0.001);
  expect(seekSpy).not.toHaveBeenCalled();
  const down2 = new MouseEvent("pointerdown", {
    clientX: 300,
    clientY: 10,
    bubbles: true,
  }) as PointerEvent;
  const up2 = new MouseEvent("pointerup", {
    clientX: 300,
    clientY: 10,
    bubbles: true,
  }) as PointerEvent;
  canvas.onpointerdown(down2);
  canvas.onpointerup(up2);
  expect(seekSpy).toHaveBeenCalled();
});
test("drag-zoom shows the single-file red selection band while dragging", () => {
  add("a");
  const canvas = document.querySelector<HTMLCanvasElement>(
    "canvas[data-timeline='true']",
  );
  jest
    .spyOn(canvas, "getBoundingClientRect")
    .mockReturnValue({ left: 0, width: 1000, top: 0, height: 50 } as DOMRect);
  canvas.onpointerdown(
    new MouseEvent("pointerdown", {
      clientX: 100,
      clientY: 10,
    }) as PointerEvent,
  );
  canvas.onpointermove(
    new MouseEvent("pointermove", {
      clientX: 400,
      clientY: 12,
    }) as PointerEvent,
  );
  const band = document.querySelector(".figureSelection__band");
  expect(band).not.toBeNull();
  canvas.onpointerup(
    new MouseEvent("pointerup", { clientX: 400, clientY: 12 }) as PointerEvent,
  );
  expect(document.querySelector(".figureSelection__band")).toBeNull();
});
test("live analysis uses 1024 frequency bins for smooth low-frequency curves", () => {
  add("a");
  app.session.pane = "live";
  app.session.notify("pane");
  expect(app["options"](1024).bins).toBe(1024);
});
test("docked transport is hidden by default and revealed on hover/focus", () => {
  const transport = document.querySelector(".comparisonTransport");
  expect(transport).not.toBeNull();
  transport.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  expect(
    (document.getElementById("root") as HTMLElement).dataset.transportHold,
  ).toBe("true");
});

describe("STFT selection coordinates", () => {
  test.each([
    [1, {}, { start: 0.002, end: 0.008, minHz: 800, maxHz: 10000 }],
    [2, {}, { start: 0.002, end: 0.008, minHz: 800, maxHz: 10000 }],
    [2, { ctrlKey: true }, { start: 0.002, end: 0.008 }],
    [2, { metaKey: true }, { start: 0.002, end: 0.008 }],
    [2, { shiftKey: true }, { minHz: 800, maxHz: 10000 }],
  ])(
    "uses canvas bounds at DPR %s with modifiers %j",
    (dpr, modifiers, expected) => {
      add("a");
      app.session.pane = "stft";
      app.session.setView({ start: 0, end: 0.01, minHz: 1, maxHz: 10000 });
      const canvas =
        document.querySelector<HTMLCanvasElement>("canvas[data-stft]");
      expect(canvas).not.toBeNull();
      // The backing store differs from CSS pixels; the figure has a heading and padding.
      canvas.width = 1000 * dpr;
      canvas.height = 200 * dpr;
      jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
        left: 120,
        top: 180,
        width: 1000,
        height: 200,
      } as DOMRect);
      const host = canvas.parentElement;
      expect(host.classList.contains("comparisonFigure__canvasWrap")).toBe(
        true,
      );
      expect(host.querySelector(".comparisonFigure__frequencies")).toBeNull();
      expect(host.querySelector(".comparisonFigure__axis")).toBeNull();
      const setView = jest
        .spyOn(app.session, "setView")
        .mockImplementation(() => {});
      canvas.onpointerdown(
        new PointerEvent("pointerdown", {
          clientX: 920,
          clientY: 280,
          ...modifiers,
        }),
      );
      canvas.onpointermove(
        new PointerEvent("pointermove", {
          clientX: 320,
          clientY: 140,
          ...modifiers,
        }),
      );
      const band = host.querySelector<HTMLElement>(".figureSelection__band");
      expect(band).not.toBeNull();
      expect(band.style.left).toBe("shiftKey" in modifiers ? "0px" : "200px");
      expect(band.style.width).toBe("shiftKey" in modifiers ? "100%" : "600px");
      expect(band.style.top).toBe("0px");
      expect(band.style.height).toBe(
        "ctrlKey" in modifiers || "metaKey" in modifiers ? "100%" : "100px",
      );
      canvas.onpointerup(
        new PointerEvent("pointerup", {
          clientX: 320,
          clientY: 140,
          ...modifiers,
        }),
      );
      const patch = setView.mock.calls[0][0];
      expect(Object.keys(patch).sort()).toEqual(Object.keys(expected).sort());
      for (const [key, value] of Object.entries(expected)) {
        expect(patch[key]).toBeCloseTo(value, 6);
      }
      expect(host.querySelector(".figureSelectionOverlay")).toBeNull();
    },
  );

  test.each(["onpointercancel", "onlostpointercapture"] as const)(
    "%s removes the band without zooming or seeking",
    (handler) => {
      add("a");
      app.session.pane = "stft";
      app.session.setView({ start: 0, end: 0.01 });
      const canvas =
        document.querySelector<HTMLCanvasElement>("canvas[data-stft]");
      const setView = jest.spyOn(app.session, "setView");
      const seek = jest.spyOn(app["transport"], "seek");
      canvas.onpointerdown(
        new PointerEvent("pointerdown", { clientX: 20, clientY: 20 }),
      );
      canvas[handler](new PointerEvent(handler.slice(2)));
      canvas.onpointerup(
        new PointerEvent("pointerup", { clientX: 100, clientY: 100 }),
      );
      expect(document.querySelector(".figureSelectionOverlay")).toBeNull();
      expect(setView).not.toHaveBeenCalled();
      expect(seek).not.toHaveBeenCalled();
    },
  );
});

test("STFT keeps its canvas on zoom and resize, and reuses previous view analysis", async () => {
  add("a");
  const request = jest.fn(async (job) => ({
    tile: {
      values: new Float32Array(job.columns * job.options.bins).fill(-30),
      columns: job.columns,
      bins: job.options.bins,
      start: job.time,
      end: job.end,
    },
  }));
  app["_analysis"] = {
    request,
    cancel: jest.fn(),
    dispose: jest.fn(),
  } as never;
  app["renderFigures"]();
  await flush();
  const canvas = document.querySelector("canvas[data-stft]");
  expect(request).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("resize"));
  await flush();
  expect(document.querySelector("canvas[data-stft]")).toBe(canvas);
  expect(request).toHaveBeenCalledTimes(1);
  app.session.setView({ start: 0.002, end: 0.008 });
  await flush();
  expect(document.querySelector("canvas[data-stft]")).toBe(canvas);
  expect(request).toHaveBeenCalledTimes(2);
  app.session.resetView();
  await flush();
  expect(request).toHaveBeenCalledTimes(2);
  app.session.stft.dbLow = -60;
  app.session.notify("display");
  await flush();
  expect(request).toHaveBeenCalledTimes(2);
  app.session.stft.windowType = "hamming";
  app.session.stft.highResolution = true;
  app.session.notify("display");
  await flush();
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls[2][0].options).toMatchObject({
    windowType: "hamming",
    bins: 512,
    frequencyScale: "log",
  });
});

test("rebuilding figures restores the document and nested scroll offsets", () => {
  add("a");
  const root = document.getElementById("root");
  document.documentElement.scrollTop = 300;
  root.scrollTop = 120;
  const deck = root.querySelector("[data-deck]");
  const original = deck.replaceChildren.bind(deck);
  jest.spyOn(deck, "replaceChildren").mockImplementation((...nodes) => {
    document.documentElement.scrollTop = 0;
    root.scrollTop = 0;
    original(...nodes);
  });
  app.session.stftLayout = "column";
  app.session.notify("layout");
  expect(document.documentElement.scrollTop).toBe(300);
  expect(root.scrollTop).toBe(120);
});

test("comparison settings affect view and visibility; help describes comparison actions", () => {
  add("a");
  const input = document.querySelector<HTMLInputElement>(
    '[data-compare-setting="minHz"]',
  );
  input.value = "100";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  expect(app.session.view.minHz).toBe(100);
  const visible = document.querySelector<HTMLInputElement>(
    '[data-compare-setting="visible"]',
  );
  visible.checked = false;
  visible.dispatchEvent(new Event("change", { bubbles: true }));
  expect(document.querySelector<HTMLElement>(".comparisonGrid").hidden).toBe(
    true,
  );
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
  const help = document.querySelector<HTMLElement>(".keyboardShortcutsOverlay");
  expect(help.hidden).toBe(false);
  expect(help.textContent).toContain("Open comparison actions and layout menu");
  expect(help.textContent).not.toContain("Scroll on play FAB");
});

test("mute and activation retain the same controls and STFT tiles", () => {
  add("a");
  add("b");
  const track = document.querySelector<HTMLElement>('[data-track-id="a"]');
  const mute = track.querySelector<HTMLButtonElement>('[data-action="mute"]');
  const light = track.querySelector<HTMLButtonElement>(
    '[data-action="active"]',
  );
  const canvas = document.querySelector('canvas[data-stft="a"]');
  mute.focus();
  mute.click();
  expect(app.session.tracks[0].muted).toBe(true);
  expect(track.querySelector('[data-action="mute"]')).toBe(mute);
  expect(document.activeElement).toBe(mute);
  expect(mute.querySelector("svg")).not.toBeNull();
  light.click();
  expect(app.session.tracks[0].active).toBe(false);
  expect(document.querySelector('canvas[data-stft="a"]')).toBe(canvas);
  expect(canvas.closest<HTMLElement>(".comparisonFigure").dataset.active).toBe(
    "false",
  );
  expect(light.getAttribute("aria-pressed")).toBe("false");
  light.click();
  expect(canvas.closest<HTMLElement>(".comparisonFigure").dataset.active).toBe(
    "true",
  );
});

test("shared monitor controls update the transport and EQ state", () => {
  const mode = jest.spyOn(app.transport, "setMonitoring");
  const bands = jest.spyOn(app.transport, "setBandMask");
  const eq = jest.spyOn(app.transport, "setHeadphoneEq");
  document.querySelector<HTMLButtonElement>("[data-open-monitor]").click();
  expect(
    document.querySelector<HTMLElement>(".comparisonMonitorPanel").hidden,
  ).toBe(false);
  document.querySelector<HTMLButtonElement>(".js-lm-s").click();
  expect(mode).toHaveBeenLastCalledWith("s", 0, 0);
  document
    .querySelector<HTMLButtonElement>('.js-lm-band[data-band="2"]')
    .click();
  expect(bands).toHaveBeenLastCalledWith(4);
  document.querySelector<HTMLButtonElement>(".js-lm-bands-reset").click();
  expect(bands).toHaveBeenLastCalledWith(0);
  document.querySelector<HTMLButtonElement>(".js-he-bypass").click();
  expect(eq).toHaveBeenCalledWith(app["_headphoneEq"]);
  document.querySelector<HTMLButtonElement>(".js-he-profile").click();
  expect(
    document.querySelector<HTMLElement>(".curveCorrectionOverlay").hidden,
  ).toBe(false);
  expect(
    document.querySelector<HTMLElement>(".comparisonMonitorPanel").hidden,
  ).toBe(true);
});

test("loudness chart draws only short-term; summary has one aligned row per track", () => {
  add("<b>track</b>");
  app["_profiles"].set("<b>track</b>", {
    revision: 1,
    complete: true,
    loudness: {
      timeSec: new Float32Array([0, 0.005, 0.01]),
      momentaryLufs: new Float32Array([-5, -4, -3]),
      shortTermLufs: new Float32Array([-20, -19, -18]),
      truePeakDbTp: new Float32Array([-1, -1, -1]),
      integratedLufs: -21,
      loudnessRangeLu: 2,
      maxTruePeakDbTp: -1,
      plrLu: 20,
    },
  });
  app.session.pane = "loudness";
  app.session.notify("pane");
  expect(
    document.querySelector(".comparisonLoudnessSummary tbody th").textContent,
  ).toBe("<b>track</b>");
  expect(document.querySelector(".comparisonLoudnessSummary b")).toBeNull();
  expect(
    [...document.querySelectorAll(".comparisonLoudnessSummary tbody td")].map(
      (e) => e.textContent,
    ),
  ).toEqual(["-21.0", "2.0", "-1.0"]);
  const canvas = document.querySelector<HTMLCanvasElement>(
    'canvas[data-feature="lufs"]',
  );
  const context = canvas.getContext("2d");
  const stroke = jest.spyOn(context, "stroke");
  const label = jest.spyOn(context, "fillText");
  stroke.mockClear();
  label.mockClear();
  app["drawProfiles"]();
  expect(stroke).toHaveBeenCalledTimes(1);
  expect(label).not.toHaveBeenCalled();
});

test("reused EQ import receives host replies and applies the imported filters", async () => {
  document.querySelector<HTMLButtonElement>(".js-he-profile").click();
  document.querySelector<HTMLButtonElement>(".js-cc-import").click();
  const messages = (app["_post"] as jest.Mock).mock.calls.map(
    ([message]) => message,
  );
  const request = messages.find(
    (message) =>
      message.type === "compare.eq" && message.message.data.op === "import",
  );
  expect(request).toBeDefined();
  const apply = jest.spyOn(app.transport, "setHeadphoneEq");
  app["receive"]({
    type: "compare.eqResult",
    message: {
      type: "EQ_PRESET_OP_RESULT",
      data: {
        requestId: request.message.data.requestId,
        payload: {
          fileName: "monitor.txt",
          content: "Preamp: -3 dB\nFilter 1: ON PK Fc 1000 Hz Gain 2 dB Q 1.0",
        },
      },
    },
  });
  await flush();
  expect(app["_headphoneEq"].profile.filters[0].frequency).toBe(1000);
  expect(app["_headphoneEq"].profile.preampDb).toBe(-3);
  expect(apply).toHaveBeenCalledWith(app["_headphoneEq"]);
  expect(document.querySelector(".js-he-profileText").textContent).toBe(
    "monitor",
  );
});

test("transport volume double-click resets to unity and time input seeks safely", () => {
  add("a");
  const volume = document.querySelector<HTMLInputElement>("[data-volume]");
  const setVolume = jest.spyOn(app.transport, "setVolume");
  volume.value = "40";
  volume.dispatchEvent(new Event("input"));
  volume.dispatchEvent(new MouseEvent("dblclick"));
  expect(volume.value).toBe("100");
  expect(setVolume).toHaveBeenLastCalledWith(1);
  const time = document.querySelector<HTMLInputElement>("[data-time-input]");
  const seek = jest.spyOn(app.transport, "seek");
  time.value = "0.005";
  time.dispatchEvent(new Event("change"));
  expect(seek).toHaveBeenLastCalledWith(0.005);
  time.value = "999";
  time.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(seek).toHaveBeenLastCalledWith(app.session.duration);
  time.value = "-10";
  time.dispatchEvent(new Event("change"));
  expect(seek).toHaveBeenLastCalledWith(0);
  seek.mockClear();
  time.value = "";
  time.dispatchEvent(new Event("change"));
  expect(seek).not.toHaveBeenCalled();
  time.focus();
  time.value = "0.007";
  app["tick"]();
  expect(time.value).toBe("0.007");
  time.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(time.value).toBe("0.00");
  expect(seek).not.toHaveBeenCalled();
});

test("monitor opens above the dock and keeps it visible while interacting", () => {
  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-open-monitor]",
  );
  expect(trigger.closest(".comparisonTransport")).not.toBeNull();
  expect(trigger.closest(".comparisonTabs")).toBeNull();
  trigger.click();
  expect(document.getElementById("root").dataset.monitorOpen).toBe("true");
  expect(
    document.querySelector<HTMLElement>(".comparisonMonitorPanel").style.bottom,
  ).not.toBe("");
  document.querySelector<HTMLButtonElement>("[data-close-monitor]").click();
  expect(document.getElementById("root").dataset.monitorOpen).toBeUndefined();
});

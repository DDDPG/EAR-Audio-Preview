import {
  ComparisonSession,
  comparisonChangeEffects,
} from "./comparisonSession";
import { MockAudioBuffer } from "../../__mocks__/helper";

function file(id: string, seconds = 1, rate = 48000, channels = 2) {
  return {
    id,
    uri: `file:///${id}.wav`,
    name: id,
    revision: 1,
    buffer: new MockAudioBuffer(
      channels,
      seconds * rate,
      rate,
    ) as unknown as AudioBuffer,
    sourceSampleRate: rate,
    bitDepth: 24,
  };
}
test("focus, active, and mute are independent; bypass remembers mute", () => {
  const s = new ComparisonSession();
  const a = s.add(file("a"), true);
  const b = s.add(file("b"), true);
  expect(a.muted).toBe(false);
  expect(b.muted).toBe(true);
  s.setFocus("b");
  expect(s.audibleTracks.map((t) => t.id)).toEqual(["a"]);
  s.setActive("b", false);
  expect(s.focus.id).toBe("a");
  expect(() => s.setMuted("b", false)).toThrow();
  s.setActive("b", true);
  expect(b.muted).toBe(true);
  s.setMuted("b", false);
  s.setActive("b", false);
  s.setActive("b", true);
  expect(b.muted).toBe(false);
});
test("longest loaded file controls extent, while removal clamps view and selection", () => {
  const s = new ComparisonSession();
  s.add(file("short", 1), true);
  s.add(file("long", 3), true);
  expect(s.duration).toBe(3);
  s.setActive("long", false);
  expect(s.duration).toBe(3);
  s.setSelection(1, 3);
  s.remove("long");
  expect(s.view.end).toBe(1);
  expect(s.selection).toEqual({ start: 1, end: 1 });
});
test("capacity, duplicates, stable colors and supported channels", () => {
  const s = new ComparisonSession();
  ["a", "b", "c", "d", "e", "f", "g", "h"].forEach((id) =>
    s.add(file(id), true),
  );
  const colors = s.tracks.map((t) => t.color);
  expect(new Set(colors).size).toBe(8);
  expect(() => s.add(file("a"))).toThrow(/already/);
  expect(() => s.add(file("i"))).toThrow(/eight/);
  s.remove("a");
  expect(s.tracks.map((t) => t.color)).toEqual(colors.slice(1));
  expect(() => s.add(file("surround", 1, 48000, 6))).toThrow(/mono or stereo/);
  expect(s.add(file("i")).muted).toBe(true);
});
test("viewport and selection do not mutate one another", () => {
  const s = new ComparisonSession();
  s.add(file("a", 10), true);
  s.setSelection(2, 7);
  s.setView({ start: 3, end: 5 });
  expect(s.selection).toEqual({ start: 2, end: 7 });
  expect(s.view.start).toBe(3);
});

test("gain updates are atomic, reset on replacement, and do not change decoded samples", () => {
  const s = new ComparisonSession();
  const a = s.add(file("a"), true);
  s.add(file("b"), true);
  s.setPlaybackGains(new Map([["a", 0.5]]));
  expect(() =>
    s.setPlaybackGains(
      new Map([
        ["a", 0.2],
        ["missing", 0.3],
      ]),
    ),
  ).toThrow();
  expect(s.playbackGain("a")).toBe(0.5);
  expect(() => s.setPlaybackGains(new Map([["a", Infinity]]))).toThrow();
  expect(s.playbackGain("a")).toBe(0.5);
  s.replace("a", {
    buffer: a.buffer,
    revision: 2,
    sourceSampleRate: 48000,
    bitDepth: 24,
  });
  expect(s.playbackGain("a")).toBe(1);
  s.setPlaybackGains(new Map([["b", 0.1]]));
  s.remove("b");
  expect(s.playbackGain("b")).toBe(1);
});

test("typed display updates repair ranges before a single change notification", () => {
  const session = new ComparisonSession();
  const changes: Array<{ reason: string; high: number }> = [];
  session.addEventListener("change", (event: CustomEvent) => {
    changes.push({ reason: event.detail.reason, high: session.stft.dbHigh });
  });
  session.updateStft({ dbLow: 5, dbHigh: 0 });
  expect(changes).toEqual([{ reason: "display", high: 6 }]);
  session.updateWaveform({ minAmplitude: 2, maxAmplitude: 1 });
  expect(session.maxAmplitude).toBe(2.1);
  session.setPane("live");
  const revision = session.revision;
  session.setPane("live");
  expect(session.revision).toBe(revision);
});

test("state change rules keep selection and mute from restarting analysis", () => {
  for (const reason of ["selection", "mute", "file"] as const) {
    expect(comparisonChangeEffects(reason)).toMatchObject({
      figures: false,
      cancelProfiles: false,
      waves: false,
    });
  }
  for (const reason of ["tracks", "audio", "active"] as const) {
    expect(comparisonChangeEffects(reason)).toEqual({
      figures: true,
      cancelProfiles: true,
      waves: true,
      prune: true,
    });
  }
  expect(comparisonChangeEffects("display")).toMatchObject({
    figures: true,
    cancelProfiles: false,
  });
});

test("saved settings restore false, zero and partial values with one notification", () => {
  const session = new ComparisonSession();
  const reasons: string[] = [];
  session.addEventListener("change", (event: CustomEvent) =>
    reasons.push(event.detail.reason),
  );
  session.restoreSettings({
    layout: "row",
    pane: "edit",
    stft: { visible: false, dbHigh: 0 },
    controls: {
      waveformVisible: false,
      expanded: false,
      tiltDbPerOct: 0,
      waveformScale: 0,
    },
  });
  expect(session.stftLayout).toBe("row");
  expect(session.pane).toBe("edit");
  expect(session.stft.visible).toBe(false);
  expect(session.stft.dbHigh).toBe(0);
  expect(session.waveformVisible).toBe(false);
  expect(session.expanded).toBe(false);
  expect(session.waveformScale).toBe(0);
  expect(session.windowMs).toBe(80);
  expect(reasons).toEqual(["settings"]);
});

test("saved settings cannot overwrite session state outside the whitelist", () => {
  const session = new ComparisonSession();
  session.restoreSettings({
    pane: "invalid",
    layout: "invalid",
    controls: { pane: "live", duration: 100 },
    stft: { unknownSetting: true },
  } as never);
  expect(session.pane).toBe("stft");
  expect(session.stftLayout).toBe("auto");
  expect(session.duration).toBe(0);
  expect(session.stft).not.toHaveProperty("unknownSetting");
});

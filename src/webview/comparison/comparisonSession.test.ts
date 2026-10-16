import { ComparisonSession } from "./comparisonSession";
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
  ["a", "b", "c", "d"].forEach((id) => s.add(file(id), true));
  const colors = s.tracks.map((t) => t.color);
  expect(new Set(colors).size).toBe(4);
  expect(() => s.add(file("a"))).toThrow(/already/);
  expect(() => s.add(file("e"))).toThrow(/four/);
  s.remove("a");
  expect(s.tracks.map((t) => t.color)).toEqual(colors.slice(1));
  expect(() => s.add(file("surround", 1, 48000, 6))).toThrow(/mono or stereo/);
  expect(s.add(file("e")).muted).toBe(true);
});
test("viewport and selection do not mutate one another", () => {
  const s = new ComparisonSession();
  s.add(file("a", 10), true);
  s.setSelection(2, 7);
  s.setView({ start: 3, end: 5 });
  expect(s.selection).toEqual({ start: 2, end: 7 });
  expect(s.view.start).toBe(3);
});

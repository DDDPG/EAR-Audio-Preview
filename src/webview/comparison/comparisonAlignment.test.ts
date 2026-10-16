import { ComparisonAlignment } from "./comparisonAlignment";
import { ComparisonSession } from "./comparisonSession";
import { MockAudioBuffer } from "../../__mocks__/helper";
import type { ComparisonTransport } from "./comparisonTransport";
import type { AlignmentReply } from "./alignmentProtocol";

let session: ComparisonSession, ui: ComparisonAlignment, pause: jest.Mock;
const nativeBuffer = globalThis.AudioBuffer;
const buffer = () =>
  new MockAudioBuffer(2, 48000, 48000) as unknown as AudioBuffer;
const reply: AlignmentReply = {
  kind: "alignment",
  estimate: {
    accepted: true,
    offsetSamples: 523,
    polarity: -1,
    confidence: 1,
    reason: "accepted",
  },
  residual: { valid: true, gain: -2, nullDepthDb: Infinity, rmsDiff: 0 },
};
const select = (key: string) =>
  document.querySelector<HTMLSelectElement>(`[data-alignment-${key}]`);
const button = (key: string) =>
  document.querySelector<HTMLButtonElement>(`[data-alignment-${key}]`);
const click = async (key: string) => {
  button(key).click();
  await new Promise((resolve) => setTimeout(resolve, 10));
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  globalThis.AudioBuffer = class extends MockAudioBuffer {
    constructor(o: AudioBufferOptions) {
      super(o.numberOfChannels, o.length, o.sampleRate);
    }
  } as unknown as typeof AudioBuffer;
  document.body.innerHTML =
    '<div id="root"><nav class="comparisonTabs"></nav></div>';
  session = new ComparisonSession();
  for (const id of ["a", "b"]) {
    const audio = buffer();
    audio.getChannelData(0)[600] = 0.5;
    session.add({
      id,
      uri: id,
      name: `${id}<file>.wav`,
      revision: 1,
      buffer: audio,
      sourceSampleRate: 48000,
      bitDepth: 32,
    });
  }
  pause = jest.fn();
  ui = new ComparisonAlignment(
    document.getElementById("root"),
    session,
    { pause } as unknown as ComparisonTransport,
    async () => undefined,
  );
  jest.spyOn(ui.client, "analyze").mockResolvedValue(reply);
  ui.open();
});
afterEach(() => {
  ui.dispose();
  globalThis.AudioBuffer = nativeBuffer;
  jest.restoreAllMocks();
});
test("accepted preview does not mutate audio; apply affects all consumers via the buffer and reset restores it", async () => {
  const track = session.tracks[1],
    original = track.buffer;
  await click("estimate");
  expect(track.buffer).toBe(original);
  expect(button("apply").disabled).toBe(false);
  expect(document.querySelector("output").textContent).toContain(
    "Inverted polarity",
  );
  await click("apply");
  expect(pause).toHaveBeenCalled();
  expect(track.buffer).not.toBe(original);
  expect(track.buffer.getChannelData(0)[77]).toBe(0.5);
  expect(track.revision).toBeLessThan(0);
  expect(original.getChannelData(0)[600]).toBe(0.5);
  await click("reset");
  expect(track.buffer).toBe(original);
  expect(button("apply").disabled).toBe(true);
});
test("polarity is compensated only after explicitly checking its option", async () => {
  await click("estimate");
  document.querySelector<HTMLInputElement>(
    "[data-alignment-polarity]",
  ).checked = true;
  await click("apply");
  expect(session.tracks[1].buffer.getChannelData(0)[77]).toBe(-0.5);
});
test("rejection disables apply and never pauses or changes audio", async () => {
  (ui.client.analyze as jest.Mock).mockResolvedValue({
    kind: "alignment",
    estimate: { ...reply.estimate, accepted: false, reason: "ambiguous-peaks" },
  });
  const original = session.tracks[1].buffer;
  await click("estimate");
  expect(button("apply").disabled).toBe(true);
  expect(document.querySelector("output").textContent).toContain(
    "equally well",
  );
  await click("apply");
  expect(session.tracks[1].buffer).toBe(original);
  expect(pause).not.toHaveBeenCalled();
});
test("a late worker result after track replacement cannot be applied", async () => {
  let resolve: (v: AlignmentReply) => void;
  (ui.client.analyze as jest.Mock).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  await click("estimate");
  const replacement = buffer();
  session.replace("b", {
    buffer: replacement,
    revision: 2,
    sourceSampleRate: 48000,
    bitDepth: 32,
  });
  resolve(reply);
  await new Promise((r) => setTimeout(r, 0));
  expect(button("apply").disabled).toBe(true);
  expect(session.tracks[1].buffer).toBe(replacement);
});
test("changed source state invalidates preview, reset preserves the reload warning", async () => {
  await click("estimate");
  await click("apply");
  session.markChanged("b");
  await click("reset");
  expect(session.tracks[1].changed).toBe(true);
  await click("estimate");
  expect(document.querySelector("output").textContent).toContain("Reload");
});
test("reload drops saved originals; reset never resurrects an older file", async () => {
  await click("estimate");
  await click("apply");
  const latest = buffer();
  session.replace("b", {
    buffer: latest,
    revision: 2,
    sourceSampleRate: 48000,
    bitDepth: 32,
  });
  expect(button("reset").disabled).toBe(true);
  await click("reset");
  expect(session.tracks[1].buffer).toBe(latest);
});
test("reference/target changes and close cancel requests; filenames stay text", async () => {
  await click("estimate");
  select("reference").value = "b";
  select("reference").dispatchEvent(new Event("change"));
  expect(button("apply").disabled).toBe(true);
  expect(select("target").value).toBe("a");
  expect(document.querySelector("file")).toBeNull();
  const cancel = jest.spyOn(ui.client, "cancel");
  await click("close");
  expect(cancel).toHaveBeenCalled();
  expect(document.querySelector("dialog")).toBeNull();
});

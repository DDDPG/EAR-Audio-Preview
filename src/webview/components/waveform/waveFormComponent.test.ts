import WaveFormComponent from "./waveFormComponent";

const settings = {
  minTime: 0,
  maxTime: 2,
  minAmplitude: -1,
  maxAmplitude: 1,
  waveformVerticalScale: 1,
};
test("a short source ends at its absolute time on a longer shared waveform axis", () => {
  const root = document.createElement("div");
  new WaveFormComponent(
    root,
    100,
    80,
    settings,
    100,
    new Float32Array(100).fill(0.5),
    0,
    1,
    { color: "#123456" },
  );
  const ctx = root
    .querySelector<HTMLCanvasElement>(".mainCanvas")
    .getContext("2d");
  const bars = jest.mocked(ctx.fillRect).mock.calls;
  expect(bars).toHaveLength(50);
  expect(bars[49][0]).toBe(49);
  expect(ctx.fillStyle).toBe("#123456");
  const axis = root
    .querySelector<HTMLCanvasElement>(".axisCanvas")
    .getContext("2d");
  expect(
    jest.mocked(axis.fillText).mock.calls.some((call) => call[0] === "1.8"),
  ).toBe(true);
});

test("long source envelopes use the original renderer without scanning PCM", () => {
  const root = document.createElement("div"),
    envelope = jest.fn(() => [-0.25, 0.5] as const);
  new WaveFormComponent(
    root,
    100,
    80,
    settings,
    48000,
    new Float32Array(96000),
    0,
    1,
    { envelope },
  );
  expect(envelope).toHaveBeenCalledTimes(100);
  expect(envelope).toHaveBeenLastCalledWith(95040, 96000);
  const ctx = root
    .querySelector<HTMLCanvasElement>(".mainCanvas")
    .getContext("2d");
  expect(jest.mocked(ctx.fillRect).mock.calls[0]).toEqual([0, 20, 1, 30]);
});

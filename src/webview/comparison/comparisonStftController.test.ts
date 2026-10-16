import { ComparisonStftController } from "./comparisonStftController";
import { ComparisonSession } from "./comparisonSession";
import { MockAudioBuffer } from "../../__mocks__/helper";
import type { ComparisonAnalysisClient } from "./analysisClient";

test("STFT settings cancel shared jobs while color changes keep them", () => {
  const session = new ComparisonSession();
  session.add(
    {
      id: "a",
      uri: "a.wav",
      name: "a",
      revision: 1,
      buffer: new MockAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
      sourceSampleRate: 48000,
      bitDepth: 24,
    },
    true,
  );
  const analysis = { cancel: jest.fn() } as unknown as ComparisonAnalysisClient;
  const controller = new ComparisonStftController(
    session,
    () => analysis,
    () => false,
    () => 0,
    (bins) => ({
      bins,
      windowMs: session.windowMs,
      minHz: 20,
      maxHz: 24000,
      tiltDbPerOct: 0,
      weighting: "none",
    }),
    jest.fn(),
    jest.fn(),
    jest.fn(),
  );
  controller.beginRender();
  expect(analysis.cancel).toHaveBeenCalledTimes(1);
  session.updateStft({ dbLow: -80 });
  controller.beginRender();
  expect(analysis.cancel).toHaveBeenCalledTimes(1);
  session.updateStft({ windowSamples: 2048 });
  controller.beginRender();
  expect(analysis.cancel).toHaveBeenCalledTimes(2);
  session.setPane("live");
  controller.beginRender();
  expect(analysis.cancel).toHaveBeenCalledTimes(3);
});

test("STFT refuses an in-flight tile from an earlier audio revision", async () => {
  const session = new ComparisonSession();
  const track = session.add(
    {
      id: "a",
      uri: "a.wav",
      name: "a",
      revision: 1,
      buffer: new MockAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
      sourceSampleRate: 48000,
      bitDepth: 24,
    },
    true,
  );
  let finish: (result: unknown) => void;
  const request = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const analysis = {
    cancel: jest.fn(),
    request,
  } as unknown as ComparisonAnalysisClient;
  const draw = jest.fn();
  const controller = new ComparisonStftController(
    session,
    () => analysis,
    () => false,
    () => 0,
    (bins) => ({
      bins,
      windowMs: 80,
      minHz: 20,
      maxHz: 24000,
      tiltDbPerOct: 0,
      weighting: "none",
    }),
    jest.fn(),
    draw,
    jest.fn(),
  );
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const pending = controller.loadStft(track, canvas);
  expect(request).toHaveBeenCalledTimes(1);
  track.revision = 2;
  finish({
    tile: {
      values: new Float32Array(50 * 256),
      columns: 50,
      bins: 256,
      start: 0,
      end: 1,
    },
  });
  await pending;
  expect(draw).not.toHaveBeenCalled();
  expect(canvas.dataset.drawnKey).toBeUndefined();
  canvas.remove();
});

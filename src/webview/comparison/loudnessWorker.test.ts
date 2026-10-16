/** @jest-environment node */
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
import { extractLoudnessWorkletSource } from "../../../scripts/loudness-worklet-source.cjs";

const folder = __dirname;
function run(chunks: number, channels: number, input?: Float32Array) {
  const library = fs.readFileSync(
    path.resolve(
      folder,
      "../../../node_modules/loudness-worklet/packages/lib/dist/index.js",
    ),
    "utf8",
  );
  const manifest = JSON.parse(
    fs.readFileSync(
      path.resolve(
        folder,
        "../../../node_modules/loudness-worklet/package.json",
      ),
      "utf8",
    ),
  );
  const processor = extractLoudnessWorkletSource(library, manifest.version);
  const source =
    fs.readFileSync(path.join(folder, "loudnessWorkerPrelude.js"), "utf8") +
    "\n" +
    processor +
    "\n" +
    fs.readFileSync(path.join(folder, "loudnessWorkerAdapter.js"), "utf8");
  const messages: Array<{ snapshots?: unknown[]; error?: string }> = [];
  const scope = {
    onmessage: null as (event: { data: unknown }) => void,
    postMessage: (message: { snapshots?: unknown[] }) => messages.push(message),
  };
  vm.runInNewContext(source, { self: scope });
  const left =
    input ??
    Float32Array.from(
      { length: 96000 },
      (_, index) => Math.sin((2 * Math.PI * 1000 * index) / 48000) * 0.25,
    );
  scope.onmessage({
    data: {
      type: "init",
      sampleRate: 48000,
      duration: left.length / 48000,
      hop: 0.1,
      id: 1,
    },
  });
  for (let offset = 0; offset < left.length; offset += chunks) {
    scope.onmessage({
      data: {
        type: "chunk",
        left: left.slice(offset, offset + chunks),
        right: channels === 2 ? left.slice(offset, offset + chunks) : undefined,
        id: 2,
      },
    });
  }
  scope.onmessage({ data: { type: "finish", id: 3 } });
  expect(messages.some((message) => message.error)).toBe(false);
  return messages[messages.length - 1].snapshots;
}
test.each([1, 2])(
  "unmodified loudness kernel keeps exact results across chunk boundaries (%i channels)",
  (channels) => {
    const whole = run(262144, channels);
    expect(run(512, channels)).toEqual(whole);
    expect(whole.length).toBeGreaterThan(10);
  },
);

test.each([1, 2])(
  "tail measurements are flushed without synthetic samples (%i channels)",
  (channels) => {
    for (const length of [1000, 96000, 96001]) {
      const input = new Float32Array(length);
      input[length - 50] = 0.9;
      const result = run(512, channels, input) as Array<{
        currentTime: number;
        currentMeasurements: Array<{ maximumTruePeakLevel: number }>;
      }>;
      expect(result[result.length - 1].currentTime).toBe(length / 48000);
      expect(
        result[result.length - 1].currentMeasurements[0].maximumTruePeakLevel,
      ).toBeGreaterThan(-3);
      expect(run(262144, channels, input)).toEqual(result);
    }
  },
);

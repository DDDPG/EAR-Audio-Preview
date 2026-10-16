/** @jest-environment node */
import { execFileSync } from "child_process";
import path from "path";

test("real FLAC complete-file decoding includes the final parser-buffered frame", () => {
  // Run the ESM-only decoder in Node without Jest's module transformation.
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import fs from "node:fs";
         import { FLACDecoder } from "@wasm-audio-decoders/flac";
         const bytes = fs.readFileSync(process.argv[1]);
         const decoder = new FLACDecoder();
         await decoder.ready;
         const streaming = await decoder.decode(bytes);
         const tail = await decoder.flush();
         const complete = await decoder.decodeFile(bytes);
         console.log(JSON.stringify({
           partialLength: streaming.samplesDecoded,
           tailLength: tail.samplesDecoded,
           completeLength: complete.samplesDecoded,
           channelLength: complete.channelData[0].length,
           sampleRate: complete.sampleRate,
           lastSample: complete.channelData[0][9999],
           errors: complete.errors
         }));
         await decoder.free();`,
        path.resolve(__dirname, "../../__fixtures__/flac-final-frame.flac"),
      ],
      { encoding: "utf8", cwd: path.resolve(__dirname, "../../..") },
    ),
  );
  expect(result.partialLength).toBeLessThan(10000);
  expect(result.tailLength).toBeGreaterThan(0);
  expect(result.partialLength + result.tailLength).toBe(10000);
  expect(result.completeLength).toBe(10000);
  expect(result.channelLength).toBe(10000);
  expect(result.sampleRate).toBe(48000);
  expect(result.lastSample).toBeCloseTo(
    Math.trunc(12000 * Math.sin((9999 * Math.PI) / 32)) / 32767,
    7,
  );
  expect(result.errors).toEqual([]);
});

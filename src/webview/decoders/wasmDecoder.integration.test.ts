/** @jest-environment node */
import { execFileSync } from "child_process";
import path from "path";

test("production WASM wrapper preserves complete Vorbis and Opus files, including Opus named .ogg", () => {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import fs from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { pathToFileURL } from "node:url";
    import { createRequire } from "node:module";
    import ts from "typescript";
    const root = process.cwd();
    const require = createRequire(root + "/package.json");
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ear-codec-wrapper-"));
    try {
      const modules = [
        ["src/webview/decoders/wasmDecoder.ts", "wasmDecoder.mjs"],
        ["src/webview/decoders/oggOpusLength.ts", "oggOpusLength.mjs"],
        ["src/webview/utils/audioFileBitDepth.ts", "audioFileBitDepth.mjs"]
      ];
      for (const [source, output] of modules) {
        let code = ts.transpileModule(fs.readFileSync(path.join(root, source), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
        }).outputText;
        code = code.replaceAll('"./oggOpusLength"', JSON.stringify(pathToFileURL(path.join(temporary, "oggOpusLength.mjs")).href))
          .replaceAll('"../utils/audioFileBitDepth"', JSON.stringify(pathToFileURL(path.join(temporary, "audioFileBitDepth.mjs")).href));
        for (const pkg of ["mpg123-decoder", "@wasm-audio-decoders/flac", "@wasm-audio-decoders/ogg-vorbis", "ogg-opus-decoder"]) {
          code = code.replaceAll(JSON.stringify(pkg), JSON.stringify(pathToFileURL(require.resolve(pkg)).href));
        }
        fs.writeFileSync(path.join(temporary, output), code);
      }
      const { WasmDecoder } = await import(pathToFileURL(path.join(temporary, "wasmDecoder.mjs")).href);
      const directory = path.join(root, "src/__fixtures__/codec-compatibility");
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json")));
      const results = [];
      for (const file of manifest.files.filter(file => file.codec === "vorbis" || file.codec === "opus")) {
        const decoder = new WasmDecoder(fs.readFileSync(path.join(directory, file.name)), path.extname(file.name).slice(1));
        await decoder.decodeAsync();
        results.push({ name: file.name, expected: file.samplesPerChannel ?? manifest.source.samplesPerChannel,
          length: decoder.length, rate: decoder.sampleRate, channels: decoder.numChannels,
          channelLengths: decoder.samples.map(channel => channel.length), finite: decoder.samples.every(channel => channel.every(Number.isFinite)) });
        decoder.dispose();
      }
      const chainBytes = fs.readFileSync(path.join(directory, "reference-chained-mono-48000.opus"));
      const chains = [];
      for (const ext of ["opus", "ogg"]) {
        const chain = new WasmDecoder(chainBytes, ext);
        await chain.decodeAsync();
        chains.push({ length: chain.length, rate: chain.sampleRate, channels: chain.numChannels,
          channelLength: chain.samples[0].length });
        chain.dispose();
      }
      let changedFormatRejected = false;
      const changed = new WasmDecoder(fs.readFileSync(path.join(directory, "reference-chained-format-change.opus")), "opus");
      try { await changed.decodeAsync(); } catch { changedFormatRejected = true; } finally { changed.dispose(); }
      console.log(JSON.stringify({ files: results, chains, changedFormatRejected }));
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  `,
      ],
      {
        encoding: "utf8",
        cwd: path.resolve(__dirname, "../../.."),
        timeout: 20000,
      },
    ),
  );
  expect(result.files).toHaveLength(8);
  for (const file of result.files) {
    expect(file.length).toBe(file.expected);
    expect(file.rate).toBe(48000);
    expect(file.channels).toBe(file.name.includes("stereo") ? 2 : 1);
    expect(file.channelLengths).toEqual(
      Array(file.channels).fill(file.expected),
    );
    expect(file.finite).toBe(true);
  }
  expect(result.chains).toEqual([
    { length: 20000, rate: 48000, channels: 1, channelLength: 20000 },
    { length: 20000, rate: 48000, channels: 1, channelLength: 20000 },
  ]);
  expect(result.changedFormatRejected).toBe(true);
}, 25000);

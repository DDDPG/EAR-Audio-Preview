/** Same-process, matched-output STFT benchmark against the official upstream.
 * Neither implementation is rewritten. Both use the same installed Ooura.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import ts from "typescript";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const commit = "3edd1bc0761d026a2f24d96055ee7430365ba2aa";
const sourceHash =
  "b1fbe49de3892488a888c6b8803fb4640082aaa5491e238f0b89053aa2771009";
const sourcePath = "src/webview/services/analyzeService.ts";
const url = `https://raw.githubusercontent.com/sukumo28/vscode-audio-preview/${commit}/${sourcePath}`;
const hash = (x) => createHash("sha256").update(x).digest("hex");
const cacheDir = path.join(root, "bench/.competitor-cache");
fs.mkdirSync(cacheDir, { recursive: true });
const cached = path.join(cacheDir, "analyzeService.ts");
if (!fs.existsSync(cached) || hash(fs.readFileSync(cached)) !== sourceHash) {
  const bytes = execFileSync(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      "60",
      url,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  assert.equal(
    hash(bytes),
    sourceHash,
    "Upstream immutable source hash changed",
  );
  fs.writeFileSync(cached, bytes);
}
const upstream = fs.readFileSync(cached, "utf8");
const current = fs.readFileSync(path.join(root, sourcePath), "utf8");
function load(entryCode) {
  const modules = new Map();
  function compile(filename, code = fs.readFileSync(filename, "utf8")) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = { exports: {} };
    modules.set(filename, mod);
    const localRequire = (name) => {
      const candidate = path.resolve(path.dirname(filename), name) + ".ts";
      return name.startsWith(".") && fs.existsSync(candidate)
        ? compile(candidate)
        : require(name);
    };
    const js = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("require", "module", "exports", js)(
      localRequire,
      mod,
      mod.exports,
    );
    return mod.exports;
  }
  // Same actual project Service base; its event registration is unused by this call.
  return compile(path.join(root, sourcePath), entryCode).default;
}
const Upstream = load(upstream),
  Current = load(current);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const trials = 9;
const cases = [
  { seconds: 10, channels: 1 },
  { seconds: 60, channels: 1 },
  { seconds: 180, channels: 1 },
  { seconds: 60, channels: 2 },
];
let sink = 0;
const results = [];
for (const spec of cases) {
  const rate = 48000;
  let seed = 314159;
  const samples = Array.from({ length: spec.channels }, (_, ch) =>
    Float32Array.from({ length: (spec.seconds + 2) * rate }, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (
        Math.sin((2 * Math.PI * (437 + ch * 73) * i) / rate) * 0.35 +
        (seed / 2147483648) * 0.05
      );
    }),
  );
  const audio = {
    sampleRate: rate,
    length: samples[0].length,
    numberOfChannels: spec.channels,
    duration: spec.seconds + 2,
    getChannelData: (ch) => samples[ch],
  };
  const settings = {
    fftBackend: 0,
    windowType: 0,
    windowSize: 1024,
    hopSize: 256,
    minTime: 1,
    maxTime: spec.seconds + 1,
    minFrequency: 0,
    maxFrequency: rate / 2,
  };
  const services = [new Upstream(audio), new Current(audio)];
  let cells = 0;
  const hashes = [];
  // Validate every output cell, not a sample: the selected interior region has
  // equal centering/padding in both implementations. Include log normalization.
  for (let ch = 0; ch < spec.channels; ch++) {
    const a = services[0].getSpectrogram(ch, settings),
      b = services[1].getSpectrogram(ch, settings);
    assert.equal(a.length, b.length);
    const digest = createHash("sha256");
    for (let i = 0; i < a.length; i++) {
      const ab = Buffer.from(new Float64Array(a[i]).buffer),
        bb = Buffer.from(new Float64Array(b[i]).buffer);
      assert.ok(
        ab.equals(bb),
        `Output mismatch at ${spec.seconds}s/${ch}/${i}`,
      );
      for (const x of b[i]) assert.ok(Number.isFinite(x));
      cells += b[i].length;
      digest.update(bb);
    }
    hashes.push(digest.digest("hex"));
  }
  const measure = (index) => {
    const start = performance.now();
    for (let ch = 0; ch < spec.channels; ch++) {
      const out = services[index].getSpectrogram(ch, settings);
      sink += out[100][37];
    }
    return performance.now() - start;
  };
  for (let j = 0; j < 3; j++) {
    measure(0);
    measure(1);
  }
  const times = [[], []];
  for (let j = 0; j < trials; j++)
    for (const k of j % 2 ? [1, 0] : [0, 1]) {
      global.gc?.();
      times[k].push(measure(k));
    }
  const before = median(times[0]),
    after = median(times[1]);
  const frames = Math.ceil((spec.seconds * rate) / settings.hopSize);
  const n = settings.windowSize;
  const fftArraysPerFrameBytes =
    (n + 2 * (n / 2 + 1)) * Float64Array.BYTES_PER_ELEMENT;
  const result = {
    ...spec,
    sampleRate: rate,
    windowSize: n,
    hopSize: settings.hopSize,
    binsPerFrame: n / 2,
    framesPerChannel: frames,
    cellsCompared: cells,
    outputSha256PerChannel: hashes,
    byteIdentical: true,
    trials: times,
    upstreamMedianMs: before,
    earMedianMs: after,
    speedup: before / after,
    timeReductionPct: (1 - after / before) * 100,
    earRealtimeFactor: (spec.seconds * 1000) / after,
    fftWorkspaceFactoryCalls: {
      upstream: frames * 3 * spec.channels,
      ear: 3 * spec.channels,
    },
    fftWorkspaceRequestedBytes: {
      upstream: frames * fftArraysPerFrameBytes * spec.channels,
      ear: fftArraysPerFrameBytes * spec.channels,
    },
  };
  results.push(result);
  console.log(
    `${spec.seconds}s x ${spec.channels}ch: ${before.toFixed(2)} -> ${after.toFixed(2)} ms (${result.speedup.toFixed(2)}x), ${cells} matching cells`,
  );
  services.forEach((s) => s.dispose());
}
assert.ok(Number.isFinite(sink));
const report = {
  date: "2026-10-16",
  metric:
    "Complete single-file getSpectrogram Ooura call, including framing and relative-dB normalization; no decoding/rendering/IPC",
  upstream: {
    repository: "https://github.com/sukumo28/vscode-audio-preview",
    commit,
    sourceUrl: url,
    sourceSha256: hash(upstream),
  },
  ear: {
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    sourcePath,
    sourceSha256: hash(current),
    state: "uncommitted working tree",
  },
  environment: {
    node: process.version,
    cpu: os.cpus()[0].model,
    platform: process.platform,
    arch: process.arch,
    ooura: require("ooura/package.json").version,
    gcExposed: !!global.gc,
  },
  method: {
    warmupCallsPerImplementation: 3,
    pairedTrials: trials,
    alternatingOrder: true,
    explicitGcOutsideTimedRegion: !!global.gc,
    analysisRegion:
      "Interior region from 1s through duration+1s of a duration+2s seeded signal; no endpoint zero padding",
    window: "periodic Hann",
    input: "seeded tone plus noise; shared Float32 samples",
    workspaceMetric:
      "Exact FFT factory call/array-length accounting, not heap or whole-process RAM",
    exclusions: [
      "audio decoding",
      "canvas/WebGL rendering",
      "extension host",
      "application launch",
      "competing desktop applications",
    ],
  },
  results,
};
const save = process.argv.indexOf("--save");
if (save >= 0)
  fs.writeFileSync(
    path.resolve(root, process.argv[save + 1]),
    JSON.stringify(report, null, 2) + "\n",
  );

/** Compare the working tree with an immutable Git version in one Node process. */
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
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const baseline = option("--baseline", "06705d4");
const target = "src/webview/comparison/comparisonDsp.ts";
const original = execFileSync("git", ["show", `${baseline}:${target}`], {
  cwd: root,
  encoding: "utf8",
});
const current = fs.readFileSync(path.join(root, target), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function load(source) {
  const cache = new Map();
  function compile(filename, code = fs.readFileSync(filename, "utf8")) {
    if (cache.has(filename)) {
      return cache.get(filename).exports;
    }
    const module = { exports: {} };
    cache.set(filename, module);
    const require = createRequire(filename);
    const localRequire = (name) => {
      const candidate = path.resolve(path.dirname(filename), name) + ".ts";
      return name.startsWith(".") && fs.existsSync(candidate)
        ? compile(candidate)
        : require(name);
    };
    const output = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("require", "module", "exports", output)(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  }
  return compile(path.join(root, target), source).NativeSpectrum;
}
const Before = load(original),
  After = load(current);
function audio(rate, signal, stereo = true) {
  let seed = 12345;
  const left = Float32Array.from({ length: Math.ceil(rate * 0.4) }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return signal === "silence"
      ? 0
      : signal === "impulse"
        ? i === 50
          ? 0.9
          : 0
        : signal === "noise"
          ? (seed / 2147483648) * 0.4
          : Math.sin((2 * Math.PI * 997 * i) / rate) * 0.25;
  });
  return {
    left,
    right: stereo
      ? Float32Array.from(left, (value, i) =>
          signal === "tone" ? -value : value * 0.5 + Math.sin(i * 0.7) * 0.1,
        )
      : undefined,
    sampleRate: rate,
    origin: 0.125,
    duration: 0.525,
  };
}
const options = {
  windowMs: 80,
  minHz: 10,
  maxHz: 24000,
  bins: 256,
  tiltDbPerOct: 0,
  weighting: "none",
};
const digest = createHash("sha256");
let compared = 0,
  configurations = 0;
function equalFrames(a, b) {
  for (const key of ["db", "rho", "polarL", "polarR"]) {
    const bytes = (value) =>
      Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    assert.ok(
      bytes(a[key]).equals(bytes(b[key])),
      `${key} differs at corpus frame ${compared}`,
    );
    digest.update(bytes(b[key]));
  }
  assert.ok(
    Object.is(a.broadbandRho, b.broadbandRho),
    `broadbandRho differs at frame ${compared}`,
  );
  const scalar = Buffer.alloc(8);
  scalar.writeDoubleLE(a.broadbandRho ?? NaN);
  digest.update(scalar);
  compared++;
}
// Reuse both engines across every change, including rate/size/axis/weight invalidation.
const oldEngine = new Before(),
  newEngine = new After();
for (const rate of [44100, 48000, 96000, 192000]) {
  for (const signal of ["silence", "impulse", "tone", "noise"]) {
    const input = audio(rate, signal, signal !== "impulse");
    for (const windowType of [
      "hann",
      "hamming",
      "blackman-harris",
      "triangular",
    ]) {
      for (const frequencyScale of ["linear", "log", "mel", "hybrid"]) {
        for (const phase of [false, true]) {
          for (const weighting of ["none", "a"]) {
            const index = configurations++;
            const config = {
              ...options,
              windowType,
              frequencyScale,
              weighting,
              windowMs: [0.2, 8, 20, 80, 320][index % 5],
              bins: [16, 256, 512, 1024][index % 4],
              minHz: index % 3 ? 10 : 0,
              maxHz: 96000,
              hybridRatio: [0, 0.5, 1][index % 3],
              tiltDbPerOct: [-6, 0, 6][index % 3],
            };
            for (const time of [0.125, 0.3, 0.525, 0.8]) {
              equalFrames(
                oldEngine.compute(input, time, config, phase),
                newEngine.compute(input, time, config, phase),
              );
            }
          }
        }
      }
    }
  }
}
const cases = [
  {
    name: "stft.stereo.48k.80ms.256.none",
    rate: 48000,
    stereo: true,
    windowMs: 80,
    bins: 256,
    weighting: "none",
    phase: false,
  },
  {
    name: "stft.stereo.48k.80ms.512.a",
    rate: 48000,
    stereo: true,
    windowMs: 80,
    bins: 512,
    weighting: "a",
    phase: false,
  },
  {
    name: "stft.mono.48k.8ms.512.a",
    rate: 48000,
    stereo: false,
    windowMs: 8,
    bins: 512,
    weighting: "a",
    phase: false,
  },
  {
    name: "live.stereo.48k.80ms.1024.a",
    rate: 48000,
    stereo: true,
    windowMs: 80,
    bins: 1024,
    weighting: "a",
    phase: true,
  },
];
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const benchmarks = [];
let sink = 0;
for (const entry of cases) {
  const input = audio(entry.rate, "noise", entry.stereo);
  const config = {
    ...options,
    ...entry,
    tiltDbPerOct: 3,
    maxHz: entry.rate / 2,
    frequencyScale: "log",
  };
  const engines = [new Before(), new After()];
  function run(index, frames) {
    const started = performance.now();
    for (let i = 0; i < frames; i++) {
      sink += engines[index].compute(
        input,
        0.25 + (i % 64) / 1000,
        config,
        entry.phase,
      ).db[10];
    }
    return performance.now() - started;
  }
  run(0, 300);
  run(1, 300);
  const samples = [[], []];
  for (let round = 0; round < 9; round++) {
    for (const index of round % 2 ? [1, 0] : [0, 1]) {
      samples[index].push(run(index, 400));
    }
  }
  const beforeMs = median(samples[0]),
    afterMs = median(samples[1]);
  const result = {
    name: entry.name,
    framesPerSample: 400,
    samples,
    beforeMs,
    afterMs,
    speedup: beforeMs / afterMs,
    reductionPercent: (1 - afterMs / beforeMs) * 100,
  };
  benchmarks.push(result);
  console.log(
    `${entry.name}: ${beforeMs.toFixed(2)} -> ${afterMs.toFixed(2)} ms / 400 frames (${result.speedup.toFixed(2)}x)`,
  );
}
assert.ok(Number.isFinite(sink));
const report = {
  baseline,
  baselineSourceSha256: sha256(original),
  currentSourceSha256: sha256(current),
  node: process.version,
  cpu: os.cpus()[0].model,
  platform: process.platform,
  equivalence: {
    frames: compared,
    byteIdentical: true,
    sha256: digest.digest("hex"),
    fields: ["db", "rho", "polarL", "polarR", "broadbandRho"],
    rates: [44100, 48000, 96000, 192000],
    signals: ["silence", "impulse", "tone", "noise"],
    boundary:
      "Ooura full compute; cached configuration switches, zero padding, nonzero origin, tails and Nyquist. No renderer, IPC or live VS Code wall time.",
  },
  benchmarks,
};
const save = option("--save", null);
if (save) {
  fs.writeFileSync(
    path.resolve(root, save),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(`Byte-identical frames: ${compared}`);

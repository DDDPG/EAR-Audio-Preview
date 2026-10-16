/** Run the repository's unchanged STFT case against EAR and pinned upstream.
 * Only exposes buildCases/runCase and substitutes the upstream AnalyzeService;
 * no fixture, warmup, sample count, timed body or threshold is rewritten.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ts from "typescript";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(path.join(root, "package.json"));
const benchmarkPath = path.join(root, "bench/benchmark.ts");
const original = fs.readFileSync(benchmarkPath, "utf8");
assert.equal(
  original.split("void main();").length,
  2,
  "Unexpected benchmark entrypoint",
);
const exposed = original.replace(
  "void main();",
  "export { buildCases, runCase };",
);
const upstreamPath = path.join(
  root,
  "bench/.competitor-cache/analyzeService.ts",
);
const upstream = fs.readFileSync(upstreamPath, "utf8");
const hash = (x) => createHash("sha256").update(x).digest("hex");
assert.equal(
  hash(upstream),
  "b1fbe49de3892488a888c6b8803fb4640082aaa5491e238f0b89053aa2771009",
);
function loader(override) {
  const cache = new Map();
  function compile(filename, code = fs.readFileSync(filename, "utf8")) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const localRequire = (name) => {
      const candidate = path.resolve(path.dirname(filename), name) + ".ts";
      if (
        override &&
        candidate === path.join(root, "src/webview/services/analyzeService.ts")
      )
        return { default: override, __esModule: true };
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
  return compile;
}
const Upstream = loader()(
  path.join(root, "src/webview/services/analyzeService.ts"),
  upstream,
).default;
const current = loader()(benchmarkPath, exposed);
const baseline = loader(Upstream)(benchmarkPath, exposed);
const caseName = "render.oouraSpectrogram.3s.w1024h80";
const select = (module) => module.buildCases().find((x) => x.name === caseName);
const a = select(baseline),
  b = select(current);
assert.equal(a.warmup, 2);
assert.equal(a.samples, 10);
assert.equal(b.warmup, a.warmup);
assert.equal(b.samples, a.samples);
const ga = a.fn(),
  gb = b.fn();
assert.equal(ga.length, gb.length);
let cells = 0,
  finitePairs = 0,
  identicalFinitePairs = 0,
  upstreamNonfinite = 0,
  earNonfinite = 0;
const upstreamBadFrames = [];
for (let i = 0; i < ga.length; i++) {
  assert.equal(ga[i].length, gb[i].length);
  let bad = false;
  for (let j = 0; j < ga[i].length; j++) {
    cells++;
    const x = ga[i][j],
      y = gb[i][j];
    if (!Number.isFinite(x)) {
      upstreamNonfinite++;
      bad = true;
    }
    if (!Number.isFinite(y)) earNonfinite++;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      finitePairs++;
      if (Object.is(x, y)) identicalFinitePairs++;
    }
  }
  if (bad) upstreamBadFrames.push(i);
}
const rounds = [];
for (let i = 0; i < 2; i++) {
  const values = {};
  for (const [label, module] of i % 2
    ? [
        ["ear", current],
        ["upstream", baseline],
      ]
    : [
        ["upstream", baseline],
        ["ear", current],
      ])
    values[label] = await module.runCase(select(module));
  rounds.push({
    ...values,
    speedup: values.upstream.meanMs / values.ear.meanMs,
  });
  console.log(
    `Repository case round ${i + 1}: ${values.upstream.meanMs} -> ${values.ear.meanMs} ms (${rounds.at(-1).speedup.toFixed(2)}x); finite pairs ${identicalFinitePairs}/${finitePairs}`,
  );
}
const report = {
  date: "2026-10-16",
  benchmark: {
    path: "bench/benchmark.ts",
    sha256: hash(original),
    case: caseName,
    warmup: a.warmup,
    samples: a.samples,
    sourceUnmodified: true,
    adapter:
      "Expose existing buildCases/runCase; remove only automatic main dispatch; inject original upstream AnalyzeService for this one existing case",
  },
  environment: { node: process.version, gcExposed: !!global.gc },
  upstream: {
    version: "2.6.0",
    commit: "3edd1bc0761d026a2f24d96055ee7430365ba2aa",
    sourceSha256: hash(upstream),
  },
  ear: {
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    sourceSha256: hash(
      fs.readFileSync(
        path.join(root, "src/webview/services/analyzeService.ts"),
      ),
    ),
  },
  equivalence: {
    frames: ga.length,
    bins: ga[0].length,
    cells,
    finitePairs,
    identicalFinitePairs,
    upstreamNonfinite,
    earNonfinite,
    upstreamBadFrames,
    boundary:
      "Original full 3s fixture and centered windows, including both endpoints; no exclusion of tail frames. The upstream uses an inclusive final sample bound and produces nonfinite tail columns. Outputs are not globally byte-identical.",
  },
  rounds,
};
const save = process.argv.indexOf("--save");
if (save >= 0)
  fs.writeFileSync(
    path.resolve(root, process.argv[save + 1]),
    JSON.stringify(report, null, 2) + "\n",
  );

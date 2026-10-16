/** Numerical regression corpus against immutable pre-review live kernels.
 * Does not change or replace benchmark.ts / baseline.json / compare.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = "06705d4807e121e60737a080daa0a2d6bd2827dd";
const files = ["quinticBSpline", "stereoPolarField", "liveBallistics"];
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sources = {};
function load(original) {
  const cache = new Map();
  function compile(name) {
    if (cache.has(name)) return cache.get(name);
    const file = `src/webview/utils/${name}.ts`;
    const code = original
      ? execFileSync("git", ["show", `${baseline}:${file}`], { cwd: root, encoding: "utf8" })
      : fs.readFileSync(path.join(root, file), "utf8");
    sources[(original ? "baseline/" : "current/") + file] = sha256(code);
    const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const exports = {};
    cache.set(name, exports);
    const require = createRequire(path.join(root, file));
    new Function("require", "exports", output)(id => id.startsWith("./") ? compile(id.slice(2)) : require(id), exports);
    return exports;
  }
  return Object.fromEntries(files.map(name => [name, compile(name)]));
}
const before = load(true), after = load(false);
let seed = 19;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return seed / 2147483648;
};
const smooth = { cases: 0, elements: 0, byteIdentical: true };
for (const length of [0, 1, 2, 3, 4, 5, 33, 64, 300, 1024, 4096]) {
  for (const scale of [0, 1e-40, 1e-9, 1, 120, 1e38]) {
    for (const typed of [false, true]) {
      const array = Array.from({ length }, random).map(x => x * scale);
      const input = typed ? new Float32Array(array) : array;
      const a = before.quinticBSpline.quinticBSplineSmooth(input);
      const b = after.quinticBSpline.quinticBSplineSmooth(input);
      assert.deepEqual(new Uint8Array(a.buffer), new Uint8Array(b.buffer));
      smooth.cases++;
      smooth.elements += length;
    }
  }
}
const polar = { cases: 0, elements: 0, byteIdenticalCases: 0, maxUlp: 0, maxRelativeError: 0, nonfinitePairs: 0 };
for (let frame = 0; frame < 4096; frame++) {
  const length = [1, 3, 64, 511, 1024, 4096, 8192][frame % 7];
  const bins = [1, 2, 7, 64, 120][frame % 5];
  const scale = [0, 1e-40, 0.9999999e-9, 1e-9, 1.0000001e-9, 1e-4, 1, 16, 1e10, 1e38][frame % 10];
  const left = Float32Array.from({ length }, () => random() * scale);
  const right = Float32Array.from(left, (v, i) => frame % 11 === 0 ? v : frame % 11 === 1 ? -v : i % 13 === 0 ? 0 : random() * scale);
  const a = new Float32Array(bins), b = new Float32Array(bins);
  const stride = [1, 4, 6][frame % 3], mix = [0, 0.18, 1][frame % 3];
  before.stereoPolarField.computeInstantPolarBins(left, right, a, stride, mix);
  after.stereoPolarField.computeInstantPolarBins(left, right, b, stride, mix);
  if (Buffer.from(a.buffer).equals(Buffer.from(b.buffer))) polar.byteIdenticalCases++;
  const ua = new Uint32Array(a.buffer), ub = new Uint32Array(b.buffer);
  for (let i = 0; i < bins; i++) {
    if (!Number.isFinite(a[i])) {
      assert.equal(b[i], a[i]);
      polar.nonfinitePairs++;
      continue;
    }
    assert.ok(Number.isFinite(b[i]));
    const ulp = Math.abs(ua[i] - ub[i]);
    polar.maxUlp = Math.max(polar.maxUlp, ulp);
    if (a[i]) polar.maxRelativeError = Math.max(polar.maxRelativeError, Math.abs(a[i] - b[i]) / a[i]);
    assert.ok(ulp <= 2, `frame ${frame}, bin ${i}: ${ulp} ULP`);
  }
  polar.cases++;
  polar.elements += bins;
}
const report = {
  date: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  baseline, sourceSha256: sources, smooth, polar,
  interpretation: "B-spline preserves operation order and must be byte-identical. Polar uses direct squared norm of Float32 samples; corpus permits at most two Float32 ULP from removing hypot round-trip. Overflow in the existing Float32 accumulator remains identical; this is a numerical regression check, not a new accuracy or timing baseline.",
};
console.log(JSON.stringify(report, null, 2));
const save = process.argv.indexOf("--save");
if (save >= 0) fs.writeFileSync(process.argv[save + 1], JSON.stringify(report, null, 2) + "\n");

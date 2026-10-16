/** Corrected geometry contracts and strict energy equivalence; historical gates stay unchanged. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadHost } from "./demos/host.mjs";
const polar = loadHost("src/webview/utils/stereoPolarField.ts");
const spline = loadHost("src/webview/utils/quinticBSpline.ts");
const bytes = (value) =>
  Buffer.from(value.buffer, value.byteOffset, value.byteLength);
let seed = 19;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return seed / 2147483648;
};
let geometryCases = 0;
for (const [left, right, angle] of [
  [1, 0, (3 * Math.PI) / 4],
  [0, 1, Math.PI / 4],
  [1, 1, Math.PI / 2],
  [1, -1, Math.PI],
  [-1, 1, 0],
]) {
  for (const sign of [1, -1]) {
    const l = left * sign,
      r = right * sign;
    const expected = left + right === 0 && sign < 0 ? Math.PI - angle : angle;
    const theta = polar.stereoFieldAngleRad(l, r);
    assert.ok(Math.abs(theta - expected) < 1e-12);
    const bins = new Float32Array(120);
    polar.computeInstantPolarBins(
      new Float32Array([l]),
      new Float32Array([r]),
      bins,
      1,
      0,
    );
    const index = bins.findIndex((v) => v > 0);
    assert.ok(
      Math.abs(polar.polarBinToAngleRad(index, 120) - theta) <= Math.PI / 120,
    );
    assert.ok(polar.interpolatePolarRmsAtAngle(bins, theta) > 0);
    geometryCases++;
  }
}
for (const bins of [
  new Float32Array([0, 1]),
  new Float32Array([1, 0]),
  new Float32Array([0.2, 0.8, 0.4]),
]) {
  for (let step = 0; step <= 120; step++) {
    const v = polar.interpolatePolarRmsAtAngle(bins, (Math.PI * step) / 120);
    assert.ok(v >= Math.min(...bins) && v <= Math.max(...bins));
    geometryCases++;
  }
}
const smooth = { cases: 0, elements: 0, byteIdentical: true };
for (const length of [0, 1, 2, 3, 4, 5, 33, 64, 300, 1024, 4096])
  for (const scale of [0, 1e-40, 1e-9, 1, 120, 1e38])
    for (const typed of [false, true]) {
      const array = Array.from({ length }, () => random() * scale),
        input = typed ? new Float32Array(array) : array;
      const expected = new Float32Array(length);
      for (let i = 0; i < length; i++)
        expected[i] =
          (1 / 120) * input[Math.max(0, i - 2)] +
          (26 / 120) * input[Math.max(0, i - 1)] +
          (66 / 120) * input[i] +
          (26 / 120) * input[Math.min(length - 1, i + 1)] +
          (1 / 120) * input[Math.min(length - 1, i + 2)];
      assert.ok(
        bytes(expected).equals(bytes(spline.quinticBSplineSmooth(input))),
      );
      smooth.cases++;
      smooth.elements += length;
    }
const energy = { cases: 0, elements: 0, byteIdentical: true };
for (let frame = 0; frame < 4096; frame++) {
  const length = [1, 3, 64, 511, 1024, 4096, 8192][frame % 7],
    count = [1, 2, 7, 64, 120][frame % 5];
  const scale = [
    0, 1e-40, 0.9999999e-9, 1e-9, 1.0000001e-9, 1e-4, 1, 16, 1e10, 1e38,
  ][frame % 10];
  const left = Float32Array.from({ length }, () => random() * scale);
  const right = Float32Array.from(left, (v, i) =>
    frame % 11 === 0
      ? v
      : frame % 11 === 1
        ? -v
        : i % 13 === 0
          ? 0
          : random() * scale,
  );
  const stride = [1, 4, 6][frame % 3],
    mix = [0, 0.18, 1][frame % 3];
  const sum = new Float32Array(count),
    counts = new Uint16Array(count),
    expected = new Float32Array(count),
    actual = new Float32Array(count);
  for (let i = 0; i < length; i += stride) {
    const mag = Math.hypot(left[i], right[i]);
    if (mag < 1e-9) continue;
    // Isolate the squared-norm optimization under the SAME corrected geometry.
    // Geometry itself is checked independently above, not against the old bug.
    const theta = polar.stereoFieldAngleRad(left[i], right[i]);
    const index = Math.min(
      count - 1,
      Math.max(0, Math.floor((theta / Math.PI) * count)),
    );
    sum[index] += mag * mag;
    counts[index]++;
  }
  for (let i = 0; i < count; i++)
    if (counts[i]) expected[i] = Math.sqrt(sum[i] / counts[i]);
  if (mix > 0) {
    const spread = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      if (expected[i] <= 0) continue;
      spread[i] += expected[i] * (1 - mix);
      if (i > 0) spread[i - 1] += expected[i] * (mix * 0.5);
      if (i < count - 1) spread[i + 1] += expected[i] * (mix * 0.5);
    }
    for (let i = 0; i < count; i++)
      expected[i] = Math.max(expected[i], spread[i]);
  }
  polar.computeInstantPolarBins(left, right, actual, stride, mix);
  assert.ok(
    bytes(expected).equals(bytes(actual)),
    `Non-identical energy at frame ${frame}`,
  );
  energy.cases++;
  energy.elements += count;
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const report = {
  date: new Date().toISOString(),
  geometryCases,
  smooth,
  energy,
  sourceSha256: Object.fromEntries(
    [
      "src/webview/utils/stereoPolarField.ts",
      "src/webview/utils/quinticBSpline.ts",
    ].map((f) => [f, sha256(fs.readFileSync(f))]),
  ),
  interpretation:
    "Geometry intentionally corrects inherited polarity/direction/endpoint defects. Strict byte equality compares the optimized RMS energy with a hypot reference under that corrected geometry. The frozen historical liveKernelValidation corpus describes the prior incorrect geometry and is retained unchanged; this report does not claim byte equivalence with that geometry or measure speed.",
};
console.log(JSON.stringify(report, null, 2));
const save = process.argv.indexOf("--save");
if (save >= 0)
  fs.writeFileSync(
    process.argv[save + 1],
    JSON.stringify(report, null, 2) + "\n",
  );

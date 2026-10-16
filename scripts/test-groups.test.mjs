import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  classifyTest,
  discoverTests,
  groups,
  inventory,
  selectTests,
} from "./test-groups.mjs";

test("each architecture boundary routes to its intended group", () => {
  const examples = {
    "src/audioPreviewEditor.test.ts": "host",
    "src/comparison/comparisonHost.test.ts": "host",
    "src/extensionHost/autoEqHost.test.ts": "host",
    "src/shared/sequenceHop.test.ts": "shared",
    "src/webview/services/playerService.test.ts": "services",
    "src/webview/comparison/comparisonApp.test.ts": "comparison",
    "src/webview/components/player/playerComponent.test.ts": "ui",
    "src/webview/spectrogramFrequencyLayout.test.ts": "ui",
    "src/webview/utils/stereoPolarField.regression.test.ts": "utils",
    "src/webview/decoders/wasmDecoder.test.ts": "codecs",
    "src/webview/encoder.test.ts": "codecs",
    "src/message.contract.test.ts": "contracts",
    "src/eslintPolicy.test.ts": "contracts",
  };
  for (const [file, group] of Object.entries(examples))
    assert.equal(classifyTest(file), group);
});

test("real-dependency integration is selected once, outside its module group", () => {
  const file = "src/shared/sequenceFeatureCompute.integration.test.ts";
  const catalog = inventory([file]);
  assert.deepEqual(catalog.integration, [file]);
  assert.deepEqual(catalog.shared, []);
});

test("Windows separators and future tests in existing modules are supported", () => {
  assert.equal(
    classifyTest("src\\webview\\services\\future.test.ts"),
    "services",
  );
  assert.equal(
    classifyTest("src/webview/comparison/newFeature.spec.ts"),
    "comparison",
  );
});

test("unmapped architectural locations fail instead of silently dropping tests", () => {
  assert.throws(
    () => inventory(["src/newSubsystem/newFeature.test.ts"]),
    /exactly one architecture group/,
  );
});

test("group selection deduplicates paths and rejects invalid or empty groups", () => {
  const file = "src/webview/services/playerService.test.ts";
  const catalog = inventory([file]);
  assert.deepEqual(selectTests(catalog, ["services", "services"]), [file]);
  assert.throws(() => selectTests(catalog, []), /Choose a group/);
  assert.throws(() => selectTests(catalog, ["unknown"]), /Unknown test group/);
  assert.throws(() => selectTests(catalog, ["host"]), /No tests/);
});

test("current source inventory is complete and unique without pinning a growing count", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = discoverTests(root);
  const jestFiles = JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(root, "node_modules/jest/bin/jest.js"),
        "--listTests",
        "--json",
        "--maxWorkers=2",
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
  assert.deepEqual(
    files.map((file) => path.resolve(root, file)).sort(),
    jestFiles.sort(),
  );
  assert.ok(files.length > 0);
  const catalog = inventory(files);
  const selected = selectTests(
    catalog,
    groups
      .filter((group) => catalog[group.name].length)
      .map((group) => group.name),
  );
  assert.deepEqual(selected.sort(), files);
  assert.equal(Object.values(catalog).flat().length, files.length);
});

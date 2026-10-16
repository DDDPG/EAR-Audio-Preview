import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeVersion,
  localizedNotes,
  syncSection,
  releaseFiles,
} from "./release-notes.mjs";

test("versions reject invalid tags and path traversal", () => {
  assert.equal(normalizeVersion("v0.6.0"), "0.6.0");
  assert.equal(normalizeVersion("0.7.0-beta.1"), "0.7.0-beta.1");
  for (const value of [
    "../0.6.0",
    "0.6",
    "v",
    "0.6.0\nmalicious",
    "v0.6.0/extra",
  ]) {
    assert.throws(() => normalizeVersion(value));
  }
});
test("localized release extraction stops at the next language", () => {
  const source =
    "# v0.6.0\n\n## English\n\n- Compare four files.\n\n## 简体中文\n\n- 对比四份音频。\n";
  assert.equal(localizedNotes(source, "en"), "- Compare four files.");
  assert.equal(localizedNotes(source, "zh"), "- 对比四份音频。");
  assert.throws(() => localizedNotes("## English\n", "en"));
});
test("README syncing is idempotent and refuses missing or duplicate blocks", () => {
  const input =
    "intro\n<!-- release:en:start -->old<!-- release:en:end -->\nrest";
  const output = syncSection(input, "en", "0.6.0", "- New.");
  assert.ok(output.includes("## What's new in v0.6.0\n\n- New."));
  assert.ok(output.endsWith("\nrest"));
  assert.equal(syncSection(output, "en", "0.6.0", "- New."), output);
  assert.throws(() => syncSection("missing", "en", "0.6.0", "notes"));
  assert.throws(() => syncSection(input + input, "en", "0.6.0", "notes"));
});
test("releasing a different package version fails instead of using current highlights", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ear-release-"));
  try {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ version: "0.6.0" }),
    );
    assert.throws(() => releaseFiles(root, "v0.5.0"), /does not match/);
    assert.throws(() => releaseFiles(root, "v0.6.0"), /ENOENT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a tagged release uses its bilingual notes and rejects lockfile drift", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ear-release-"));
  try {
    fs.mkdirSync(path.join(root, "doc/releases"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ version: "0.6.0" }),
    );
    const lock = { version: "0.6.0", packages: { "": { version: "0.6.0" } } };
    fs.writeFileSync(
      path.join(root, "package-lock.json"),
      JSON.stringify(lock),
    );
    fs.writeFileSync(
      path.join(root, "doc/releases/0.6.0.md"),
      "# EAR Audio Preview v0.6.0\n\n## English\n\n- Compare.\n\n## 简体中文\n\n- 比较。\n",
    );
    const result = releaseFiles(root, "v0.6.0");
    assert.equal(result.en, "- Compare.");
    assert.equal(result.zh, "- 比较。");
    assert.ok(result.notes.includes("## 简体中文"));
    lock.packages[""].version = "0.5.0";
    fs.writeFileSync(
      path.join(root, "package-lock.json"),
      JSON.stringify(lock),
    );
    assert.throws(() => releaseFiles(root, "v0.6.0"), /lock/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

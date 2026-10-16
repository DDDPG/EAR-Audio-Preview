/** Public Marketplace metadata; does not install or execute competing extensions. */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, "bench/.competitor-cache");
await fs.mkdir(cache, { recursive: true });
const ids = [
  "sukumo28.wav-preview",
  "huachao.audio-player",
  "jojonki.wave-explorer",
  "sunxingwei.specview",
  "YongsooIm.audioscope",
  "simzhou.audiolens",
];
const query = {
  filters: [
    {
      criteria: ids.map((value) => ({ filterType: 7, value })),
      pageNumber: 1,
      pageSize: 20,
      sortBy: 0,
      sortOrder: 0,
    },
  ],
  assetTypes: [],
  flags: 659,
};
const queryPath = path.join(cache, "gallery-query.json");
await fs.writeFile(queryPath, JSON.stringify(query));
const endpoint =
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";
const { stdout } = await exec(
  "curl",
  [
    "--fail",
    "--silent",
    "--show-error",
    "--max-time",
    "45",
    "-H",
    "Content-Type: application/json",
    "-H",
    "Accept: application/json;api-version=7.2-preview.1",
    "--data-binary",
    "@" + queryPath,
    endpoint,
  ],
  { maxBuffer: 8 * 1024 * 1024 },
);
const extensions = JSON.parse(stdout).results[0].extensions;
if (extensions.length !== ids.length)
  throw new Error("Incomplete Marketplace response");
const entries = await Promise.all(
  extensions.map(async (e) => {
    const id = e.publisher.publisherName + "." + e.extensionName;
    const v = e.versions.find(
      (x) => !x.targetPlatform || x.targetPlatform === "universal",
    );
    if (!v) throw new Error("No universal package: " + id);
    const file = (type) => v.files.find((f) => f.assetType === type)?.source;
    const readmeUrl = file("Microsoft.VisualStudio.Services.Content.Details");
    const packageUrl = file("Microsoft.VisualStudio.Services.VSIXPackage");
    for (const url of [readmeUrl, packageUrl]) {
      const u = new URL(url);
      if (u.protocol !== "https:" || !/(?:^|\.)vsassets\.io$/.test(u.hostname))
        throw new Error("Unexpected gallery asset URL");
    }
    const readme = (
      await exec(
        "curl",
        [
          "--fail",
          "--silent",
          "--show-error",
          "--location",
          "--max-time",
          "60",
          readmeUrl,
        ],
        { maxBuffer: 4 * 1024 * 1024 },
      )
    ).stdout;
    await fs.writeFile(path.join(cache, id + ".README.md"), readme);
    const result = {
      id,
      displayName: e.displayName,
      version: v.version,
      targetPlatform: v.targetPlatform || "universal",
      versionUpdated: v.lastUpdated,
      marketplaceUrl:
        "https://marketplace.visualstudio.com/items?itemName=" + id,
      readmeUrl,
      readmeSha256: createHash("sha256").update(readme).digest("hex"),
      packageUrl,
    };
    try {
      const headers = (
        await exec(
          "curl",
          [
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--head",
            "--max-time",
            "45",
            "-H",
            "Accept-Encoding: identity",
            packageUrl,
          ],
          { maxBuffer: 1024 * 1024 },
        )
      ).stdout;
      await fs.writeFile(path.join(cache, id + ".headers.txt"), headers);
      const lengths = [...headers.matchAll(/^content-length:\s*(\d+)\s*$/gim)];
      result.packageContentLength = lengths.length
        ? Number(lengths.at(-1)[1])
        : null;
      result.packageSizeMethod =
        "Final HTTP HEAD Content-Length (identity encoding); package not downloaded";
    } catch (error) {
      result.packageContentLength = null;
      result.packageSizeError = String(error.message).slice(0, 240);
    }
    console.log(
      id +
        "@" +
        v.version +
        ": " +
        (result.packageContentLength ?? "unknown") +
        " declared package bytes",
    );
    return result;
  }),
);
const report = {
  checkedOn: "2026-10-16",
  retrievedAt: new Date().toISOString(),
  source: endpoint,
  scope:
    "VS Code audio extensions; universal packages. No installation or Cursor runtime certification.",
  packageSizeBoundary:
    "Server-declared compressed VSIX transfer bytes. EAR local uncommitted VSIX is a different release state. Excludes editor, installed size, lazy model downloads, and session memory.",
  entries: entries.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)),
};
await fs.writeFile(
  path.join(root, "doc/metrics/plugin-catalog.json"),
  JSON.stringify(report, null, 2) + "\n",
);

/** Download, verify, unpack and install pinned plugins into a disposable profile. */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
if (!process.argv[2])
  throw new Error("Supply an external benchmark work directory");
const base = path.resolve(process.argv[2]);
const binary =
  process.env.VSCODE_NODE_EXECUTABLE ||
  "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
const cli =
  process.env.VSCODE_CLI_JS ||
  "/Applications/Visual Studio Code.app/Contents/Resources/app/out/cli.js";
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "doc/metrics/plugin-catalog.json"), "utf8"),
);
for (const dir of ["vsix", "unpacked"])
  await fs.mkdir(path.join(base, dir), { recursive: true });
const packages = [];
for (const entry of catalog.entries) {
  const name = entry.id + "-" + entry.version;
  const filename = path.join(base, "vsix", name + ".vsix");
  const existing = await fs.stat(filename).catch(() => null);
  if (existing?.size !== entry.packageContentLength) {
    const u = new URL(entry.packageUrl);
    if (u.protocol !== "https:" || !/(?:^|\.)vsassets\.io$/.test(u.hostname))
      throw new Error("Unexpected gallery asset URL");
    await exec("curl", [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--max-time",
      "180",
      entry.packageUrl,
      "-o",
      filename,
    ]);
  }
  const bytes = await fs.readFile(filename);
  if (bytes.length !== entry.packageContentLength)
    throw new Error("Incomplete package: " + entry.id);
  const dest = path.join(base, "unpacked", name);
  await exec("python3", [
    "-c",
    `import sys,zipfile,pathlib
p=pathlib.Path(sys.argv[2]).resolve()
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 for n in z.namelist():
  target=(p/n).resolve()
  assert target==p or p in target.parents
 z.extractall(p)
`,
    filename,
    dest,
  ]);
  await exec(
    binary,
    [
      cli,
      "--user-data-dir=" + path.join(base, "install-profile"),
      "--extensions-dir=" + path.join(base, "extensions"),
      "--install-extension",
      filename,
      "--force",
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
  );
  packages.push({
    id: entry.id,
    version: entry.version,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  console.log("Verified and installed " + name);
}
const ear = path.join(root, "ear-audio-preview-0.6.0.vsix");
await exec(
  binary,
  [
    cli,
    "--user-data-dir=" + path.join(base, "install-profile"),
    "--extensions-dir=" + path.join(base, "extensions"),
    "--install-extension",
    ear,
    "--force",
  ],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
);
await exec(process.execPath, [
  path.join(root, "bench/plugins/fixtures.cjs"),
  path.join(base, "fixtures"),
]);
await fs.writeFile(
  path.join(base, "downloaded.json"),
  JSON.stringify(packages, null, 2) + "\n",
);
console.log(
  "Isolated plugin installation and repository-derived WAV fixtures ready.",
);

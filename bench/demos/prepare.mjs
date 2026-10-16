/** Cache the published preset outside Git; no audio is uploaded. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../demo-captures/host-cache",
);
const url =
  "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/over-ear/Sennheiser%20HD%20650/Sennheiser%20HD%20650%20ParametricEQ.txt";
await fs.mkdir(dir, { recursive: true });
const bytes = execFileSync(
  "curl",
  ["--fail", "--silent", "--show-error", "--location", "--max-time", "60", url],
  { maxBuffer: 1024 * 1024 },
);
if (
  !bytes.toString().startsWith("Preamp:") ||
  !bytes.includes(Buffer.from("Filter 10:"))
)
  throw new Error("Unexpected upstream preset");
await fs.writeFile(path.join(dir, "hd650.txt"), bytes);
await fs.writeFile(
  path.join(dir, "source.json"),
  JSON.stringify(
    {
      url,
      retrievedAt: new Date().toISOString(),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Cached official AutoEq HD650 preset; original user audio remains local.",
);

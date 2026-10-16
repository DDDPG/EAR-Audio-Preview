/** Measure the downloaded archives, retaining the repository bundle-size units. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
if (!process.argv[2])
  throw new Error("Supply the external benchmark work directory");
const base = path.resolve(process.argv[2]);
const script = `import json,zipfile,hashlib,gzip,sys
from pathlib import Path
root,base=Path(sys.argv[1]),Path(sys.argv[2])
catalog=json.loads((root/'doc/metrics/plugin-catalog.json').read_text())
paths=[('Eps-Acoustic-Revolution-Lab.ear-audio-preview','0.6.0',root/'ear-audio-preview-0.6.0.vsix')]+[(e['id'],e['version'],base/'vsix'/f"{e['id']}-{e['version']}.vsix") for e in catalog['entries']]
rows=[]
for id,version,p in paths:
 b=p.read_bytes()
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  files=[x for x in z.infolist() if not x.is_dir()]
  code=[x for x in files if x.filename.endswith(('.js','.cjs','.mjs','.wasm'))]
  rows.append(dict(id=id,version=version,archiveBytes=len(b),archiveSha256=hashlib.sha256(b).hexdigest(),installedArchiveBytes=sum(x.file_size for x in files),fileCount=len(files),codeAndWasmBytes=sum(x.file_size for x in code),codeAndWasmGzipBytes=sum(len(gzip.compress(z.read(x),compresslevel=9,mtime=0)) for x in code),codeAndWasmFiles=[dict(path=x.filename,bytes=x.file_size) for x in code]))
print(json.dumps(dict(date='2026-10-16',method='Actual downloaded pinned VSIX packages; all ZIP entries CRC checked. InstalledArchiveBytes sums every entry uncompressed size. Code/WASM metric includes shipped js/cjs/mjs/wasm files, each gzip level9 separately; excludes source maps, editor RAM, and post-install lazy assets.',packages=rows),indent=2))`;
const report = execFileSync("python3", ["-c", script, root, base], {
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
});
const save = process.argv.indexOf("--save");
if (save >= 0)
  fs.writeFileSync(path.resolve(process.argv[save + 1]), report + "\n");
for (const p of JSON.parse(report).packages)
  console.log(
    `${p.id}: VSIX ${p.archiveBytes} bytes; unpacked ${p.installedArchiveBytes} bytes; ${p.fileCount} files`,
  );

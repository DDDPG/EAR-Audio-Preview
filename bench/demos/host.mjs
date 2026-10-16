/** Load the project's actual pure host modules; this adapter supplies no DSP. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const cache = new Map();
export function loadHost(relative) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const require = createRequire(filename);
  const localRequire = (name) => {
    const candidate = path.resolve(path.dirname(filename), name) + ".ts";
    return name.startsWith(".") && fs.existsSync(candidate)
      ? loadHost(candidate)
      : require(name);
  };
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
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

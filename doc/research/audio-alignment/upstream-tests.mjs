import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
// Only redirect the official test's import. All original assertions are unchanged.
const text = fs.readFileSync(new URL('./vendor/audioscope-compare-math.test.mts',import.meta.url),'utf8');
const path = new URL('./vendor/loader.mjs',import.meta.url).href;
const runnable = stripTypeScriptTypes(text).replace("await import('../src-webview/audioscope/core/compareMath.ts')", `((await import(${JSON.stringify(path)})).upstream)`);
await import('data:text/javascript;base64,'+Buffer.from(runnable).toString('base64'));

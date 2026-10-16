import fs from 'node:fs';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { upstream } from './vendor/loader.mjs';
import { estimateAlignment, compareResidual } from './operator.mjs';
import { syntheticCases, realCases, realChannels, shift } from './corpus.mjs';
const protocol = JSON.parse(fs.readFileSync(new URL('./protocol.json', import.meta.url)));
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(new URL(name, import.meta.url))).digest('hex');
const baseline = (a, b, rate) => {
  const ma = upstream.downmixToMono(a, a[0].length), mb = upstream.downmixToMono(b, b[0].length);
  const v = upstream.estimateOffset(ma, mb, rate);
  return { ...v, accepted: true, polarity: 1 };
};
const phase = process.argv[2] ?? 'dev';
const cases = phase === 'dev' ? syntheticCases(protocol.developmentSeeds) : phase === 'heldout' ? syntheticCases(protocol.heldoutSeeds) : realCases();
const rows = [];
for (const c of cases) {
  const row = { family: c.family, seed: c.seed, rate: c.rate, expected: c.expected, positive: c.positive, tolerance: c.tolerance };
  for (const [name, fn] of [['audioscope', baseline], ['candidate', estimateAlignment]]) {
    const start = performance.now(), result = fn(c.a, c.b, c.rate);
    row[name] = { ...result, elapsedMs: performance.now() - start };
    if (c.positive) {
      row[name].errorSamples = Math.abs(result.offsetSamples - c.expected);
      row[name].success = result.accepted && row[name].errorSamples <= c.tolerance;
      const residual = compareResidual(c.a, c.b, c.rate, result.offsetSamples);
      row[name].stereoResidualDb = residual.nullDepthDb === Infinity ? 'Infinity' : residual.nullDepthDb;
    }
  }
  rows.push(row);
  console.log(c.family, c.seed, c.rate, JSON.stringify({ base: row.audioscope.offsetSamples, ours: row.candidate.offsetSamples, ok: row.candidate.success, reason: row.candidate.reason }));
}
const summary = {};
for (const name of ['audioscope', 'candidate']) {
  const positives = rows.filter(r => r.positive), negatives = rows.filter(r => !r.positive);
  summary[name] = { positiveCases: positives.length, positiveSuccess: positives.filter(r => r[name].success).length, negativeCases: negatives.length, negativeAccepted: negatives.filter(r => r[name].accepted).length, negativeNonzeroOffsets: negatives.filter(r => r[name].offsetSamples !== 0).length };
}
const result = { phase, protocolSha256: hash('./protocol.json'), baselineSha256: hash('./vendor/audioscope-compareMath.ts'), operatorSha256: hash('./operator.mjs'), timestamp: new Date().toISOString(), node: process.version, summary, rows };
fs.writeFileSync(new URL(`./results/${phase}.json`, import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(summary, null, 2));

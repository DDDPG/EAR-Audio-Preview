import fs from 'node:fs';
import assert from 'node:assert/strict';
import { rng } from '../../corpus.mjs';
const load = (file, name) => {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import[^\n]*\n/, '').replaceAll('export function', 'function');
  return new Function(`${source}\nreturn ${name};`)();
};
const before = load('./round_5/before/operator.mjs', 'decimate');
const after = load('./round_5/rejected-fir/operator.mjs', 'decimatePair');
const random = rng(1739); let cases = 0;
for (const factor of [1,4,22,24,96]) for (const nx of [511,1024,4097]) for (const ny of [511,1024,4097]) {
  const x = Float32Array.from({length:nx}, (_,i) => i % 7 ? random() : -0);
  const y = Float32Array.from({length:ny}, (_,i) => i % 9 ? random() : 0);
  for (const start of [0,7,Math.min(nx,ny)-16]) for (const count of [1,7,31]) {
    const actual = after(x,y,start,count,factor);
    for (const [i, input] of [x,y].entries()) {
      const expected = before(input,start,count,factor);
      assert.deepEqual(Buffer.from(actual[i].buffer),Buffer.from(expected.buffer));
    }
    cases++;
  }
}
fs.writeFileSync(new URL('./round_5/fir-equivalence.json',import.meta.url),JSON.stringify({passed:true,cases,rawFloat64BuffersByteIdentical:true,factors:[1,4,22,24,96],coverage:['unequal input lengths','start boundary','interior','tail zero padding','signed zero']},null,2));
console.log(`${cases} paired FIR cases byte-identical to independent decimation`);

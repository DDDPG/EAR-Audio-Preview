import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { syntheticCases, realCases, realChannels, shift } from '../../corpus.mjs';
const home = import.meta.dirname, root = path.resolve(home, '../..');
const [mode, arg] = process.argv.slice(2), round = Number(arg), dir = path.join(home, `round_${round}`);
const json = (f, v) => fs.writeFileSync(f, JSON.stringify(v, (_, x) => x === Infinity ? 'Infinity' : x, 2));
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
const frozen = JSON.parse(fs.readFileSync(path.join(home, 'frozen.json')));
const checkFrozen = () => { for (const [f, h] of Object.entries(frozen)) assert.equal(hash(f), h, f); };
checkFrozen();
if (mode === 'start') {
  if (round > 1) assert.equal(JSON.parse(fs.readFileSync(path.join(home, '../checkpoint.json'))).completedRounds, round - 1, 'Previous round must be recorded first');
  fs.mkdirSync(path.join(dir, 'before'), { recursive: true });
  for (const f of ['operator.mjs', 'fft.mjs']) fs.copyFileSync(path.join(root, f), path.join(dir, 'before', f));
  json(path.join(home, '../checkpoint.json'), { plannedRounds: 5, completedRounds: round - 1, activeRound: round, status: 'finding', run: 'run-20261016', scope: ['operator.mjs', 'fft.mjs', 'review-regressions.test.mjs', 'review artifacts', 'README.md'], frozen });
  process.exit();
}
if (mode === 'verify') {
  const run = (name, args) => {
    const out = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 180000 });
    fs.writeFileSync(path.join(dir, `${name}.log`), out);
  };
  run('tests', ['--test', 'operator.test.mjs', ...(fs.existsSync(path.join(root, 'review-regressions.test.mjs')) ? ['review-regressions.test.mjs'] : [])]);
  run('upstream', ['upstream-tests.mjs']);
  for (const phase of ['dev', 'heldout', 'real']) {
    run(phase, ['evaluate.mjs', phase]);
    const r = JSON.parse(fs.readFileSync(path.join(root, 'results', phase + '.json')));
    assert.ok(r.rows.every(x => x.positive ? x.candidate.success : !x.candidate.accepted));
    fs.copyFileSync(path.join(root, 'results', phase + '.json'), path.join(dir, phase + '.json'));
  }
  run('confirmation', ['confirm.mjs']);
  const before = await import(path.join(dir, 'before/operator.mjs'));
  const after = await import(path.join(root, 'operator.mjs'));
  const protocol = JSON.parse(fs.readFileSync(path.join(root, 'protocol.json')));
  let cases = 0;
  const digest = crypto.createHash('sha256');
  for (const c of [...syntheticCases([...protocol.developmentSeeds, ...protocol.heldoutSeeds, 32452843, 49979687]), ...realCases()]) {
    const a = before.estimateAlignment(c.a, c.b, c.rate), b = after.estimateAlignment(c.a, c.b, c.rate);
    assert.equal(JSON.stringify(a), JSON.stringify(b), `estimate ${c.family} ${c.seed}`);
    const ra = before.compareResidual(c.a, c.b, c.rate, a.offsetSamples), rb = after.compareResidual(c.a, c.b, c.rate, b.offsetSamples);
    assert.equal(JSON.stringify(ra), JSON.stringify(rb), `residual ${c.family} ${c.seed}`);
    digest.update(JSON.stringify([b, rb])); cases++;
  }
  checkFrozen();
  json(path.join(dir, 'verify.json'), { passed: true, frozenInputsUnchanged: true, equivalentCases: cases, byteIdenticalEstimateAndResidual: true, outputSha256: digest.digest('hex'), operatorSha256: hash('operator.mjs'), fftSha256: hash('fft.mjs'), checks: ['original tests', 'added regressions', '8 unchanged upstream tests', 'dev heldout real', '58 confirmation and 6 gain checks'], timestamp: new Date().toISOString() });
  console.log(`Round ${round}: full gates green, ${cases} byte-identical outputs`);
}
if (mode === 'bench' || mode === 'bench-original') {
  const before = await import(mode === 'bench-original' ? path.join(home, 'baseline/operator.mjs') : path.join(dir, 'before/operator.mjs'));
  const after = await import(path.join(root, 'operator.mjs'));
  const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length/2)];
  const rows = [];
  for (const file of ['A','B','C','D']) for (const seconds of [3,30]) {
    const a = realChannels(file).map(c => c.slice(0, seconds*48000)), b = a.map(c => shift(c,523,.7));
    for (let i=0;i<4;i++) { before.estimateAlignment(a,b,48000); after.estimateAlignment(a,b,48000); }
    const samples = {before:[],after:[]};
    for (let i=0;i<15;i++) for (const key of i%2 ? ['after','before'] : ['before','after']) {
      global.gc?.(); const t=performance.now(); const r=({before,after})[key].estimateAlignment(a,b,48000);
      samples[key].push(performance.now()-t); assert.ok(r.accepted && r.offsetSamples===523);
    }
    const row = {file,seconds,samples,beforeMs:median(samples.before),afterMs:median(samples.after)};
    row.speedup=row.beforeMs/row.afterMs; rows.push(row); console.log(file,seconds,row.speedup.toFixed(3));
  }
  json(path.join(dir,mode === 'bench-original' ? 'bench-original.json' : 'bench.json'),{rows,medianSpeedup:median(rows.map(x=>x.speedup)),timestamp:new Date().toISOString()});
}
if (mode === 'record') {
  for (const f of ['findings.json','refutations.json','applied.json','verify.json','summary.md']) assert.ok(fs.statSync(path.join(dir,f)).size>2,f);
  const cp=JSON.parse(fs.readFileSync(path.join(home,'../checkpoint.json')));
  assert.equal(cp.activeRound, round); assert.equal(cp.completedRounds, round - 1);
  cp.completedRounds=round; cp.status=round===5?'complete':'round-complete'; cp.activeRound=null;
  cp.rounds=Array.from({length:round},(_,i)=>({round:i+1,...JSON.parse(fs.readFileSync(path.join(home,`round_${i+1}/applied.json`)))}));
  cp.operatorSha256=hash('operator.mjs'); cp.fftSha256=hash('fft.mjs'); cp.frozenInputsUnchanged=true;
  json(path.join(home,'../checkpoint.json'),cp); console.log('Recorded round',round);
}
if (mode === 'audit') {
  const cp = JSON.parse(fs.readFileSync(path.join(home,'../checkpoint.json')));
  assert.equal(cp.completedRounds,5); assert.equal(cp.status,'complete');
  assert.equal(cp.operatorSha256,hash('operator.mjs'));
  for (let r=1;r<=5;r++) {
    const rd = path.join(home,`round_${r}`);
    for (const f of ['findings.json','refutations.json','applied.json','verify.json','summary.md']) assert.ok(fs.statSync(path.join(rd,f)).size>2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(rd,'verify.json'))).passed,true);
    const applied=JSON.parse(fs.readFileSync(path.join(rd,'applied.json')));
    execFileSync('git',['cat-file','-e',applied.commit+'^{commit}'],{cwd:root});
  }
  const final=JSON.parse(fs.readFileSync(path.join(root,'results/final-verification.json')));
  assert.equal(final.passed,true); assert.equal(final.sha256['./operator.mjs'],hash('operator.mjs'));
  checkFrozen(); console.log('All five rounds recorded; commits, frozen inputs and current final verification agree.');
}

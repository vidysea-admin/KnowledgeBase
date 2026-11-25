import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
const S = 'C:/Users/Lenovo/AppData/Local/Temp/claude/6e9d41101c3c5a5b/3fb8d78b-cac7-406e-9e13-fe76f3d5cd42/scratchpad/c3b-check-b';
const BASE = `${S}/copy`;
const HEAD_BLOB = 'bcabe1d45042593d49b1bdee628413157b0d3a25';
const R = String.raw;
const M = [
  { id: 'BASE', from: null },
  { id: 'X8', from: R`.find({ archiveId: null }, { projection: { ownerUserId: 1 } })`, to: R`.find({ archiveId: null })` },
  { id: 'X9', from: R`await keys.deleteOne({ ownerUserId: oid, archiveId, type: r.type, id: r.id });`, to: R`await keys.deleteOne({ archiveId, type: r.type, id: r.id });` },
];
const out = [];
for (const m of M) {
  const dir = `${S}/mutp-${m.id}`;
  const file = `${dir}/src/wa/authState.ts`;
  rmSync(dir, { recursive: true, force: true });
  const rc = spawnSync('robocopy', [BASE, dir, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/MT:16'], { encoding: 'utf8' });
  if (rc.status >= 8) { out.push({ id: m.id, error: 'robocopy ' + rc.status }); continue; }
  copyFileSync(`${S}/probe/src/wa/authState.probe.test.ts`, `${dir}/src/wa/authState.probe.test.ts`);
  const backup = readFileSync(file);
  const restore = () => { try { writeFileSync(file, backup); } catch {} };
  const rec = { id: m.id };
  try {
    if (m.from) {
      const text = backup.toString('utf8');
      const n = text.split(m.from).length - 1;
      if (n !== 1) { rec.error = 'pattern count ' + n; out.push(rec); continue; }
      const idx = text.indexOf(m.from);
      writeFileSync(file, text.slice(0, idx) + m.to + text.slice(idx + m.from.length));
    }
    const t = spawnSync('cmd', ['/c', 'npx', 'tsx', '--test', '--test-force-exit', '--test-name-pattern=PROBE-P1','--test-name-pattern=PROBE-P5', 'src/wa/authState.probe.test.ts'], {
      cwd: dir, env: { ...process.env, C3B_SEED: '12345' }, encoding: 'utf8', timeout: 150000, maxBuffer: 64 * 1024 * 1024 });
    const o = (t.stdout || '') + (t.stderr || '');
    rec.exit = t.status; rec.timedOut = t.error?.code === 'ETIMEDOUT';
    rec.pass = (o.match(/^ℹ pass (\d+)/m) || [])[1]; rec.fail = (o.match(/^ℹ fail (\d+)/m) || [])[1];
    rec.failing = [...o.matchAll(/^\s*✖ (.+?) \(/gm)].map((x) => x[1]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
  } finally {
    restore();
    const h = spawnSync('git', ['hash-object', file], { encoding: 'utf8' }).stdout.trim();
    rec.hashAfterRestore = h === HEAD_BLOB ? 'equals HEAD blob' : 'MISMATCH ' + h;
    rmSync(dir, { recursive: true, force: true });
    rec.dirRemoved = !existsSync(dir);
  }
  out.push(rec);
  console.log(JSON.stringify(rec));
}
writeFileSync(`${S}/mutants-probe-result.json`, JSON.stringify(out, null, 1));
console.log('done');

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const S = 'C:\\Users\\Lenovo\\AppData\\Local\\Temp\\claude\\6e9d41101c3c5a5b\\3fb8d78b-cac7-406e-9e13-fe76f3d5cd42\\scratchpad\\c3b-check-b';
const BASE = `${S}\\copy`;
const HEAD_BLOB = 'bcabe1d45042593d49b1bdee628413157b0d3a25';
const R = String.raw;
const BT = String.fromCharCode(96);

const MUTANTS = [
  { id: 'X1', crit: 'C3B-C1', from: R`if (!r) { data[id] = null; continue; }`, to: R`if (!r) { continue; }` },
  { id: 'X2', crit: 'C3B-C2', from: R`JSON.parse(plain.toString('utf8'), BufferJSON.reviver)`, to: R`JSON.parse(plain.toString('utf8'))` },
  { id: 'X3', crit: 'C3B-C3', from: R`const nonce = randomBytes(12);`, to: R`const nonce = Buffer.alloc(12);` },
  { id: 'X4', crit: 'C3B-C4', from: R`JSON.stringify(['wa-key-store/1', owner, type, id])`, to: R`JSON.stringify(['wa-key-store/1', type, id])` },
  { id: 'X5', crit: 'C3B-C5', from: 'withLock(' + BT + '${hex}\\u0000creds' + BT + ', async () => {', to: '((_n: string, f: () => Promise<void>) => Promise.resolve().then(f))(' + BT + '${hex}\\u0000creds' + BT + ', async () => {' },
  { id: 'X6', crit: 'C3B-C6f', from: R`const res = await credsC.updateOne(live, { $set: set });`, to: R`const res = await credsC.updateOne({ ownerUserId: oid }, { $set: set });` },
  { id: 'X7', crit: 'C3B-C6e', from: R`updatedAt: { $lte: newest.archivedAt } }`, to: R`updatedAt: { $lt: newest.archivedAt } }` },
  { id: 'X8', crit: 'C3B-C7', from: R`.find({ archiveId: null }, { projection: { ownerUserId: 1 } })`, to: R`.find({ archiveId: null })` },
  { id: 'X9', crit: 'C3B-C7', from: R`await keys.deleteOne({ ownerUserId: oid, archiveId, type: r.type, id: r.id });`, to: R`await keys.deleteOne({ archiveId, type: r.type, id: r.id });` },
  { id: 'X10', crit: 'C3B-C8', first: true, from: R`const unarchive = { $set: { archiveId: null }, $unset: { archivedAt: '' } };`, to: R`const unarchive = { $set: { archiveId: null } };` },
];

const only = process.argv.slice(2);
const out = [];
for (const m of MUTANTS) {
  if (only.length && !only.includes(m.id)) continue;
  const dir = `${S}\\mut-${m.id}`;
  const file = `${dir}\\src\\wa\\authState.ts`;
  rmSync(dir, { recursive: true, force: true });
  const rc = spawnSync('robocopy', [BASE, dir, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/MT:16'], { encoding: 'utf8' });
  if (rc.status >= 8) { out.push({ id: m.id, error: 'robocopy ' + rc.status }); continue; }
  const backup = readFileSync(file); // byte backup, taken just before THIS mutation
  const restore = () => { try { writeFileSync(file, backup); } catch {} };
  const onSig = () => { restore(); process.exit(130); };
  process.on('SIGINT', onSig); process.on('SIGTERM', onSig);
  const rec = { id: m.id, crit: m.crit };
  try {
    const text = backup.toString('utf8');
    const n = text.split(m.from).length - 1;
    if (n < 1 || (!m.first && n !== 1)) { rec.error = `pattern count ${n}`; out.push(rec); continue; }
    const idx = text.indexOf(m.from);
    writeFileSync(file, text.slice(0, idx) + m.to + text.slice(idx + m.from.length));
    const t = spawnSync('cmd', ['/c', 'npx', 'tsx', '--test', '--test-force-exit', 'src/wa/authState.test.ts'], {
      cwd: dir, env: { ...process.env, C3B_SEED: '12345' }, encoding: 'utf8', timeout: 150000, maxBuffer: 64 * 1024 * 1024,
    });
    const o = (t.stdout || '') + (t.stderr || '');
    rec.timedOut = t.error?.code === 'ETIMEDOUT';
    rec.exit = t.status;
    rec.pass = (o.match(/^ℹ pass (\d+)/m) || [])[1];
    rec.fail = (o.match(/^ℹ fail (\d+)/m) || [])[1];
    rec.failing = [...o.matchAll(/^\s*✖ (.+?) \(/gm)].map((x) => x[1]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
  } finally {
    restore();
    const h = spawnSync('git', ['hash-object', file], { encoding: 'utf8' }).stdout.trim();
    rec.hashAfterRestore = h === HEAD_BLOB ? 'equals HEAD blob' : `MISMATCH ${h}`;
    process.off('SIGINT', onSig); process.off('SIGTERM', onSig);
    rmSync(dir, { recursive: true, force: true });
    rec.dirRemoved = !existsSync(dir);
  }
  out.push(rec);
  console.log(JSON.stringify(rec));
}
writeFileSync(`${S}\\mutants-result.json`, JSON.stringify(out, null, 1));
console.log('done');

// Fixed approved ordinary stages only. No credentials in arguments, output or receipts.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../../..');
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const permitted = [
  ['--import', 'tsx', 'qa/evidence/goal-live-toc/strict-claims-sample.mjs', '--preflight'],
  ['--import', 'tsx', 'qa/evidence/goal-live-toc/strict-claims-sample.mjs', '--run'],
  ['--import', 'tsx', 'qa/evidence/goal-live-toc/staging-read-only.mjs'],
];
assert.ok(permitted.some(args => JSON.stringify(args) === JSON.stringify(spec.args)), 'Unapproved argv');
assert.equal(spec.timeoutMs, spec.args.includes('qa/evidence/goal-live-toc/staging-read-only.mjs') ? 45000 : 110000);
assert.ok(/^qa\/evidence\/goal-live-toc\/ordinary-(strict-preflight|strict-run|staging)-\d{8}T\d{6}Z$/.test(spec.output));
assert.ok(Object.keys(spec.pins).length >= 11);
const sha = file => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
const before = Object.fromEntries(Object.keys(spec.pins).map(file => [file, sha(file)]));
for (const [file, hash] of Object.entries(spec.pins)) assert.equal(before[file], hash.toLowerCase(), 'Source pin drift: ' + file);
for (const suffix of ['.json', '.stdout.txt', '.stderr.txt']) assert.equal(existsSync(resolve(root, spec.output + suffix)), false, 'Immutable receipt exists');
const start = Date.now(), startedAt = new Date(start).toISOString();
let stdout = '', stderr = '', timedOut = false, overflow = false, spawnError = null, killing = false;
const child = spawn(process.execPath, spec.args, { cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
console.log(JSON.stringify({ state: 'started', pid: child.pid, startedAt, timeoutMs: spec.timeoutMs }));
function stopOwned() {
  if (killing) return; killing = true;
  if (process.platform === 'win32') {
    const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    const killTimer = setTimeout(() => { kill.kill(); child.kill(); }, 5000);
    kill.on('close', () => clearTimeout(killTimer));
    kill.on('error', () => { clearTimeout(killTimer); child.kill(); });
  } else child.kill('SIGKILL');
}
for (const [stream, key] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) stream.on('data', data => {
  if (key === 'stdout') stdout += data; else stderr += data;
  if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 2097152) { overflow = true; stopOwned(); }
});
child.on('error', error => { spawnError = error.code ?? 'spawn-failed'; });
const timer = setTimeout(() => { timedOut = true; stopOwned(); }, spec.timeoutMs);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stopOwned);
child.on('close', (exitCode, signal) => {
  clearTimeout(timer);
  const after = Object.fromEntries(Object.keys(spec.pins).map(file => [file, sha(file)]));
  const receipt = { stage: spec.args.at(-1), args: spec.args, pid: child.pid, startedAt,
    completedAt: new Date().toISOString(), elapsedMs: Date.now() - start, timeoutMs: spec.timeoutMs,
    exitCode, signal, timedOut, overflow, spawnError, before, after,
    hashesUnchanged: JSON.stringify(before) === JSON.stringify(after),
    stdoutPath: spec.output + '.stdout.txt', stderrPath: spec.output + '.stderr.txt', specSHA256: sha(process.argv[2]) };
  writeFileSync(resolve(root, receipt.stdoutPath), stdout, { flag: 'wx' });
  writeFileSync(resolve(root, receipt.stderrPath), stderr, { flag: 'wx' });
  writeFileSync(resolve(root, spec.output + '.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ state: 'terminal', pid: child.pid, exitCode, signal, timedOut, overflow,
    elapsedMs: receipt.elapsedMs, hashesUnchanged: receipt.hashesUnchanged, receipt: spec.output + '.json' }));
  process.exitCode = exitCode === 0 && !timedOut && !overflow && !spawnError && receipt.hashesUnchanged ? 0 : 1;
});

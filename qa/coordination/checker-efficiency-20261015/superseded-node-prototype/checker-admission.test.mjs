import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admission, finish, cli, digest } from './checker-admission.mjs';

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'checker-admission-'));
  try {
    const put = (path, bytes) => { writeFileSync(join(root, path), bytes); return { path, sha256: digest(bytes) }; };
    const spec = { version: 1, root, slug: 'test-unit', cycle: 2, makerActiveMs: 10000,
      manifest: put('manifest.md', '**Handshake status:** ready-for-check\nStatus: ready-for-check\nFix cycle: 2\n'),
      packet: put('packet.md', 'Only this change and its consumer.'),
      pins: [put('source.mjs', 'export const value = 1;'), put('receipt.json', '{"exit":0}')],
      riskFlags: ['tenancy'], requiredChecks: ['tenant-refusal', 'consumer'] };
    return fn(spec, put);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('measured 10% elapsed budget, bounded input estimate is explicitly not billing', () => fixture(spec => {
  const result = admission(spec, 100);
  assert.equal(result.budgetMs, 1000); assert.equal(result.deadlineMs, 1100);
  assert.equal(result.tokenUsage, 'unknown'); assert.equal(result.billedCost, 'unknown'); assert.equal(result.estimateOnly, true);
  assert.equal(admission({ ...spec, makerActiveMs: 1e9 }).budgetMs, 180000);
}));
test('unknown and zero maker timing refuse rather than manufacture ratio', () => fixture(spec => {
  for (const value of [undefined, null, 0, -1, NaN, Infinity, '100']) assert.throws(() => admission({ ...spec, makerActiveMs: value }), /timing/);
}));
test('WIP, disagreeing status and wrong cycle refuse', () => fixture((spec, put) => {
  for (const text of ['Status: building\nFix cycle: 2\n', '**Handshake status:** ready-for-check\nStatus: building\nFix cycle: 2\n', 'Status: ready-for-check\nFix cycle: 1\n']) {
    assert.throws(() => admission({ ...spec, manifest: put('manifest.md', text) }), /not-ready|wrong-cycle/);
  }
}));
test('source, evidence and manifest drift refuse admission', () => fixture(spec => {
  writeFileSync(join(spec.root, 'receipt.json'), '{"exit":1}'); assert.throws(() => admission(spec), /stale-pin/);
}));
test('packet limit and duplicate pin refuse', () => fixture((spec, put) => {
  assert.throws(() => admission({ ...spec, packet: put('packet.md', 'x'.repeat(16385)) }), /packet-over-budget/);
  assert.throws(() => admission({ ...spec, pins: [...spec.pins, spec.pins[0]] }), /duplicate-pin|stale-pin/);
}));
test('path traversal and secrets never read', () => fixture(spec => {
  for (const path of ['../outside', '.env', 'auth.json', 'C:\\outside']) assert.throws(() => admission({ ...spec, pins: [{ path, sha256: 'a'.repeat(64) }] }), /unsafe-path|sensitive-path/);
}));
test('mandatory risk and check list cannot be empty', () => fixture(spec => {
  assert.throws(() => admission({ ...spec, requiredChecks: [] }), /missing-required/);
  assert.throws(() => admission({ ...spec, riskFlags: [] }), /risk-flags/);
  assert.throws(() => admission({ ...spec, riskFlags: ['none','tenancy'] }), /risk-flags/);
}));
test('complete in-budget semantic request retained, incomplete/security omitted means HOLD', () => fixture(spec => {
  const lease = admission(spec, 100);
  assert.equal(finish(spec, lease, { verdict: 'PASS', completedChecks: spec.requiredChecks }, 900).verdict, 'PASS');
  const result = finish(spec, lease, { verdict: 'PASS', completedChecks: ['consumer'] }, 900);
  assert.equal(result.verdict, 'HOLD'); assert.deepEqual(result.missingChecks, ['tenant-refusal']);
}));
test('over-budget PASS becomes HOLD, proven FAIL stays FAIL', () => fixture(spec => {
  const lease = admission(spec, 100);
  for (const verdict of ['PASS','FAIL','HOLD']) {
    const result = finish(spec, lease, { verdict, completedChecks: spec.requiredChecks }, 1101);
    assert.equal(result.verdict, verdict === 'PASS' ? 'HOLD' : verdict); assert.equal(result.overBudget, true);
  }
}));
test('post-review drift prevents finish', () => fixture(spec => {
  const lease = admission(spec, 100); writeFileSync(join(spec.root, 'source.mjs'), 'changed');
  assert.throws(() => finish(spec, lease, { verdict: 'PASS', completedChecks: spec.requiredChecks }, 500), /stale-pin/);
}));
test('exclusive cycle reservation prevents duplicate dispatch; no automatic retry', () => fixture(spec => {
  const file = join(spec.root, 'spec.json'); writeFileSync(file, JSON.stringify(spec));
  cli(['admit', file]); assert.throws(() => cli(['admit', file]), /EEXIST/);
  const status = cli(['status', file]); assert.equal(status.finished, false); assert.ok(status.remainingMs > 0);
  const report = join(spec.root, 'report.json'); writeFileSync(report, JSON.stringify({ verdict: 'HOLD', completedChecks: [], explanation: 'unavailable independent probe' }));
  assert.equal(cli(['finish', file, report]).verdict, 'HOLD'); assert.throws(() => cli(['finish', file, report]), /already-finished/);
}));
test('one bounded command launch yields attributed receipt, duplicate rejected', () => fixture(spec => {
  spec.makerActiveMs = 100000;
  spec.independentCommand = { file: process.execPath, args: ['-e','process.stdout.write("probe-ok")'] };
  const file = join(spec.root, 'spec.json'); writeFileSync(file, JSON.stringify(spec));
  cli(['admit', file]); const receipt = cli(['run', file]);
  assert.equal(receipt.exitCode, 0); assert.equal(receipt.stdoutSha256, digest('probe-ok'));
  assert.throws(() => cli(['run', file]), /EEXIST/);
}));
test('hanging child timeout is captured without pass inference', () => fixture(spec => {
  spec.makerActiveMs = 2000;
  spec.independentCommand = { file: process.execPath, args: ['-e','setInterval(()=>{},1000)'] };
  const file = join(spec.root, 'spec.json'); writeFileSync(file, JSON.stringify(spec));
  cli(['admit', file]); const receipt = cli(['run', file]); assert.equal(receipt.errorCode, 'ETIMEDOUT');
  assert.equal(receipt.exitCode, null);
}));
test('required command receipt cannot be bypassed by requested PASS', () => fixture(spec => {
  spec.independentCommand = { file: process.execPath, args: ['-e','process.exit(1)'] };
  const file = join(spec.root, 'spec.json'); writeFileSync(file, JSON.stringify(spec)); cli(['admit', file]);
  const report = join(spec.root, 'report.json'); writeFileSync(report, JSON.stringify({ verdict: 'PASS', completedChecks: spec.requiredChecks }));
  assert.equal(cli(['finish', file, report]).verdict, 'HOLD');
}));

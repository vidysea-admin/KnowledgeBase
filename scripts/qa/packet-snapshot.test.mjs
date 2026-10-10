import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { snapshot, freeze, verify, sha256, normalizeInventory, WORKSPACE, LIMITS } from './packet-snapshot.mjs';

const fixtureParent = path.join(WORKSPACE, '.cache/coordination');
async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(fixtureParent, 'packet-fixture-'));
  const put = async (rel, bytes) => { await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true }); await fs.writeFile(path.join(root, rel), bytes); };
  try {
    await fs.mkdir(path.join(root, '.cache/coordination'), { recursive: true });
    await put('src/a.ts', Buffer.from('export const a = 1;\r\n'));
    await put('src/b.ts', Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('export const b = 2;\r\n')]));
    const base = { slug: 'fixture-unit', cycle: 0, output: '.cache/coordination/base', paths: ['src/a.ts', 'src/b.ts', 'src/new.ts'] };
    const setup = async (format = 'entries') => {
      const captured = await snapshot(root, base);
      await put('src/a.ts', 'export const a = 3;\n'); await put('src/new.ts', 'export const c = 4;\n');
      await put('dep.ts', 'export const d = 5;'); await put('qa/contracts/fixture.md', 'independent contract'); await put('evidence.txt', 'truthful receipt'); await put('output.log', 'EXPECTED RED\r\n');
      const pin = async rel => ({ path: rel, sha256: sha256(await fs.readFile(path.join(root, rel))) });
      const receipt = { argv: ['node', 'fixture-test.mjs'], cwd: '.', startedAtUTC: '2026-10-09T18:00:00.000Z', endedAtUTC: '2026-10-09T18:00:00.250Z', durationSeconds: 0.25, exitCode: 1, output: await pin('output.log') };
      await put('receipt.json', JSON.stringify(receipt));
      const spec = { slug: base.slug, cycle: 0, output: '.cache/coordination/final', format, snapshot: { path: captured.path, sha256: captured.sha256 }, sources: await Promise.all(base.paths.map(pin)), dependencies: [await pin('dep.ts')], evidence: [await pin('evidence.txt')], contract: await pin('qa/contracts/fixture.md'), receipts: [await pin('receipt.json')] };
      return { captured, spec, pin, receipt };
    };
    await fn({ root, put, base, setup });
  } finally {
    // Only the exact physically owned fixture created above; no product mutation.
    assert.equal(await fs.realpath(root), root);
    assert.ok(path.relative(fixtureParent, root).startsWith('packet-fixture-'));
    await fs.rm(root, { recursive: true, force: true });
  }
}
const refused = async (fn, code) => assert.rejects(fn, e => !code || e.code === code);

test('F1 exact recorded missing-source/output collision refuses before any write', async () => fixture(async ({ root }) => {
  const rel = '.cache/coordination/candidate/snapshot.json';
  await refused(() => snapshot(root, {slug:'checker-probe',cycle:0,output:'.cache/coordination/candidate',paths:[rel]}), 'output_input_collision');
  assert.equal(await fs.stat(path.join(root,...rel.split('/'))).then(()=>true,()=>false), false);
  await assert.rejects(fs.stat(path.join(root, '.cache/coordination/candidate')), { code: 'ENOENT' });
}));
test('F2 exact recorded CI null-base adapter keeps inferred false', () => {
  const adapter = normalizeInventory({sources:[{path:'src/new.mjs',sha256:sha256('new'),baseSha256:null,baseBackup:null}]});
  assert.equal(adapter.sourceRows[0].baseExists, false);
});
test('output subtree guard includes incomplete marker, bases and parent aliases', async () => fixture(async ({ root, base }) => {
  for (const rel of ['.cache/coordination/candidate/INCOMPLETE.json', '.cache/coordination/candidate/bases/0.bin', '.cache/coordination/candidate']) await refused(() => snapshot(root, { ...base, output: '.cache/coordination/candidate', paths: [rel] }), 'output_input_collision');
}));

test('real three-file snapshot → edit → entries freeze → readonly verify, exact BOM/CRLF/absence and RED receipt', async () => fixture(async ({ root, setup }) => {
  const { captured, spec } = await setup();
  const raw = JSON.parse(await fs.readFile(path.join(root, captured.path), 'utf8'));
  assert.equal(raw.entries[2].baseExists, false); assert.equal(raw.entries[2].baseBackup, null);
  assert.deepEqual(await fs.readFile(path.join(root, raw.entries[0].baseBackup)), Buffer.from('export const a = 1;\r\n'));
  assert.deepEqual((await fs.readFile(path.join(root, raw.entries[1].baseBackup))).subarray(0, 3), Buffer.from([239, 187, 191]));
  const result = await freeze(root, spec); const before = await fs.readFile(path.join(root, result.path));
  const report = await verify(root, result.path, result.sha256);
  assert.equal(report.authority, 'pin-integrity-only'); assert.equal(report.sources, 3); assert.equal(report.receipts, 1);
  assert.deepEqual(await fs.readFile(path.join(root, result.path)), before);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'receipt.json'))).exitCode, 1);
  assert.equal(await fs.readFile(path.join(root, 'src/a.ts'), 'utf8'), 'export const a = 3;\n');
}));
test('CI sources format with exact base bindings verifies', async () => fixture(async ({ root, setup }) => { const { spec } = await setup('sources'); const result = await freeze(root, spec); assert.equal((await verify(root, result.path, result.sha256)).integrity, 'complete'); }));
test('actual CI, B7 and D3 inventory adapters preserve pinned row/base identities; originals untouched', async () => {
  for (const rel of ['meeting-bot-ci-types', 't057-b7-confidence-graph', 't057-d3-knowledge-gaps']) {
    const file = path.join(WORKSPACE, `.cache/coordination/${rel}-cycle-0/inventory.json`); const before = await fs.readFile(file);
    const value = JSON.parse(before.toString('utf8').replace(/^\uFEFF/, '')); const adapted = normalizeInventory(value);
    assert.deepEqual(adapted.sourceRows.map(r => [r.path, r.sha256, r.baseSha256]), (value.sources ?? value.entries).map(r => [r.path, r.sha256, r.baseSha256]));
    assert.equal(sha256(await fs.readFile(file)), sha256(before));
  }
});
test('absolute, traversal, aliases, duplicates, devices and sensitive paths refuse before output', async () => fixture(async ({ root, base }) => {
  for (const paths of [[], ['/src/a.ts'], ['../x'], ['src//a.ts'], ['src/a.ts', 'src/A.ts'], ['.env.local'], ['data/bot-profile/Preferences'], ['.codex/config.toml'], ['.aws/config'], ['.ssh/id_rsa'], ['src/NUL.ts'], ['src/a.ts:stream'], ['src\\a.ts']]) await refused(() => snapshot(root, { ...base, paths }));
  await assert.rejects(fs.stat(path.join(root, base.output)), { code: 'ENOENT' });
}));
test('root outside workspace and output outside owned cache refuse', async () => fixture(async ({ root, base }) => {
  await refused(() => snapshot(path.parse(root).root, base)); await refused(() => snapshot(root, { ...base, output: 'src/output' }));
}));
test('directory and hardlink inputs refuse', async () => fixture(async ({ root, base }) => {
  await refused(() => snapshot(root, { ...base, paths: ['src'] })); await fs.link(path.join(root, 'src/a.ts'), path.join(root, 'src/hard.ts')); await refused(() => snapshot(root, { ...base, paths: ['src/hard.ts'] }));
}));
test('junction/source/output redirects refuse; no followed writes', async () => fixture(async ({ root, base }) => {
  await fs.symlink(path.join(root, 'src'), path.join(root, 'redirect'), 'junction'); await refused(() => snapshot(root, { ...base, paths: ['redirect/a.ts'] }), 'redirected_path');
  await fs.symlink(path.join(root, 'src'), path.join(root, '.cache/coordination/redirect'), 'junction'); await refused(() => snapshot(root, { ...base, output: '.cache/coordination/redirect/new' }), 'redirected_path');
}));
test('capture drift, unexpected creation and post-reservation removal refuse without complete snapshot', async () => fixture(async ({ root, put, base }) => {
  await refused(() => snapshot(root, base, { afterRead: () => put('src/new.ts', 'unexpected') }), 'source_drift');
  await fs.unlink(path.join(root, 'src/new.ts'));
  await refused(() => snapshot(root, base, { beforeComplete: () => fs.unlink(path.join(root, 'src/a.ts')) }));
  await assert.rejects(fs.stat(path.join(root, `${base.output}/snapshot.json`)), { code: 'ENOENT' });
  assert.ok(await fs.stat(path.join(root, `${base.output}/INCOMPLETE.json`)));
}));
test('concurrent same destination has exactly one winner, no overwrite', async () => fixture(async ({ root, base }) => {
  const results = await Promise.allSettled([snapshot(root, base), snapshot(root, base)]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const winner = results.find(r => r.status === 'fulfilled').value; const bytes = await fs.readFile(path.join(root, winner.path)); await refused(() => snapshot(root, base), 'destination_exists'); assert.deepEqual(await fs.readFile(path.join(root, winner.path)), bytes);
}));
test('modified snapshot backup during capture cannot publish complete provenance', async () => fixture(async ({ root, put, base }) => {
  await refused(() => snapshot(root, base, { beforeComplete: () => put(`${base.output}/bases/0.bin`, 'replaced') }), 'pin_mismatch');
  await assert.rejects(fs.stat(path.join(root, `${base.output}/snapshot.json`)), { code: 'ENOENT' });
}));
test('per-file and row bounds refuse before copying', async () => fixture(async ({ root, put, base }) => {
  await put('src/large.ts', Buffer.alloc(LIMITS.fileBytes + 1)); await refused(() => snapshot(root, { ...base, paths: ['src/large.ts'] }), 'file_limit');
  await refused(() => snapshot(root, { ...base, paths: Array.from({ length: LIMITS.rows + 1 }, (_, i) => `src/${i}.ts`) }), 'invalid_rows');
}));
test('aggregate read budget is finite', async () => fixture(async ({ root, put, base }) => {
  const list = []; for (let i = 0; i < 9; i++) { const rel = `src/${i}.ts`; list.push(rel); await put(rel, Buffer.alloc(LIMITS.fileBytes)); }
  await refused(() => snapshot(root, { ...base, paths: list }), 'aggregate_limit');
}));
for (const rel of ['src/a.ts', 'dep.ts', 'evidence.txt', 'qa/contracts/fixture.md', 'output.log', 'receipt.json', '.cache/coordination/base/bases/0.bin']) {
  test(`changed required pin refuses freeze and verification: ${rel}`, async () => fixture(async ({ root, put, setup }) => {
    const { spec } = await setup(); const result = await freeze(root, spec); await put(rel, 'changed'); await refused(() => verify(root, result.path, result.sha256)); await refused(() => freeze(root, { ...spec, output: '.cache/coordination/another' }));
  }));
}
test('missing source/output/base and wrong or absent expected hashes refuse', async () => fixture(async ({ root, setup }) => {
  const { spec } = await setup(); const result = await freeze(root, spec);
  await refused(() => verify(root, result.path)); await refused(() => verify(root, result.path, '0'.repeat(64)), 'pin_mismatch');
  await fs.unlink(path.join(root, 'output.log')); await refused(() => verify(root, result.path, result.sha256));
}));
for (const rel of ['src/a.ts', '.cache/coordination/base/bases/0.bin']) test(`missing required bytes refuse: ${rel}`, async () => fixture(async ({ root, setup }) => {
  const { spec } = await setup(); const result = await freeze(root, spec); await fs.unlink(path.join(root, rel));
  await refused(() => verify(root, result.path, result.sha256)); await refused(() => freeze(root, { ...spec, output: '.cache/coordination/missing' }));
}));
test('bounded JSON receipt and forged baseline mapping refuse', async () => fixture(async ({ root, setup, put }) => {
  const { spec } = await setup(); const result = await freeze(root, spec);
  const inv = JSON.parse(await fs.readFile(path.join(root, result.path))); inv.entries[0].baseBackup = 'evidence.txt'; const bytes = Buffer.from(JSON.stringify(inv));
  await put(result.path, bytes); await refused(() => verify(root, result.path, sha256(bytes)), 'baseline_mapping');
  await put('receipt.json', Buffer.alloc(LIMITS.jsonBytes + 1)); const changed = { ...spec, receipts: [{ path: 'receipt.json', sha256: sha256(await fs.readFile(path.join(root, 'receipt.json'))) }] }; await refused(() => freeze(root, changed), 'file_limit');
}));
test('inventory replacement with self-consistent rows cannot defeat caller pin', async () => fixture(async ({ root, setup, put }) => {
  const { spec } = await setup(); const result = await freeze(root, spec); const inv = JSON.parse(await fs.readFile(path.join(root, result.path))); inv.cycle = 1; await put(result.path, JSON.stringify(inv)); await refused(() => verify(root, result.path, result.sha256), 'pin_mismatch');
}));
test('incomplete markers prevent snapshot use and verification despite complete JSON', async () => fixture(async ({ root, setup, put }) => {
  const { spec } = await setup(); const result = await freeze(root, spec);
  await put(`${spec.output}/INCOMPLETE.json`, '{}'); await refused(() => verify(root, result.path, result.sha256), 'incomplete_operation');
  await put('.cache/coordination/base/INCOMPLETE.json', '{}'); await refused(() => freeze(root, { ...spec, output: '.cache/coordination/retry' }), 'incomplete_operation');
}));
test('omitted groups, overlap, malformed hashes, receipt and mixed adapters refuse', async () => fixture(async ({ root, setup, put }) => {
  const { spec, pin, receipt } = await setup();
  for (const bad of [{ ...spec, dependencies: undefined }, { ...spec, receipts: [] }, { ...spec, evidence: [spec.contract] }, { ...spec, contract: { ...spec.contract, sha256: 'bogus' } }]) await refused(() => freeze(root, bad));
  for (const changed of [{ ...receipt, durationSeconds: -1 }, { ...receipt, exitCode: 0.5 }, { ...receipt, endedAtUTC: 'bad' }, { ...receipt, endedAtUTC: '2026-02-30T18:00:00Z' }, { ...receipt, output: null }, { ...receipt, argv: [] }]) { await put('receipt.json', JSON.stringify(changed)); const receiptPin = await pin('receipt.json'); await refused(() => freeze(root, { ...spec, receipts: [receiptPin] })); }
  assert.throws(() => normalizeInventory({ sources: [], entries: [] }));
}));
test('freeze read and completion drift refuse; existing frozen output never overwritten', async () => fixture(async ({ root, setup, put }) => {
  const { spec } = await setup();
  await refused(() => freeze(root, spec, { afterRead: () => put('dep.ts', 'drift') }), 'source_drift');
  await put('dep.ts', 'export const d = 5;');
  await refused(() => freeze(root, spec, { beforeComplete: () => put('src/new.ts', 'drift') }), 'source_drift');
  await assert.rejects(fs.stat(path.join(root, `${spec.output}/inventory.json`)), { code: 'ENOENT' });
}));

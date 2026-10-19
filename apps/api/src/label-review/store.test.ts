import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileLabelReviewStore } from './store.js';
import { loadLabelItems, SOURCE_FILES } from './source.js';
import { human, makeProject } from './fixture.js';

const NOW = '2026-10-19T10:00:00.000Z';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function setup() {
  const p = await makeProject();
  const store = createFileLabelReviewStore({ root: p.reviews, projectRoot: p.project, now: () => NOW });
  const pins = async () => Promise.all(Object.values(SOURCE_FILES).map(async f => sha(await readFile(join(p.project, f)))));
  return { ...p, store, pins, cleanup: () => rm(p.base, { recursive: true, force: true }) };
}
const row = (v: { items: { id: string }[] }, id: string) => v.items.find(i => i.id === id)! as ReturnType<typeof Object>;

test('view lists both sets with prompt, passage, AI label and server-derived confidence; never humanGold', async () => {
  const t = await setup();
  try {
    const v = await t.store.read(human());
    assert.equal(v.humanGold, false); assert.equal(v.metricLabel, 'AI-consensus');
    assert.deepEqual(v.items.map(i => i.id).sort(), ['t022:review-001', 't022:review-002', 'u22:c-failed', 'u22:c-high', 'u22:c-medium', 'u22:c-null']);
    const by = Object.fromEntries(v.items.map(i => [i.id, i]));
    assert.equal(by['t022:review-001']!.prompt, 'Question review-001?'); assert.match(by['t022:review-001']!.passage, /Title review-001\nSummary review-001/);
    assert.equal(by['t022:review-001']!.aiLabel, 0.9); assert.equal(by['t022:review-001']!.confidence, 'high');
    assert.equal(by['t022:review-002']!.confidence, 'low');
    assert.equal(by['u22:c-high']!.confidence, 'high'); assert.equal(by['u22:c-high']!.passage, 'Cited passage c-high');
    assert.equal(by['u22:c-medium']!.confidence, 'medium'); assert.equal(by['u22:c-failed']!.confidence, 'low');
    assert.equal(by['u22:c-null']!.aiLabel, null); assert.equal(by['u22:c-null']!.confidence, 'low');
    assert.deepEqual(v.counts.byConfidence, { high: 2, medium: 1, low: 3 });
    assert.ok(v.items.every(i => i.effective.labelSource === 'ai-consensus' && i.effective.reviewedBy === null && i.revision === 0));
  } finally { await t.cleanup(); }
});

test('accept keeps labelSource ai-consensus, sets reviewedBy, and never writes humanGold', async () => {
  const t = await setup(); const before = await t.pins();
  try {
    const item = row(await t.store.read(human()), 'u22:c-high') as unknown as { inputSha256: string };
    const v = await t.store.accept(human(), 'u22:c-high', { expectedRevision: 0, inputSha256: item.inputSha256 });
    const e = (row(v, 'u22:c-high') as unknown as { effective: Record<string, unknown>; revision: number });
    assert.equal(e.effective.labelSource, 'ai-consensus'); assert.equal(e.effective.label, 'supported'); assert.equal(e.effective.reviewedBy, 'fixture-human'); assert.equal(e.revision, 1);
    assert.equal(v.counts.humanOverrides, 0); assert.equal(v.counts.reviewed, 1);
    const files = await readdir(t.reviews), stored = await Promise.all(files.filter(f => f.endsWith('.json')).map(f => readFile(join(t.reviews, f), 'utf8')));
    assert.equal(stored.length, 1); assert.ok(!/humanGold/i.test(stored[0]!)); assert.ok(!stored[0]!.includes('"labelSource":"human"'));
    assert.deepEqual(await t.pins(), before);
  } finally { await t.cleanup(); }
});

test('override creates labelSource human with an optional note; invalid labels leave nothing behind', async () => {
  const t = await setup();
  try {
    const hashOf = (id: string, v: { items: { id: string; inputSha256: string }[] }) => v.items.find(i => i.id === id)!.inputSha256;
    const v0 = await t.store.read(human());
    for (const [id, label] of [['t022:review-001', 1.5], ['t022:review-001', Number.NaN], ['t022:review-001', 'supported'], ['u22:c-high', 'bogus'], ['u22:c-high', 0.5], ['u22:c-high', null]] as const)
      await assert.rejects(t.store.override(human(), id, { expectedRevision: 0, inputSha256: hashOf(id, v0), label }), /invalid/);
    await assert.rejects(t.store.override(human(), 'u22:c-high', { expectedRevision: 0, inputSha256: hashOf('u22:c-high', v0), label: 'unsupported', note: 'x'.repeat(2001) }), /invalid/);
    assert.equal((await t.store.read(human())).counts.reviewed, 0);
    const v = await t.store.override(human(), 'u22:c-null', { expectedRevision: 0, inputSha256: hashOf('u22:c-null', v0), label: 'unsupported', note: 'Checked the source' });
    const e = (row(v, 'u22:c-null') as unknown as { effective: Record<string, unknown> }).effective;
    assert.equal(e.labelSource, 'human'); assert.equal(e.label, 'unsupported'); assert.equal(e.note, 'Checked the source'); assert.equal(v.counts.humanOverrides, 1); assert.equal(v.humanGold, false);
    const t2 = await t.store.override(human(), 't022:review-002', { expectedRevision: 0, inputSha256: hashOf('t022:review-002', v0), label: 0.25 });
    assert.equal((row(t2, 't022:review-002') as unknown as { effective: Record<string, unknown> }).effective.label, 0.25);
  } finally { await t.cleanup(); }
});

test('accept refuses an item with no AI label; stale revision, drifted input and unknown id refuse', async () => {
  const t = await setup();
  try {
    const v0 = await t.store.read(human()), h = (id: string) => v0.items.find(i => i.id === id)!.inputSha256;
    await assert.rejects(t.store.accept(human(), 'u22:c-null', { expectedRevision: 0, inputSha256: h('u22:c-null') }), /no_ai_label/);
    await assert.rejects(t.store.accept(human(), 'u22:c-high', { expectedRevision: 0, inputSha256: 'f'.repeat(64) }), /conflict/);
    await assert.rejects(t.store.accept(human(), 'u22:nope', { expectedRevision: 0, inputSha256: 'x' }), /not_found/);
    await assert.rejects(t.store.accept(human(), 'u22:c-high', { expectedRevision: -1, inputSha256: h('u22:c-high') }), /invalid/);
    await t.store.accept(human(), 'u22:c-high', { expectedRevision: 0, inputSha256: h('u22:c-high') });
    await assert.rejects(t.store.accept(human(), 'u22:c-high', { expectedRevision: 0, inputSha256: h('u22:c-high') }), /conflict/);
    await mkdir(join(t.reviews, `${createHash('sha256').update('toc').digest('hex')}.lock`));
    await assert.rejects(t.store.accept(human(), 'u22:c-medium', { expectedRevision: 0, inputSha256: h('u22:c-medium') }), /conflict/);
  } finally { await t.cleanup(); }
});

test('bulk accept touches only unreviewed high-confidence items and never overwrites a human override', async () => {
  const t = await setup(); const before = await t.pins();
  try {
    const v0 = await t.store.read(human()), h = (id: string) => v0.items.find(i => i.id === id)!.inputSha256;
    await t.store.override(human(), 'u22:c-high', { expectedRevision: 0, inputSha256: h('u22:c-high'), label: 'unsupported' });
    const v = await t.store.acceptHighConfidence(human());
    assert.equal(v.acceptedCount, 1);
    const ids = v.items.filter(i => i.revision > 0).map(i => `${i.id}=${i.effective.labelSource}`).sort();
    assert.deepEqual(ids, ['t022:review-001=ai-consensus', 'u22:c-high=human']);
    assert.equal((await t.store.acceptHighConfidence(human())).acceptedCount, 0);
    await assert.rejects(t.store.acceptHighConfidence(human(), 'both' as 'u22'), /invalid/);
    assert.deepEqual(await t.pins(), before);
  } finally { await t.cleanup(); }
});

test('tenant scoping: each tenant sees and reviews only its own items; foreign and non-human contexts refuse', async () => {
  const t = await setup();
  try {
    const toc = await t.store.read(human('toc')), other = await t.store.read(human('other'));
    assert.ok(toc.items.every(i => i.tenantId === 'toc')); assert.deepEqual(other.items.map(i => i.id), ['u22:c-foreign']);
    await assert.rejects(t.store.accept(human('other'), 'u22:c-high', { expectedRevision: 0, inputSha256: toc.items.find(i => i.id === 'u22:c-high')!.inputSha256 }), /not_found/);
    await t.store.accept(human('other'), 'u22:c-foreign', { expectedRevision: 0, inputSha256: other.items[0]!.inputSha256 });
    assert.equal((await t.store.read(human('toc'))).counts.reviewed, 0);
    await assert.rejects(t.store.read(human('nobody')), /not_found/);
    await assert.rejects(t.store.read({ ...human(), reviewerKind: 'automation' }), /forbidden/);
    await assert.rejects(t.store.read({ ...human(), canReview: false }), /forbidden/);
  } finally { await t.cleanup(); }
});

test('a stored record whose source contradicts its action, or a humanGold field, fails closed', async () => {
  const t = await setup();
  try {
    const v0 = await t.store.read(human()), item = v0.items.find(i => i.id === 'u22:c-high')!;
    await t.store.accept(human(), item.id, { expectedRevision: 0, inputSha256: item.inputSha256 });
    const file = join(t.reviews, `${createHash('sha256').update('toc').digest('hex')}.json`), good = await readFile(file, 'utf8');
    await writeFile(file, good.replace('"labelSource":"ai-consensus"', '"labelSource":"human"'));
    await assert.rejects(t.store.read(human()), /unavailable/);
    await writeFile(file, good.replace('"reviewedBy"', '"humanGold":true,"reviewedBy"'));
    await assert.rejects(t.store.read(human()), /unavailable/);
    await writeFile(file, good); assert.equal((await t.store.read(human())).counts.reviewed, 1);
  } finally { await t.cleanup(); }
});

test('the real T-022 (30) and U2.2 (72) sidecars load read-only with the AI label and a confidence band', async () => {
  const repo = fileURLToPath(new URL('../../../../', import.meta.url));
  const pins = async () => Promise.all(Object.values(SOURCE_FILES).map(async f => sha(await readFile(join(repo, f)))));
  const before = await pins(), items = await loadLabelItems(repo);
  assert.equal(items.filter(i => i.set === 't022').length, 30); assert.equal(items.filter(i => i.set === 'u22').length, 72);
  assert.ok(items.every(i => i.prompt.length > 0 && i.passage.length > 0 && ['high', 'medium', 'low'].includes(i.confidence)));
  assert.ok(items.filter(i => i.set === 't022').every(i => typeof i.aiLabel === 'number'));
  assert.ok(items.filter(i => i.aiLabel === null).every(i => i.confidence === 'low'));
  assert.deepEqual(await pins(), before);
});

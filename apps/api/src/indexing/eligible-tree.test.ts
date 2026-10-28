import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import type { Sessions, SessionPages, Turns, TreeIndexRootDocument } from '@lkb/core';
import { buildTree, buildTopicIndex, treeSearch } from '@lkb/index';
import { eligibleTreeInput } from './eligible-tree.js';
import { trustedTreeReads } from '../composition/integrations/trusted-readers.js';
import { indexTurnDigest } from './generation.js';

// The immutable recorded 022 attack/control runs separately with its pinned original reader.
// These ordinary standing cases exercise the CURRENT reader's mandatory snapshot capability.

type Row = Record<string, unknown>;
const tenant = 'tenant-a', marker = 'CachedSecret';
function fixture() {
  const makeSession = (id: string, date: string): Sessions => ({ _id: id, tenantId: tenant, sourceId: `source-${id}`,
    title: `Session ${id}`, date, status: { transcribe: 'done', index: 'done' } });
  const sessions = [makeSession('old', '2025-01-01'), makeSession('new', '2026-01-01')];
  const makePage = (id: string, summary: string): SessionPages => ({ _id: `page-${id}`, tenantId: tenant,
    sessionId: id, summary, evidence: [{ sessionId: id, turnId: `turn-${id}` }] });
  const pages = [makePage('old', `${marker} is a cached topic.`), makePage('new', 'Current Student Visa guidance.')];
  const turns: Turns[] = pages.map(page => ({ _id: `turn-${page.sessionId}`, tenantId: tenant, sessionId: page.sessionId,
    text: page.summary!, speakerRef: 'speaker', tStart: 0, tEnd: 1 }));
  const root: TreeIndexRootDocument = { ...buildTree(sessions, pages)[tenant]!, tenantId: tenant };
  root.summary = `${marker} mixed parent summary`;
  const rows: Record<string, Row[]> = { sessions: sessions as unknown as Row[], session_pages: pages as unknown as Row[],
    sources: sessions.map(s => ({ _id: s.sourceId, tenantId: tenant, kind: 'recording', path: `${s._id}.wav`, consent: { given: true } })),
    turns: turns as unknown as Row[], tree_index: [root as unknown as Row], transcript_reviews: [],
    whatsapp_candidates: [], whatsapp_review_log: [], claims: [] };
  const matches = (row: Row, filter: Row) => Object.entries(filter).every(([key, expected]) => row[key] === expected);
  const db = { client: { startSession() { return {
    async withTransaction<T>(run: () => Promise<T>) { return run(); },
    async endSession() {}, inTransaction() { return false; },
  }; } }, collection(name: string) { return {
    async findOne(filter: Row) { return structuredClone(rows[name]?.find(row => matches(row, filter)) ?? null); },
    find(filter: Row) { return { async toArray() { return structuredClone(rows[name]?.filter(row => matches(row, filter)) ?? []); } }; },
  }; } } as unknown as Db;
  return { sessions, pages, root, rows, db };
}

test('rejected page invalidates cache and removes its session from tree/graph contributors', async () => {
  const f = fixture();
  f.rows.turns = f.rows.turns!.filter(turn => turn.sessionId !== 'old');
  const before = JSON.stringify(f.root);
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root);
  assert.equal(eligible.existingRoot, undefined);
  assert.deepEqual(eligible.sessions.map(session => session._id), ['new']);
  assert.deepEqual(eligible.pages.map(page => page.sessionId), ['new']);
  assert.equal(JSON.stringify(f.root), before, 'eligibility must not mutate the old cache');
});

test('a disappeared effective page cannot preserve a cached old year or mixed parent summary', async () => {
  const f = fixture();
  const currentPages = f.pages.filter(page => page.sessionId !== 'old');
  f.rows.session_pages = currentPages as unknown as Row[];
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, currentPages, f.root);
  assert.equal(eligible.existingRoot, undefined);
  assert.deepEqual(eligible.sessions.map(session => session._id), ['new']);
  let calls = 0;
  const rebuilt = await buildTopicIndex(tenant, eligible.sessions, eligible.pages,
    async () => { calls++; throw new Error('provider forbidden'); },
    { enabled: false, existingRoot: eligible.existingRoot, changedSessionIds: ['new'] });
  assert.ok(rebuilt.root);
  f.rows.tree_index = [{ ...rebuilt.root, tenantId: tenant } as unknown as Row];
  const loaded = await trustedTreeReads(() => f.db).load(tenant);
  assert.ok(!JSON.stringify(loaded).includes(marker));
  const oldId = `${tenant}/year:2025/month:01/session:old`;
  assert.deepEqual(loaded ? treeSearch(loaded, [oldId, `${oldId}/topic:cachedsecret`]) : [], []);
  assert.equal(calls, 0);
});

test('valid cache retains its exact reference and all safe contributors', async () => {
  const f = fixture();
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root);
  assert.equal(eligible.existingRoot, f.root);
  assert.deepEqual(eligible.sessions.map(session => session._id), ['old', 'new']);
  assert.deepEqual(eligible.pages, f.pages);
});

test('cached single and plural contributor references cannot bypass safe-page membership', async () => {
  const f = fixture();
  for (const evidence of [{ sessionRef: 'missing' }, { sessionRefs: ['old', 'missing'] }]) {
    const root = { ...f.root, evidence };
    assert.equal((await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, root)).existingRoot, undefined);
  }
});

test('same-ID corrected evidence withholds unbound legacy summary and cached topic', async () => {
  const f = fixture();
  const old = f.rows.turns!.find(turn => turn.sessionId === 'old')!;
  old.text = 'The sensitive passage was redacted.';
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root);
  assert.equal(eligible.existingRoot, undefined);
  assert.deepEqual(eligible.sessions.map(session => session._id), ['new']);
  assert.deepEqual(eligible.pages.map(page => page.sessionId), ['new']);
});

test('generation binding must follow the exact current effective transcript and source', async () => {
  const f = fixture();
  const oldRows = f.rows.turns!.filter(turn => turn.sessionId === 'old') as unknown as Turns[];
  f.pages[0]!.indexArtifact = { version: 1, generation: '4d621b38-df45-40cb-9cc5-3bcb2b291828',
    sessionId: 'old', sourceId: 'source-old', turnDigest: indexTurnDigest(oldRows) };
  const oldNode = f.root.children.find(year => year.title === '2025')!.children[0]!.children[0]!;
  oldNode.indexArtifact = { ...f.pages[0]!.indexArtifact };
  assert.equal((await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root)).existingRoot, f.root);
  oldNode.indexArtifact.generation = '1d621b38-df45-40cb-9cc5-3bcb2b291828';
  assert.equal((await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root)).existingRoot, undefined);
  oldNode.indexArtifact = { ...f.pages[0]!.indexArtifact };
  f.rows.turns!.find(turn => turn.sessionId === 'old')!.text = 'Corrected source text with the same ID.';
  assert.equal((await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root)).existingRoot, undefined);
  f.pages[0]!.indexArtifact.sourceId = 'foreign-source';
  assert.deepEqual((await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root)).pages.map(page => page.sessionId), ['new']);
});

test('a corrected current page cannot make the same-ID stale cached summary readable', async () => {
  const f = fixture();
  f.pages[0]!.summary = 'Current safe revised guidance.';
  f.rows.turns!.find(turn => turn.sessionId === 'old')!.text = f.pages[0]!.summary;
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root);
  assert.equal(eligible.pages.length, 2, 'the current corrected page itself remains eligible');
  assert.equal(eligible.existingRoot, undefined);
  const loaded = await trustedTreeReads(() => f.db).load(tenant);
  assert.ok(!JSON.stringify(loaded).includes(marker));
});

test('matching cached summary cannot retain unsupported stale topic or org display text', async () => {
  for (const kind of ['topic', 'org'] as const) {
    const f = fixture();
    f.pages[0]!.summary = 'Current safe revised guidance.';
    f.rows.turns!.find(turn => turn.sessionId === 'old')!.text = f.pages[0]!.summary;
    const oldNode = f.root.children.find(year => year.title === '2025')!.children[0]!.children[0]!;
    oldNode.summary = f.pages[0]!.summary;
    oldNode.children[0]!.level = kind;
    oldNode.children[0]!.node_id = oldNode.children[0]!.node_id.replace('/topic:', `/${kind}:`);
    assert.equal((await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root)).existingRoot, undefined);
  }
});

test('routingSummary is never built from a withdrawn or unapproved source and stays within 768 UTF-8 bytes', async () => {
  const { bindIndexTree } = await import('./generation.js');
  const longNew = 'करियर 🧠 Current Student Visa guidance. '.repeat(80);
  for (const withdrawal of ['consent-withdrawn', 'whatsapp-unapproved'] as const) {
    const f = fixture();
    const newPage = f.pages.find(page => page.sessionId === 'new')!;
    newPage.summary = longNew;
    f.rows.turns!.find(turn => turn.sessionId === 'new')!.text = longNew;
    const oldSource = f.rows.sources!.find(source => source._id === 'source-old')!;
    if (withdrawal === 'consent-withdrawn') oldSource.consent = { given: false };
    else oldSource.kind = 'whatsapp-batch';
    const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root);
    assert.deepEqual(eligible.pages.map(page => page.sessionId), ['new'], withdrawal);
    const tree = buildTree(eligible.sessions, eligible.pages)[tenant]!;
    // Pass EVERY page (including the withdrawn one) so only eligibility, not the input list, keeps it out.
    const binding = { version: 1 as const, generation: '00000000-0000-4000-8000-000000000000', sessionId: 'new', sourceId: 'source-new', turnDigest: 'a'.repeat(64) };
    const bound = bindIndexTree(tree, binding, f.pages as never, tenant);
    const summaries: string[] = [];
    const walk = (node: TreeIndexRootDocument | typeof bound) => { const text = node.evidence?.routingSummary; if (typeof text === 'string') summaries.push(text); node.children.forEach(walk); };
    walk(bound);
    assert.ok(summaries.length >= 2, withdrawal);
    for (const text of summaries) {
      assert.ok(!text.includes(marker), `${withdrawal}: withdrawn text leaked`);
      assert.ok(Buffer.byteLength(text, 'utf8') <= 768, `${withdrawal}: ${Buffer.byteLength(text, 'utf8')} bytes`);
      assert.ok(!text.includes('\uFFFD'));
      assert.equal(Buffer.from(text, 'utf8').toString('utf8'), text);
    }
    assert.ok(!JSON.stringify(bound).includes(marker));
    // Control: the unfiltered input WOULD leak, so the assertions above are not vacuous.
    const unfiltered = bindIndexTree(buildTree(f.sessions, f.pages)[tenant]!, { ...binding, sessionId: 'old', sourceId: 'source-old' }, f.pages as never, tenant);
    assert.ok(JSON.stringify(unfiltered).includes(marker), `${withdrawal}: control must leak`);
  }
});

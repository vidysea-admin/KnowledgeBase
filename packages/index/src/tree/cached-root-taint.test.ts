/** ISS-U23-CACHED-ROOT-001: rejected-page knowledge must not survive in a cached root, through any reader.
 * The ledger fixture is the recorded 022 reproduction (data, matcher, oracle unchanged); only the db
 * double gains the snapshot-session capability the current production reader now requires (D-015). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import type { Sessions, SessionPages, Turns, TreeIndexNode, TreeIndexRootDocument } from '@lkb/core';
import { eligibleTreeInput } from '../../../../apps/api/src/indexing/eligible-tree.js';
import { trustedTreeReads } from '../../../../apps/api/src/composition/integrations/trusted-readers.js';
import { buildTopicIndex } from './topic-indexing.js';
import { buildTree } from './build.js';
import { treeSearch } from './search.js';

const tenant = 'tenant-a';
const marker = 'CachedSecret';
type Row = Record<string, unknown>;
function values(value: unknown, path: string[]): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => values(item, path));
  if (!path.length) return [value];
  if (!value || typeof value !== 'object') return [];
  return values((value as Row)[path[0]!], path.slice(1));
}
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, wanted]) => values(row, key.split('.')).some(actual => {
    if (wanted && typeof wanted === 'object' && '$in' in wanted) return (wanted as { $in: unknown[] }).$in.includes(actual);
    return actual === wanted;
  }));
}

function fixture(validOldCitation: boolean) {
  const session = (id: string, date: string): Sessions => ({ _id: id, tenantId: tenant,
    sourceId: `source-${id}`, title: `Session ${id}`, date, status: { transcribe: 'done', index: 'done' } });
  const sessions = [session('old', '2025-01-01'), session('new', '2026-01-01')];
  const page = (id: string, summary: string): SessionPages => ({ _id: `page-${id}`, tenantId: tenant,
    sessionId: id, summary, evidence: [{ sessionId: id, turnId: `turn-${id}` }] });
  const pages = [page('old', `${marker} is a cached topic.`), page('new', 'Current Student Visa guidance.')];
  const turn = (id: string, text: string): Turns => ({ _id: `turn-${id}`, tenantId: tenant,
    sessionId: id, text, speakerRef: 'speaker', tStart: 0, tEnd: 1 });
  const root: TreeIndexRootDocument = { ...buildTree(sessions, pages)[tenant]!, tenantId: tenant };
  root.summary = `${marker} mixed parent summary`;
  const rows: Record<string, Row[]> = {
    sessions: sessions as unknown as Row[], session_pages: pages as unknown as Row[],
    sources: sessions.map(s => ({ _id: s.sourceId, tenantId: tenant, kind: 'recording', path: `${s._id}.wav`,
      consent: { given: true, recordedBy: 'checker-fixture' } })),
    turns: [turn('new', pages[1]!.summary!), ...(validOldCitation ? [turn('old', pages[0]!.summary!)] : [])] as unknown as Row[],
    tree_index: [root as unknown as Row], transcript_reviews: [], claims: [],
    whatsapp_candidates: [], whatsapp_review_log: [],
  };
  const db = { client: { startSession() { return {
    async withTransaction<T>(run: () => Promise<T>) { return run(); },
    async endSession() {}, inTransaction() { return false; },
  }; } }, collection(name: string) { return {
    async findOne(filter: Row) { return structuredClone(rows[name]?.find(row => matches(row, filter)) ?? null); },
    find(filter: Row) { return { async toArray() { return structuredClone(rows[name]?.filter(row => matches(row, filter)) ?? []); } }; },
  }; } } as unknown as Db;
  return { sessions, pages, root, rows, db };
}

const oldId = `${tenant}/year:2025/month:01/session:old`;
const noProvider = (calls: { n: number }) => async () => { calls.n++; throw new Error('provider forbidden'); };

/** `producer`: 'current' uses eligibleTreeInput's filtered output; 'original' reproduces the pre-fix
 * producer (all visible sessions, only safe pages, cached root retained) so the tree package alone must refuse it. */
async function readerResult(validOldCitation: boolean, producer: 'current' | 'original') {
  const f = fixture(validOldCitation);
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root);
  const input = producer === 'current' ? eligible
    : { sessions: f.sessions, pages: eligible.pages, existingRoot: f.root as TreeIndexNode | undefined };
  const calls = { n: 0 };
  const rebuilt = await buildTopicIndex(tenant, input.sessions, input.pages, noProvider(calls),
    { enabled: false, existingRoot: input.existingRoot, changedSessionIds: ['new'] });
  assert.ok(rebuilt.root, 'indexer must produce a candidate');
  f.rows.tree_index = [{ ...rebuilt.root, tenantId: tenant } as unknown as Row];
  const loaded = await trustedTreeReads(() => f.db).load(tenant);
  const resolved = loaded ? treeSearch(loaded, [oldId, `${oldId}/topic:cachedsecret`]) : [];
  assert.equal(calls.n, 0);
  return { eligible, built: rebuilt.root, loaded, resolved };
}

for (const producer of ['current', 'original'] as const) {
  test(`positive control (${producer} producer): valid cited old-year knowledge stays readable`, async () => {
    const out = await readerResult(true, producer);
    assert.equal(out.eligible.pages.length, 2);
    assert.ok(JSON.stringify(out.loaded).includes(marker));
    assert.ok(JSON.stringify(out.resolved).includes(marker));
  });

  test(`security (${producer} producer): rejected old page leaks through no reader path`, async () => {
    const out = await readerResult(false, producer);
    assert.deepEqual(out.eligible.pages.map(p => p.sessionId), ['new']);
    // cached root summary / built root, trusted reads, tree search
    assert.ok(!JSON.stringify(out.built).includes(marker), 'rebuilt root still carries rejected cached text');
    assert.ok(!JSON.stringify(out.loaded).includes(marker), 'trustedTreeReads exposes rejected cached text');
    assert.ok(!JSON.stringify(out.resolved).includes(marker), 'treeSearch resolves rejected cached text');
    assert.equal(out.built.summary, '');
  });
}

// Package-level boundary: buildTopicIndex alone must refuse any cached node unsupported by the current pages.
function twoYears() {
  const sessions: Sessions[] = [['a', '2024-02-01'], ['b', '2025-03-01'], ['c', '2026-04-01']].map(([id, date]) => ({
    _id: id!, tenantId: tenant, sourceId: `s-${id}`, title: `S ${id}`, date: date!, org: id === 'a' ? 'Acme' : undefined,
    status: { transcribe: 'done', index: 'done' } }) as Sessions);
  const pages: SessionPages[] = sessions.map(s => ({ _id: `p-${s._id}`, tenantId: tenant, sessionId: s._id,
    summary: `Guidance on Scholarship ${s._id}.`, evidence: [{ sessionId: s._id, turnId: `t-${s._id}` }] }));
  return { sessions, pages, root: buildTree(sessions, pages)[tenant]! };
}
const rebuild = (s: Sessions[], p: SessionPages[], root: TreeIndexNode, changed: string[]) =>
  buildTopicIndex(tenant, s, p, noProvider({ n: 0 }), { enabled: false, existingRoot: root, changedSessionIds: changed });
const find = (n: TreeIndexNode, pred: (x: TreeIndexNode) => boolean): TreeIndexNode | undefined =>
  pred(n) ? n : n.children.map(c => find(c, pred)).find(Boolean);

test('valid cache keeps untouched year references exactly', async () => {
  const { sessions, pages, root } = twoYears();
  const out = await rebuild(sessions, pages, root, ['c']);
  assert.equal(out.root!.children.find(y => y.title === '2024'), root.children.find(y => y.title === '2024'));
});

const taints: [string, (r: TreeIndexNode) => void][] = [
  ['tenant summary', r => { r.summary = marker; }],
  ['year summary', r => { r.children.find(y => y.title === '2024')!.summary = marker; }],
  ['month summary', r => { r.children.find(y => y.title === '2024')!.children[0]!.summary = marker; }],
  ['session summary differing from page', r => { find(r, n => n.level === 'session' && n.title === 'S a')!.summary = marker; }],
  ['topic summary', r => { find(r, n => n.level === 'topic' && n.node_id.includes('session:a'))!.summary = marker; }],
  ['topic title without current source', r => { find(r, n => n.level === 'topic' && n.node_id.includes('session:a'))!.title = marker; }],
  ['org title', r => { find(r, n => n.level === 'org')!.title = marker; }],
];
for (const [name, taint] of taints) {
  test(`untouched year with tainted ${name} is not reused`, async () => {
    const { sessions, pages, root } = twoYears();
    taint(root);
    const out = await rebuild(sessions, pages, root, ['c']);
    assert.ok(!JSON.stringify(out.root).includes(marker));
    assert.ok(!JSON.stringify(treeSearch(out.root!, [`${tenant}/year:2024/month:02/session:a`])).includes(marker));
  });
}

test('cached session whose page was rejected is not served from the untouched year', async () => {
  const { sessions, pages, root } = twoYears();
  find(root, n => n.level === 'session' && n.title === 'S a')!.summary = `${marker} secret`;
  const out = await rebuild(sessions, pages.filter(p => p.sessionId !== 'a'), root, ['c']);
  assert.ok(!JSON.stringify(out.root).includes(marker));
});

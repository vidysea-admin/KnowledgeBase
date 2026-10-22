import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import type { Sessions, SessionPages, Turns, TreeIndexRootDocument } from '@lkb/core';
import { buildTopicIndex, treeSearch } from '@lkb/index';
import { eligibleTreeInput } from '../eligible-tree.js';
import { trustedTreeReads, trustedGraphReads } from '../../composition/integrations/trusted-readers.js';
import { buildTestDeps, fakeKeyStore } from '../../fixtures.js';
import { startTestServer } from '../../testUtils.js';

// D-190: the tree is built from ELIGIBLE sessions; ineligible ones are excluded, counted and never cited.
type Row = Record<string, unknown>;
const tenant = 'tenant-a', other = 'tenant-b';
const noLlm = async () => { throw new Error('provider forbidden'); };

function fixture() {
  const mk = (t: string, id: string, date: string): Sessions => ({ _id: id, tenantId: t, sourceId: `source-${id}`, title: `Session ${id}`, date, status: { transcribe: 'done', index: 'done' } });
  const sessions = [{ ...mk(tenant, 'a', '2025-01-01'), org: 'Outreach Org' }, mk(tenant, 'b', '2026-01-01'), mk(tenant, 'c', '2026-02-01'), mk(tenant, 'd', '2026-03-01'), mk(tenant, 'e', '2026-04-01'), mk(other, 'z', '2026-05-01')];
  const mkPage = (t: string, id: string, summary: string): SessionPages => ({ _id: `page-${id}`, tenantId: t, sessionId: id, summary, evidence: [{ sessionId: id, turnId: `turn-${id}` }] });
  const pages = [mkPage(tenant, 'a', 'AlphaMarker guidance on law careers.'), mkPage(tenant, 'b', 'BetaMarker guidance on visas.'),
    mkPage(tenant, 'c', 'GammaSecret rejected transcript.'), mkPage(tenant, 'd', 'DeltaSecret withdrawn consent.'), mkPage(other, 'z', 'OtherTenantSecret text.')];
  const turns: Turns[] = pages.map(p => ({ _id: `turn-${p.sessionId}`, tenantId: p.tenantId, sessionId: p.sessionId, text: p.summary!, speakerRef: 's', tStart: 0, tEnd: 1 }));
  const rows: Record<string, Row[]> = { sessions: sessions as unknown as Row[], session_pages: pages as unknown as Row[],
    sources: sessions.map(s => ({ _id: s.sourceId, tenantId: s.tenantId, kind: 'recording', path: `${s._id}.wav`, consent: { given: true } })),
    turns: turns as unknown as Row[], tree_index: [], transcript_reviews: [], whatsapp_candidates: [], whatsapp_review_log: [], claims: [], graph_edges: [] };
  rows.turns = rows.turns!.filter(t => t.sessionId !== 'c'); // c: transcript identity invalid
  rows.sources!.find(s => s._id === 'source-d')!.consent = { given: false }; // d: not visible
  const matches = (row: Row, filter: Row) => Object.entries(filter).every(([key, expected]) => row[key] === expected);
  const db = { client: { startSession() { return { async withTransaction<T>(run: () => Promise<T>) { return run(); }, async endSession() {}, inTransaction() { return false; } }; } },
    collection(name: string) { return {
      async findOne(filter: Row) { return structuredClone(rows[name]?.find(row => matches(row, filter)) ?? null); },
      find(filter: Row) { return { async toArray() { return structuredClone(rows[name]?.filter(row => matches(row, filter)) ?? []); } }; },
    }; } } as unknown as Db;
  return { sessions, pages, rows, db };
}
type F = ReturnType<typeof fixture>;

/** Build and store the tenant root from eligible input only, as indexing does. */
async function storeEligibleRoot(f: F) {
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, null);
  const built = await buildTopicIndex(tenant, eligible.sessions, eligible.pages, noLlm, { enabled: false });
  const root = { ...built.root!, tenantId: tenant } as TreeIndexRootDocument;
  f.rows.tree_index = [root as unknown as Row];
  return root;
}
type N = { node_id: string; children: N[] };
const hasSession = (n: N, id: string): boolean => n.node_id.endsWith(`/session:${id}`) || n.children.some(c => hasSession(c, id));

test('mixed input: eligible sessions build the tree, excluded ones are counted by category and never cited', async () => {
  const f = fixture();
  const root = await storeEligibleRoot(f);
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, root);
  assert.deepEqual(eligible.sessions.map(s => s._id), ['a', 'b']);
  assert.equal(eligible.existingRoot, root, 'a tree of only eligible sessions is retained though other sessions are ineligible');
  assert.deepEqual(eligible.excluded, { total: 3, reasons: { 'transcript-mismatch': 1, 'not-visible': 1, 'no-page': 1 } });
  const { tree, excluded } = await trustedTreeReads(() => f.db).loadWithExclusions!(tenant);
  assert.ok(tree && hasSession(tree as unknown as N, 'a') && hasSession(tree as unknown as N, 'b'));
  for (const gone of ['c', 'd', 'e']) assert.equal(hasSession(tree as unknown as N, gone), false, gone);
  const text = JSON.stringify(tree);
  for (const secret of ['GammaSecret', 'DeltaSecret', 'OtherTenantSecret']) assert.ok(!text.includes(secret), secret);
  assert.equal(excluded.total, 3);
  assert.deepEqual(treeSearch(tree!, [`${tenant}/year:2026/month:02/session:c`]), []);
  assert.ok(!JSON.stringify(excluded).includes('"c"') && !JSON.stringify(excluded).includes('source-'), 'counts only, no ids');
});

test('zero eligible sessions: no tree even though a root is cached', async () => {
  const f = fixture();
  const root = await storeEligibleRoot(f);
  f.rows.turns = []; // every transcript now invalid
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, root);
  assert.equal(eligible.sessions.length, 0);
  assert.equal(eligible.existingRoot, undefined);
  assert.equal((await trustedTreeReads(() => f.db).loadWithExclusions!(tenant)).tree, null);
});

test('a cached root that cites a now-ineligible session is not served and is rebuilt without it', async () => {
  const f = fixture();
  f.rows.turns!.push({ _id: 'turn-c', tenantId: tenant, sessionId: 'c', text: 'GammaSecret rejected transcript.', speakerRef: 's', tStart: 0, tEnd: 1 });
  const wasEligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, null);
  assert.deepEqual(wasEligible.sessions.map(s => s._id), ['a', 'b', 'c']);
  const built = await buildTopicIndex(tenant, wasEligible.sessions, wasEligible.pages, noLlm, { enabled: false });
  const stale = { ...built.root!, tenantId: tenant } as TreeIndexRootDocument;
  f.rows.tree_index = [stale as unknown as Row];
  assert.ok(hasSession(stale as unknown as N, 'c'));
  f.rows.turns = f.rows.turns!.filter(t => t.sessionId !== 'c'); // c becomes ineligible
  const now = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, stale, { rebuildOnNewEligible: ['a'] });
  assert.equal(now.existingRoot, undefined, 'stale root must not be reused');
  const loaded = await trustedTreeReads(() => f.db).loadWithExclusions!(tenant);
  assert.equal(loaded.tree, null, 'and is not served by the read path');
  const rebuilt = await buildTopicIndex(tenant, now.sessions, now.pages, noLlm, { enabled: false, existingRoot: now.existingRoot, changedSessionIds: ['a'] });
  assert.equal(hasSession(rebuilt.root as unknown as N, 'c'), false);
  assert.ok(!JSON.stringify(rebuilt.root).includes('GammaSecret'));
});

test('a session that became eligible forces an index-time rebuild but does not block reads', async () => {
  const f = fixture();
  const root = await storeEligibleRoot(f);
  f.pages.push({ _id: 'page-e', tenantId: tenant, sessionId: 'e', summary: 'EpsilonMarker new page.', evidence: [{ sessionId: 'e', turnId: 'turn-e' }] });
  f.rows.session_pages = f.pages as unknown as Row[];
  f.rows.turns!.push({ _id: 'turn-e', tenantId: tenant, sessionId: 'e', text: 'EpsilonMarker new page.', speakerRef: 's', tStart: 0, tEnd: 1 });
  const read = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, root);
  assert.equal(read.existingRoot, root, 'reads still serve the safe cached tree');
  assert.equal(read.excluded.total, 2);
  const write = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, root, { rebuildOnNewEligible: ['a'] });
  assert.equal(write.existingRoot, undefined, 'index write must rebuild so e is included');
  const own = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, root, { rebuildOnNewEligible: ['e'] });
  assert.equal(own.existingRoot, root, 'the session being indexed is the intended change, not a stale gap');
});

test('tenant isolation: another tenant sees neither this tenant tree nor its exclusion counts', async () => {
  const f = fixture();
  await storeEligibleRoot(f);
  const b = await eligibleTreeInput(f.db, other, f.sessions, f.pages, null);
  assert.deepEqual(b.excluded, { total: 0, reasons: {} });
  assert.deepEqual(b.sessions.map(s => s._id), ['z']);
  const loaded = await trustedTreeReads(() => f.db).loadWithExclusions!(other);
  assert.equal(loaded.tree, null, 'tenant-b has no stored root of its own');
  assert.ok(!JSON.stringify(loaded).includes('AlphaMarker'));
});

test('POST /ask and GET /graph report excludedSessions with reason counts and no ids; zero eligible stays 404', async () => {
  const f = fixture();
  await storeEligibleRoot(f);
  const base = buildTestDeps({ keyStore: fakeKeyStore({ k: { tenantId: tenant, scopes: ['ask', 'graph'] } }) });
  base.ask.tree = trustedTreeReads(() => f.db);
  base.graph = trustedGraphReads(() => f.db);
  const server = await startTestServer(base);
  const headers = { 'content-type': 'application/json', authorization: 'Bearer k' };
  try {
    const ask = await fetch(server.baseUrl + '/ask', { method: 'POST', headers, body: JSON.stringify({ query: 'law careers' }) });
    assert.equal(ask.status, 200);
    const body = await ask.json() as Record<string, unknown>;
    assert.equal(body.excludedSessions, 3);
    assert.deepEqual(body.exclusionReasons, { 'transcript-mismatch': 1, 'not-visible': 1, 'no-page': 1 });
    assert.ok(!JSON.stringify(body).includes('GammaSecret'));
    const graph = await fetch(server.baseUrl + '/graph', { headers });
    assert.equal(graph.status, 200);
    const g = await graph.json() as Record<string, unknown>;
    assert.equal(g.excludedSessions, 3);
    const gtext = JSON.stringify(g);
    for (const secret of ['GammaSecret', 'DeltaSecret', 'session:c', 'session:d']) assert.ok(!gtext.includes(secret), secret);
    f.rows.turns = [];
    const none = await fetch(server.baseUrl + '/ask', { method: 'POST', headers, body: JSON.stringify({ query: 'law careers' }) });
    assert.equal(none.status, 404);
    assert.equal((await fetch(server.baseUrl + '/graph', { headers })).status, 404);
  } finally { await server.close(); }
});

test('an org node titled from the session org field is retained; a tampered org title is not', async () => {
  const f = fixture();
  const root = await storeEligibleRoot(f);
  const orgs: N[] = []; const find = (n: N): void => { if (n.node_id.includes('/org:')) orgs.push(n); n.children.forEach(find); };
  find(root as unknown as N);
  assert.equal(orgs.length, 1, 'the fixture session org produced an org node');
  assert.equal((await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, root)).existingRoot, root);
  (orgs[0] as unknown as { title: string }).title = 'Some Other Org';
  assert.equal((await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, root)).existingRoot, undefined);
});

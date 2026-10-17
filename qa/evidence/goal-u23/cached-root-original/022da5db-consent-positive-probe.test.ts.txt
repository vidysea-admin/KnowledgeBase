import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from 'mongodb';
import type { Sessions, SessionPages, Turns, TreeIndexRootDocument } from '@lkb/core';
import { eligibleTreeInput } from '../../../apps/api/src/indexing/eligible-tree.js';
import { trustedTreeReads } from '../../../apps/api/src/composition/integrations/trusted-readers.js';
import { buildTopicIndex } from '../../../packages/index/src/tree/topic-indexing.js';
import { buildTree } from '../../../packages/index/src/tree/build.js';
import { treeSearch } from '../../../packages/index/src/tree/search.js';

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
  const db = { collection(name: string) { return {
    async findOne(filter: Row) { return structuredClone(rows[name]?.find(row => matches(row, filter)) ?? null); },
    find(filter: Row) { return { async toArray() { return structuredClone(rows[name]?.filter(row => matches(row, filter)) ?? []); } }; },
  }; } } as unknown as Db;
  return { sessions, pages, root, rows, db };
}

async function actualReaderResult(validOldCitation: boolean) {
  const f = fixture(validOldCitation);
  const eligible = await eligibleTreeInput(f.db, tenant, f.sessions, f.pages, f.root);
  let providerCalls = 0;
  const rebuilt = await buildTopicIndex(tenant, eligible.sessions, eligible.pages,
    async () => { providerCalls++; throw new Error('provider forbidden'); },
    { enabled: false, existingRoot: eligible.existingRoot, changedSessionIds: ['new'] });
  assert.ok(rebuilt.root, 'indexer must produce a candidate');
  f.rows.tree_index = [{ ...rebuilt.root, tenantId: tenant } as unknown as Row];
  const loaded = await trustedTreeReads(() => f.db).load(tenant);
  const oldId = `${tenant}/year:2025/month:01/session:old`;
  const resolved = loaded ? treeSearch(loaded, [oldId, `${oldId}/topic:cachedsecret`]) : [];
  console.log(JSON.stringify({ validOldCitation, eligiblePages: eligible.pages.map(p => p.sessionId),
    retainedRoot: Boolean(eligible.existingRoot), loadedMarker: JSON.stringify(loaded).includes(marker),
    resolvedMarker: JSON.stringify(resolved).includes(marker), providerCalls }));
  assert.equal(providerCalls, 0);
  return { loaded, resolved, eligible };
}

test('positive control: valid cited old-year knowledge remains readable without inference', async () => {
  const out = await actualReaderResult(true);
  assert.equal(out.eligible.pages.length, 2);
  assert.ok(JSON.stringify(out.loaded).includes(marker));
  assert.ok(JSON.stringify(out.resolved).includes(marker));
});

test('security regression: rejected old-page citation cannot survive cached parent/year through actual reader', async () => {
  const out = await actualReaderResult(false);
  assert.deepEqual(out.eligible.pages.map(p => p.sessionId), ['new']);
  assert.ok(!JSON.stringify(out.loaded).includes(marker), 'actual trustedTreeReads exposes rejected cached summary/topic or parent summary');
  assert.ok(!JSON.stringify(out.resolved).includes(marker), 'actual treeSearch resolves rejected cached topic/session text');
});

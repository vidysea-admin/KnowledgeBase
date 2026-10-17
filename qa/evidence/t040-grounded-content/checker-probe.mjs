import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from '../../../apps/api/node_modules/express/index.js';
import { MongoClient } from '../../../packages/db/node_modules/mongodb/lib/index.js';
import { connect, close } from '../../../packages/db/src/client.ts';
import { createGroundedContentDeps } from '../../../apps/api/src/grounded-content/reader.ts';
import { createGroundedContentRouter } from '../../../apps/api/src/grounded-content/router.ts';
import { installDom } from '../../../.cache/coordination/safe-test-runtime/react-harness.mjs';
import { createRequire } from 'node:module';

test('real store -> projection -> real panel, source-bound sample and two-tenant filters', async () => {
  const launch = Date.now(), queries = [];
  const raw = JSON.parse(readFileSync(new URL('../../../data/toc-migrated/2026-10-13-zoom-webinar-p2/turns.json', import.meta.url)));
  const sourceTurn = raw.find(t => typeof t.text === 'string' && t.text.length > 20);
  assert.ok(sourceTurn);
  const sid = 'sample';
  const turn = { ...sourceTurn, tenantId: 'a', sessionId: sid, _id: 'actual-source', speakerRef: 'anonymous' };
  const ref = { turnId: turn._id, sessionId: sid, quote: turn.text };
  const session = { _id: sid, tenantId: 'a', sourceId: 'src', title: 'Sample', date: '2026-10-14', status: { transcribe: 'done', index: 'done' } };
  const page = { _id: 'page', tenantId: 'a', sessionId: sid, summary: turn.text, evidence: [ref], citedItems: [{ id: 'n', kind: 'insight', text: turn.text, origin: 'speaker-statement', verification: 'unverified', evidence: [ref] }], qa: [{ id: 'q', question: turn.text, questionEvidence: [ref], answer: turn.text, answerEvidence: [ref], status: 'answered' }], privateToken: 'must-not-project' };
  const claim = { _id: 'c', tenantId: 'a', text: turn.text, status: 'verified', evidence: [ref] };
  const rows = { sessions: [session], session_pages: [page], claims: [claim], turns: [turn] };
  for (const [name, records] of Object.entries(rows)) records.push({ ...records[0], tenantId: 'b', ...(name === 'turns' ? { text: 'FOREIGN SENTINEL' } : {}) });
  const matches = (row, f) => Object.entries(f).every(([k, v]) => k === 'evidence.sessionId' ? row.evidence.some(e => e.sessionId === v) : row[k] === v);
  const fakeDb = { collection(name) { return { findOne: async f => { queries.push({ name, f }); return rows[name].find(r => matches(r, f)) ?? null; }, find(f) { queries.push({ name, f }); return { toArray: async () => rows[name].filter(r => matches(r, f)) }; } }; } };
  const saved = { connect: MongoClient.prototype.connect, db: MongoClient.prototype.db, close: MongoClient.prototype.close };
  MongoClient.prototype.connect = async function () { return this; };
  MongoClient.prototype.db = function () { return fakeDb; };
  MongoClient.prototype.close = async function () {};
  let ui, previousFetch = globalThis.fetch;
  try {
    await connect('mongodb://127.0.0.1:27017', 'hermetic-only');
    const { createMongoBrainReadDeps } = await import('../../../apps/api/src/store.ts');
    const deps = createGroundedContentDeps(createMongoBrainReadDeps());
    const data = await deps.getGroundedContent('a', sid);
    assert.equal(data.notes[0].text, turn.text); assert.equal(data.qa[0].answerEvidence[0].available, true);
    assert.equal(data.notes[0].evidence[0].tStart, turn.tStart); assert.equal(data.claims[0].status, 'verified');
    assert.ok(queries.every(q => q.f.tenantId === 'a')); assert.equal(queries.length, 4);
    assert.ok(!JSON.stringify(data).includes('FOREIGN SENTINEL')); assert.ok(!JSON.stringify(data).includes('must-not-project'));
    const foreign = await deps.getGroundedContent('b', sid);
    assert.equal(foreign.notes[0].evidence[0].available, false);
    queries.length = 0;
    const app = express(); app.use((req, res, next) => { req.auth = { tenantId: { $ne: null }, scopes: ['sessions'] }; next(); }); app.use(createGroundedContentRouter(deps)); app.use((err, req, res, next) => res.status(500).json({ error: 'refused' }));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    try { assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/sessions/sample/grounded-content`)).status, 500); assert.equal(queries.length, 0); }
    finally { await new Promise(resolve => server.close(resolve)); }
    turn.text = 'replacement no longer supports former quote';
    const stale = await deps.getGroundedContent('a', sid);
    assert.equal(stale.notes[0].evidence[0].available, false); assert.equal(stale.notes[0].evidence[0].tStart, null);
    ui = installDom(); const wr = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
    const { MemoryRouter } = wr('react-router-dom'); const { GroundedContentPanel } = await import('../../../apps/web/src/pages/sessions/grounded/GroundedContentPanel.tsx');
    globalThis.fetch = async () => new Response(JSON.stringify(data), { status: 200 });
    ui.render(ui.React.createElement(MemoryRouter, {}, ui.React.createElement(GroundedContentPanel, { apiKey: 'key', sessionId: sid })));
    await ui.screen.findByText('Answer evidence · Unverified'); assert.ok(ui.screen.getByText('Question evidence'));
    assert.equal(ui.screen.getAllByRole('link')[0].getAttribute('href'), '/sessions/sample#turn-actual-source');
    console.log(JSON.stringify({ sample: sourceTurn._id, quoteChars: ref.quote.length, tenantFilters: 4, bypassInvalidTenantReads: 0, staleRefUnavailable: true, elapsedMs: Date.now() - launch }));
  } finally { globalThis.fetch = previousFetch; ui?.cleanup(); await close(); Object.assign(MongoClient.prototype, saved); }
});

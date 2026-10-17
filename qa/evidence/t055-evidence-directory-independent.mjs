import assert from 'node:assert/strict';
import { buildKnowledgeGraph } from '../../packages/index/src/graph/build-graph.ts';
import { buildKnowledgeDirectory } from '../../apps/web/src/pages/knowledge/knowledgeDirectoryModel.ts';

const sessions = [
  { _id: 's /#one', title: '<img src=x>', date: '2026-10-14', status: { transcribe: 'done', index: 'done' } },
  { _id: 's-two', title: '2026-10-01 title is not a recorded date', date: '', status: { transcribe: 'done', index: 'done' } },
];
const sources = [{ _id: 'source', kind: 'document', captureMode: 'provided', createdAt: '', path: 'C:/private/SECRET' }];
const rows = [
  { from: 'topic:visas', to: 'person:alice', type: 'discussed', sessionRef: sessions[0]._id, confidence: 0.7, evidence: [{ turnId: 't /#one' }] },
  { from: 'topic:visas', to: `session:${sessions[0]._id}`, type: 'present_in', confidence: 1, evidence: [{ turnId: 'endpoint' }] },
];
const graph = buildKnowledgeGraph({ treeRoot: null, entityEdges: rows, sessions });
let count = 0;
const check = (name, fn) => { fn(); count++; process.stdout.write(`PASS ${name}\n`); };
const model = buildKnowledgeDirectory(sessions, sources, graph, 'topic:visas');
check('actual producer inherited evidence ownership and canonical entities', () => {
  assert.equal(model.relationships[0].evidence[0].href, '/sessions/s%20%2F%23one#turn-t%20%2F%23one');
  assert.equal(model.relationships[1].evidence[0].href, '/sessions/s%20%2F%23one#turn-endpoint');
  assert.equal(model.relationships[0].edge.inferred, true);
  assert.equal(model.relationships[1].edge.inferred, false);
  assert.equal(model.relationships[0].edge.origin, 'graph_edges');
});
check('sampled graph coverage, dates and local path omission', () => {
  assert.equal(model.missingGraphSessions, 1);
  assert.equal(model.stats.sessionsTotal, 2);
  assert.deepEqual(new Set(model.collections.map(row => row.label)), new Set(['2026-10', 'Date unavailable']));
  assert.equal(JSON.stringify(model.resources).includes('SECRET'), false);
  assert.equal(model.resources[0].href, null);
});
for (const name of ['conflicting explicit', 'unknown', 'missing', 'contradictory endpoint', 'two incident sessions']) {
  check(`refuse ${name}`, () => {
    const bad = structuredClone(graph), edge = bad.edges[0];
    if (name === 'conflicting explicit') edge.evidence[0].sessionId = 's-two';
    if (name === 'unknown') { edge.sessionRef = 'unknown'; edge.evidence[0].sessionId = 'unknown'; }
    if (name === 'missing') { delete edge.sessionRef; delete edge.evidence[0].sessionId; }
    if (name === 'contradictory endpoint') edge.target = 'session:s-two';
    if (name === 'contradictory endpoint') bad.nodes.push({ id: 'session:s-two', kind: 'session', ref: 's-two', label: 'Two', sources: ['graph_edges'] });
    if (name === 'two incident sessions') {
      delete edge.sessionRef; delete edge.evidence[0].sessionId;
      bad.nodes.push({ id: 'session:s-two', kind: 'session', ref: 's-two', label: 'Two', sources: ['graph_edges'] });
      edge.source = `session:${sessions[0]._id}`; edge.target = 'session:s-two';
    }
    const selected = name === 'two incident sessions' ? edge.source : 'topic:visas';
    assert.equal(buildKnowledgeDirectory(sessions, sources, bad, selected).relationships[0].evidence[0].href, null);
  });
}
for (const url of ['javascript:alert(1)', 'file:///C:/private/x', 'https://a:b@example.com/', 'https://example.com/\u0000', ' https://example.com/', '//example.com']) {
  check(`unsafe URL ${JSON.stringify(url)}`, () => assert.equal(buildKnowledgeDirectory(sessions, [{ ...sources[0], url }], graph).resources[0].href, null));
}
check('safe public URL preserved', () => assert.equal(buildKnowledgeDirectory(sessions, [{ ...sources[0], url: 'https://example.com/a?q=x#part' }], graph).resources[0].href, 'https://example.com/a?q=x#part'));
check('invalid recorded date refuses normalization', () => assert.equal(buildKnowledgeDirectory([{ ...sessions[0], date: '2026-02-30' }], [], graph).collections[0].label, 'Date unavailable'));
process.stdout.write(`Independent actual-producer probes: ${count}/${count} passed\n`);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicIndex } from '../../../packages/index/src/tree/topic-indexing.js';
import { buildTree } from '../../../packages/index/src/tree/build.js';
import { promoteTreeEntities } from '../../../packages/index/src/tree/promote-entities.js';
import type { Sessions, SessionPages, TreeIndexNode } from '@lkb/core';
import type { CompleteResult } from '@lkb/ai';

const s = (id: string, tenantId = 'a', date = '2026-02-01'): Sessions => ({
  _id: id, tenantId, date, sourceId: 'src', title: id,
  status: { transcribe: 'done', index: 'done' },
});
const p = (id: string, summary: string, tenantId = 'a'): SessionPages => ({
  _id: 'same-page', tenantId, sessionId: id, summary,
  evidence: [{ sessionId: id, turnId: 't1' }],
});
const reply = (json: unknown): CompleteResult => ({
  json, text: '', provider: 'checker-injected', model: 'none',
  usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0,
});

test('foreign changed IDs preserve own root without inference in regex mode', async () => {
  const sessions = [s('own')], pages = [p('own', 'Student Visa')];
  const root = buildTree(sessions, pages).a!;
  let calls = 0;
  const output = await buildTopicIndex('a', [...sessions, s('foreign', 'b')],
    [...pages, p('foreign', 'FOREIGN SECRET', 'b')], async () => { calls++; return reply([]); },
    { enabled: false, existingRoot: root, changedSessionIds: ['foreign'] });
  assert.equal(output.root, root);
  assert.equal(calls, 0);
  assert.equal(output.results.size, 0);
});

test('foreign cache ID collisions cannot cause refusal or disclosure', async () => {
  const seen: string[] = [];
  const output = await buildTopicIndex('a', [s('own'), s('own', 'b')],
    [p('own', 'FOREIGN SECRET', 'b'), p('own', 'Student Visa')],
    async (job) => { seen.push(job.messages[1]!.content); return reply(['Student Visa']); }, { enabled: true });
  assert.deepEqual(seen, ['Student Visa']);
  assert.equal(output.results.size, 1);
  assert.deepEqual(promoteTreeEntities(output.root!).topics,
    [{ _id: 'student-visa', name: 'Student Visa', sessionRefs: ['own'] }]);
});

test('bad single and plural evidence refuse without inference or input mutation', async () => {
  const sessions = [s('own')], pages = [p('own', 'Student Visa')];
  let calls = 0;
  for (const evidence of [{ sessionRef: 'foreign' }, { sessionRefs: ['own', 'foreign'] }]) {
    const root = structuredClone(buildTree(sessions, pages).a!);
    const leaf = root.children[0]!.children[0]!.children[0]!.children[0]!;
    leaf.evidence = evidence;
    const bytes = JSON.stringify(root);
    await assert.rejects(buildTopicIndex('a', sessions, pages, async () => { calls++; return reply([]); },
      { enabled: true, existingRoot: root }), /unresolved session evidence/);
    assert.equal(JSON.stringify(root), bytes);
  }
  assert.equal(calls, 0);
});

test('all-year refresh removes old heuristic topics and preserves precise shared refs', async () => {
  const sessions = [s('old', 'a', '2025-01-01'), s('new')];
  const pages = [p('old', 'Student Visa and Old Topic'), { ...p('new', 'Student Visa and New Topic'), _id: 'page-new' }];
  const root = buildTree(sessions, pages).a!;
  const before = JSON.stringify(root);
  const output = await buildTopicIndex('a', sessions, pages,
    async (job) => reply(job.messages[1]!.content.includes('Old Topic') ? ['Student Visa', 'Old Topic'] : ['Student Visa']),
    { enabled: true, existingRoot: root, changedSessionIds: ['new'] });
  assert.deepEqual(promoteTreeEntities(output.root!).topics,
    [{ _id: 'old-topic', name: 'Old Topic', sessionRefs: ['old'] },
      { _id: 'student-visa', name: 'Student Visa', sessionRefs: ['new', 'old'] }]);
  assert.equal(JSON.stringify(root), before);
});

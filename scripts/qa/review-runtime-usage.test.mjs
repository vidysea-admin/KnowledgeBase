import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TOKEN_FIELDS, readSession, snapshot, phaseDelta, writeReceipt } from './review-runtime-usage.mjs';

const time = '2026-10-15T10:00:00Z';
const counts = n => Object.fromEntries(TOKEN_FIELDS.map(k => [k, n]));
const events = (id, name, n, complete = true) => [
  { timestamp: time, type: 'session_meta', payload: { id, parent_thread_id: 'parent', source: { subagent: { thread_spawn: { agent_path: name } } }, base_instructions: 'PRIVATE_BODY_SENTINEL' } },
  { timestamp: time, type: 'event_msg', payload: { type: 'task_started' } },
  { timestamp: time, type: 'response_item', payload: { content: 'PRIVATE_BODY_SENTINEL' } },
  { timestamp: time, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: counts(n) } } },
  ...(complete ? [{ timestamp: time, type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'PRIVATE_BODY_SENTINEL' } }] : []),
].map(x => JSON.stringify(x)).join('\n') + '\n';
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'runtime-public-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'session.jsonl');
  const take = async (n, boundary = 'baseline', complete = true) => { await writeFile(file, events('child', '/root/checker/child', n, complete)); return snapshot({ unit: 'public-fixture', cycle: 0, phase: 'review', boundary, agentPrefix: '/root/checker', sessions: [file, file] }); };
  return { root, file, take };
}
test('metadata allowlist, deduplication, cumulative phase delta and downstream receipt', async t => {
  const f = await fixture(t), a = await f.take(10), b = await f.take(13, 'end');
  const report = phaseDelta(a, b);
  assert.equal(a.records.length, 1); assert.equal(report.status, 'known');
  assert.equal(report.advisory.actual_total_tokens, 3);
  assert.equal(report.actual_tokens.input_tokens, 3);
  assert.equal(report.active_seconds, null); assert.equal(report.monetary_cost, null);
  const output = path.join(f.root, 'receipt.json'); await writeReceipt(f.root, output, report);
  const text = await readFile(output, 'utf8'); assert.equal(text.includes('PRIVATE_BODY_SENTINEL'), false);
  assert.equal(JSON.parse(text).actual_tokens.total_tokens, 3);
  await assert.rejects(writeReceipt(f.root, output, report));
});
test('reset, inflight, missing baseline and malformed tail are unknown', async t => {
  const f = await fixture(t), a = await f.take(10);
  assert.equal(phaseDelta(a, await f.take(9, 'end')).actual_tokens, null);
  assert.equal(phaseDelta(a, await f.take(11, 'end', false)).status, 'unknown');
  const b = await f.take(12, 'end');
  assert.equal(phaseDelta({ ...a, records: [] }, b).status, 'unknown');
  await writeFile(f.file, events('child', '/root/checker/child', 12) + '{partial');
  const broken = await snapshot({ unit: 'public-fixture', cycle: 0, phase: 'review', boundary: 'end', agentPrefix: '/root/checker', sessions: [f.file] });
  assert.equal(phaseDelta(a, broken).status, 'unknown');
});
test('prefix boundary excludes siblings; retries/children aggregate by thread identity', async t => {
  const f = await fixture(t), sibling = path.join(f.root, 'sibling.jsonl'), retry = path.join(f.root, 'retry.jsonl');
  await writeFile(sibling, events('sibling', '/root/checker-other', 100));
  await writeFile(retry, events('retry', '/root/checker/retry', 5));
  await f.take(10);
  const scope = { unit: 'public-fixture', cycle: 0, phase: 'review', agentPrefix: '/root/checker', sessions: [f.file, sibling, retry] };
  const a = await snapshot({ ...scope, boundary: 'baseline' });
  await f.take(13); await writeFile(retry, events('retry', '/root/checker/retry', 7));
  const b = await snapshot({ ...scope, boundary: 'end' });
  assert.equal(b.records.length, 2); assert.equal(phaseDelta(a, b).actual_tokens.total_tokens, 5);
  assert.throws(() => phaseDelta(a, { ...b, cycle: 1 }));
  assert.throws(() => phaseDelta(a, { ...b, records: [...b.records, b.records[0]] }));
});
test('explicit output refuses outside workspace and symlinked parent', async t => {
  const f = await fixture(t), outside = await mkdtemp(path.join(tmpdir(), 'runtime-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await assert.rejects(writeReceipt(f.root, path.join(outside, 'receipt.json'), {}), /outside_workspace/);
  await assert.rejects(writeReceipt(f.root, 'relative.json', {}), /absolute/);
  const linked = path.join(f.root, 'linked');
  await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(writeReceipt(f.root, path.join(linked, 'receipt.json'), {}), /outside_workspace/);
});
test('actual sanitized runtime metadata accepts ordinal and arbitrary envelope/payload ordering', async t => {
  // Derived from actual dedicated-checker metadata; IDs/path aliased, counters and
  // timestamps/ordinal preserved. No response, tool or instruction bodies copied.
  const fixturePath = new URL('../../qa/fixtures/review-runtime-usage-ordinal.jsonl', import.meta.url);
  const actual = await readSession(fixturePath);
  assert.equal(actual.status, 'known');
  assert.equal(actual.identity.agent_path, '/root/public-fixture');
  assert.equal(actual.cumulative_tokens.total_tokens, 614949);
  const f = await fixture(t);
  const source = (await readFile(fixturePath, 'utf8')).trim().split('\n').map(JSON.parse);
  const reordered = source.map(event => {
    const p = event.payload;
    const payload = event.type === 'session_meta'
      ? { agent_path: p.agent_path, parent_thread_id: p.parent_thread_id, id: p.id }
      : { ...(p.info ? { info: p.info } : {}), type: p.type };
    return ` \t${JSON.stringify({ payload, ordinal: event.ordinal, type: event.type, timestamp: event.timestamp })} \t`;
  }).join('\n');
  // A nested metadata-looking type in an unrelated event is never identity.
  const unrelated = { type: 'response_item', payload: { type: 'session_meta', id: 'forged', agent_path: '/root/forged', body: 'PRIVATE_BODY_SENTINEL' } };
  await writeFile(f.file, reordered + '\n' + JSON.stringify(unrelated) + '\n');
  assert.deepEqual(await readSession(f.file), actual);
});

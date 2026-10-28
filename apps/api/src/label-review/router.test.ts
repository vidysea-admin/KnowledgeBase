import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { requireAuth } from '../auth.js';
import { createReviewAdapters, createReviewPolicyResolver } from '../review-authority/policy.js';
import { createLabelReviewRouter } from './router.js';
import { createFileLabelReviewStore } from './store.js';
import { makeProject } from './fixture.js';
import type { LabelReviewView } from './types.js';

const grants = (tenantId: string) => ({ tenantId, keys: [
  { keyId: `human-${tenantId}`, subject: `trusted-${tenantId}`, reviewerKind: 'human', canPropose: false, canReview: true, answerActions: [] },
  { keyId: 'robot', subject: 'robot', reviewerKind: 'automation', canPropose: true, canReview: false, answerActions: [] }] });

async function boot() {
  const p = await makeProject();
  const store = createFileLabelReviewStore({ root: p.reviews, projectRoot: p.project, now: () => '2026-10-19T10:00:00.000Z' });
  const policy = createReviewAdapters(createReviewPolicyResolver(JSON.stringify({ version: 1, tenants: [grants('toc'), grants('other')] })));
  const tenantOf = (key: string) => key.endsWith('other') ? 'other' : 'toc';
  const app = express(); app.use(express.json());
  app.use(requireAuth({ verify: async key => ['human-toc', 'human-other', 'robot', 'noscope', 'robot-other'].includes(key) ? { tenantId: tenantOf(key), keyId: key === 'robot-other' ? 'robot' : key, scopes: key === 'noscope' ? [] : ['compete'] } : null }));
  app.use(createLabelReviewRouter({ store, contextFor: policy.relationshipContextFor }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const call = (path: string, key?: string, body?: unknown) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { call, stop: async () => { await new Promise<void>((r, j) => server.close(e => e ? j(e) : r())); await rm(p.base, { recursive: true, force: true }); } };
}

test('authentication, scope and trusted-human identity are required on every route', async () => {
  const t = await boot();
  try {
    const routes: [string, unknown][] = [['/label-review', undefined], ['/label-review/items/u22:c-high/accept', { expectedRevision: 0, inputSha256: 'x' }],
      ['/label-review/items/u22:c-high/override', { expectedRevision: 0, inputSha256: 'x', label: 'supported' }], ['/label-review/accept-high-confidence', {}]];
    for (const [path, body] of routes) {
      assert.equal((await t.call(path, undefined, body)).status, 401, path);
      assert.equal((await t.call(path, 'nope', body)).status, 401, path);
      assert.equal((await t.call(path, 'noscope', body)).status, 403, path);
      assert.equal((await t.call(path, 'robot', body)).status, 403, path);
    }
    const ok = await t.call('/label-review', 'human-toc'); assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'private, no-store');
    assert.equal((await t.call('/label-review?x=1', 'human-toc')).status, 400);
  } finally { await t.stop(); }
});

test('accept over HTTP cannot create human or humanGold labels even when the body asks for it', async () => {
  const t = await boot();
  try {
    const v0 = await (await t.call('/label-review', 'human-toc')).json() as LabelReviewView;
    const item = v0.items.find(i => i.id === 'u22:c-high')!;
    const r = await t.call(`/label-review/items/${encodeURIComponent(item.id)}/accept`, 'human-toc', { expectedRevision: 0, inputSha256: item.inputSha256,
      labelSource: 'human', humanGold: true, reviewedBy: 'someone-else', label: 'unsupported', tenantId: 'other', reviewedAt: '1999-01-01T00:00:00.000Z' });
    assert.equal(r.status, 200); const v = await r.json() as LabelReviewView, e = v.items.find(i => i.id === item.id)!;
    assert.equal(e.effective.labelSource, 'ai-consensus'); assert.equal(e.effective.label, 'supported'); assert.equal(e.effective.reviewedBy, 'trusted-toc');
    assert.equal(e.effective.reviewedAt, '2026-10-19T10:00:00.000Z'); assert.equal(v.humanGold, false); assert.ok(!JSON.stringify(v).includes('"humanGold":true'));
    const o = await t.call(`/label-review/items/${encodeURIComponent('u22:c-null')}/override`, 'human-toc', { expectedRevision: 0, inputSha256: v0.items.find(i => i.id === 'u22:c-null')!.inputSha256, label: 'unsupported', note: 'ok', humanGold: true, reviewedBy: 'x' });
    const ovView = await o.json() as LabelReviewView, ov = ovView.items.find(i => i.id === 'u22:c-null')!;
    assert.equal(ov.effective.labelSource, 'human'); assert.equal(ov.effective.reviewedBy, 'trusted-toc'); assert.equal(ovView.humanGold, false);
    assert.equal((await t.call(`/label-review/items/${encodeURIComponent('u22:c-high')}/accept`, 'human-toc', { expectedRevision: 0, inputSha256: item.inputSha256 })).status, 409);
    assert.equal((await t.call('/label-review/items/u22:c-medium/accept', 'human-toc', { expectedRevision: 0 })).status, 400);
  } finally { await t.stop(); }
});

test('tenant scoping over HTTP: another tenant cannot read, accept or see a review', async () => {
  const t = await boot();
  try {
    const mine = await (await t.call('/label-review', 'human-toc')).json() as LabelReviewView;
    const theirs = await (await t.call('/label-review', 'human-other')).json() as LabelReviewView;
    assert.deepEqual(theirs.items.map(i => i.id), ['u22:c-foreign']); assert.equal(theirs.tenantId, 'other');
    const item = mine.items.find(i => i.id === 'u22:c-high')!;
    assert.equal((await t.call('/label-review/items/u22:c-high/accept', 'human-other', { expectedRevision: 0, inputSha256: item.inputSha256 })).status, 404);
    const bulk = await (await t.call('/label-review/accept-high-confidence', 'human-toc', { set: 'u22' })).json() as LabelReviewView & { acceptedCount: number };
    assert.equal(bulk.acceptedCount, 1); assert.ok(bulk.items.every(i => i.set === 'u22' || i.revision === 0));
    const after = await (await t.call('/label-review', 'human-other')).json() as LabelReviewView; assert.equal(after.counts.reviewed, 0);
    assert.equal((await t.call('/label-review/accept-high-confidence', 'human-toc', { set: 'bogus' })).status, 400);
  } finally { await t.stop(); }
});

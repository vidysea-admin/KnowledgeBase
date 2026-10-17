import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramAlertSink } from '../../packages/core/src/alerts/alert-sink.js';
import { detectSilentWatchers } from '../../apps/api/src/routes/health.js';

test('ledger reproduction 1 verbatim: detector twice, one stale drive, recording notify fake still sees two calls', async () => {
  const notified: unknown[][] = [];
  const deps = { tenantIds: ['toc'], expectedSourceTypes: ['drive'], intervalMs: 3600000,
    now: () => new Date('2026-10-09T12:00:00Z'),
    listHeartbeats: async () => [{tenantId: 'toc', sourceType: 'drive', lastHeartbeatAt: '2026-10-09T08:00:00Z'}],
    notifyWatchSilent: (...args: unknown[]) => {notified.push(args);},
  };
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 1, unreadable: 0});
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 1, unreadable: 0});
  assert.equal(notified.length, 2);
});

test('independent pending transport: reservation keeps repeated real detector probes isolated by tenant', async () => {
  let time = 0;
  const sent: string[] = [];
  let finish!: () => void;
  const pending = new Promise<void>(resolve => {finish = resolve;});
  const sink = createTelegramAlertSink({token: 'fake', chatId: 'fake', now: () => time,
    send: async (_token, _chat, text) => {sent.push(text); await pending;},
  });
  const deps = {tenantIds: ['toc', 'other'], intervalMs: 3600000,
    now: () => new Date('2026-10-09T12:00:00Z'),
    listHeartbeats: async (tenantId: string) => [{tenantId, sourceType: 'drive', lastHeartbeatAt: '2026-10-09T08:00:00Z'}],
    notifyWatchSilent: sink.notifyWatchSilent,
  };
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 6, unreadable: 0});
  assert.deepEqual(await detectSilentWatchers(deps), {silent: 6, unreadable: 0});
  assert.equal(sent.length, 6);
  assert.equal(new Set(sent).size, 6);
  time = 59999;
  await detectSilentWatchers(deps);
  assert.equal(sent.length, 6);
  time = 60000;
  await detectSilentWatchers(deps);
  assert.equal(sent.length, 12);
  finish();
});

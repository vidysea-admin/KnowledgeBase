import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeakerCloudTransport, createSpeakerSuggestionRouting } from '../../apps/api/src/speaker-routing/routing.ts';

test('checker: real timeout signal expires, using accelerated injected clock only', async () => {
  const original = AbortSignal.timeout;
  const hold = setTimeout(() => {}, 2000);
  let requested;
  AbortSignal.timeout = milliseconds => { requested = milliseconds; return original(5); };
  try {
    const transport = createSpeakerCloudTransport(async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('private timeout echo')), { once: true });
    }));
    await assert.rejects(transport({ kind: 'http', url: 'https://ollama.com/api/chat', method: 'POST', body: {} }), { message: 'speaker cloud request failed' });
    assert.equal(requested, 120000);
  } finally { AbortSignal.timeout = original; clearTimeout(hold); }
});

test('checker: default transport never consumes failed response body, records sanitized attempt', async () => {
  let bodyReads = 0;
  const rows = [];
  const transport = createSpeakerCloudTransport(async () => ({
    ok: false, status: 500,
    json: async () => { bodyReads++; throw new Error('private-token transcript'); },
    text: async () => { bodyReads++; return 'private-token transcript'; },
  }));
  const route = createSpeakerSuggestionRouting(transport, {
    OLLAMA_API_KEY: 'private-token', SPEAKERS_PROPOSER_MODEL: 'deepseek-v4-pro', SPEAKERS_VERIFIER_MODEL: 'gpt-oss:120b',
  }, { tenantId: 'independent-tenant', write: async row => { rows.push(row); } });
  await assert.rejects(route.verifierComplete({ kind: 'speakers', messages: [{ role: 'user', content: 'transcript' }] }), { message: 'speaker cloud request failed' });
  assert.equal(bodyReads, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenantId, 'independent-tenant');
  assert.equal(rows[0].status, 'failed');
  assert.equal(rows[0].error, 'speaker cloud request failed');
  assert.ok(!JSON.stringify(rows).includes('private-token'));
  assert.ok(!JSON.stringify(rows).includes('transcript'));
});

test('checker: nested cloud/latest aliases cannot evade distinct-role refusal', () => {
  let calls = 0;
  const transport = async () => { calls++; throw new Error('unexpected provider call'); };
  for (const alias of ['MODEL:cloud:latest', 'MODEL-cloud:latest', 'MODEL:latest-cloud']) {
    assert.throws(() => createSpeakerSuggestionRouting(transport, {
      OLLAMA_API_KEY: 'offline-key', SPEAKERS_PROPOSER_MODEL: 'model', SPEAKERS_VERIFIER_MODEL: alias,
    }, { tenantId: 'independent-tenant', write: async () => {} }), /distinct/);
  }
  assert.equal(calls, 0);
});

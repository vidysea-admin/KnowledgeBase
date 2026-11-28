// Review 2026-11-27 (fix/prelaunch-transient): a 5xx / 408 / 429 from /webinar-operations during an API redeploy must be a
// TRANSIENT pre-launch failure (the meeting stays queued and retries), never "owner mismatch" which fails the meeting for good.
// A wrong owner header, 401 or 403 stays a hard failure.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPipelineDeps} from './run-pipeline-deps.mjs';
import {isTransientNetworkError} from './scheduler/dispatch.mjs';

async function attempt(status, tenantHeader) {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', {status, headers: tenantHeader ? {'x-lkb-tenant': tenantHeader} : {}});
  try {
    const deps = createPipelineDeps({LKB_API_URL: 'http://api.invalid', LKB_API_KEY: 'k', LKB_TENANT_ID: 'toc'});
    await deps.validateTenant();
    return undefined;
  } catch (error) { return error; } finally { globalThis.fetch = saved; }
}

test('5xx / 408 / 429 from the operations endpoint is transient', async () => {
  for (const [status, header] of [[503, undefined], [502, undefined], [500, 'toc'], [504, undefined], [408, undefined], [429, 'toc']]) {
    const error = await attempt(status, header);
    assert.ok(error, `status ${status} must still refuse this tick`);
    assert.equal(isTransientNetworkError(error), true, `status ${status} must be retried`);
  }
});

test('a wrong owner, 401 or 403 is not transient', async () => {
  for (const [status, header] of [[200, 'other'], [503, 'other'], [401, undefined], [403, 'toc'], [404, undefined]]) {
    const error = await attempt(status, header);
    assert.ok(error, `status ${status}/${header} must refuse`);
    assert.equal(isTransientNetworkError(error), false, `status ${status}/${header} must not be retried`);
  }
});

test('a correct owner on 200 passes', async () => {
  assert.equal(await attempt(200, 'toc'), undefined);
});

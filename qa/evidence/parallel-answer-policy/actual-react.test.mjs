import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installDom } from '../../../.cache/coordination/safe-test-runtime/react-harness.mjs';

const harness = installDom();
const webRequire = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { MemoryRouter } = webRequire('react-router-dom');
const { AuthProvider } = await import('../../../apps/web/src/auth/AuthContext.tsx');
const { AnswerPolicySimulator } = await import('../../../apps/web/src/pages/answer-policy/AnswerPolicySimulator.tsx');
const { React, render, screen, fireEvent, waitFor, cleanupTesting } = harness;
after(() => harness.cleanup());
function payload() {
  return { draft: { policyId: 'browser-draft', version: 1, mode: 'internal-only' },
    simulation: { policyId: 'browser-draft', version: 1, decision: 'review', reason: 'insufficient-coverage', internalSources: 1, webSources: 1 },
    result: { answer: 'Forms open in October.', verdict: 'ambiguous', reason: 'partial', scored: [], auditLog: [],
      insufficient_coverage: true, web_used: true, sources: { internal: [{ node_id: 'n', evidence: { sessionRef: 's1' } }],
        web: [{ url: 'javascript:alert(1)', title: 'Unsafe source' }] } } };
}
function mount() {
  harness.window.localStorage.clear(); harness.window.localStorage.setItem('lkbApiKey', 'test-key');
  render(React.createElement(AuthProvider, null, React.createElement(MemoryRouter, null, React.createElement(AnswerPolicySimulator))));
}
async function withFetch(run, responder = () => Response.json(payload())) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return responder(calls.length); };
  try { await run(calls); } finally { globalThis.fetch = original; cleanupTesting(); }
}
test('actual React/client trims fresh request and separates decision, candidate and safe sources', async () => withFetch(async (calls) => {
  mount(); fireEvent.change(screen.getByLabelText('Question'), { target: { value: ' When? ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simulate policy' }));
  await waitFor(() => assert.ok(screen.getByText('Forms open in October.')));
  assert.equal(calls.length, 1); assert.match(calls[0].url, /\/answer-policy\/simulate$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { query: 'When?', draft: { policyId: 'browser-draft', version: 1, mode: 'internal-only' } });
  assert.equal(new Headers(calls[0].options.headers).get('authorization'), 'Bearer test-key');
  assert.ok(screen.getByRole('heading', { name: 'Policy decision: review' }));
  assert.equal(screen.getByRole('link', { name: 'n' }).getAttribute('href'), '/sessions/s1');
  assert.equal(screen.queryByRole('link', { name: 'Unsafe source' }), null); assert.ok(screen.getByText('Unsafe source'));
  assert.ok(screen.getByText(/Coverage is insufficient/)); assert.ok(screen.getByText('Ask used web sources.'));
}));
test('actual React/client versions local draft changes and clears prior result', async () => withFetch(async (calls) => {
  mount(); fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'When?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simulate policy' }));
  await waitFor(() => assert.ok(screen.getByText('Forms open in October.')));
  fireEvent.change(screen.getByLabelText('Allowed sources'), { target: { value: 'internal-and-web' } });
  assert.equal(screen.queryByText('Forms open in October.'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Simulate policy' }));
  await waitFor(() => assert.equal(calls.length, 2));
  assert.deepEqual(JSON.parse(calls[1].options.body).draft, { policyId: 'browser-draft', version: 2, mode: 'internal-and-web' });
}));
test('actual React/client preserves API error and refuses blank request', async () => withFetch(async (calls) => {
  mount(); assert.equal(screen.getByRole('button', { name: 'Simulate policy' }).disabled, true); assert.equal(calls.length, 0);
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'When?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simulate policy' }));
  await waitFor(() => assert.equal(screen.getByRole('alert').textContent, 'No index available.'));
}, () => Response.json({ error: 'not_found', message: 'No index available.' }, { status: 404 })));

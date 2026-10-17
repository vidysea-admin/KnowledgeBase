import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { installDom } from "../../.cache/coordination/safe-test-runtime/react-harness.mjs";
const h = installDom(), React = h.React;
const { useSendNowStatus, STATUS_REQUEST_MS } = await import("../../apps/web/src/pages/meeting-bot/useSendNowStatus.ts");
const { SendNowForm } = await import("../../apps/web/src/pages/meeting-bot/SendNowForm.tsx");
const { advanceAuthSession, AUTH_INVALIDATED_EVENT, AUTH_KEY_STORAGE_KEY } = await import("../../apps/web/src/api/client.ts");
const ID = "send-now-20261014100000-abcdef", OTHER = "send-now-20261014100001-abcdef";
const originalFetch = globalThis.fetch;
const json = (code, body) => new Response(JSON.stringify(body), { status: code });
const state = (id = ID, status = "running") => json(200, { jobId: id, status, joined: "unknown" });
const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };
const settle = () => h.act(flush);
afterEach(() => { h.cleanupTesting(); globalThis.fetch = originalFetch; window.localStorage.clear(); advanceAuthSession(); });
after(() => h.cleanup());

test("deadline covers response body decoding, not only fetch headers", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); let calls = 0, finish;
  globalThis.fetch = async () => { calls++; return { ok: true, json: () => new Promise(r => { finish = r; }) }; };
  const hook = h.renderHook(() => useSendNowStatus("key", ID)); await settle();
  await h.act(async () => { t.mock.timers.tick(STATUS_REQUEST_MS); await flush(); });
  assert.match(hook.result.current, /Automatic checks stopped.*admission is unknown/);
  await h.act(async () => { finish({ jobId: ID, status: "running", joined: "unknown" }); await flush(); });
  await h.act(async () => { t.mock.timers.tick(120_000); await flush(); });
  assert.equal(calls, 1); assert.doesNotMatch(hook.result.current, /process is alive/);
});

test("late 401 from replaced login cannot clear replacement storage or invalidate its session", async () => {
  let finish; const events = [];
  const listener = e => events.push(e.detail); window.addEventListener(AUTH_INVALIDATED_EVENT, listener);
  try {
    window.localStorage.setItem(AUTH_KEY_STORAGE_KEY, "old");
    globalThis.fetch = () => new Promise(r => { finish = r; });
    const hook = h.renderHook(({ key, id }) => useSendNowStatus(key, id), { initialProps: { key: "old", id: ID } });
    advanceAuthSession(); window.localStorage.setItem(AUTH_KEY_STORAGE_KEY, "new");
    hook.rerender({ key: "new", id: null });
    await h.act(async () => { finish(json(401, { message: "old credential rejected" })); await flush(); });
    assert.equal(window.localStorage.getItem(AUTH_KEY_STORAGE_KEY), "new"); assert.deepEqual(events, []);
    assert.equal(hook.result.current, null);
  } finally { window.removeEventListener(AUTH_INVALIDATED_EVENT, listener); }
});

test("status 403 keeps current login and hides private server reason", async () => {
  const events = []; const listener = e => events.push(e.detail); window.addEventListener(AUTH_INVALIDATED_EVENT, listener);
  try {
    window.localStorage.setItem(AUTH_KEY_STORAGE_KEY, "key");
    globalThis.fetch = async () => json(403, { message: "private-tenant-token" });
    const hook = h.renderHook(() => useSendNowStatus("key", ID)); await settle();
    assert.equal(window.localStorage.getItem(AUTH_KEY_STORAGE_KEY), "key"); assert.deepEqual(events, []);
    assert.match(hook.result.current, /unknown/); assert.doesNotMatch(hook.result.current, /private-tenant-token/);
  } finally { window.removeEventListener(AUTH_INVALIDATED_EVENT, listener); }
});

test("replacement submission under same key ignores prior in-flight job status", async () => {
  let finishOld; let posts = 0; const gets = [];
  globalThis.fetch = async (url, init) => {
    if (init.method === "POST") return json(202, { jobId: ++posts === 1 ? ID : OTHER, status: "launching" });
    gets.push([url, init.headers.authorization]);
    if (String(url).endsWith(ID)) return new Promise(r => { finishOld = r; });
    return state(OTHER);
  };
  const form = h.render(<SendNowForm apiKey="key" />);
  h.fireEvent.change(form.getByLabelText("Meeting URL"), { target: { value: "https://meet.google.com/abc-defg-hij" } });
  h.fireEvent.change(form.getByLabelText("Record until"), { target: { value: "23:59" } });
  h.fireEvent.submit(form.container.querySelector("form")); await settle();
  h.fireEvent.submit(form.container.querySelector("form")); await settle();
  await h.act(async () => { finishOld(state(ID, "not-running")); await flush(); });
  assert.equal(posts, 2); assert.equal(gets.length, 2); assert.ok(gets.every(([, auth]) => auth === "Bearer key"));
  assert.match(form.container.textContent, /Launch accepted.*20261014100001.*recorder process is alive/);
  assert.doesNotMatch(form.container.textContent, /Not running|has not joined yet/);
});

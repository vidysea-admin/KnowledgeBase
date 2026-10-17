import test from "node:test";
import assert from "node:assert/strict";
import { loadScript, flush, deferred, okResponse, makeFakeFetch, defaultConfig } from "./tab-capture-harness.mjs";

const T = { timeout: 20000 };
function world({ captured = [], contexts = [], config = defaultConfig, sendMessage, configFails } = {}) {
  const f = makeFakeFetch((c) => {
    if (c.url === "chrome-extension://ext-id/config.json") { if (configFails) throw new Error("no config"); return { ok: true, json: async () => config }; }
    return okResponse();
  });
  const reg = { onClicked: [], onMessage: [], onMessageExternal: [], onConnect: [] }; const log = [];
  const ev = (k) => ({ addListener: (fn) => reg[k].push(fn) });
  const chrome = {
    action: { onClicked: ev("onClicked") },
    runtime: {
      id: "ext-id", onMessage: ev("onMessage"), onMessageExternal: ev("onMessageExternal"), onConnect: ev("onConnect"),
      getURL: (p) => `chrome-extension://ext-id/${p}`, getContexts: async () => contexts,
      sendMessage: sendMessage ?? (async (m) => { log.push(["sendMessage", m]); return { ok: true }; }),
    },
    tabCapture: { getCapturedTabs: async () => captured, getMediaStreamId: async (o) => { log.push(["streamId", o]); return "sid-" + o.targetTabId; } },
    offscreen: { createDocument: async (o) => { log.push(["createDocument", o]); } },
  };
  loadScript("background.js", { chrome, fetch: f.fetch });
  const events = () => f.calls.filter((c) => c.url.endsWith("/event")).map((c) => ({ url: c.url, auth: c.headers.Authorization, ...JSON.parse(c.body) }));
  return { reg, log, calls: f.calls, events, click: (tab = { id: 7 }) => reg.onClicked[0](tab) };
}
const external = (w) => w.calls.filter((c) => !c.url.startsWith("chrome-extension://"));

test("start: reads config.json, creates offscreen doc, mints stream id for the clicked tab, sends start to recorder", T, async () => {
  const w = world(); await w.click({ id: 42 }); await flush();
  assert.deepEqual(w.log.map((l) => l[0]), ["createDocument", "streamId", "sendMessage"]);
  assert.equal(w.log[0][1].url, "recorder.html"); assert.equal(w.log[1][1].targetTabId, 42);
  assert.deepEqual(JSON.parse(JSON.stringify(w.log[2][1])), { target: "recorder", type: "start", streamId: "sid-42", config: defaultConfig });
  assert.equal(w.events().length, 0, "no error reported on success");
});

test("start: an existing offscreen document is reused", T, async () => {
  const w = world({ contexts: [{}] }); await w.click(); await flush();
  assert.ok(!w.log.some((l) => l[0] === "createDocument"));
});

test("P5 single capture: an active captured tab refuses a new start before minting any stream id", T, async () => {
  const w = world({ captured: [{ status: "active" }] }); await w.click(); await flush();
  assert.equal(w.log.length, 0);
});

test("P4 re-entrancy: a second click while starting is ignored", T, async () => {
  const gate = deferred();
  const w = world({ sendMessage: async () => { await gate.promise; return { ok: true }; } });
  const a = w.click({ id: 1 }); await flush(); await w.click({ id: 2 }); await flush();
  assert.equal(w.log.filter((l) => l[0] === "streamId").length, 1);
  gate.resolve(); await a; await flush();
  assert.equal(w.log.filter((l) => l[0] === "streamId").length, 1);
});

test("P3 recorder refusal is reported to the receiver as capture-error (bearer, configured endpoint)", T, async () => {
  const w = world({ sendMessage: async () => ({ ok: false, error: "A capture is already active" }) }); await w.click(); await flush();
  assert.deepEqual(w.events(), [{ url: "http://127.0.0.1:4321/event", auth: "Bearer tok-abc", event: "capture-error", error: "A capture is already active" }]);
});

test("P3 no acknowledgement from the recorder is a failure; the guard resets so a later click can retry", T, async () => {
  let n = 0; const w = world({ sendMessage: async () => (n++ ? { ok: true } : undefined) });
  await w.click(); await flush();
  assert.match(w.events()[0].error, /did not acknowledge/);
  await w.click(); await flush(); assert.equal(w.events().length, 1);
});

test("P3 exceptions during start are reported, never swallowed silently", T, async () => {
  const w = world({ sendMessage: async () => { throw new Error("offscreen gone"); } }); await w.click(); await flush();
  assert.equal(w.events()[0].error, "offscreen gone");
});

test("P7 error reports go only to the configured endpoint", T, async () => {
  const cfg = { endpoint: "http://127.0.0.1:5555", token: "zzz" };
  const w = world({ config: cfg, sendMessage: async () => ({ ok: false, error: "e" }) });
  await w.click(); await flush();
  assert.ok(external(w).length > 0 && external(w).every((c) => c.url === "http://127.0.0.1:5555/event"));
});

test("known gap: unreadable config.json means nothing starts and nothing can be reported (no endpoint known)", T, async () => {
  const w = world({ configFails: true }); await w.click(); await flush();
  assert.equal(w.log.length, 0); assert.equal(w.events().length, 0);
});

test("P6 background registers no onMessage / onMessageExternal / onConnect listeners (no external control surface)", T, () => {
  const w = world(); assert.equal(w.reg.onClicked.length, 1);
  for (const k of ["onMessage", "onMessageExternal", "onConnect"]) assert.equal(w.reg[k].length, 0, k);
});

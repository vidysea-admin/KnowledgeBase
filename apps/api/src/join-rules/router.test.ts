/**
 * apps/api/src/join-rules/router.test.ts — T-037 `t037-join-rules-edit-api`. Real HTTP over the real
 * `createServer` (auth + rate limit + router); the store is a faithful in-memory fake because
 * `apps/*` may not import `packages/meeting-bot` (.dependency-cruiser.cjs applies to test files too).
 * The REAL store/engine round trip lives in scripts/qa/join-rules-edit-api.test.ts (outside that rule).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "../testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../fixtures.js";
import type { JoinRulesDeps, JoinRuleSetValue, JoinRuleStateValue, StoredJoinRulesValue } from "./deps.js";

class JoinRulesStoreError extends Error {
  constructor(public readonly code: string, detail: string) { super(`join-rules store: ${code}: ${detail}`); this.name = "JoinRulesStoreError"; }
}
class ValidationError extends Error {}
const EMPTY = (): StoredJoinRulesValue => ({ ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } });

/** Mirrors the real store's contract: missing -> empty; corrupt -> throws; save overwrites blindly. */
function fakeStore(opts: { delayMs?: number; sizeCap?: number } = {}) {
  const files = new Map<string, StoredJoinRulesValue>();
  const corrupt = new Set<string>();
  const log: { op: string; tenantId: string }[] = [];
  const wait = () => new Promise(r => setTimeout(r, opts.delayMs ?? 0));
  const load = async (t: string): Promise<StoredJoinRulesValue> => {
    log.push({ op: "load", tenantId: t });
    const snapshot = structuredClone(files.get(t) ?? EMPTY()); // read first, THEN yield (models I/O latency)
    if (opts.delayMs) await wait();
    if (corrupt.has(t)) throw new JoinRulesStoreError("corrupt", `SECRET-PATH C:\\state\\join-rules\\${t}.json`);
    return snapshot;
  };
  const save = async (t: string, v: StoredJoinRulesValue): Promise<void> => {
    log.push({ op: "save", tenantId: t });
    if (opts.sizeCap !== undefined && JSON.stringify(v).length > opts.sizeCap) throw new JoinRulesStoreError("too-large", "cap");
    files.set(t, structuredClone(v));
  };
  const deps: JoinRulesDeps = {
    load, save,
    validateRuleSet(input: unknown): JoinRuleSetValue {
      const o = input as Record<string, unknown>;
      const extra = Object.keys(o).filter(k => !["version", "ownDomains", "rules"].includes(k));
      if (extra.length) throw new ValidationError(`unknown field "${extra[0]}"`);
      if (o.version !== 1 || !Array.isArray(o.ownDomains) || !Array.isArray(o.rules)) throw new ValidationError("bad shape");
      return { version: 1, ownDomains: o.ownDomains as string[], rules: o.rules as JoinRuleSetValue["rules"] };
    },
    async recordApproval(t, a): Promise<JoinRuleStateValue> {
      const cur = await load(t);
      if (a.value.includes(" ")) throw new JoinRulesStoreError("invalid", "bad value");
      const key = a.kind === "sender" ? "approvedSenders" : "approvedDomains";
      const state = { ...cur.state, [key]: [...cur.state[key], a.value.toLowerCase()] };
      await save(t, { ruleSet: cur.ruleSet, state });
      return state;
    },
    async recordOptOut(t, id): Promise<JoinRuleStateValue> {
      const cur = await load(t);
      const state = { ...cur.state, optedOutEventIds: [...cur.state.optedOutEventIds, id] };
      await save(t, { ruleSet: cur.ruleSet, state });
      return state;
    },
  };
  return { deps, files, corrupt, log };
}

const KEYS = {
  "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] },
  "b-key": { tenantId: "tenant-b", scopes: ["calendar", "join-rules"] },
  "noscope-key": { tenantId: "tenant-a", scopes: ["sources"] },
};
const RULES = { version: 1, ownDomains: ["own.example"], rules: [{ id: "r1", effect: "allow", match: { domain: "trusted.example" } }] };
const URL_PATH = "/calendar/join-rules";

async function withServer(joinRules: JoinRulesDeps | undefined, fn: (s: TestServer, call: (method: string, path: string, key?: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: any }>) => Promise<void>) {
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), ...(joinRules ? { joinRules } : {}) }));
  const call = async (method: string, path: string, key?: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: any; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
  try { await fn(server, call); } finally { await server.close(); }
}

const ALL: [string, string, unknown][] = [
  ["GET", URL_PATH, undefined], ["PUT", URL_PATH, RULES],
  ["POST", `${URL_PATH}/approvals`, { kind: "sender", value: "x@y.example" }], ["POST", `${URL_PATH}/opt-outs`, { eventId: "e1" }],
];

test("unauthenticated requests are refused (401) and touch nothing", async () => {
  const s = fakeStore();
  await withServer(s.deps, async (_srv, call) => {
    for (const [m, p, b] of ALL) assert.equal((await call(m, p, undefined, b)).status, 401, `${m} ${p}`);
    assert.equal((await call("GET", URL_PATH, "bogus-key")).status, 401);
  });
  assert.equal(s.log.length, 0);
});

test("a key without the required scope is refused (403) on every route and touches nothing", async () => {
  const s = fakeStore();
  await withServer(s.deps, async (_srv, call) => {
    for (const [m, p, b] of ALL) assert.equal((await call(m, p, "noscope-key", b)).status, 403, `${m} ${p}`);
  });
  assert.equal(s.log.length, 0);
});

test("no join-rules store wired -> 503 (fails closed, never an empty rule set)", async () => {
  await withServer(undefined, async (_srv, call) => {
    assert.equal((await call("GET", URL_PATH, "a-key")).status, 503);
    assert.equal((await call("PUT", URL_PATH, "a-key", RULES)).status, 503);
    assert.equal((await call("GET", URL_PATH)).status, 401);
    assert.equal((await call("GET", URL_PATH, "noscope-key")).status, 403);
  });
});

test("two tenants: A cannot read or write B's rules, state, approvals or opt-outs", async () => {
  const s = fakeStore();
  const bRules = { version: 1, ownDomains: ["b-own.example"], rules: [{ id: "b1", effect: "deny", match: { domain: "evil.example" } }] };
  s.files.set("tenant-b", { ruleSet: bRules as any, state: { approvedSenders: ["bob@b.example"], approvedDomains: [], optedOutEventIds: ["b-event"] } });
  await withServer(s.deps, async (_srv, call) => {
    const a = await call("GET", URL_PATH, "a-key");
    assert.deepEqual(a.json, EMPTY());
    assert.ok(!JSON.stringify(a.json).includes("bob@b.example"));
    assert.equal((await call("PUT", URL_PATH, "a-key", RULES)).status, 200);
    assert.equal((await call("POST", `${URL_PATH}/approvals`, "a-key", { kind: "domain", value: "a.example" })).status, 200);
    assert.equal((await call("POST", `${URL_PATH}/opt-outs`, "a-key", { eventId: "a-event" })).status, 200);
    // B untouched by every A write.
    assert.deepEqual(s.files.get("tenant-b")!.ruleSet, bRules);
    assert.deepEqual(s.files.get("tenant-b")!.state, { approvedSenders: ["bob@b.example"], approvedDomains: [], optedOutEventIds: ["b-event"] });
    // Symmetric: B sees only B, and A's data is absent.
    const b = await call("GET", URL_PATH, "b-key");
    assert.deepEqual(b.json.ruleSet, bRules);
    assert.ok(!JSON.stringify(b.json).includes("a-event") && !JSON.stringify(b.json).includes("a.example"));
  });
  assert.ok(s.log.filter(l => l.op === "save").every(l => l.tenantId === "tenant-a"));
});

test("a client-supplied tenant (body, query, path, header) never selects the tenant", async () => {
  const s = fakeStore();
  s.files.set("tenant-b", { ruleSet: RULES as any, state: { approvedSenders: ["bob@b.example"], approvedDomains: [], optedOutEventIds: [] } });
  await withServer(s.deps, async (_srv, call) => {
    // body naming a tenant is REJECTED on every write route, nothing written
    assert.equal((await call("PUT", URL_PATH, "a-key", { ...RULES, tenantId: "tenant-b" })).status, 400);
    assert.equal((await call("POST", `${URL_PATH}/approvals`, "a-key", { kind: "sender", value: "x@y.example", tenantId: "tenant-b" })).status, 400);
    assert.equal((await call("POST", `${URL_PATH}/opt-outs`, "a-key", { eventId: "e", tenantId: "tenant-b" })).status, 400);
    assert.equal(s.log.filter(l => l.op === "save").length, 0);
    // query / header / path variants are ignored: reads still return A's (empty) data
    for (const [p, h] of [[`${URL_PATH}?tenantId=tenant-b`, {}], [`${URL_PATH}?tenant=tenant-b`, {}], [URL_PATH, { "x-tenant-id": "tenant-b", "x-tenant": "tenant-b" }]] as const) {
      const r = await call("GET", p, "a-key", undefined, { ...h });
      assert.equal(r.status, 200); assert.deepEqual(r.json, EMPTY());
    }
    assert.equal((await call("GET", `${URL_PATH}/tenant-b`, "a-key")).status === 200, false);
    assert.ok(s.log.every(l => l.tenantId === "tenant-a"));
  });
});

test("PUT replaces the rules and PRESERVES stored approvals and opt-outs", async () => {
  const s = fakeStore();
  const state = { approvedSenders: ["ann@x.example"], approvedDomains: ["d.example"], optedOutEventIds: ["e1", "e2"] };
  s.files.set("tenant-a", { ruleSet: EMPTY().ruleSet, state });
  await withServer(s.deps, async (_srv, call) => {
    const put = await call("PUT", URL_PATH, "a-key", RULES);
    assert.equal(put.status, 200);
    assert.deepEqual(put.json, { ruleSet: RULES, state });
    assert.deepEqual(s.files.get("tenant-a"), { ruleSet: RULES, state });
    // a second replace with an empty rule set still keeps state
    assert.equal((await call("PUT", URL_PATH, "a-key", { version: 1, ownDomains: [], rules: [] })).status, 200);
    assert.deepEqual(s.files.get("tenant-a")!.state, state);
    assert.deepEqual((await call("GET", URL_PATH, "a-key")).json.state, state);
  });
});

test("PUT cannot smuggle state: a `state` field in the body is rejected, stored value unchanged", async () => {
  const s = fakeStore();
  const before = { ruleSet: RULES as any, state: { approvedSenders: ["ann@x.example"], approvedDomains: [], optedOutEventIds: [] } };
  s.files.set("tenant-a", structuredClone(before));
  await withServer(s.deps, async (_srv, call) => {
    const r = await call("PUT", URL_PATH, "a-key", { ...RULES, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: [] } });
    assert.equal(r.status, 400);
  });
  assert.deepEqual(s.files.get("tenant-a"), before);
});

test("invalid, unknown-field, non-object and oversized bodies are refused 4xx; stored value unchanged", async () => {
  const s = fakeStore();
  const before = { ruleSet: RULES as any, state: { approvedSenders: ["ann@x.example"], approvedDomains: [], optedOutEventIds: ["e1"] } };
  s.files.set("tenant-a", structuredClone(before));
  await withServer(s.deps, async (srv, call) => {
    for (const bad of [{ version: 2, ownDomains: [], rules: [] }, { ...RULES, extra: 1 }, { version: 1, ownDomains: "x", rules: [] }, [], "str", null, 7]) {
      const r = await call("PUT", URL_PATH, "a-key", bad);
      assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(bad)} -> ${r.status}`);
    }
    // no body at all
    const noBody = await fetch(`${srv.baseUrl}${URL_PATH}`, { method: "PUT", headers: { authorization: "Bearer a-key" } });
    assert.equal(noBody.status, 400);
    // malformed JSON
    const malformed = await fetch(`${srv.baseUrl}${URL_PATH}`, { method: "PUT", headers: { authorization: "Bearer a-key", "content-type": "application/json" }, body: "{not json" });
    assert.ok(malformed.status >= 400 && malformed.status < 500);
    // oversized (> express.json 100kb default)
    const huge = await call("PUT", URL_PATH, "a-key", { ...RULES, pad: "x".repeat(300_000) });
    assert.equal(huge.status, 413);
  });
  assert.deepEqual(s.files.get("tenant-a"), before);
  assert.equal(s.log.filter(l => l.op === "save").length, 0);
});

test("a store-level size refusal on save maps to 413 and leaves the stored value unchanged", async () => {
  const s = fakeStore({ sizeCap: 400 });
  const before = { ruleSet: EMPTY().ruleSet, state: { approvedSenders: ["ann@x.example"], approvedDomains: [], optedOutEventIds: [] } };
  s.files.set("tenant-a", structuredClone(before));
  const big = { version: 1, ownDomains: [], rules: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, effect: "allow", match: { domain: `d${i}.example` } })) };
  await withServer(s.deps, async (_srv, call) => { assert.equal((await call("PUT", URL_PATH, "a-key", big)).status, 413); });
  assert.deepEqual(s.files.get("tenant-a"), before);
});

test("approvals / opt-outs: valid -> 200 with state; bad bodies -> 400 and nothing written", async () => {
  const s = fakeStore();
  await withServer(s.deps, async (_srv, call) => {
    const ok = await call("POST", `${URL_PATH}/approvals`, "a-key", { kind: "sender", value: "Ann@X.example" });
    assert.equal(ok.status, 200); assert.deepEqual(ok.json.state.approvedSenders, ["ann@x.example"]);
    assert.equal((await call("POST", `${URL_PATH}/opt-outs`, "a-key", { eventId: "e1" })).json.state.optedOutEventIds[0], "e1");
    const saves = s.log.filter(l => l.op === "save").length;
    for (const bad of [{}, { kind: "other", value: "a" }, { kind: "sender" }, { kind: "sender", value: 5 }, { kind: "sender", value: "has space" }, { kind: "sender", value: "" }, []])
      assert.equal((await call("POST", `${URL_PATH}/approvals`, "a-key", bad)).status, 400, JSON.stringify(bad));
    for (const bad of [{}, { eventId: "" }, { eventId: 3 }, { eventId: "e", more: 1 }, []])
      assert.equal((await call("POST", `${URL_PATH}/opt-outs`, "a-key", bad)).status, 400, JSON.stringify(bad));
    assert.equal(s.log.filter(l => l.op === "save").length, saves);
  });
});

test("a corrupt stored file is a non-leaking 5xx on every route and is never overwritten", async () => {
  const s = fakeStore();
  const original = { ruleSet: RULES as any, state: { approvedSenders: ["ann@x.example"], approvedDomains: [], optedOutEventIds: [] } };
  s.files.set("tenant-a", structuredClone(original)); s.corrupt.add("tenant-a");
  await withServer(s.deps, async (_srv, call) => {
    for (const [m, p, b] of ALL) {
      const r = await call(m, p, "a-key", b);
      assert.equal(r.status, 500, `${m} ${p}`);
      assert.ok(!JSON.stringify(r.json).includes("SECRET-PATH") && !JSON.stringify(r.json).includes("corrupt"), JSON.stringify(r.json));
    }
    // another tenant is unaffected
    assert.equal((await call("GET", URL_PATH, "b-key")).status, 200);
  });
  assert.equal(s.log.filter(l => l.op === "save").length, 0);
  assert.deepEqual(s.files.get("tenant-a"), original);
});

test("concurrent approvals for one tenant (and concurrent PUT + approvals) all survive", async () => {
  const s = fakeStore({ delayMs: 5 });
  await withServer(s.deps, async (_srv, call) => {
    const emails = Array.from({ length: 12 }, (_, i) => `u${i}@x.example`);
    const results = await Promise.all([
      ...emails.map(value => call("POST", `${URL_PATH}/approvals`, "a-key", { kind: "sender", value })),
      call("POST", `${URL_PATH}/opt-outs`, "a-key", { eventId: "ev-1" }),
      call("PUT", URL_PATH, "a-key", RULES),
      call("POST", `${URL_PATH}/approvals`, "b-key", { kind: "sender", value: "only-b@x.example" }),
    ]);
    for (const r of results) assert.equal(r.status, 200);
    const a = s.files.get("tenant-a")!;
    assert.deepEqual([...a.state.approvedSenders].sort(), [...emails].sort());
    assert.deepEqual(a.state.optedOutEventIds, ["ev-1"]);
    assert.deepEqual(a.ruleSet, RULES);
    assert.deepEqual(s.files.get("tenant-b")!.state.approvedSenders, ["only-b@x.example"]);
  });
});

test("without the per-tenant lock this fake WOULD lose updates (non-vacuity of the concurrency test)", async () => {
  const s = fakeStore({ delayMs: 5 });
  await Promise.all(Array.from({ length: 6 }, (_, i) => s.deps.recordApproval("tenant-a", { kind: "sender", value: `u${i}@x.example` })));
  assert.ok(s.files.get("tenant-a")!.state.approvedSenders.length < 6);
});

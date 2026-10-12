/**
 * unit `t037-tick-verifies-key-tenant` — the tick verifies the API key's tenant (X-LKB-Tenant of GET /webinar-operations) before applying join rules.
 * ISS-T037WIRE-001 recorded reproduction in PRODUCTION SHAPE (buildRealScheduleTickDeps + fake fetch); header handling table; one request per enforcing tick; default parity.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { readScheduledKeys } from "../schedule-state.js";
import { saveJoinRules } from "../join-rules-store.js";
import { resetJoinRulesEnforceWarnings } from "../join-rules-enforce.js";
import { buildRealScheduleTickDeps, runScheduleTickOnce, type ScheduleTickDeps } from "../schedule-tick.js";
import { createKeyTenantLoader } from "./key-tenant.js";

const NOW = "2026-10-10T09:56:00Z", START = "2026-10-10T10:00:00Z", END = "2026-10-10T11:00:00Z";
const BASE = "http://api.test:3300", KEY = "lv_secretkey";
const A = "ten-a", B = "ten-b";
const MODES = ["fail-closed", "fail-open"] as const;
const row = (id: string, o: Record<string, unknown> = {}) => ({ _id: id, subject: `Webinar: ${id}`, senderEmail: "o@x.com", senderDomain: "x.com",
  senderAuthenticated: true, status: "approved", meetingUrl: "https://zoom.us/j/123456789?pwd=a", startTime: START, endTime: END, kind: "upcoming", ...o });
const G2 = row("g2", { meetingUrl: "https://meet.google.com/abc-defg-hij", startTime: "2026-10-10T09:57:00Z", endTime: "2026-10-10T09:58:30Z" });

type Reply = { status?: number; headers?: Array<[string, string]>; throws?: unknown };
interface Req { url: string; auth: string | null; redirect?: string; hasSignal: boolean }
/** Fake API: candidates + calendar bodies, and a configurable /webinar-operations reply. */
function fakeApi(rows: unknown[], ops: Reply | (() => Reply)) {
  const reqs: Req[] = [];
  const f = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url), h = new Headers(init?.headers);
    reqs.push({ url: u, auth: h.get("authorization"), redirect: init?.redirect, hasSignal: init?.signal instanceof AbortSignal });
    if (u.startsWith(`${BASE}/meeting-candidates`)) return new Response(JSON.stringify({ candidates: rows }), { status: 200 });
    if (u.startsWith(`${BASE}/calendar/upcoming`)) return new Response(JSON.stringify({ meetings: [] }), { status: 200 });
    if (u.startsWith(`${BASE}/webinar-operations`)) {
      const r = typeof ops === "function" ? ops() : ops;
      if (r.throws) throw r.throws;
      const hd = new Headers(); for (const [k, v] of r.headers ?? []) hd.append(k, v);
      return new Response("{}", { status: r.status ?? 200, headers: hd });
    }
    throw new Error(`unexpected request ${u}`);
  };
  return { reqs, f: f as typeof fetch, opsCount: () => reqs.filter((r) => r.url.includes("/webinar-operations")).length };
}
async function withEnv<T>(env: Record<string, string | undefined>, f: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const keys = ["LKB_API_URL", "LKB_API_KEY", "LKB_TENANT_ID", "LKB_JOIN_RULES_ENFORCE"], saved = keys.map((k) => process.env[k]), realFetch = globalThis.fetch;
  for (const k of keys) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  globalThis.fetch = f;
  try { return await fn(); } finally {
    globalThis.fetch = realFetch; keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
  }
}
async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(path.join(tmpdir(), "lkb-keytenant-"));
  try { return await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
const save = (root: string, tenant: string, opted: string[]) =>
  saveJoinRules(root, tenant, { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: { approvedSenders: [], approvedDomains: [], optedOutEventIds: opted } });

/** One production-shaped tick: real deps from env, state/scheduler/clock replaced; the loader's log is captured instead of printed. */
async function tick(root: string, env: Record<string, string | undefined>, api: ReturnType<typeof fakeApi>, dryRun = true, extra: Partial<ScheduleTickDeps> = {}) {
  return withEnv({ LKB_API_URL: BASE, LKB_API_KEY: KEY, ...env }, api.f, async () => {
    const logs: string[] = [], scheduled: string[] = [];
    const log = (m: string) => { logs.push(m); };
    const d = { ...buildRealScheduleTickDeps(), stateDir: root, now: () => NOW, log,
      scheduler: { scheduleOnce: async (j: { jobKey: string }) => { scheduled.push(j.jobKey); } }, ...extra } as ScheduleTickDeps;
    if (d.loadKeyTenant && !("loadKeyTenant" in extra)) d.loadKeyTenant = createKeyTenantLoader(BASE, KEY, log);
    const result = await runScheduleTickOnce(d, dryRun);
    return { result, logs, scheduled, ids: result.toSchedule.map((i) => i.sourceId) };
  });
}
const warns = (l: string[]) => l.filter((x) => x.includes("JOIN RULES WARNING"));

// ---------- header handling ----------
test("header table: only a single valid tenant id verifies; everything else is `unknown` (null), never a default; raw value never logged", async () => {
  const H = (v: string, name = "X-LKB-Tenant"): Reply => ({ headers: [[name, v]] });
  const cases: Array<[string, Reply, string | null]> = [
    ["valid", H(A), A], ["name in other case", H(A, "x-lkb-TENANT"), A], ["missing", {}, null], ["empty", H(""), null], ["whitespace only", H("   "), null],
    ["two values", { headers: [["X-LKB-Tenant", A], ["X-LKB-Tenant", B]] }, null], ["same value twice", { headers: [["X-LKB-Tenant", A], ["X-LKB-Tenant", A]] }, null],
    ["comma list", H("ten-a,ten-b"), null], ["invalid chars", H("ten a/../x"), null], ["path-like", H("..\\evil"), null], ["10,000 chars", H("a".repeat(10_000)), null],
    ["uppercase variant (store validator is lowercase-only)", H("TEN-A"), null], ["device name", H("con"), null],
    ["401", { status: 401, headers: [["X-LKB-Tenant", A]] }, null], ["403 (no sessions scope)", { status: 403 }, null], ["403 even with header", { status: 403, headers: [["X-LKB-Tenant", A]] }, null],
    ["500", { status: 500, headers: [["X-LKB-Tenant", A]] }, null], ["network error", { throws: new TypeError("fetch failed") }, null],
    ["timeout", { throws: new DOMException("timed out", "TimeoutError") }, null], ["redirect refused", { throws: new TypeError("unexpected redirect") }, null],
  ];
  for (const [name, reply, want] of cases) {
    const api = fakeApi([], reply), logs: string[] = [];
    const got = await withEnv({}, api.f, () => createKeyTenantLoader(BASE, KEY, (m) => logs.push(m))());
    assert.equal(got, want, name);
    assert.equal(api.reqs.length, 1, name);
    assert.ok(api.reqs[0]!.hasSignal && api.reqs[0]!.redirect === "error", `${name}: timeout signal and redirect:error`);
    assert.ok(logs.join("\n").length < 400 && !logs.join("").includes("aaaaaaaaaa") && !logs.join("").includes(KEY), `${name}: bounded, no raw header, no key in log`);
    assert.equal(logs.length, want === null ? 1 : 0, name);
  }
  const none = fakeApi([], H(A));
  assert.equal(await withEnv({}, none.f, () => createKeyTenantLoader(BASE, undefined, () => {})()), null); assert.equal(none.reqs.length, 0, "no key: no request");
});

// ---------- ISS-T037WIRE-001 recorded reproduction, production shape ----------
test("ISS-T037WIRE-001 recorded repro (A's rules opt out g1; run configured as B; API says the key is A's): g1 is NOT scheduled through B's rules, both policies", async () => {
  await withRoot(async (root) => {
    save(root, A, ["g1"]); let n = 0;
    for (const mode of MODES) {
      resetJoinRulesEnforceWarnings();
      const api = fakeApi([row("g1")], { headers: [["X-LKB-Tenant", A]] });
      const t = await tick(root, { LKB_TENANT_ID: B, LKB_JOIN_RULES_ENFORCE: mode }, api, false);
      const w = warns(t.logs); assert.equal(w.length, 1); assert.match(w[0]!, /tenant-mismatch/);
      assert.ok(!/ten-a|ten-b/.test(w[0]!), "no tenant ids in the warning");
      assert.equal(api.opsCount(), 1, "exactly one verification request");
      if (mode === "fail-closed") {
        assert.deepEqual(t.ids, [], "fail-closed: nothing scheduled"); assert.deepEqual(t.scheduled, []); assert.deepEqual([...readScheduledKeys(root, A)], [], "nothing recorded");
        assert.deepEqual(t.result.skipped.map((s) => [s.sourceId, s.reason]), [["g1", "rules-unevaluable"]]);
      } else { assert.deepEqual(t.ids, ["g1"], "fail-open: selection unchanged (loud warning), B's rules not applied"); assert.equal(t.scheduled.length, 1); }
      n++;
    }
    assert.equal(n, 2, `ISS-T037WIRE-001: ${n}/2 policies as specified (g1 never scheduled through B's rules; fail-closed schedules nothing)`);
  });
});
test("unverified (header missing / 403 / 500 / network / invalid / uppercase variant) is treated like mismatch: fail-closed schedules and records nothing, fail-open unchanged with the warning", async () => {
  const replies: Array<[string, Reply]> = [["missing", {}], ["403", { status: 403 }], ["500", { status: 500 }], ["network", { throws: new TypeError("x") }],
    ["invalid", { headers: [["X-LKB-Tenant", "a b"]] }], ["uppercase", { headers: [["X-LKB-Tenant", "TEN-A"]] }]];
  for (const [name, reply] of replies) for (const mode of MODES) await withRoot(async (root) => { // fresh state dir per case: fail-open records what it schedules
      save(root, A, ["g1"]);
      resetJoinRulesEnforceWarnings();
      const api = fakeApi([row("g1")], reply);
      const t = await tick(root, { LKB_TENANT_ID: A, LKB_JOIN_RULES_ENFORCE: mode }, api, false);
      assert.ok(warns(t.logs).some((w) => /tenant-unverified/.test(w)), `${name}/${mode}: tenant-unverified warning`);
      assert.equal(api.opsCount(), 1);
      if (mode === "fail-closed") { assert.deepEqual(t.ids, [], name); assert.deepEqual(t.scheduled, [], name); assert.deepEqual([...readScheduledKeys(root, A)], [], name); }
      else { assert.deepEqual(t.ids, ["g1"], `${name}: fail-open leaves the selection unchanged (A's opt-out NOT applied: rules are not attributable)`); }
  });
});
test("matching tenants: rules of the tenant are applied exactly as before (opt-out honoured)", async () => {
  await withRoot(async (root) => {
    save(root, A, ["g1"]);
    for (const mode of MODES) {
      const api = fakeApi([row("g1"), G2], { headers: [["x-lkb-tenant", A]] });
      const t = await tick(root, { LKB_TENANT_ID: A, LKB_JOIN_RULES_ENFORCE: mode }, api);
      assert.deepEqual(t.ids, ["g2"], mode); assert.equal(warns(t.logs).length, 0, mode); assert.equal(api.opsCount(), 1);
    }
  });
});

// ---------- requests: scope of the key, per-tick, off ----------
test("the verification uses the SAME key and base URL as the candidate fetch, one request per enforcing tick, none cached across ticks (a changed key tenant is seen at once)", async () => {
  await withRoot(async (root) => {
    save(root, A, ["g1"]); let who = A;
    const api = fakeApi([row("g1")], () => ({ headers: [["X-LKB-Tenant", who]] }));
    const env = { LKB_TENANT_ID: A, LKB_JOIN_RULES_ENFORCE: "fail-closed" };
    const t1 = await tick(root, env, api); assert.deepEqual(t1.ids, []); assert.equal(api.opsCount(), 1);
    who = B; const t2 = await tick(root, env, api); assert.ok(t2.logs.some((l) => /tenant-mismatch/.test(l)), "second tick sees the new key tenant"); assert.equal(api.opsCount(), 2);
    assert.ok(api.reqs.every((r) => r.url.startsWith(`${BASE}/`) && r.auth === `Bearer ${KEY}`), "every request: configured base URL, the same key, nowhere else");
  });
});
test("enforcement off (absent / empty / off / garbage): NO verification request, no header read, output identical with or without the loader", async () => {
  await withRoot(async (root) => {
    save(root, A, ["g1"]);
    const rows = [row("g1"), G2];
    for (const v of [undefined, "", "off", "FAIL-CLOSED", "yes"]) {
      resetJoinRulesEnforceWarnings();
      const api = fakeApi(rows, { headers: [["X-LKB-Tenant", B]] }), api2 = fakeApi(rows, {});
      const withLoader = await tick(root, { LKB_TENANT_ID: A, LKB_JOIN_RULES_ENFORCE: v }, api);
      resetJoinRulesEnforceWarnings();
      const without = await tick(root, { LKB_TENANT_ID: A, LKB_JOIN_RULES_ENFORCE: v }, api2, true, { loadKeyTenant: undefined });
      assert.equal(api.opsCount(), 0, `${String(v)}: zero extra requests`);
      assert.deepEqual(withLoader.result, without.result); assert.deepEqual(withLoader.logs, without.logs); assert.deepEqual([...withLoader.ids].sort(), ["g1", "g2"]);
      assert.deepEqual(api.reqs.map((r) => r.url), api2.reqs.map((r) => r.url), "request list identical to a tick without the loader");
    }
  });
});
test("a throwing loader is `unverified`, never a crash and never `verified`", async () => {
  await withRoot(async (root) => {
    save(root, A, ["g1"]);
    const t = await tick(root, { LKB_TENANT_ID: A, LKB_JOIN_RULES_ENFORCE: "fail-closed" }, fakeApi([row("g1")], {}), true, { loadKeyTenant: async () => { throw new Error("boom"); } });
    assert.deepEqual(t.ids, []); assert.ok(warns(t.logs).some((w) => /tenant-unverified/.test(w)));
  });
});

// ---------- veto only ----------
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
test("veto-only: with any key-tenant outcome the result is a subset of the un-enforced selection (500 seeds x both enabling values)", async () => {
  await withRoot(async (root) => {
    save(root, A, ["g0", "g2"]);
    for (let seed = 1; seed <= 500; seed++) for (const mode of MODES) {
      const r = rng(seed), rows = Array.from({ length: Math.floor(r() * 5) }, (_, i) => row(`g${i}`, { meetingUrl: `https://zoom.us/j/55500011${i}`, status: r() < 0.8 ? "approved" : "pending" }));
      const outcome = [{ headers: [["X-LKB-Tenant", A]] }, { headers: [["X-LKB-Tenant", B]] }, {}, { status: 403 }][Math.floor(r() * 4)] as Reply;
      const base = await tick(root, { LKB_TENANT_ID: A, LKB_JOIN_RULES_ENFORCE: "off" }, fakeApi(rows, outcome));
      const t = await tick(root, { LKB_TENANT_ID: A, LKB_JOIN_RULES_ENFORCE: mode }, fakeApi(rows, outcome));
      const input = new Set(base.ids);
      assert.ok(t.ids.every((id) => input.has(id)), `seed ${seed} ${mode}: nothing added`);
    }
  });
});

/**
 * scripts/webinar/join-rules-etag.test.ts — unit `iss-t037ui-001-join-rules-api-etag` (lane rulesapi).
 * HTTP-level regression tests for the join-rules PUT precondition (If-Match / If-None-Match + ETag) and ISS-UNOPTLOCK-002:
 * the REAL createServer (auth + router) over the REAL store (`createJoinRulesDeps`) on a temp state dir, and REAL second node processes.
 * Temp dirs only; localhost only; no browser. Run: node --test --import tsx scripts/webinar/join-rules-etag.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startTestServer } from "../../apps/api/src/testUtils.js";
import { buildTestDeps, fakeKeyStore } from "../../apps/api/src/fixtures.js";
import type { JoinRulesDeps } from "../../apps/api/src/join-rules/deps.js";
import { evaluateJoinRules, type JoinRuleSet } from "../../packages/meeting-bot/src/calendar/join-rules/join-rules.js";
import { joinRulesFilePath, joinRulesValidator, loadJoinRules, saveJoinRules, JOIN_RULES_ABSENT } from "../../packages/meeting-bot/src/calendar/join-rules/join-rules-store.js";
import { createJoinRulesDeps } from "./join-rules-host.js";

const HERE = import.meta.dirname;
const STORE_URL = pathToFileURL(path.join(HERE, "..", "..", "packages", "meeting-bot", "src", "calendar", "join-rules", "join-rules-store.ts")).href;
const LEDGER = path.join(HERE, "..", "..", "qa", "issues.unoptlock.jsonl");
const P = "/calendar/join-rules";
const KEYS = {
  "a-key": { tenantId: "tenant-a", scopes: ["calendar", "join-rules"] },
  "b-key": { tenantId: "tenant-b", scopes: ["calendar", "join-rules"] },
};
const RULES_X: JoinRuleSet = { version: 1, ownDomains: [], rules: [{ id: "r-allow", effect: "allow", match: { domain: "x.com" } }] };
const RULES_Y: JoinRuleSet = { version: 1, ownDomains: [], rules: [{ id: "r-allow", effect: "allow", match: { domain: "y.com" } }] };
const RULES_Z: JoinRuleSet = { version: 1, ownDomains: [], rules: [{ id: "r-allow", effect: "allow", match: { domain: "z.com" } }] };
const emptyState = () => ({ approvedSenders: [] as string[], approvedDomains: [] as string[], optedOutEventIds: [] as string[] });
const tag = (rs: JoinRuleSet) => `"${joinRulesValidator(rs)}"`;
const STRONG = /^"[0-9a-f]{64}"$/;
const ev = (id: string) => ({ id, organizer: "s@x.com", meetingUrl: "https://meet.google.com/abc-defg-hij" });
const decide = (dir: string, tenant: string, id: string) => { const l = loadJoinRules(dir, tenant); return evaluateJoinRules(ev(id), l.ruleSet, l.state).action; };

type Res = { status: number; json: any; etag: string | null; headers: Headers };
type Call = (method: string, p: string, key: string, body?: unknown, headers?: Record<string, string>) => Promise<Res>;

async function withHarness(fn: (ctx: { dir: string; call: Call; baseUrl: string }) => Promise<void>, wrap?: (real: JoinRulesDeps, dir: string) => JoinRulesDeps) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "jr-etag-rulesapi-"));
  const real = createJoinRulesDeps({ stateDir: dir });
  const server = await startTestServer(buildTestDeps({ keyStore: fakeKeyStore(KEYS), joinRules: wrap ? wrap(real, dir) : real }));
  const call: Call = async (method, p, key, body, headers = {}) => {
    const res = await fetch(`${server.baseUrl}${p}`, {
      method, headers: { authorization: `Bearer ${key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: any; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, etag: res.headers.get("etag"), headers: res.headers };
  };
  try { await fn({ dir, call, baseUrl: server.baseUrl }); } finally { await server.close(); rmSync(dir, { recursive: true, force: true }); }
}

const WORKER = `
const [url, dir, mode, a, b, startAt] = process.argv.slice(1);
const s = await import(url);
const out = {};
try {
  if (mode === "optout") { s.recordTenantOptOut(dir, "tenant-a", a); out.ok = true; }
  else if (mode === "cas") {
    while (Date.now() < Number(startAt)) {}
    const r = s.saveJoinRulesIf(dir, "tenant-a", a, JSON.parse(b)); out.ok = true; out.validator = r.validator;
  }
} catch (e) { out.ok = false; out.code = e.code; out.currentValidator = e.currentValidator; out.msg = String(e.message); }
console.log(JSON.stringify(out));
`;
function worker(dir: string, mode: string, a: string, b = "", startAt = 0): Promise<any> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", WORKER, STORE_URL, dir, mode, a, b, String(startAt)], { stdio: ["ignore", "pipe", "pipe"] });
    let o = "", e = ""; p.stdout.on("data", d => o += d); p.stderr.on("data", d => e += d);
    p.on("close", c => { try { resolve(JSON.parse(o.trim().split("\n").pop()!)); } catch { reject(new Error(`worker exit ${c}: ${o} ${e}`)); } });
  });
}
const bytesOf = (dir: string, tenant: string) => readFileSync(joinRulesFilePath(dir, tenant));
const noDebris = (dir: string) => { const d = path.join(dir, "join-rules"); return readdirSync(d).filter(f => !f.endsWith(".json")); };

/** Wraps the real deps: after the PUT route's read-only look (loadWithValidator) and BEFORE its write, a REAL second process opts `cal1` out. */
function hookBetweenLoadAndSave(real: JoinRulesDeps, dir: string, mode: "cas" | "legacy") {
  const st = { armed: false, fired: 0, snapshot: undefined as undefined | Awaited<ReturnType<JoinRulesDeps["loadWithValidator"]>> };
  const deps: JoinRulesDeps = {
    ...real,
    loadWithValidator: async t => {
      const r = await real.loadWithValidator(t);
      if (st.armed) { st.armed = false; st.snapshot = r; assert.equal((await worker(dir, "optout", "cal1")).ok, true); st.fired++; }
      return r;
    },
    // control only: the OLD behaviour, an unconditional full replace from the caller's snapshot
    saveIf: mode === "legacy"
      ? async (t, _expected, ruleSet) => { await real.save(t, { ruleSet, state: st.snapshot!.state }); return { ...(await real.loadWithValidator(t)) }; }
      : real.saveIf,
  };
  return { deps, st };
}

test("ISS-UNOPTLOCK-002 replay over HTTP (recorded reproduction, real second process between the PUT's load and its save): the opt-out survives and the decision stays not-join", async () => {
  const row = readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).find(r => r.id === "ISS-UNOPTLOCK-002");
  assert.match(row.evidence, /seed rules allow x\.com, state empty/); assert.match(row.evidence, /recordTenantOptOut\(cal1\)/);
  let ok = 0;
  // CONTROL (non-vacuity): the same sequence with the legacy unconditional save reproduces the bug through the very same route
  {
    let hook!: ReturnType<typeof hookBetweenLoadAndSave>;
    await withHarness(async ({ dir, call }) => {
      saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: { ...emptyState(), approvedSenders: ["s@x.com"] } }); // seed rules allow x.com, no opt-outs
      hook.st.armed = true;
      const r = await call("PUT", P, "a-key", RULES_Y, { "if-match": tag(RULES_X) });
      assert.equal(hook.st.fired, 1);
      assert.equal(r.status, 200);
      assert.deepEqual(loadJoinRules(dir, "tenant-a").state.optedOutEventIds, [], "control: the legacy path erases the opt-out");
      assert.equal(decide(dir, "tenant-a", "cal1"), "join", "control: and the meeting becomes joinable");
    }, (real, dir) => { hook = hookBetweenLoadAndSave(real, dir, "legacy"); return hook.deps; });
  }
  // THE FIX: PUT -> saveIf (atomic compare-and-set under the store lock)
  let hook!: ReturnType<typeof hookBetweenLoadAndSave>;
  await withHarness(async ({ dir, call }) => {
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: { ...emptyState(), approvedSenders: ["s@x.com"] } }); // seed rules allow x.com, no opt-outs
    hook.st.armed = true;
    const r = await call("PUT", P, "a-key", RULES_Y, { "if-match": tag(RULES_X) }); // the opt-out must NOT invalidate the ETag
    assert.equal(hook.st.fired, 1, "the second process really ran between load and save");
    if (r.status === 200) ok++;
    if (JSON.stringify(loadJoinRules(dir, "tenant-a").state.optedOutEventIds) === JSON.stringify(["cal1"])) ok++;
    if (decide(dir, "tenant-a", "cal1") !== "join") ok++;
    if (JSON.stringify(loadJoinRules(dir, "tenant-a").ruleSet) === JSON.stringify(RULES_Y) && r.json.state.optedOutEventIds[0] === "cal1" && r.etag === tag(RULES_Y)) ok++;
    console.log(`ISS-UNOPTLOCK-002 (HTTP): ${ok}/4`);
    assert.equal(ok, 4);
    assert.deepEqual(noDebris(dir), []);
  }, (real, dir) => { hook = hookBetweenLoadAndSave(real, dir, "cas"); return hook.deps; });
});

test("ISS-T037UI-001 replay (1): two clients load, A saves, B saves with the old ETag -> B gets 412 + the winner's ETag and writes nothing; (2) B re-loads then saves -> 200", async () => {
  await withHarness(async ({ dir, call }) => {
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: emptyState() });
    const loadedA = await call("GET", P, "a-key"), loadedB = await call("GET", P, "a-key");
    assert.equal(loadedA.etag, tag(RULES_X)); assert.equal(loadedB.etag, loadedA.etag);
    const a = await call("PUT", P, "a-key", RULES_Y, { "if-match": loadedA.etag! });
    assert.equal(a.status, 200); assert.equal(a.etag, tag(RULES_Y));
    const before = bytesOf(dir, "tenant-a");
    const b = await call("PUT", P, "a-key", RULES_Z, { "if-match": loadedB.etag! });
    assert.equal(b.status, 412);
    assert.deepEqual(b.json, { error: "precondition-failed", currentEtag: tag(RULES_Y) });
    assert.equal(b.etag, tag(RULES_Y));
    assert.ok(bytesOf(dir, "tenant-a").equals(before), "loser wrote nothing");
    const reload = await call("GET", P, "a-key");
    assert.equal(reload.etag, tag(RULES_Y));
    const b2 = await call("PUT", P, "a-key", RULES_Z, { "if-match": reload.etag! });
    assert.equal(b2.status, 200); assert.equal(b2.etag, tag(RULES_Z));
    assert.deepEqual(loadJoinRules(dir, "tenant-a").ruleSet, RULES_Z);
    console.log("ISS-T037UI-001 (HTTP): 2/2 (409 in the ledger text; 412 per the ordered contract)");
  });
});

test("two concurrent PUTs with the SAME If-Match: exactly one 2xx, the other 412 with the winner's ETag, the loser's rules are not stored", async () => {
  await withHarness(async ({ dir, call }) => {
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: emptyState() });
    const [r1, r2] = await Promise.all([
      call("PUT", P, "a-key", RULES_Y, { "if-match": tag(RULES_X) }),
      call("PUT", P, "a-key", RULES_Z, { "if-match": tag(RULES_X) }),
    ]);
    const ok = [r1, r2].filter(r => r.status === 200), lost = [r1, r2].filter(r => r.status === 412);
    assert.equal(ok.length, 1, JSON.stringify([r1.status, r2.status])); assert.equal(lost.length, 1);
    const stored = loadJoinRules(dir, "tenant-a").ruleSet;
    const winnerRules = r1.status === 200 ? RULES_Y : RULES_Z;
    assert.deepEqual(stored, winnerRules);
    assert.equal(lost[0]!.etag, tag(winnerRules)); assert.deepEqual(lost[0]!.json, { error: "precondition-failed", currentEtag: tag(winnerRules) });
    assert.equal(ok[0]!.etag, tag(winnerRules));
  });
});

test("cross-process race: an HTTP PUT and a REAL process saveJoinRulesIf with the same validator, released together: exactly one wins, the file is the winner's", async () => {
  await withHarness(async ({ dir, call }) => {
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: emptyState() });
    const startAt = Date.now() + 1500;
    const w = worker(dir, "cas", joinRulesValidator(RULES_X), JSON.stringify(RULES_Z), startAt);
    await new Promise(r => setTimeout(r, Math.max(0, startAt - Date.now())));
    const [h, p] = await Promise.all([call("PUT", P, "a-key", RULES_Y, { "if-match": tag(RULES_X) }), w]);
    const httpWon = h.status === 200, procWon = p.ok === true;
    assert.equal(Number(httpWon) + Number(procWon), 1, JSON.stringify([h.status, p]));
    assert.deepEqual(loadJoinRules(dir, "tenant-a").ruleSet, httpWon ? RULES_Y : RULES_Z);
    if (!httpWon) assert.equal(h.status, 412);
    if (!procWon) assert.equal(p.code, "precondition-failed");
    assert.deepEqual(noDebris(dir), []);
  });
});

test("stale If-Match -> 412 {error, currentEtag} + current ETag header, nothing written; If-Match against nothing stored -> 412 with currentEtag null and NO ETag header", async () => {
  await withHarness(async ({ dir, call }) => {
    const none = await call("PUT", P, "a-key", RULES_Y, { "if-match": tag(RULES_X) });
    assert.equal(none.status, 412); assert.deepEqual(none.json, { error: "precondition-failed", currentEtag: null }); assert.equal(none.etag, null);
    assert.deepEqual(readdirSync(dir).flatMap(d => readdirSync(path.join(dir, d))), [], "no file (rule set, lock or temp) created in the state dir");
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: emptyState() });
    const before = bytesOf(dir, "tenant-a");
    const stale = await call("PUT", P, "a-key", RULES_Z, { "if-match": tag(RULES_Y) });
    assert.equal(stale.status, 412); assert.deepEqual(stale.json, { error: "precondition-failed", currentEtag: tag(RULES_X) }); assert.equal(stale.etag, tag(RULES_X));
    assert.ok(bytesOf(dir, "tenant-a").equals(before));
    assert.deepEqual(noDebris(dir), []);
  });
});

test("no precondition header -> 428 {error: precondition-required}, nothing written (also for a body that would be invalid)", async () => {
  await withHarness(async ({ dir, call }) => {
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: emptyState() });
    const before = bytesOf(dir, "tenant-a");
    for (const body of [RULES_Y, { not: "a rule set" }]) {
      const r = await call("PUT", P, "a-key", body);
      assert.equal(r.status, 428); assert.deepEqual(r.json, { error: "precondition-required" }); assert.equal(r.etag, null, "no stray (Express weak) ETag");
    }
    assert.ok(bytesOf(dir, "tenant-a").equals(before));
    const fresh = await call("PUT", P, "b-key", RULES_Y);
    assert.equal(fresh.status, 428);
    assert.equal(readdirSync(path.join(dir, "join-rules")).some(n => n.includes("tenant-b")), false);
  });
});

test("If-None-Match: * creates only when nothing is stored; with a rule set present -> 412 with the current ETag; unsupported forms -> 412, both headers -> 400", async () => {
  await withHarness(async ({ dir, call }) => {
    const first = await call("GET", P, "a-key");
    assert.equal(first.status, 200); assert.equal(first.etag, null, "no rule set stored -> no ETag header (and no Express weak one)");
    assert.deepEqual(first.json, { ruleSet: { version: 1, ownDomains: [], rules: [] }, state: emptyState() });
    const created = await call("PUT", P, "a-key", RULES_X, { "if-none-match": "*" });
    assert.equal(created.status, 200); assert.equal(created.etag, tag(RULES_X)); assert.match(created.etag!, STRONG);
    assert.equal((await call("GET", P, "a-key")).etag, created.etag);
    const before = bytesOf(dir, "tenant-a");
    const again = await call("PUT", P, "a-key", RULES_Y, { "if-none-match": "*" });
    assert.equal(again.status, 412); assert.deepEqual(again.json, { error: "precondition-failed", currentEtag: tag(RULES_X) }); assert.equal(again.etag, tag(RULES_X));
    for (const h of [{ "if-match": "*" }, { "if-match": `${tag(RULES_X)}, ${tag(RULES_Y)}` }, { "if-match": `W/${tag(RULES_X)}` }, { "if-match": joinRulesValidator(RULES_X) }, { "if-none-match": tag(RULES_X) }]) {
      const r = await call("PUT", P, "a-key", RULES_Y, h);
      assert.equal(r.status, 412, JSON.stringify(h)); assert.deepEqual(r.json, { error: "precondition-failed", currentEtag: tag(RULES_X) });
    }
    assert.equal((await call("PUT", P, "a-key", RULES_Y, { "if-match": tag(RULES_X), "if-none-match": "*" })).status, 400);
    assert.ok(bytesOf(dir, "tenant-a").equals(before), "every refused PUT wrote nothing");
  });
});

test("an opt-out / approval between an editor's GET and PUT does NOT 412 and is preserved (real second process and HTTP)", async () => {
  await withHarness(async ({ dir, call }) => {
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: emptyState() });
    const got = await call("GET", P, "a-key");
    assert.equal((await worker(dir, "optout", "cal-proc")).ok, true);                                              // another writer process
    assert.equal((await call("POST", `${P}/opt-outs`, "a-key", { eventId: "cal-http" })).status, 200);             // another editor tab
    assert.equal((await call("POST", `${P}/approvals`, "a-key", { kind: "sender", value: "ann@x.example" })).status, 200);
    assert.equal((await call("GET", P, "a-key")).etag, got.etag, "state changes do not change the ETag");
    const r = await call("PUT", P, "a-key", RULES_Y, { "if-match": got.etag! });
    assert.equal(r.status, 200);
    const st = loadJoinRules(dir, "tenant-a").state;
    assert.deepEqual([...st.optedOutEventIds].sort(), ["cal-http", "cal-proc"]); assert.deepEqual(st.approvedSenders, ["ann@x.example"]);
    assert.deepEqual([...r.json.state.optedOutEventIds].sort(), ["cal-http", "cal-proc"]);
    assert.notEqual(decide(dir, "tenant-a", "cal-proc"), "join");
  });
});

test("tenant isolation: tenant A's ETag is useless against tenant B (412, B untouched), and cannot create B's first rule set", async () => {
  await withHarness(async ({ dir, call }) => {
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: emptyState() });
    saveJoinRules(dir, "tenant-b", { ruleSet: RULES_Y, state: emptyState() });
    const aTag = (await call("GET", P, "a-key")).etag!, bTag = (await call("GET", P, "b-key")).etag!;
    assert.notEqual(aTag, bTag);
    const aBefore = bytesOf(dir, "tenant-a"), bBefore = bytesOf(dir, "tenant-b");
    const r = await call("PUT", P, "b-key", RULES_Z, { "if-match": aTag });
    assert.equal(r.status, 412); assert.deepEqual(r.json, { error: "precondition-failed", currentEtag: bTag }); assert.equal(r.etag, bTag);
    assert.ok(bytesOf(dir, "tenant-b").equals(bBefore) && bytesOf(dir, "tenant-a").equals(aBefore));
    // nothing stored for tenant C: A's tag does not create it, and the tenant is never taken from a header or body
    const cTry = await call("PUT", P, "b-key", { ...RULES_Z, tenantId: "tenant-a" }, { "if-match": aTag, "x-tenant-id": "tenant-a" });
    assert.equal(cTry.status, 400); assert.ok(bytesOf(dir, "tenant-a").equals(aBefore));
    // B's own tag works and only B changes
    assert.equal((await call("PUT", P, "b-key", RULES_Z, { "if-match": bTag })).status, 200);
    assert.ok(bytesOf(dir, "tenant-a").equals(aBefore));
    assert.deepEqual(loadJoinRules(dir, "tenant-b").ruleSet, RULES_Z);
  });
});

test("GET ETag: strong sha256, changes with the rule set only; a matching If-None-Match on GET is still 200 (never 304); 412/428/POST responses carry no stray weak ETag", async () => {
  await withHarness(async ({ dir, call }) => {
    saveJoinRules(dir, "tenant-a", { ruleSet: RULES_X, state: emptyState() });
    const g = await call("GET", P, "a-key");
    assert.match(g.etag!, STRONG); assert.equal(g.etag, `"${joinRulesValidator(RULES_X)}"`); assert.ok(!g.etag!.startsWith("W/"));
    assert.deepEqual(Object.keys(g.json).sort(), ["ruleSet", "state"], "GET body shape unchanged (no validator field)");
    const again = await call("GET", P, "a-key", undefined, { "if-none-match": g.etag! });
    assert.equal(again.status, 200);
    const post = await call("POST", `${P}/opt-outs`, "a-key", { eventId: "e1" });
    assert.equal(post.status, 200); assert.equal(post.etag, null);
    assert.equal((await call("GET", P, "a-key")).etag, g.etag);
    assert.equal(JOIN_RULES_ABSENT, "absent");
  });
});

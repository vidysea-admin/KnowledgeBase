/**
 * ISS-ALERTTENANT-002 (D-015 against qa/issues.alerttenant.jsonl): the tick's state tenant is bound to the VERIFIED tenant of the API key.
 * Recorded scenario, verbatim: "A tick misconfigured with tenant B's id but tenant A's key would record A's meetings as B's."
 * Temp directories only. The reproductions below print "ISS-ALERTTENANT-002: n/m".
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runScheduleTickOnce, type ScheduleTickDeps } from "../schedule-tick.js";
import { StateTenantRefusal, requireStateTenantMatchesKey } from "./state-tenant-tag.js";
import type { AutoRecordCandidateInput } from "../auto-join.js";

const A = "tenant-a", B = "tenant-b";
const CAND: AutoRecordCandidateInput = {
  id: "c1", title: "TOC webinar", senderEmail: "ops@theoutreachcollective.in", senderDomain: "theoutreachcollective.in", senderAuthenticated: true,
  status: "auto_approved", meetingUrl: "https://zoho.com/meeting/abc?tk=SECRET123", startTime: "2026-09-28T12:30:00Z", endTime: "2026-09-28T13:30:00Z", kind: "upcoming",
};
function deps(dir: string, o: Partial<ScheduleTickDeps>, calls: string[], logs: string[] = []): ScheduleTickDeps {
  return { loadCalendarEvents: async () => [], loadCandidates: async () => [CAND], now: () => "2026-09-28T12:26:00Z", stateDir: dir, stateTenantId: A, bindStateTenantToKey: true,
    scheduler: { scheduleOnce: async (x) => { calls.push(x.jobKey); } }, log: (m) => logs.push(m), ...o };
}
async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "alertkeytenant-"));
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// the ledger row is read at test time: the scenario text below is a substring of its evidence
const ROW = readFileSync(new URL("../../../../../qa/issues.alerttenant.jsonl", import.meta.url), "utf8").trim().split("\n")
  .map((l) => JSON.parse(l) as Record<string, string>).find((r) => r.id === "ISS-ALERTTENANT-002")!;
let pass = 0, total = 0;
after(() => { console.log(`ISS-ALERTTENANT-002: ${pass}/${total} reproductions refused as required`); });

test("the recorded scenario is verbatim in the ledger row", () => {
  assert.ok(ROW.evidence!.includes("A tick misconfigured with tenant B's id but tenant A's key would record A's meetings as B's"));
});

// [label, stateTenantId, how the key tenant is learned]
const CASES: [string, string, Partial<ScheduleTickDeps>, string][] = [
  ["recorded: tenant B's id with tenant A's key (loadKeyTenant)", B, { loadKeyTenant: async () => A }, "key-tenant-mismatch"],
  ["recorded: tenant B's id with tenant A's key (test seam joinRulesKeyTenantId)", B, { joinRulesKeyTenantId: A }, "key-tenant-mismatch"],
  ["the mirror: tenant A's id with tenant B's key", A, { loadKeyTenant: async () => B }, "key-tenant-mismatch"],
  ["key tenant could not be verified (null)", A, { loadKeyTenant: async () => null }, "key-tenant-unverified"],
  ["key tenant lookup throws", A, { loadKeyTenant: async () => { throw new Error("boom: sk-live-SECRETKEY"); } }, "key-tenant-unverified"],
  ["key tenant is not a tenant id", A, { loadKeyTenant: async () => "../a" as never }, "key-tenant-unverified"],
  ["key tenant is empty", A, { joinRulesKeyTenantId: "" }, "key-tenant-unverified"],
  ["key tenant is a non-string", A, { joinRulesKeyTenantId: 7 as never }, "key-tenant-unverified"],
  ["key tenant seam says null", A, { joinRulesKeyTenantId: null }, "key-tenant-unverified"],
  ["no verifier at all", A, {}, "key-tenant-unverified"],
];
for (const [label, tenant, o, reason] of CASES) {
  for (const dryRun of [false, true]) {
    test(`ISS-ALERTTENANT-002 refuses (${dryRun ? "dry-run" : "real"}): ${label}`, () => withDir(async (dir) => {
      const calls: string[] = [], logs: string[] = [];
      total++;
      await assert.rejects(runScheduleTickOnce(deps(dir, { stateTenantId: tenant, ...o }, calls, logs), dryRun),
        (e: unknown) => e instanceof StateTenantRefusal && e.reason === reason && !e.message.includes("SECRETKEY") && !e.message.includes(tenant === A ? B : A));
      assert.deepEqual(calls, [], "nothing scheduled");
      assert.deepEqual(readdirSync(dir), [], "nothing written to the state dir");
      assert.ok(!logs.join("\n").includes("SECRETKEY"));
      pass++;
    }));
  }
}

test("a matching key tenant lets the tick run, writes state tagged with that tenant, and verifies the key exactly once", () => withDir(async (dir) => {
  const calls: string[] = []; let checks = 0;
  await runScheduleTickOnce(deps(dir, { loadKeyTenant: async () => { checks++; return A; } }, calls), false);
  assert.equal(checks, 1);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(readFileSync(path.join(dir, "schedule-state.json"), "utf8")).tenantId, A);
}));

test("the join-rules key check reuses the same single verification (enforcing mode does not fetch twice)", () => withDir(async (dir) => {
  const calls: string[] = []; let checks = 0;
  await runScheduleTickOnce(deps(dir, { joinRulesEnforce: "fail-closed", joinRulesTenantId: A, loadKeyTenant: async () => { checks++; return A; },
    joinRulesIo: { load: () => ({ version: 1, tenantId: A, rules: [] }) as never } as never }, calls), true).catch(() => {});
  assert.equal(checks, 1);
}));

test("flag OFF (the production wiring today): no key verification request and a mismatching key does NOT stop the tick (T-037 contract unchanged)", () => withDir(async (dir) => {
  const calls: string[] = []; let checks = 0;
  await runScheduleTickOnce(deps(dir, { bindStateTenantToKey: undefined, loadKeyTenant: async () => { checks++; return B; } }, calls), false);
  assert.equal(checks, 0);
  assert.equal(calls.length, 1);
}));

test("requireStateTenantMatchesKey: pure unit table", () => {
  assert.equal(requireStateTenantMatchesKey(A, A), A);
  for (const k of [B, null, undefined, "", 5, {}, "a b"]) assert.throws(() => requireStateTenantMatchesKey(A, k), StateTenantRefusal, String(k));
  assert.throws(() => requireStateTenantMatchesKey("", A), StateTenantRefusal);
});

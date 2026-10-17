import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { enforceJoinRules } from "../../../packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.js";
import { emptyStoredJoinRules, joinRulesFilePath, saveJoinRules } from "../../../packages/meeting-bot/src/calendar/join-rules/join-rules-store.js";
import { lastValidJoinRulesPath, loadLastValidJoinRules, loadPrimaryJoinRules, saveLastValidJoinRules } from "../../../packages/meeting-bot/src/calendar/join-rules/join-rules-last-valid.js";

const tenant = "checker-tenant", now = 1_800_000_000_000;
async function fixture(fn: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-last-valid-checker-"));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("checker: cache-write failure cannot claim recovery or alter authoritative policy bytes", async () => fixture(async dir => {
  const policy = emptyStoredJoinRules();
  policy.state.optedOutEventIds = ["protected-event"];
  saveJoinRules(dir, tenant, policy);
  const primary = joinRulesFilePath(dir, tenant), before = readFileSync(primary);
  mkdirSync(lastValidJoinRulesPath(dir, tenant));
  let healthy = 0;
  const degraded: unknown[] = [];
  const input = { toSchedule: [], skipped: [] };
  assert.equal(await enforceJoinRules(input, { stateDir: dir, tenantId: tenant, keyTenantId: tenant,
    mode: "last-valid", now: () => now, log: () => {}, onHealthy: () => { healthy++; },
    onDegraded: event => { degraded.push(event); } }), input);
  assert.equal(healthy, 0);
  assert.deepEqual(degraded, [{ tenantId: tenant, reason: "snapshot-write-failed", usingSnapshot: false }]);
  assert.deepEqual(readFileSync(primary), before);
  assert.equal(readdirSync(path.dirname(primary)).some(name => /\.tmp$|\.lock$/.test(name)), false);
}));

test("checker: stale save refuses after intervening primary opt-out; previous complete cache remains", async () => fixture(async dir => {
  const policy = emptyStoredJoinRules();
  saveJoinRules(dir, tenant, policy);
  const old = loadPrimaryJoinRules(dir, tenant);
  saveLastValidJoinRules(dir, tenant, old, now);
  const cache = lastValidJoinRulesPath(dir, tenant), before = readFileSync(cache);
  const latest = emptyStoredJoinRules(); latest.state.optedOutEventIds = ["newly-refused"];
  saveJoinRules(dir, tenant, latest);
  assert.throws(() => saveLastValidJoinRules(dir, tenant, old, now + 50), /primary-changed/);
  assert.deepEqual(readFileSync(cache), before);
  assert.equal(readdirSync(path.dirname(cache)).some(name => /\.tmp$|\.lock$/.test(name)), false);
}));

test("checker: restarted cached full-state denial cannot be edited into permissive state", async () => fixture(async dir => {
  const policy = emptyStoredJoinRules(); policy.state.optedOutEventIds = ["protected-event"];
  saveJoinRules(dir, tenant, policy); saveLastValidJoinRules(dir, tenant, policy, now);
  unlinkSync(joinRulesFilePath(dir, tenant));
  assert.deepEqual(loadLastValidJoinRules(dir, tenant, now + 3_599_999).stored.state.optedOutEventIds, ["protected-event"]);
  assert.throws(() => loadLastValidJoinRules(dir, tenant, now + 3_600_000), /expired/);
  const cache = lastValidJoinRulesPath(dir, tenant), raw = JSON.parse(readFileSync(cache, "utf8"));
  raw.stored.state.optedOutEventIds = [];
  writeFileSync(cache, JSON.stringify(raw));
  assert.throws(() => loadLastValidJoinRules(dir, tenant, now + 1), /integrity-mismatch/);
}));

test("checker: unevaluable current primary refuses and signals degradation without recovery", async () => fixture(async dir => {
  saveJoinRules(dir, tenant, emptyStoredJoinRules());
  let healthy = 0;
  const reasons: string[] = [];
  const input = { toSchedule: [{ source: "gmail" as const, sourceId: "protected-event", sessionKey: "gmail:protected-event",
    title: "fixture", sender: "a@example.com", meetingUrl: "https://zoom.us/j/123456789",
    startTime: "2030-01-01T10:00:00Z", endTime: "2030-01-01T11:00:00Z" }], skipped: [] };
  const result = await enforceJoinRules(input, { stateDir: dir, tenantId: tenant, keyTenantId: tenant,
    mode: "last-valid", now: () => now, log: () => {}, onHealthy: () => { healthy++; },
    onDegraded: event => { reasons.push(event.reason); }, io: { evaluate: () => { throw new Error("fixture failure"); } } });
  assert.equal(result.toSchedule.length, 0);
  assert.equal(result.skipped[0]?.reason, "rules-unevaluable");
  assert.equal(healthy, 0);
  assert.ok(reasons.includes("evaluation-failed"));
}));

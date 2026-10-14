import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { SelectAutoRecordItemsResult } from "@lkb/core";
import { selectAutoRecordItems, loadTrustedSenderConfig } from "../auto-join.js";
import { enforceJoinRules, parseJoinRulesEnforce, type JoinRulesDegradation, type JoinRulesEnforceConfig } from "./join-rules-enforce.js";
import { emptyStoredJoinRules, joinRulesFilePath, saveJoinRules, recordTenantOptOut } from "./join-rules-store.js";
import { lastValidJoinRulesPath, JOIN_RULES_SNAPSHOT_TTL_MS } from "./join-rules-last-valid.js";

const NOW = Date.parse("2030-01-01T09:58:00Z"), TENANT = "tenant-a", ZOOM = "https://zoom.us/j/123456789";
async function root(fn: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-rule-enforce-"));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function selection(): SelectAutoRecordItemsResult {
  return selectAutoRecordItems({ calendarEvents: [], candidates: [{ id: "g1", title: "Webinar: Test", senderEmail: "a@example.com", senderDomain: "example.com",
    senderAuthenticated: true, status: "approved", meetingUrl: ZOOM, startTime: "2030-01-01T10:00:00Z", endTime: "2030-01-01T11:00:00Z", kind: "upcoming" }],
    now: new Date(NOW).toISOString(), leadMinutes: 5, trustedSenders: loadTrustedSenderConfig(), alreadyScheduled: new Set<string>() });
}
function cfg(dir: string, events: JoinRulesDegradation[], more: Partial<JoinRulesEnforceConfig> = {}): JoinRulesEnforceConfig {
  return { mode: "last-valid", stateDir: dir, tenantId: TENANT, keyTenantId: TENANT, now: () => NOW, log: () => {},
    onDegraded: e => { events.push(e); }, ...more };
}
test("mode is explicit and absent/unrecognized remain off", () => {
  assert.equal(parseJoinRulesEnforce("last-valid"), "last-valid");
  for (const raw of [undefined, "", "LAST-VALID", " last-valid", true]) assert.equal(parseJoinRulesEnforce(raw), "off");
});
test("valid primary seeds snapshot; corruption/missing primary uses it without extending expiry", async () => root(async dir => {
  const events: JoinRulesDegradation[] = [], input = selection();
  saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  assert.equal(await enforceJoinRules(input, cfg(dir, events)), input);
  const file = lastValidJoinRulesPath(dir, TENANT), bytes = readFileSync(file);
  writeFileSync(joinRulesFilePath(dir, TENANT), "bad-json");
  assert.deepEqual((await enforceJoinRules(input, cfg(dir, events, { now: () => NOW + 100 }))).toSchedule, input.toSchedule);
  assert.equal(events[0]?.usingSnapshot, true);
  assert.equal(events[0]?.snapshotExpiresAt, NOW + JOIN_RULES_SNAPSHOT_TTL_MS);
  assert.deepEqual(readFileSync(file), bytes);
  unlinkSync(joinRulesFilePath(dir, TENANT));
  assert.equal((await enforceJoinRules(input, cfg(dir, events))).toSchedule.length, 1);
  const expired = await enforceJoinRules(input, cfg(dir, events, { now: () => NOW + JOIN_RULES_SNAPSHOT_TTL_MS }));
  assert.equal(expired.toSchedule.length, 0); assert.equal(expired.skipped[0]?.reason, "rules-unevaluable");
}));
test("full cached deny and cross-source hinted opt-outs remain vetoes", async () => root(async dir => {
  const value = emptyStoredJoinRules(), events: JoinRulesDegradation[] = [];
  value.ruleSet.rules = [{ id: "deny", effect: "deny", match: { email: "a@example.com" } }];
  saveJoinRules(dir, TENANT, value);
  assert.equal((await enforceJoinRules(selection(), cfg(dir, events))).toSchedule.length, 0);
  writeFileSync(joinRulesFilePath(dir, TENANT), "bad");
  assert.equal((await enforceJoinRules(selection(), cfg(dir, events))).skipped[0]?.reason, "rule-denied");
  saveJoinRules(dir, TENANT, emptyStoredJoinRules(), { overwriteInvalid: true });
  recordTenantOptOut(dir, TENANT, "calX", {}, { meetingUrl: ZOOM });
  await enforceJoinRules(selection(), cfg(dir, events));
  writeFileSync(joinRulesFilePath(dir, TENANT), "bad");
  assert.equal((await enforceJoinRules(selection(), cfg(dir, events))).skipped[0]?.reason, "opted-out");
}));
test("missing, expired, future and tampered cache refuse; alert failure does not widen", async () => root(async dir => {
  const events: JoinRulesDegradation[] = [];
  assert.equal((await enforceJoinRules(selection(), cfg(dir, events))).toSchedule.length, 0);
  saveJoinRules(dir, TENANT, emptyStoredJoinRules()); await enforceJoinRules(selection(), cfg(dir, events));
  writeFileSync(joinRulesFilePath(dir, TENANT), "bad");
  assert.equal((await enforceJoinRules(selection(), cfg(dir, events, { now: () => NOW - 1 }))).toSchedule.length, 0);
  const file = lastValidJoinRulesPath(dir, TENANT), p = JSON.parse(readFileSync(file, "utf8")); p.hash = "bad"; writeFileSync(file, JSON.stringify(p));
  assert.equal((await enforceJoinRules(selection(), cfg(dir, events, { onDegraded: () => { throw new Error("sink"); } }))).toSchedule.length, 0);
}));
test("tenant verification refuses before primary/cache reads; wrong-tenant primary cannot fall back", async () => root(async dir => {
  const events: JoinRulesDegradation[] = []; saveJoinRules(dir, TENANT, emptyStoredJoinRules()); await enforceJoinRules(selection(), cfg(dir, events));
  for (const keyTenantId of [undefined, null, "tenant-b"]) {
    let reads = 0;
    const out = await enforceJoinRules(selection(), cfg(dir, events, { keyTenantId, io: { load: () => { reads++; return emptyStoredJoinRules(); } } }));
    assert.equal(out.toSchedule.length, 0); assert.equal(reads, 0);
  }
  const file = joinRulesFilePath(dir, TENANT), p = JSON.parse(readFileSync(file, "utf8")); p.tenantId = "tenant-b"; writeFileSync(file, JSON.stringify(p));
  assert.equal((await enforceJoinRules(selection(), cfg(dir, events))).toSchedule.length, 0);
  assert.equal(events.at(-1)?.reason, "primary-identity-invalid");
}));
test("read-only does not write snapshots or send alerts; empty failed ticks alert once", async () => root(async dir => {
  const events: JoinRulesDegradation[] = []; saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  await enforceJoinRules(selection(), cfg(dir, events, { readOnly: true }));
  assert.equal(existsSync(lastValidJoinRulesPath(dir, TENANT)), false);
  writeFileSync(joinRulesFilePath(dir, TENANT), "bad");
  await enforceJoinRules(selection(), cfg(dir, events, { readOnly: true })); assert.equal(events.length, 0);
  await enforceJoinRules({ toSchedule: [], skipped: [] }, cfg(dir, events)); assert.equal(events.length, 1);
}));
test("healthy callback resets outages only after validated primary/saved snapshot; errors preserve enforcement", async () => root(async dir => {
  const events: JoinRulesDegradation[] = []; let healthy = 0;
  const onHealthy = () => { healthy++; throw new Error("reset sink"); };
  saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  assert.equal((await enforceJoinRules(selection(), cfg(dir, events, { onHealthy }))).toSchedule.length, 1);
  assert.equal(healthy, 1);
  await enforceJoinRules(selection(), cfg(dir, events, { onHealthy, readOnly: true })); assert.equal(healthy, 1);
  writeFileSync(joinRulesFilePath(dir, TENANT), "bad");
  await enforceJoinRules(selection(), cfg(dir, events, { onHealthy })); assert.equal(healthy, 1);
}));
test("primary change between captured validation and snapshot lock refuses stale current selection", async () => root(async dir => {
  const events: JoinRulesDegradation[] = []; saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  const stale = emptyStoredJoinRules();
  recordTenantOptOut(dir, TENANT, "g1");
  const out = await enforceJoinRules(selection(), cfg(dir, events, { io: { load: () => stale } }));
  assert.equal(out.toSchedule.length, 0); assert.equal(out.skipped[0]?.reason, "rules-unevaluable");
  assert.equal(events.at(-1)?.reason, "primary-changed"); assert.equal(events.at(-1)?.usingSnapshot, false);
  assert.equal(existsSync(lastValidJoinRulesPath(dir, TENANT)), false);
}));
test("cached enforcement preserves previously rejected/cancelled selection and evaluator errors refuse", async () => root(async dir => {
  saveJoinRules(dir, TENANT, emptyStoredJoinRules()); const events: JoinRulesDegradation[] = [], selected = selection();
  const skipped = { ...selected.toSchedule[0]!, reason: "cancelled" as const, detail: "cancelled earlier" };
  const input = { toSchedule: [], skipped: [skipped] };
  assert.equal(await enforceJoinRules(input, cfg(dir, events)), input);
  writeFileSync(joinRulesFilePath(dir, TENANT), "bad");
  assert.deepEqual(await enforceJoinRules(input, cfg(dir, events)), input);
  const failed = await enforceJoinRules(selected, cfg(dir, events, { io: { evaluate: () => { throw new Error("evaluator"); } } }));
  assert.equal(failed.toSchedule.length, 0); assert.equal(failed.skipped[0]?.reason, "rules-unevaluable");
  assert.equal(events.at(-1)?.reason, "evaluation-failed"); assert.equal(events.at(-1)?.usingSnapshot, true);
  let cleared = false;
  saveJoinRules(dir, TENANT, emptyStoredJoinRules(), { overwriteInvalid: true });
  await enforceJoinRules(selected, cfg(dir, events, { onHealthy: () => { cleared = true; },
    io: { evaluate: () => { throw new Error("evaluator"); } } }));
  assert.equal(cleared, false); assert.equal(events.at(-1)?.reason, "evaluation-failed");
}));

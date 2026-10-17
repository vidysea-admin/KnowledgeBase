import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runScheduleTickOnce, type ScheduleTickDeps } from "./schedule-tick.js";
import { emptyStoredJoinRules, saveJoinRules, joinRulesFilePath } from "./join-rules/join-rules-store.js";
import { saveLastValidJoinRules, lastValidJoinRulesPath } from "./join-rules/join-rules-last-valid.js";
import { AUTOJOIN_OFF } from "../autojoin/config.js";
import type { JoinRulesDegradation } from "./join-rules/join-rules-enforce.js";

const TENANT = "tenant-integration", NOW = "2026-10-14T12:00:00Z";
async function fixture(run: (dir: string, deps: ScheduleTickDeps, events: JoinRulesDegradation[], healthy: () => number) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-rules-glue-"));
  const events: JoinRulesDegradation[] = []; let recovered = 0;
  const deps: ScheduleTickDeps = {
    stateDir: dir, stateTenantId: TENANT, joinRulesTenantId: TENANT, joinRulesKeyTenantId: TENANT,
    joinRulesEnforce: "last-valid", loadCalendarEvents: async () => [], loadCandidates: async () => [],
    now: () => NOW, log: () => {}, scheduler: { scheduleOnce: async () => { throw new Error("No meetings expected"); } },
    autojoin: { cfg: AUTOJOIN_OFF, tagsDir: path.join(dir, "capture-tags"), raise: async () => {},
      rulesDegraded: async event => { events.push(event); }, rulesHealthy: () => { recovered++; } },
  };
  try { await run(dir, deps, events, () => recovered); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test("schedule tick dry run suppresses degradation alerts and snapshot writes", async () => fixture(async (dir, deps, events, healthy) => {
  await runScheduleTickOnce(deps, true);
  assert.deepEqual(events, []); assert.equal(healthy(), 0); assert.deepEqual(readdirSync(dir), []);
  deps.joinRulesIo = { load: () => emptyStoredJoinRules() };
  await runScheduleTickOnce(deps, true);
  assert.deepEqual(events, []); assert.equal(healthy(), 0); assert.deepEqual(readdirSync(dir), []);
}));

test("schedule tick degradation reaches downstream sink and uses injected tick clock", async () => fixture(async (dir, deps, events) => {
  saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  saveLastValidJoinRules(dir, TENANT, emptyStoredJoinRules(), Date.parse(NOW) - 60_000);
  unlinkSync(joinRulesFilePath(dir, TENANT));
  await runScheduleTickOnce(deps, false);
  assert.equal(events.length, 1); assert.equal(events[0]?.tenantId, TENANT);
  assert.equal(events[0]?.usingSnapshot, true);
  assert.equal(events[0]?.snapshotValidatedAt, Date.parse(NOW) - 60_000);
  assert.equal(events[0]?.snapshotExpiresAt, Date.parse(NOW) - 60_000 + 3_600_000);
}));

test("schedule tick validated primary clears outage only after snapshot persists", async () => fixture(async (dir, deps, events, healthy) => {
  saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  await runScheduleTickOnce(deps, false);
  assert.equal(healthy(), 1); assert.deepEqual(events, []);
}));

test("schedule tick snapshot-save failure cannot clear active outage", async () => fixture(async (dir, deps, events, healthy) => {
  saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  mkdirSync(lastValidJoinRulesPath(dir, TENANT), { recursive: true });
  await runScheduleTickOnce(deps, false);
  assert.equal(healthy(), 0);
  assert.equal(events[0]?.reason, "snapshot-write-failed"); assert.equal(events[0]?.usingSnapshot, false);
}));

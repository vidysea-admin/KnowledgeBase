import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync, unlinkSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import type {AutoRecordCandidateInput} from "@lkb/core";
import {runScheduleTickOnce, type ScheduleTickDeps} from "../schedule-tick.js";
import {emptyStoredJoinRules, saveJoinRules, loadJoinRules, recordTenantApproval, joinRulesFilePath} from "./join-rules-store.js";
import {saveLastValidJoinRules, lastValidJoinRulesPath} from "./join-rules-last-valid.js";
import {readScheduledJob} from "../state/schedule-dedup-state.js";
import {deriveJobKey} from "../task-scheduler.js";

const TENANT = "approved-trust-tick", NOW = "2030-01-01T09:58:00Z";
const candidate = (id = "next-source"): AutoRecordCandidateInput => ({id, title: "Career webinar", senderEmail: "host@example.org",
  senderDomain: "example.org", senderAuthenticated: true, status: "pending", meetingUrl: "https://zoom.us/j/123456789",
  meetingUrlSource: "conference", startTime: "2030-01-01T10:00:00Z", endTime: "2030-01-01T11:00:00Z"});
async function fixture(run: (dir: string, deps: ScheduleTickDeps, scheduled: string[]) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "approved-trust-tick-")), scheduled: string[] = [];
  const oldEmail = process.env.AUTO_RECORD_TRUSTED_EMAILS, oldDomain = process.env.AUTO_RECORD_TRUSTED_DOMAINS;
  process.env.AUTO_RECORD_TRUSTED_EMAILS = "nobody@unrelated.test"; process.env.AUTO_RECORD_TRUSTED_DOMAINS = "unrelated.test";
  const deps: ScheduleTickDeps = {stateDir: dir, stateTenantId: TENANT, joinRulesTenantId: TENANT,
    joinRulesEnforce: "last-valid", loadKeyTenant: async () => TENANT, now: () => NOW,
    loadCalendarEvents: async () => [], loadCandidates: async () => [candidate()], log: () => {},
    scheduler: {scheduleOnce: async job => {scheduled.push(job.jobKey);}}};
  saveJoinRules(dir, TENANT, emptyStoredJoinRules());
  try {await run(dir, deps, scheduled);} finally {
    if (oldEmail === undefined) delete process.env.AUTO_RECORD_TRUSTED_EMAILS; else process.env.AUTO_RECORD_TRUSTED_EMAILS = oldEmail;
    if (oldDomain === undefined) delete process.env.AUTO_RECORD_TRUSTED_DOMAINS; else process.env.AUTO_RECORD_TRUSTED_DOMAINS = oldDomain;
    rmSync(dir, {recursive: true, force: true});
  }
}
function approve(dir: string, kind: "sender" | "domain" = "sender") {
  recordTenantApproval(dir, TENANT, {kind, value: kind === "sender" ? "host@example.org" : "example.org"});
}

test("saved approval reload schedules a distinct authenticated pending webinar and persists exact dispatch identity", async () => fixture(async (dir, deps, scheduled) => {
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
  approve(dir); assert.deepEqual(loadJoinRules(dir, TENANT).state.approvedSenders, ["host@example.org"]);
  // This source differs from the previously reviewed invitation; no per-source status is changed.
  deps.loadCandidates = async () => [candidate("distinct-next-webinar")];
  let keyChecks = 0; deps.loadKeyTenant = async () => {keyChecks++; return TENANT;};
  const result = await runScheduleTickOnce(deps, false);
  assert.equal(keyChecks, 1); assert.equal(result.toSchedule.length, 1); assert.equal(scheduled.length, 1);
  const item = result.toSchedule[0]!, job = readScheduledJob(dir, deriveJobKey(item.sessionKey)!, TENANT)!;
  assert.equal(item.sourceId, "distinct-next-webinar"); assert.equal(job.sessionId, item.sessionKey);
  assert.equal(job.dispatchPolicyV1?.sourceId, item.sourceId); assert.equal(job.dispatchPolicyV1?.sender, "host@example.org");
  assert.equal(job.url, candidate().meetingUrl); assert.equal(job.until, candidate().endTime);
  assert.equal((await runScheduleTickOnce(deps, false)).toSchedule.length, 0); assert.equal(scheduled.length, 1);
}));

test("approve-once refuses absent approval, unauthenticated and inconsistent source identity without altering statuses", async () => fixture(async (dir, deps, scheduled) => {
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
  approve(dir);
  for (const change of [{senderAuthenticated: false}, {senderAuthenticated: undefined}, {senderDomain: "foreign.example"},
    {status: "rejected" as const}, {registrationOnly: true}, {meetingUrlSource: "description" as const},
    {meetingLinkIssue: "ambiguous" as const}, {cancelled: true}, {title: "Private meeting"}]) {
    const input = {...candidate(), ...change}, before = JSON.stringify(input);
    deps.loadCandidates = async () => [input];
    assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0, JSON.stringify(change));
    assert.equal(JSON.stringify(input), before);
  }
  assert.deepEqual(scheduled, []);
}));

test("verified key, rules owner and persistence owner must agree before approval grants", async () => fixture(async (dir, deps, scheduled) => {
  approve(dir);
  for (const keyTenant of [null, "foreign-tenant"]) {
    deps.loadKeyTenant = async () => keyTenant;
    deps.joinRulesIo = {load: () => {throw new Error("Foreign key must not read rules");}};
    assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
  }
  deps.joinRulesIo = undefined;
  deps.loadKeyTenant = async () => TENANT; deps.stateTenantId = "foreign-state-owner";
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
  assert.deepEqual(scheduled, []);
}));

test("saved deny and both source/session opt-outs dominate persisted approval", async () => fixture(async (dir, deps) => {
  approve(dir); const approved = loadJoinRules(dir, TENANT);
  for (const eventId of ["next-source", "gmail:next-source"]) {
    saveJoinRules(dir, TENANT, {...approved, state: {...approved.state, optedOutEventIds: [eventId]}});
    assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
  }
  saveJoinRules(dir, TENANT, {...approved, ruleSet: {...approved.ruleSet,
    rules: [{id: "deny-sender", effect: "deny", match: {email: "host@example.org"}}]}});
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
}));

test("candidate-specific approval does not admit another candidate and preserves global overlap selection", async () => fixture(async (dir, deps) => {
  approve(dir, "domain");
  const other = {...candidate("other-source"), title: "Private meeting", senderEmail: "other@example.org"};
  deps.loadCandidates = async () => [candidate(), other];
  let result = await runScheduleTickOnce(deps, true);
  assert.deepEqual(result.toSchedule.map(item => item.sourceId), ["next-source"]);
  assert.equal(result.skipped.find(item => item.sourceId === "other-source")?.reason, "untrusted-sender");
  deps.loadCandidates = async () => [candidate(), {...other, title: "Other career webinar"}];
  result = await runScheduleTickOnce(deps, true);
  assert.equal(result.toSchedule.length, 1); assert.equal(result.skipped.filter(item => item.reason === "overlap-lost").length, 1);
}));

test("selection and veto consume one verified document despite an intervening primary replacement", async () => fixture(async (dir, deps) => {
  approve(dir); const approved = loadJoinRules(dir, TENANT); let reads = 0;
  // Fail-closed mode avoids snapshot's deliberate revalidation read; this counts the authoritative resolution.
  deps.joinRulesEnforce = "fail-closed";
  deps.joinRulesIo = {load: () => {reads++; saveJoinRules(dir, TENANT, emptyStoredJoinRules()); return approved;}};
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 1);
  assert.equal(reads, 1); assert.deepEqual(loadJoinRules(dir, TENANT).state.approvedSenders, []);
}));

test("last-valid approved snapshot keeps original lifetime and refuses expired or future authority", async () => fixture(async (dir, deps) => {
  approve(dir); const approved = loadJoinRules(dir, TENANT), now = Date.parse(NOW);
  for (const age of [60_000, 3_600_000, -1]) {
    saveLastValidJoinRules(dir, TENANT, approved, now - age);
    const snapshot = readFileSync(lastValidJoinRulesPath(dir, TENANT)); unlinkSync(joinRulesFilePath(dir, TENANT));
    assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, age === 60_000 ? 1 : 0);
    assert.deepEqual(readFileSync(lastValidJoinRulesPath(dir, TENANT)), snapshot);
    saveJoinRules(dir, TENANT, approved);
  }
}));

test("off and everyWebinar retain their existing selection policy and do not project new approvals", async () => fixture(async (dir, deps) => {
  approve(dir); deps.joinRulesEnforce = "off";
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
  // ISS-376 policy stays explicitly unchanged; this is a compatibility assertion, not acceptance.
  deps.everyWebinar = true; deps.loadCandidates = async () => [{...candidate(), senderAuthenticated: false}];
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 1);
}));

test("missing or corrupt snapshot never supplies persisted approval after primary loss", async () => fixture(async (dir, deps) => {
  approve(dir); unlinkSync(joinRulesFilePath(dir, TENANT));
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
  writeFileSync(lastValidJoinRulesPath(dir, TENANT), "{broken-snapshot");
  assert.equal((await runScheduleTickOnce(deps, true)).toSchedule.length, 0);
}));

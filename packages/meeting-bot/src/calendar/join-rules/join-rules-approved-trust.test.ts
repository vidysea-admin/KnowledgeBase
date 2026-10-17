import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import type {AutoRecordCandidateInput} from "@lkb/core";
import {projectApprovedSenderTrust, type ApprovedTrustInput} from "./join-rules-approved-trust.js";
import {EMPTY_JOIN_RULE_STATE, type JoinRuleState} from "./join-rules.js";
import {loadJoinRules, recordTenantApproval, saveJoinRules} from "./join-rules-store.js";
import {selectAutoRecordItems} from "../auto-join.js";
import {applyJoinRules} from "./join-rules-select.js";

const now = Date.parse("2030-01-01T09:58:00Z");
const candidate = (id = "next-source"): AutoRecordCandidateInput => ({id, title: "Career webinar", senderEmail: "host@example.org",
  senderDomain: "example.org", senderAuthenticated: true, status: "pending", meetingUrl: "https://zoom.us/j/123456789",
  meetingUrlSource: "conference", startTime: "2030-01-01T10:00:00Z", endTime: "2030-01-01T11:00:00Z"});
const approved = (): JoinRuleState => ({...EMPTY_JOIN_RULE_STATE, approvedSenders: ["host@example.org"]});
const input = (): ApprovedTrustInput => ({context: {configuredTenantId: "tenant-a", keyTenantId: "tenant-a", verifiedAt: now, now,
  document: {tenantId: "tenant-a", source: "primary", validatedAt: now, stored: {ruleSet: {version: 1, ownDomains: [], rules: []}, state: approved()}}},
  candidate: candidate(), base: {emails: [], domains: []}, classification: "webinar", leadMinutes: 5});
const select = (x: ApprovedTrustInput, alreadyScheduled: string[] = []) => selectAutoRecordItems({calendarEvents: [], candidates: [x.candidate],
  now: new Date(x.context.now).toISOString(), leadMinutes: x.leadMinutes, trustedSenders: projectApprovedSenderTrust(x) ?? x.base, alreadyScheduled});
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test("saved exact approval survives reload and admits a distinct pending authenticated source through the real legacy selector", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "approved-trust-"));
  try {
    const x = input(); x.context.document.stored.state = {...EMPTY_JOIN_RULE_STATE};
    assert.equal(select(x).toSchedule.length, 0);
    saveJoinRules(dir, "tenant-a", x.context.document.stored);
    recordTenantApproval(dir, "tenant-a", {kind: "sender", value: "host@example.org"});
    x.context.document.stored = loadJoinRules(dir, "tenant-a"); // restart/reload, not previous candidate approval status
    const old = {...x, candidate: candidate("first-source")};
    assert.equal(select(old).toSchedule.length, 1);
    const selected = select(x, ["gmail:first-source"]);
    assert.equal(selected.toSchedule[0]?.sourceId, "next-source");
    assert.equal(x.candidate.status, "pending");
    assert.equal(applyJoinRules(selected, x.context.document.stored.ruleSet, {state: x.context.document.stored.state}).toSchedule.length, 1);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("projects only exact saved sender/domain, preserves base and never treats an allow rule as approve-once", () => {
  const x = input(); x.base = {emails: ["bootstrap@example.net"], domains: ["partner.example.net"]};
  const before = JSON.stringify(x), projected = projectApprovedSenderTrust(freeze(x));
  assert.deepEqual(projected, {emails: ["bootstrap@example.net", "host@example.org"], domains: ["partner.example.net"]});
  assert.equal(JSON.stringify(x), before);
  const domain = input(); domain.context.document.stored.state = {...EMPTY_JOIN_RULE_STATE, approvedDomains: ["example.org"]};
  assert.deepEqual(projectApprovedSenderTrust(domain), {emails: [], domains: ["example.org"]});
  domain.candidate.senderEmail = "host@sub.example.org"; domain.candidate.senderDomain = "sub.example.org";
  assert.equal(projectApprovedSenderTrust(domain), undefined);
  const allow = input(); allow.context.document.stored.state = {...EMPTY_JOIN_RULE_STATE};
  allow.context.document.stored.ruleSet.rules = [{id: "allow", effect: "allow", match: {email: "host@example.org"}}];
  assert.equal(projectApprovedSenderTrust(allow), undefined);
});

test("fresh equal owner and complete validated document are mandatory, with exclusive last-valid expiry", () => {
  for (const change of [{keyTenantId: "tenant-b"}, {configuredTenantId: "tenant-b"}, {verifiedAt: now - 1}, {now: NaN}, {now: -1}]) {
    const x = input(); Object.assign(x.context, change); assert.equal(projectApprovedSenderTrust(x), undefined);
  }
  for (const age of [0, 3_599_999, 3_600_000, -1]) {
    const x = input(); x.context.document.source = "last-valid"; x.context.document.validatedAt = now - age;
    assert.equal(Boolean(projectApprovedSenderTrust(x)), age >= 0 && age < 3_600_000);
  }
  for (const change of [{tenantId: "tenant-b"}, {source: "missing"}, {validatedAt: now - 1}, {stored: null}]) {
    const x = input(); Object.assign(x.context.document, change); assert.equal(projectApprovedSenderTrust(x), undefined);
  }
  const bad = input(); bad.context.document.stored.state = {approvedSenders: "host@example.org"} as never;
  assert.equal(projectApprovedSenderTrust(bad), undefined);
  for (const base of [{emails: [undefined], domains: []}, {emails: [], domains: [undefined]}, {emails: [" host@example.org"], domains: []}]) {
    assert.equal(projectApprovedSenderTrust({...input(), base: base as never}), undefined);
  }
});

test("deny and exact/source/session/meeting opt-outs block projection before selection; aliases never grant", () => {
  const deny = input(); deny.context.document.stored.ruleSet.rules = [{id: "deny", effect: "deny", match: {email: "host@example.org"}}];
  assert.equal(projectApprovedSenderTrust(deny), undefined); assert.equal(select(deny).toSchedule.length, 0);
  for (const [optOut, aliases] of [["next-source", []], ["gmail:next-source", []], ["cal:proven-copy", ["cal:proven-copy"]]] as const) {
    const x = input(); x.context.document.stored.state.optedOutEventIds = [optOut]; x.identityIds = aliases;
    assert.equal(projectApprovedSenderTrust(x), undefined); assert.equal(select(x).toSchedule.length, 0);
  }
  const meeting = input(); meeting.context.document.stored.state.optedOutMeetings = ["url:zoom:123456789"];
  assert.equal(projectApprovedSenderTrust(meeting), undefined);
  const noTrust = input(); noTrust.context.document.stored.state = {...EMPTY_JOIN_RULE_STATE}; noTrust.identityIds = ["approved-other-source"];
  assert.equal(projectApprovedSenderTrust(noTrust), undefined);
  const tooMany = input(); tooMany.identityIds = Array.from({length: 201}, (_, i) => `source-${i}`);
  assert.equal(projectApprovedSenderTrust(tooMany), undefined);
});

test("projection cannot supply trust to unauthenticated, rejected, cancelled, registration-only or unsafe source", () => {
  for (const change of [{senderAuthenticated: false}, {senderAuthenticated: undefined}, {status: "rejected"}, {status: "unknown"},
    {cancelled: true}, {registrationOnly: true}, {meetingUrlSource: "description"}, {meetingUrlSource: undefined},
    {senderEmail: " host@example.org"}, {senderDomain: "evil.org"}, {meetingUrl: "http://zoom.us/j/123456789"},
    {meetingUrl: "https://evil.example.org/room"}, {meetingUrl: " https://zoom.us/j/123456789"},
    {meetingUrl: "https://user:pass@zoom.us/j/123456789"}, {startTime: "invalid"}, {endTime: "2030-01-01T09:00:00Z"}]) {
    const x = input(); Object.assign(x.candidate, change); assert.equal(projectApprovedSenderTrust(x), undefined);
  }
  for (const classification of ["meeting", "uncertain"] as const) {
    const x = input(); x.classification = classification; assert.equal(projectApprovedSenderTrust(x), undefined);
  }
  const future = input(); future.candidate.startTime = "2030-01-02T10:00:00Z"; future.candidate.endTime = "2030-01-02T11:00:00Z";
  assert.equal(projectApprovedSenderTrust(future), undefined);
  const past = input(); past.candidate.startTime = "2029-01-01T10:00:00Z"; past.candidate.endTime = "2029-01-01T11:00:00Z";
  assert.equal(projectApprovedSenderTrust(past), undefined);
});

test("legacy dedup and unchanged veto remain decisive; every-webinar ISSUE376 is explicitly unresolved", () => {
  const x = input(); assert.equal(select(x, ["gmail:next-source"]).toSchedule.length, 0);
  const selected = select(x); x.context.document.stored.state.optedOutEventIds = ["next-source"];
  assert.equal(applyJoinRules(selected, x.context.document.stored.ruleSet, {state: x.context.document.stored.state}).toSchedule.length, 0);
  const skipped = select({...x, context: input().context, candidate: {...candidate(), senderAuthenticated: false}});
  assert.equal(skipped.toSchedule.length, 0);
  assert.equal(applyJoinRules(skipped, input().context.document.stored.ruleSet, {state: approved()}).toSchedule.length, 0);
  // This retained legacy reproduction is evidence of the OPEN policy gate, not a positive authority test.
  const broad = selectAutoRecordItems({calendarEvents: [], candidates: [{...candidate(), senderEmail: "attacker@evil.com", senderDomain: "evil.com",
    senderAuthenticated: false}], now: new Date(now).toISOString(), leadMinutes: 5, trustedSenders: {emails: [], domains: []},
    alreadyScheduled: [], everyWebinar: true});
  assert.equal(broad.toSchedule.length, 1);
});

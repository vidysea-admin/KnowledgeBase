/**
 * ISS-322 / ISS-333 regression (D-015): the ledger rows' own recorded reproductions, re-run verbatim,
 * counted by issue id. meeting-bot side: the config allowlist (route 1) and the preTrusted shortcut
 * (route 2) in selectAutoRecordItems. The API side (route 3, store.ts) is in
 * apps/api/src/routes/meeting-candidates.test.ts. Also pins parity between core's strict From parse
 * and this package's parseStrictEmail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessSender } from "@lkb/core";
import type { AutoRecordCandidateInput } from "@lkb/core";
import { selectAutoRecordItems } from "./auto-join.js";
import { loadTrustedSenderConfig } from "./auto-record-policy.js";
import { parseStrictEmail } from "./join-rules/join-rules.js";
import { reconcileWebinarSources } from "./calendar-client.js";

const cfg = loadTrustedSenderConfig({} as NodeJS.ProcessEnv); // the 4 default entries ISS-322 names
const run = (c: Partial<AutoRecordCandidateInput>) => selectAutoRecordItems({
  calendarEvents: [], now: "2026-09-28T12:26:00Z", leadMinutes: 5, trustedSenders: cfg, alreadyScheduled: [],
  candidates: [{ id: "c1", title: "TOC webinar", senderEmail: "x@y.com", senderDomain: "y.com", status: "pending",
    meetingUrl: "https://zoom.us/j/123456789", startTime: "2026-09-28T12:30:00Z", endTime: "2026-09-28T13:30:00Z",
    kind: "upcoming", ...c }],
});
const scheduled = (c: Partial<AutoRecordCandidateInput>) => run(c).toSchedule.length === 1;

// ISS-322 row: "all 4 default entries, not just the new umeshsugara@vidysea.com row" rest on an unauthenticated From.
const DEFAULTS: Array<[string, string]> = [["karunn@vidysea.com", "vidysea.com"], ["umeshsugara@vidysea.com", "vidysea.com"],
  ["anyone@theoutreachcollective.in", "theoutreachcollective.in"], ["anyone@ashoka.edu.in", "ashoka.edu.in"]];

test("ISS-322 recorded cases: each of the 4 default trusted entries, spoofed (no verdict), is refused on the allowlist route", () => {
  let refused = 0;
  for (const [senderEmail, senderDomain] of DEFAULTS) {
    for (const extra of [{}, { senderAuthenticated: false }] as Partial<AutoRecordCandidateInput>[]) {
      const r = run({ senderEmail, senderDomain, ...extra });
      assert.equal(r.toSchedule.length, 0, senderEmail);
      assert.equal(r.skipped[0]?.reason, "untrusted-sender");
    }
    refused++;
    assert.equal(scheduled({ senderEmail, senderDomain, senderAuthenticated: true }), true, `${senderEmail} authenticated stays trusted`);
  }
  console.log(`ISS-322: ${refused}/${DEFAULTS.length} refused (spoofed default entries); ${DEFAULTS.length}/${DEFAULTS.length} authenticated still trusted`);
  assert.equal(refused, 4);
});

test("ISS-333 (d): an auto_approved row without an authenticated sender is skipped; (e) a human approval is trusted regardless", () => {
  let behaved = 0;
  for (const senderAuthenticated of [undefined, false]) {
    const r = run({ status: "auto_approved", senderEmail: "x@unlisted.example", senderDomain: "unlisted.example", senderAuthenticated });
    assert.equal(r.toSchedule.length, 0); assert.equal(r.skipped[0]?.reason, "untrusted-sender");
  }
  behaved++; // (d)
  assert.equal(scheduled({ status: "auto_approved", senderEmail: "x@unlisted.example", senderDomain: "unlisted.example", senderAuthenticated: true }), true);
  for (const senderAuthenticated of [undefined, false, true]) {
    assert.equal(scheduled({ status: "approved", senderEmail: "x@unlisted.example", senderDomain: "unlisted.example", senderAuthenticated }), true);
  }
  behaved++; // (e)
  console.log(`ISS-333 (meeting-bot side, d+e): ${behaved}/2 behave as recorded`);
  assert.equal(behaved, 2);
});

test("a rejected row is never revived by a verdict, and the calendar organizer path is unchanged", () => {
  assert.equal(run({ status: "rejected", senderEmail: "karunn@vidysea.com", senderDomain: "vidysea.com", senderAuthenticated: true }).toSchedule.length, 0);
  const r = selectAutoRecordItems({ candidates: [], now: "2026-09-28T12:26:00Z", leadMinutes: 5, trustedSenders: cfg, alreadyScheduled: [],
    calendarEvents: [{ id: "e1", title: "TOC webinar", startTime: "2026-09-28T12:30:00Z", endTime: "2026-09-28T13:30:00Z",
      meetingUrl: "https://zoom.us/j/123456789", organizer: "karunn@vidysea.com" }] });
  assert.equal(r.toSchedule.length, 1);
});

test("parity: core's strict From parse agrees with parseStrictEmail on bare addresses", () => {
  const vectors = ["a@b.com", "A@B.Com", "a@b.com ", "a@b.com.", "evil@x.com@ashoka.edu.in", "x@ashoka.edu.in@evil.com", "a@localhost",
    "a@b..com", "a@-b.com", "a@b.c", "(c)a@b.com", "a,b@c.com", "a;b@c.com", "a\"b@c.com", "a\\b@c.com", "é@b.com",
    "a@b.com​", "", "plain", "@b.com", "a@", "ops@theoutreachcollective.in", "umeshsugara@vidysea.com"];
  for (const v of vectors) {
    const core = v === v.trim() ? assessSender([{ name: "From", value: v }]) : undefined; // core trims a header's folding whitespace
    const strict = parseStrictEmail(v);
    assert.equal(core?.senderEmail, strict?.email, JSON.stringify(v));
    assert.equal(core?.senderDomain, strict?.domain, JSON.stringify(v));
  }
});

test("reconciliation accepts the verdict key on a gmail candidate and refuses a non-boolean one", () => {
  const input = { tenantId: "lane", checkedAt: "2026-10-01T10:00:00.000Z", acquisition: { complete: true, historyComplete: true }, calendarEvents: [] };
  const row = { id: "g1", title: "Webinar", senderEmail: "a@ashoka.edu.in", senderDomain: "ashoka.edu.in", status: "auto_approved" as const,
    meetingUrl: "https://meet.google.com/abc-defg-hij", startTime: "2026-10-01T12:00:00.000Z", endTime: "2026-10-01T13:00:00.000Z" };
  assert.equal(reconcileWebinarSources({ ...input, candidates: [{ ...row, senderAuthenticated: true }] }).candidates.length, 1);
  assert.throws(() => reconcileWebinarSources({ ...input, candidates: [{ ...row, senderAuthenticated: "yes" as unknown as boolean }] }));
});

// ISS-376 (Approver ruling 1, hybrid): the row's own recorded reproductions, replayed verbatim in everyWebinar mode.
const everyWebinarRun = (c: Record<string, unknown>) => selectAutoRecordItems({ everyWebinar: true,
  candidates: [{ id: "c376", senderEmail: "attacker@evil.com", senderDomain: "evil.com", status: "pending", title: "Webinar: T",
    meetingUrl: "https://zoom.us/j/123456789", startTime: "2030-01-01T10:00:00Z", endTime: "2030-01-01T11:00:00Z", ...c } as AutoRecordCandidateInput],
  now: "2030-01-01T09:58:00Z", leadMinutes: 5, trustedSenders: cfg, calendarEvents: [], alreadyScheduled: [] });

test("ISS-376 recorded reproductions (everyWebinar): 1 failed-auth refused, 2 unknown needs approval, 3 authenticated/approved scheduled, 4 rejected refused", () => {
  let held = 0;
  const failed = everyWebinarRun({ senderAuthenticated: false });
  assert.equal(failed.toSchedule.length, 0); assert.equal(failed.skipped[0]?.reason, "untrusted-sender"); held++; // (1)
  const unknown = everyWebinarRun({ senderAuthenticated: undefined });
  assert.equal(unknown.toSchedule.length, 0); assert.equal(unknown.skipped[0]?.reason, "needs-review");
  assert.match(unknown.skipped[0]?.detail ?? "", /needs approval/); held++; // (2) visible, never silent
  assert.equal(everyWebinarRun({ senderAuthenticated: true }).toSchedule.length, 1); held++; // (3a)
  for (const senderAuthenticated of [undefined, false]) assert.equal(everyWebinarRun({ status: "approved", senderAuthenticated }).toSchedule.length, 1);
  held++; // (3b) a human approval is the promotion path
  assert.equal(everyWebinarRun({ status: "rejected", senderAuthenticated: true }).toSchedule.length, 0); held++; // (4)
  assert.equal(everyWebinarRun({ status: "auto_approved", senderAuthenticated: false }).toSchedule.length, 0);
  assert.equal(everyWebinarRun({ status: "auto_approved", senderAuthenticated: true }).toSchedule.length, 1);
  console.log(`ISS-376: ${held}/5 recorded reproductions behave as recorded`);
  assert.equal(held, 5);
});

test("ISS-376: calendar-sourced items stay schedulable in everyWebinar mode", () => {
  const r = selectAutoRecordItems({ everyWebinar: true, candidates: [], now: "2030-01-01T09:58:00Z", leadMinutes: 5, trustedSenders: cfg, alreadyScheduled: [],
    calendarEvents: [{ id: "e376", title: "Webinar: T", startTime: "2030-01-01T10:00:00Z", endTime: "2030-01-01T11:00:00Z",
      meetingUrl: "https://meet.google.com/abc-defg-hij", organizer: "anyone@evil.com" }] });
  assert.equal(r.toSchedule.length, 1);
});

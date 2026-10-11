/**
 * alert-who against state built the way PRODUCTION builds it (ISS-ALERTID-004 / D-015).
 * Nothing is injected from the formatter's inputs into the resolver's candidate list:
 *   1. runScheduleTickOnce (everyWebinar: true, injected clock, fake loaders and scheduler, no network) writes schedule-state.json and
 *      scheduled/*.json into a temp root;
 *   2. prepareWebinarSourceState (the real reconcile + projectWebinarInventory path) builds operations.json for the same inputs;
 *   3. the REAL buildAttentionAlerts formats the tick's skipped list and the operations rows;
 *   4. runAlertWho reads ONLY the temp root. The table of alert kind -> resolves is pinned below, so silently dropping coverage fails.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SKIP_REASONS, type SkippedItem } from "@lkb/core";
import type { AutoRecordCandidateInput } from "./calendar/auto-join.js";
import { alertIdFor, buildAttentionAlerts } from "./calendar/alerts/attention-alerts.js";
import { webinarSessionKey } from "./calendar/auto-record-policy.js";
import type { CalendarEvent } from "./calendar/calendar-client.js";
import { prepareWebinarSourceState, readWebinarOperationState, writeWebinarOperationState, type WebinarCalendarAcquisition } from "./calendar/schedule-state.js";
import { runScheduleTickOnce } from "./calendar/schedule-tick.js";
import { runAlertWho, type AlertWhoDeps } from "./alert-who-command.js";

const NOW = "2026-10-10T10:00:00.000Z";
const ev = (id: string, title: string, o: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title, startTime: "2026-10-10T10:02:00.000Z", endTime: "2026-10-10T11:00:00.000Z", meetingUrl: `https://zoom.us/j/${id.replace(/\D/g, "").padEnd(11, "7")}`, ...o });
const EVENTS: CalendarEvent[] = [
  ev("evJ1", "Webinar Alpha", { meetingUrl: "https://zoom.us/j/11111111111" }),
  ev("evO2", "Webinar Beta", { meetingUrl: "https://zoom.us/j/22222222222", startTime: "2026-10-10T10:03:00.000Z", endTime: "2026-10-10T11:30:00.000Z" }),
  ev("evN3", "Webinar NoLink", { meetingUrl: undefined }),
  ev("evU4", "Webinar Unsafe", { meetingUrl: "https://example.com/room" }),
  ev("evM5", "Team meeting sync"),
  ev("evR6", "Quarterly strategy discussion"),
  ev("evX7", "Webinar Cancelled", { meetingUrl: "https://zoom.us/j/33333333333", cancelled: true }),
  ev("evI9", "Webinar BadTime", { meetingUrl: "https://zoom.us/j/55555555555", endTime: "2026-10-10T10:01:00.000Z" }),
  ev("evP8", "Webinar Past", { meetingUrl: "https://zoom.us/j/44444444444", startTime: "2026-10-10T08:00:00.000Z", endTime: "2026-10-10T09:00:00.000Z" }),
  ev("evF10", "Webinar FreeText", { meetingUrl: "https://zoom.us/j/88888888888", meetingUrlSource: "description" }),
];
const cand = (id: string, o: Partial<AutoRecordCandidateInput>): AutoRecordCandidateInput => ({
  id, title: "Webinar Mail", senderEmail: "host@example.org", senderDomain: "example.org", senderAuthenticated: true, status: "pending",
  startTime: "2026-10-10T10:02:00.000Z", endTime: "2026-10-10T11:00:00.000Z", kind: "upcoming", ...o });
const CANDS: AutoRecordCandidateInput[] = [
  cand("g-dup", { title: "Webinar Alpha", meetingUrl: "https://zoom.us/j/11111111111", status: "approved" }),
  cand("g-rej", { title: "Webinar Rejected", meetingUrl: "https://zoom.us/j/66666666666", status: "rejected" }),
  cand("g-reg", { title: "Webinar Register", registrationOnly: true, registrationUrl: "https://events.example.com/register", messageId: "m1", threadId: "t1" } as Partial<AutoRecordCandidateInput>),
];
const VETO: SkippedItem[] = (["opted-out", "rule-denied", "rules-unevaluable"] as const).map((reason) =>
  ({ sessionKey: `cal:veto-${reason}`, source: "calendar", sourceId: `veto-${reason}`, title: "Webinar Vetoed", reason }));

async function build() {
  const root = mkdtempSync(path.join(tmpdir(), "alertwho-prod-"));
  const stateDir = path.join(root, "raw", "webinars"), opsFile = path.join(root, "data", "webinar-release", "operations.json");
  mkdirSync(path.dirname(opsFile), { recursive: true });
  const scheduled: string[] = [];
  const result = await runScheduleTickOnce({
    loadCalendarEvents: async () => EVENTS, loadCandidates: async () => CANDS, everyWebinar: true, now: () => NOW, stateDir,
    scheduler: { scheduleOnce: async (o) => { scheduled.push(o.jobKey); } }, log: () => {},
  }, false);
  const acquisition: WebinarCalendarAcquisition = { version: 1, tenantId: "A", scope: "available-connected-source-state", complete: true, mode: "baseline",
    checkedAt: NOW, syncToken: "tok1", sourceEvents: [], meetings: EVENTS };
  const prepared = prepareWebinarSourceState({ version: 1, tenantId: "A", operations: {} }, acquisition, CANDS, NOW);
  writeWebinarOperationState(opsFile, prepared.state);
  const skipped = [...result.skipped, ...VETO];
  const alerts = buildAttentionAlerts({ skipped, jobs: prepared.state.operations, timeZone: "UTC", now: NOW, titlePolicy: "omit" }).alerts;
  const out: string[] = [];
  const deps: AlertWhoDeps = { resolveTenant: (rest) => (rest[0] === "--tenant" ? rest[1]! : "A"), sources: { dataRoot: root, stateDir, operationsFile: opsFile, tenantId: "" },
    readOperations: readWebinarOperationState as never, now: () => new Date(NOW), write: (l) => out.push(l) };
  const ask = (id: string, ...flags: string[]) => { out.length = 0; const code = runAlertWho([id, "--tenant", "A", ...flags], deps); return { code, text: out.join("\n") }; };
  return { root, result, skipped, alerts, scheduled, ask, ops: prepared.state.operations, done: () => rmSync(root, { recursive: true, force: true }) };
}

const sourceOf = (text: string) => /source:   (.*)/.exec(text)?.[1]?.replace(/; status .*/, "") ?? "";

test("production-shaped state: the fixture covers all 15 skip reasons from core, none hand-picked", async () => {
  const b = await build();
  assert.deepEqual([...new Set(b.skipped.map((s) => s.reason))].sort(), [...SKIP_REASONS].sort());
  assert.equal(b.scheduled.length, 1, "the real tick scheduled exactly one session (evJ1)");
  b.done();
});

/** [kind] -> [alert emitted by the REAL formatter?, resolves from disk?, from which source]. Pinned: a change fails this test. */
const INV = "operations source inventory";
const EXPECTED: Record<string, [boolean, boolean, string]> = {
  "no-join-link": [true, true, INV],
  past: [false, false, ""],
  "untrusted-sender": [true, true, "operations"],
  "needs-registration": [true, true, INV],
  "duplicate-session": [false, false, ""],
  "overlap-lost": [true, true, "operations"],
  "not-webinar": [false, false, ""],
  "needs-review": [false, false, ""],
  cancelled: [false, false, ""],
  "invalid-time": [false, false, ""],
  "unsafe-join-link": [true, true, INV],
  "opted-out": [false, false, ""],
  "rule-denied": [false, false, ""],
  "rules-unevaluable": [false, false, ""],
  "unverified-link-source": [false, false, ""],
};

test("per-kind table: every skip reason -> alert emitted? -> resolves? -> from which source (default and --include-untagged agree)", async () => {
  const b = await build();
  const table: string[] = [];
  for (const reason of SKIP_REASONS) {
    const items = b.skipped.filter((s) => s.reason === reason);
    assert.ok(items.length >= 1, reason);
    const [emits, resolves, source] = EXPECTED[reason]!;
    for (const it of items) {
      const alert = b.alerts.find((a) => a.source === "skipped" && a.id === alertIdFor(it.sessionKey));
      assert.equal(alert !== undefined, emits, `${reason}: alert emitted`);
      if (!alert) continue;
      for (const flags of [[], ["--include-untagged"]]) {
        const r = b.ask(alert.id, ...flags);
        assert.equal(r.code === 0, resolves, `${reason} ${it.sessionKey} ${flags.join(" ")}\n${r.text}`);
        if (resolves) assert.equal(sourceOf(r.text), source, reason);
      }
      table.push(`${reason} | ${it.sessionKey.split(/[:-]/)[0]} key | alert yes | resolves ${resolves ? "yes" : "NO"} | ${resolves ? source : "-"}`);
    }
    if (!emits) table.push(`${reason} | no alert emitted by the formatter`);
  }
  console.log(`PER-KIND TABLE\n${table.join("\n")}`);
  b.done();
});

test("job alerts (operations rows at action_required) resolve end to end from operations.json", async () => {
  const b = await build();
  const jobs = b.alerts.filter((a) => a.source === "job");
  assert.ok(jobs.length >= 2, `job alerts: ${jobs.length}`);
  const reasons = new Set(Object.values(b.ops).filter((r: any) => r.status === "action_required").map((r: any) => r.reason));
  assert.ok(reasons.size >= 3, `production builds several review reasons: ${[...reasons]}`);
  for (const a of jobs) {
    const r = b.ask(a.id);
    assert.equal(r.code, 0, r.text);
    assert.equal(sourceOf(r.text), "operations");
  }
  console.log(`JOB ALERTS: ${jobs.filter((a) => b.ask(a.id).code === 0).length}/${jobs.length} resolve (operations)`);
  b.done();
});

test("the scheduled webinar (no alert) is findable only through operations; its untagged job file is not searched by default", async () => {
  const b = await build();
  const key = webinarSessionKey(`https://zoom.us/j/11111111111|2026-10-10T10:02:00.000Z`);
  const r = b.ask(alertIdFor(key));
  assert.equal(r.code, 0, r.text);
  assert.match(r.text, /source:   operations/);
  b.done();
});

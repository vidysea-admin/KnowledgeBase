/** ISS-ALERTID-001 / -007 (D-134 pending append): skipped sessions are persisted and `alert-who` resolves them WITHOUT operations.json. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { SkippedItem } from "@lkb/core";
import type { AutoRecordCandidateInput } from "./calendar/auto-join.js";
import { alertIdFor, buildAttentionAlerts } from "./calendar/alerts/attention-alerts.js";
import type { CalendarEvent } from "./calendar/calendar-client.js";
import { runScheduleTickOnce } from "./calendar/schedule-tick.js";
import { SKIPPED_RETENTION_DAYS, readSkippedRecords, recordSkipped, skippedStateFilePath } from "./calendar/state/skipped-state.js";
import { runAlertWho, type AlertWhoDeps } from "./alert-who-command.js";

const NOW = "2026-10-10T10:00:00.000Z";
const DAY = 86_400_000;
const ev = (id: string, title: string, o: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title, startTime: "2026-10-10T10:02:00.000Z", endTime: "2026-10-10T11:00:00.000Z", meetingUrl: `https://zoom.us/j/${id.replace(/\D/g, "").padEnd(11, "7")}`, ...o });
const EVENTS = [
  ev("evJ1", "Webinar Alpha", { meetingUrl: "https://zoom.us/j/11111111111" }),
  ev("evO2", "Webinar Beta", { meetingUrl: "https://zoom.us/j/22222222222", startTime: "2026-10-10T10:03:00.000Z", endTime: "2026-10-10T11:30:00.000Z" }),
  ev("evN3", "Webinar NoLink", { meetingUrl: undefined }),
  ev("evU4", "Webinar Unsafe", { meetingUrl: "https://example.com/room?pwd=SEKRET" }),
];
const CANDS: AutoRecordCandidateInput[] = [
  { id: "g-reg", title: "Webinar Register", senderEmail: "host@example.org", senderDomain: "example.org", senderAuthenticated: true, status: "pending",
    startTime: "2026-10-10T10:02:00.000Z", endTime: "2026-10-10T11:00:00.000Z", kind: "upcoming", registrationOnly: true,
    registrationUrl: "https://events.example.com/register?token=REGTOKEN", messageId: "m1", threadId: "t1" } as AutoRecordCandidateInput,
];

async function build(tenant = "A") {
  const root = mkdtempSync(path.join(tmpdir(), "alertwho-skip-"));
  // operations.json is NEVER written in this test: resolution must come from skipped-sessions.json alone.
  const stateDir = path.join(root, "raw", "webinars"), opsFile = path.join(root, "data", "webinar-release", "operations.json");
  const result = await runScheduleTickOnce({ loadCalendarEvents: async () => EVENTS, loadCandidates: async () => CANDS, everyWebinar: true, now: () => NOW,
    stateDir, stateTenantId: tenant, scheduler: { scheduleOnce: async () => {} }, log: () => {} }, false);
  const out: string[] = [];
  const deps: AlertWhoDeps = { resolveTenant: (rest) => (rest[0] === "--tenant" ? rest[1]! : "A"), sources: { dataRoot: root, stateDir, operationsFile: opsFile, tenantId: "" },
    readOperations: (() => { throw new Error("no operations.json in this test"); }) as never, now: () => new Date(NOW), write: (l) => out.push(l) };
  const ask = (id: string, t = "A") => { out.length = 0; const code = runAlertWho([id, "--tenant", t], deps); return { code, text: out.join("\n") }; };
  return { root, stateDir, result, ask, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("ISS-ALERTID-001/-007 replay: every skipped kind that alerts resolves from skipped-sessions.json alone", async () => {
  const b = await build();
  const alerts = buildAttentionAlerts({ skipped: b.result.skipped, jobs: {}, timeZone: "UTC", now: NOW, titlePolicy: "omit" }).alerts.filter((a) => a.source === "skipped");
  const kinds = new Set(b.result.skipped.map((s) => s.reason));
  for (const k of ["no-join-link", "unsafe-join-link", "needs-registration", "overlap-lost"]) assert.ok(kinds.has(k as never), `fixture has ${k}`);
  assert.ok(alerts.length >= 4, `alerts: ${alerts.length}`);
  let ok = 0;
  for (const a of alerts) { const r = b.ask(a.id); if (r.code === 0 && /source:   skipped-sessions/.test(r.text)) ok++; else assert.fail(`${a.id}\n${r.text}`); }
  console.log(`SKIPPED ALERTS RESOLVED: ${ok}/${alerts.length}`);
  assert.equal(ok, alerts.length);
  assert.match(b.ask(alertIdFor("cal:evN3")).text, /time:\s+.*2026/);
  b.done();
});

test("alert id computation is unchanged (20 hex of sha256 of the key)", () => {
  assert.equal(alertIdFor("cal:evN3").length, 20);
  assert.match(alertIdFor("cal:evN3"), /^[0-9a-f]{20}$/);
});

test("file is tenant-tagged; no URL, title or token is persisted", async () => {
  const b = await build();
  const raw = readFileSync(skippedStateFilePath(b.stateDir), "utf8");
  const j = JSON.parse(raw);
  assert.equal(j.tenantId, "A");
  for (const e of Object.values(j.entries) as any[]) {
    assert.equal(e.tenantId, "A");
    assert.deepEqual(Object.keys(e).sort().filter((k) => k !== "startTime"), ["recordedAt", "sessionKey", "source", "tenantId"]);
  }
  assert.ok(Object.keys(j.entries).length >= 4);
  for (const bad of ["http", "SEKRET", "REGTOKEN", "zoom.us", "example.com", "Webinar", "title", "pwd", "token"]) assert.ok(!raw.includes(bad), `file leaks ${bad}`);
  b.done();
});

test("tenant B cannot read A's skipped file; a foreign or untagged file is refused and not overwritten", async () => {
  const b = await build();
  assert.equal(b.ask(alertIdFor("cal:evN3"), "B").code, 1);
  assert.throws(() => readSkippedRecords(b.stateDir, "B"), /different tenant/);
  const before = readFileSync(skippedStateFilePath(b.stateDir), "utf8");
  assert.throws(() => recordSkipped(b.stateDir, "B", [{ sessionKey: "cal:x", source: "calendar", sourceId: "x", title: "t", reason: "no-join-link" }], NOW, () => undefined), /different tenant/);
  assert.equal(readFileSync(skippedStateFilePath(b.stateDir), "utf8"), before);
  writeFileSync(skippedStateFilePath(b.stateDir), JSON.stringify({ entries: {} }));
  assert.throws(() => readSkippedRecords(b.stateDir, "A"), /no tenant tag/);
  b.done();
});

test("retention (D-134): 30-day boundary by start time; accumulates across ticks; recordedAt ages rows with no start", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "alertwho-ret-"));
  mkdirSync(dir, { recursive: true });
  const it = (k: string): SkippedItem => ({ sessionKey: `cal:${k}`, source: "calendar", sourceId: k, title: "t", reason: "no-join-link" });
  const now = Date.parse(NOW);
  const starts: Record<string, string | undefined> = {
    exact: new Date(now - SKIPPED_RETENTION_DAYS * DAY).toISOString(),
    over: new Date(now - SKIPPED_RETENTION_DAYS * DAY - 1).toISOString(),
    recent: new Date(now - 29 * DAY).toISOString(), future: new Date(now + DAY).toISOString(), nostart: undefined,
  };
  const n = recordSkipped(dir, "A", Object.keys(starts).map(it), NOW, (s) => starts[s.sourceId]);
  assert.deepEqual(Object.keys(readSkippedRecords(dir, "A")).sort(), ["cal:exact", "cal:future", "cal:nostart", "cal:recent"]);
  assert.equal(n, 4);
  recordSkipped(dir, "A", [it("later")], new Date(now + DAY).toISOString(), () => new Date(now + 2 * DAY).toISOString());
  assert.ok(readSkippedRecords(dir, "A")["cal:recent"] && readSkippedRecords(dir, "A")["cal:later"], "accumulates");
  recordSkipped(dir, "A", [], new Date(now + 31 * DAY).toISOString(), () => undefined);
  assert.deepEqual(Object.keys(readSkippedRecords(dir, "A")).sort(), ["cal:future", "cal:later"]);
  rmSync(dir, { recursive: true, force: true });
});

test("dry-run writes nothing", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "alertwho-dry-"));
  await runScheduleTickOnce({ loadCalendarEvents: async () => EVENTS, loadCandidates: async () => [], everyWebinar: true, now: () => NOW, stateDir: root, stateTenantId: "A",
    scheduler: { scheduleOnce: async () => {} }, log: () => {} }, true);
  assert.deepEqual(readSkippedRecords(root, "A"), {});
  rmSync(root, { recursive: true, force: true });
});

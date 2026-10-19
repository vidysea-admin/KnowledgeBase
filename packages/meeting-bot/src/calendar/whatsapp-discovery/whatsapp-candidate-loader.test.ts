import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createWhatsappCandidateLoader, createWhatsappLoaderFromEnv, parseWaDiscoveryGroups, type WaRawMessage } from "./whatsapp-candidate-loader.js";
import { dedupeWhatsappCandidates, mergeWhatsappCandidates } from "./whatsapp-merge.js";
import { selectAutoRecordItems, type AutoRecordCandidateInput } from "../auto-join.js";
import { runScheduleTickOnce, type ScheduleTickDeps } from "../schedule-tick.js";
import type { CalendarEvent } from "../calendar-client.js";
import type { ScheduleOnceOptions } from "../task-scheduler.js";

const OK = "G-allowed", OTHER = "G-other", NOCONSENT = "G-noconsent";
const msgs: WaRawMessage[] = [
  { text: "join https://zoom.us/j/84512345678?pwd=a SECRETTEXT", ts: "2026-10-19T04:00:00Z", groupId: OK, messageId: "m1" },
  { text: "other https://zoom.us/j/11111111111", ts: "2026-10-19T04:01:00Z", groupId: OTHER },
  { text: "nc https://meet.google.com/abc-defg-hij", ts: "2026-10-19T04:02:00Z", groupId: NOCONSENT },
];

test("parseWaDiscoveryGroups splits and trims", () => {
  assert.deepEqual(parseWaDiscoveryGroups(" a , b;c\n"), ["a", "b", "c"]);
  assert.deepEqual(parseWaDiscoveryGroups(undefined), []);
});

test("allow-list: only listed groups are read; unlisted text never reaches the output", async () => {
  const rows = await createWhatsappCandidateLoader({ fetchMessages: async () => msgs, allowedGroups: [OK, NOCONSENT] })();
  assert.deepEqual(rows.map(r => r.meetingUrl).sort(), ["https://meet.google.com/abc-defg-hij", "https://zoom.us/j/84512345678?pwd=a"]);
  assert.ok(!JSON.stringify(rows).includes("11111111111"));
  assert.ok(!JSON.stringify(rows).includes("SECRETTEXT"));
});

test("empty allow-list: nothing fetched, nothing returned", async () => {
  let fetched = 0;
  const rows = await createWhatsappCandidateLoader({ fetchMessages: async () => { fetched++; return msgs; }, allowedGroups: [] })();
  assert.equal(rows.length, 0); assert.equal(fetched, 0);
});

test("consent=false refused even when allow-listed; unknown consent passes", async () => {
  const load = (c: (g: string) => boolean | undefined) => createWhatsappCandidateLoader({ fetchMessages: async () => msgs, allowedGroups: [OK, NOCONSENT], consentFor: c })();
  assert.deepEqual((await load(g => (g === NOCONSENT ? false : true))).map(r => r.meetingUrl), ["https://zoom.us/j/84512345678?pwd=a"]);
  assert.equal((await load(() => undefined)).length, 2);
  assert.equal((await load(() => false)).length, 0);
});

test("rows are unknown-sender whatsapp candidates (D-178 ruling 1) and carry no sender or text", async () => {
  const [row] = await createWhatsappCandidateLoader({ fetchMessages: async () => msgs, allowedGroups: [OK] })();
  assert.equal(row!.source, "whatsapp");
  assert.equal(row!.senderAuthenticated, undefined);
  assert.equal(row!.status, "pending");
  assert.equal(row!.senderEmail, "");
  assert.ok(!JSON.stringify(row).includes(OK));
});

test("registration links map to registrationOnly", async () => {
  const rows = await createWhatsappCandidateLoader({ allowedGroups: [OK], fetchMessages: async () =>
    [{ text: "https://us06web.zoom.us/webinar/register/WN_abc", ts: 1_760_000_000_000, groupId: OK }] })();
  assert.equal(rows[0]!.registrationOnly, true);
});

test("an unknown-sender WhatsApp row needs approval in the scheduler; owner approval promotes it", async () => {
  const [row] = await createWhatsappCandidateLoader({ fetchMessages: async () => msgs, allowedGroups: [OK],
    windowFor: () => ({ startTime: "2026-10-19T05:00:00Z", endTime: "2026-10-19T06:00:00Z" }) })();
  const sel = (r: AutoRecordCandidateInput) => selectAutoRecordItems({ calendarEvents: [], candidates: [r], now: "2026-10-19T04:58:00Z", leadMinutes: 5,
    trustedSenders: { domains: [], emails: [] } as any, alreadyScheduled: new Set(), everyWebinar: true, classifyInvite: () => "webinar" });
  const pending = sel(row!);
  assert.equal(pending.toSchedule.length, 0);
  assert.equal(pending.skipped[0]!.reason, "needs-review");
  assert.equal(sel({ ...row!, status: "approved" }).toSchedule.length, 1);
});

test("flag: createWhatsappLoaderFromEnv is undefined unless LKB_WA_DISCOVERY=1", () => {
  assert.equal(createWhatsappLoaderFromEnv({}, () => {}), undefined);
  assert.equal(createWhatsappLoaderFromEnv({ LKB_WA_DISCOVERY: "0", WA_DISCOVERY_GROUPS: OK }, () => {}), undefined);
  assert.equal(createWhatsappLoaderFromEnv({ LKB_WA_DISCOVERY: "true" }, () => {}), undefined);
  assert.equal(typeof createWhatsappLoaderFromEnv({ LKB_WA_DISCOVERY: "1" }, () => {}), "function");
});

const wa = async (url: string, ts = "2026-10-19T04:00:00Z") => (await createWhatsappCandidateLoader({ allowedGroups: [OK],
  fetchMessages: async () => [{ text: url, ts, groupId: OK }] })())[0]!;
const calEvent = (meetingUrl: string): CalendarEvent => ({ id: "e1", title: "T", startTime: "2026-10-19T05:00:00Z", endTime: "2026-10-19T06:00:00Z", meetingUrl } as CalendarEvent);

test("dedup: calendar and Gmail rows win over WhatsApp (zoom id, meet code); other meetings kept", async () => {
  const z = await wa("https://us02web.zoom.us/j/84512345678?pwd=wa"), m = await wa("https://meet.google.com/abc-defg-hij"), keep = await wa("https://zoom.us/j/55555555555");
  const gmail: AutoRecordCandidateInput = { id: "g1", title: "x", senderEmail: "a@b.c", senderDomain: "b.c", status: "approved", meetingUrl: "https://meet.google.com/abc-defg-hij?authuser=1" };
  const out = dedupeWhatsappCandidates([z, m, keep], [calEvent("https://zoom.us/j/84512345678?pwd=cal")], [gmail]);
  assert.deepEqual(out.map(r => r.meetingUrl), ["https://zoom.us/j/55555555555"]);
});

test("dedup: duplicate WhatsApp posts of one meeting collapse; webex falls back to normalized url", async () => {
  const a = await wa("https://zoom.us/j/84512345678?pwd=a", "2026-10-19T04:00:00Z"), b = await wa("https://us02web.zoom.us/j/84512345678", "2026-10-19T04:05:00Z");
  assert.equal(dedupeWhatsappCandidates([b, a], [], []).length, 1);
  const w = await wa("https://acme.webex.com/meet/jdoe?utm_source=x");
  assert.equal(dedupeWhatsappCandidates([w], [calEvent("https://acme.webex.com/meet/jdoe")], []).length, 0);
});

test("merge: loader failure leaves candidates untouched and the tick going", async () => {
  const base: AutoRecordCandidateInput[] = [{ id: "g1", title: "x", senderEmail: "", senderDomain: "", status: "pending" }];
  const logs: string[] = [];
  const out = await mergeWhatsappCandidates(async () => { throw new Error("boom"); }, [], base, m => logs.push(m));
  assert.equal(out, base); assert.match(logs[0]!, /boom/);
});

// ---- flag OFF = zero effect on the scheduler ----
const CAND: AutoRecordCandidateInput = { id: "c1", title: "TOC webinar", senderEmail: "ops@theoutreachcollective.in", senderDomain: "theoutreachcollective.in",
  senderAuthenticated: true, status: "auto_approved", meetingUrl: "https://zoho.com/meeting/abc?tk=SECRET123", startTime: "2026-09-28T12:30:00Z",
  endTime: "2026-09-28T13:30:00Z", kind: "upcoming" };

async function tickRun(extra: Partial<ScheduleTickDeps>) {
  const dir = mkdtempSync(path.join(tmpdir(), "lkb-wa-tick-"));
  try {
    const calls: ScheduleOnceOptions[] = [], logs: string[] = [];
    const deps: ScheduleTickDeps = { loadCalendarEvents: async () => [], loadCandidates: async () => [CAND], now: () => "2026-09-28T12:26:00Z", stateDir: dir,
      stateTenantId: "ten-t", scheduler: { scheduleOnce: async o => { calls.push(o); } }, log: m => logs.push(m), ...extra };
    const result = await runScheduleTickOnce(deps, true);
    return JSON.stringify({ result, calls, logs });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("flag OFF: scheduler output is byte-identical (hook absent, or env loader returns undefined)", async () => {
  const baseline = await tickRun({});
  assert.equal(await tickRun({ loadWhatsappCandidates: createWhatsappLoaderFromEnv({}, () => {}) }), baseline);
  assert.equal(await tickRun({ loadWhatsappCandidates: createWhatsappLoaderFromEnv({ WA_DISCOVERY_GROUPS: OK }, () => {}) }), baseline);
});

test("flag ON adds only a needs-approval row (no new toSchedule); a calendar duplicate is dropped", async () => {
  const baseline = JSON.parse(await tickRun({}));
  const loader = createWhatsappLoaderFromEnv({ LKB_WA_DISCOVERY: "1", WA_DISCOVERY_GROUPS: OK }, () => {}, async () => [{ text: "https://zoom.us/j/84512345678", ts: "2026-09-28T12:00:00Z", groupId: OK }])!;
  const on = JSON.parse(await tickRun({ loadWhatsappCandidates: loader }));
  assert.match(on.logs.join("\n"), /2 candidate\(s\)/);
  assert.deepEqual(baseline.result.toSchedule, on.result.toSchedule);
  const dupe = JSON.parse(await tickRun({ loadWhatsappCandidates: loader, loadCalendarEvents: async () => [calEvent("https://us02web.zoom.us/j/84512345678?pwd=z")] }));
  assert.match(dupe.logs.join("\n"), /1 candidate\(s\)/);
});

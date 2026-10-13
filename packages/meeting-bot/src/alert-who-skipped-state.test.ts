/** ISS-ALERTWHO-001 / -002: skipped-sessions.json is written atomically, a corrupt file is never silently reset, concurrent writers do not lose rows. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { SkippedItem } from "@lkb/core";
import type { CalendarEvent } from "./calendar/calendar-client.js";
import { runScheduleTickOnce } from "./calendar/schedule-tick.js";
import { SkippedStateCorrupt, readSkippedRecords, recordSkipped, skippedStateFilePath } from "./calendar/state/skipped-state.js";

const NOW = "2026-10-10T10:00:00.000Z";
const DAY = 86_400_000;
const it = (k: string): SkippedItem => ({ sessionKey: `cal:${k}`, source: "calendar", sourceId: k, title: "t", reason: "no-join-link" });
const tmp = () => mkdtempSync(path.join(tmpdir(), "alertwho-state-"));
const keys = (d: string) => Object.keys(readSkippedRecords(d, "A")).sort();
const leftovers = (d: string) => readdirSync(d).filter((n) => n.endsWith(".tmp"));

test("ISS-ALERTWHO-002: recordedAt of a start-less row is preserved across ticks, so it ages out 30d after FIRST sight", () => {
  const d = tmp(); const t0 = Date.parse(NOW);
  recordSkipped(d, "A", [it("nostart")], NOW, () => undefined);
  recordSkipped(d, "A", [it("nostart")], new Date(t0 + 20 * DAY).toISOString(), () => undefined); // re-skipped every tick
  assert.equal(readSkippedRecords(d, "A")["cal:nostart"]!.recordedAt, NOW, "recordedAt must stay at first sight");
  recordSkipped(d, "A", [it("nostart")], new Date(t0 + 31 * DAY).toISOString(), () => undefined);
  assert.deepEqual(keys(d), [], "31d after first sight the row is dropped even though it was re-skipped every tick");
  rmSync(d, { recursive: true, force: true });
});

test("ISS-ALERTWHO-001a atomic: a crash between write and rename leaves the old file byte-identical and no temp file", () => {
  const d = tmp();
  recordSkipped(d, "A", [it("a"), it("b")], NOW, () => undefined);
  const before = readFileSync(skippedStateFilePath(d), "utf8");
  const crash = (() => { throw Object.assign(new Error("simulated crash before rename"), { code: "EIO" }); }) as typeof renameSync;
  assert.throws(() => recordSkipped(d, "A", [it("c")], NOW, () => undefined, { rename: crash }), /simulated crash/);
  assert.equal(readFileSync(skippedStateFilePath(d), "utf8"), before);
  assert.deepEqual(leftovers(d), []);
  assert.deepEqual(keys(d), ["cal:a", "cal:b"]);
  assert.equal(existsSync(path.join(d, "skipped-sessions.lock")), false, "lock released on failure");
  rmSync(d, { recursive: true, force: true });
});

test("ISS-ALERTWHO-001b corrupt: read throws and never mutates; write quarantines byte-for-byte, reports it, and starts fresh", () => {
  for (const [name, bytes] of [["truncated", '{"version":1,"tenantId":"A","entries":{"cal:x":{"sessi'], ["non-object", "[1,2]"], ["empty", ""]] as const) {
    const d = tmp(); const f = skippedStateFilePath(d);
    writeFileSync(f, bytes);
    assert.throws(() => readSkippedRecords(d, "A"), SkippedStateCorrupt, name);
    assert.equal(readFileSync(f, "utf8"), bytes, `${name}: read left the file untouched`);
    const moved: string[] = [];
    assert.equal(recordSkipped(d, "A", [it("n")], NOW, () => undefined, { onQuarantine: (m) => moved.push(m) }), 1);
    assert.equal(moved.length, 1, `${name}: quarantine reported`);
    assert.match(moved[0]!, /^skipped-sessions\.json\.corrupt-/);
    assert.equal(readFileSync(path.join(d, moved[0]!), "utf8"), bytes, `${name}: quarantined bytes identical`);
    assert.deepEqual(keys(d), ["cal:n"]);
    rmSync(d, { recursive: true, force: true });
  }
});

test("ISS-ALERTWHO-001b: a foreign-tenant file is still refused, not quarantined", () => {
  const d = tmp(); recordSkipped(d, "A", [it("a")], NOW, () => undefined);
  assert.throws(() => recordSkipped(d, "B", [it("b")], NOW, () => undefined), /different tenant/);
  assert.deepEqual(readdirSync(d).filter((n) => n.includes("corrupt")), []);
  rmSync(d, { recursive: true, force: true });
});

test("ISS-ALERTWHO-001c concurrency: overlapping writers (child processes) lose no rows", () => {
  const d = tmp();
  const child = fileURLToPath(new URL("./skipped-state-writer.fixture.ts", import.meta.url));
  const procs = ["p0", "p1", "p2", "p3", "p4", "p5"].map((k) => spawn(process.execPath, ["--import", "tsx", child, d, k], { cwd: path.dirname(fileURLToPath(import.meta.url)) + "/..", stdio: "pipe" }));
  return Promise.all(procs.map((p) => new Promise<number>((res) => { let err = ""; p.stderr!.on("data", (b: Buffer) => (err += b)); p.on("close", (c: number) => { if (c) console.log(err); res(c ?? 1); }); }))).then((codes) => {
    assert.deepEqual(codes, [0, 0, 0, 0, 0, 0]);
    const expect = ["p0", "p1", "p2", "p3", "p4", "p5"].flatMap((k) => [0, 1, 2, 3].map((i) => `cal:${k}${i}`)).sort();
    assert.deepEqual(keys(d), expect, "all 24 rows present");
    assert.deepEqual(leftovers(d), []);
    rmSync(d, { recursive: true, force: true });
  });
});


test("ISS-ALERTWHO-001 replay: 4 accumulated rows, file truncated to 60 bytes, then a REAL tick: rows are no longer silently lost", async () => {
  const d = tmp(); const f = skippedStateFilePath(d);
  const past = ["h1", "h2", "h3", "h4"]; // history of sessions no longer in the poll window
  recordSkipped(d, "A", past.map(it), NOW, () => new Date(Date.parse(NOW) - DAY).toISOString());
  assert.equal(keys(d).length, 4);
  truncateSync(f, 60);
  const truncated = readFileSync(f);
  const logs: string[] = [];
  const ev: CalendarEvent = { id: "evNL", title: "Webinar NoLink", startTime: "2026-10-10T10:02:00.000Z", endTime: "2026-10-10T11:00:00.000Z", meetingUrl: undefined };
  await runScheduleTickOnce({ loadCalendarEvents: async () => [ev], loadCandidates: async () => [], everyWebinar: true, now: () => NOW, stateDir: d,
    stateTenantId: "A", scheduler: { scheduleOnce: async () => {} }, log: (m) => logs.push(m) }, false);
  const aside = readdirSync(d).filter((n) => n.startsWith("skipped-sessions.json.corrupt-"));
  assert.equal(aside.length, 1, "the 60-byte damaged file is kept");
  assert.ok(readFileSync(path.join(d, aside[0]!)).equals(truncated), "kept byte-for-byte");
  assert.ok(logs.some((l) => /WARNING: skipped-sessions\.json was corrupt; moved aside/.test(l)), "loud");
  assert.deepEqual(keys(d), ["cal:evNL"]);
  console.log("REPLAY ISS-ALERTWHO-001: 4 rows -> truncated -> damaged file preserved 1/1 (previously 0 evidence), warning logged");
  rmSync(d, { recursive: true, force: true });
});

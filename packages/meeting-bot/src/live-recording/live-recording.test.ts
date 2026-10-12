/**
 * ISS-T039CMD-001 / -002: the live-recording view. Fakes only: a fake `runRecord` (never Chrome/OBS), real files in a temp dir, probes
 * injected for liveness. The two recorded reproductions of the ledger rows are replayed verbatim in the first two tests.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { claimLiveRecording, entryIsLive, readLiveRecordings, UNTIL_GRACE_MS, type LiveProbes, type LiveRecordingEntry } from "./live-recording.js";
import { runClaimedRecord, type ClaimedRecordDeps } from "./claimed-record.js";
import { readAllLiveJobs, runSendNow, type SendNowDeps } from "../send-now-command.js";

const MEET = "https://meet.google.com/abc-defg-hij";
const NOW = new Date("2026-10-12T10:00:00.000Z");
const ALIVE: LiveProbes = { isAlive: () => true, startTime: () => "T0" };
const mk = () => mkdtempSync(path.join(tmpdir(), "live-rec-"));
const claimDeps = (dir: string, extra: Partial<ClaimedRecordDeps> = {}): ClaimedRecordDeps => ({
  dir, now: () => NOW, probes: ALIVE, tenant: (rest) => (rest.includes("--tenant") ? rest[rest.indexOf("--tenant") + 1]! : "vidysea"),
  until: (v) => new Date(/^\d/.test(v) && v.includes("T") ? v : "2026-10-12T15:00:00.000Z"), warn: () => {}, ...extra,
});
/** The send-now command wired exactly like defaultSendNowDeps, except runRecord is a fake that stays "recording" until released. */
function sendNow(dir: string, ops: Record<string, Record<string, unknown>> = {}) {
  const launched: string[][] = [], out: string[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const deps: SendNowDeps = {
    now: () => NOW, write: (l) => out.push(l),
    runRecord: (rest) => runClaimedRecord(rest, async (r) => { launched.push(r); await gate; }, claimDeps(dir)),
    readLiveJobs: () => readAllLiveJobs({ operationsFile: "unused", scheduledDir: path.join(dir, "no-scheduled"), recordingsDir: dir, tenantId: "vidysea" }, NOW,
      () => ({ operations: ops }), ALIVE),
  };
  return { deps, launched, out, release };
}
const tick = () => new Promise((r) => setImmediate(r));

test("ISS-T039CMD-001 verbatim: send-now, then the same send-now one minute later -> the second is refused, one bot", async () => {
  const dir = mk();
  try {
    const first = sendNow(dir);
    const run1 = runSendNow([MEET, "--until", "15:00"], first.deps);
    await tick();
    assert.equal(first.launched.length, 1);
    // "One minute later run the same command again" (a separate process in real life: its own deps, same files)
    const second = sendNow(dir);
    assert.equal(await runSendNow([MEET, "--until", "15:00"], second.deps), 1);
    assert.equal(second.launched.length, 0);
    assert.match(second.out.join("\n"), /already queued, joining or recording for this meeting/);
    first.release(); assert.equal(await run1, 0);
    // released on exit: the meeting can be sent again
    const third = sendNow(dir); third.release();
    assert.equal(await runSendNow([MEET, "--until", "15:00"], third.deps), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T039CMD-001: a MANUAL `lkb record <url> --until` is seen by send-now (any URL spelling)", async () => {
  const dir = mk();
  try {
    let stop: () => void = () => {}; const gate = new Promise<void>((r) => { stop = r; });
    const manual = runClaimedRecord([MEET, "--until", "15:00", "--title", "hand"], () => gate, claimDeps(dir));
    await tick();
    for (const spelling of [MEET, "https://meet.google.com/ABC-defg-hij?authuser=2", `  ${MEET}/  `]) {
      const h = sendNow(dir);
      assert.equal(await runSendNow([spelling], h.deps), 1, spelling);
      assert.equal(h.launched.length, 0);
    }
    const other = sendNow(dir); other.release();
    assert.equal(await runSendNow(["https://meet.google.com/zzz-yyyy-xxx"], other.deps), 0, "a different meeting is not blocked");
    stop(); await manual;
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T039CMD-002 verbatim: poller has the webinar in 'recording' (operations row, NO scheduled file) -> send-now with its join URL is refused", async () => {
  const dir = mk();
  try {
    // the poller's launch (run-pipeline.mjs:224): record <url> --backend tab --until <ISO> --session-id <id> --title ... --transcribe --process-video --index
    let stop: () => void = () => {}; const gate = new Promise<void>((r) => { stop = r; });
    const poller = runClaimedRecord(["https://zoom.us/j/12345678901?pwd=abc", "--backend", "tab", "--until", "2026-10-12T11:00:00.000Z", "--session-id", "webinar-1",
      "--title", "Webinar", "--transcribe", "--process-video", "--index"], () => gate, claimDeps(dir, { tenant: () => "vidysea" }));
    await tick();
    const h = sendNow(dir, { "webinar-1": { status: "recording", title: "Webinar", attempts: 1 } }); // operations row carries no URL, as the ledger says
    assert.equal(await runSendNow(["https://us02web.zoom.us/j/12345678901"], h.deps), 1);
    assert.equal(h.launched.length, 0);
    assert.match(h.out.join(""), /already queued/);
    stop(); await poller;
    const after = sendNow(dir, { "webinar-1": { status: "ready" } }); after.release();
    assert.equal(await runSendNow(["https://us02web.zoom.us/j/12345678901"], after.deps), 0, "released when the poller's recorder exits");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("two send-now racing (both planned an empty view): the second CLAIM is refused, runRecord runs once", async () => {
  const dir = mk();
  try {
    const empty = (): Partial<SendNowDeps> => ({ readLiveJobs: () => [] });
    const a = sendNow(dir), b = sendNow(dir); Object.assign(a.deps, empty()); Object.assign(b.deps, empty());
    const run1 = runSendNow([MEET, "--until", "15:00"], a.deps); await tick();
    await assert.rejects(runSendNow([MEET, "--until", "15:00"], b.deps), /not starting a second recording/);
    assert.equal(b.launched.length, 0);
    a.release(); await run1;
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("tenant is part of the key: another tenant's recording of the same link does not block, and is never read as ours", async () => {
  const dir = mk();
  try {
    let stop: () => void = () => {}; const gate = new Promise<void>((r) => { stop = r; });
    const other = runClaimedRecord([MEET, "--until", "15:00", "--tenant", "acme"], () => gate, claimDeps(dir));
    await tick();
    const h = sendNow(dir); h.release();
    assert.equal(await runSendNow([MEET], h.deps), 0);
    assert.deepEqual(readLiveRecordings({ dir, tenantId: "acme" }, NOW, ALIVE).map((j) => j.status), ["recording"]);
    stop(); await other;
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function entry(over: Partial<LiveRecordingEntry> = {}): LiveRecordingEntry {
  return { version: 1, tenantId: "vidysea", meetingKey: "meet:abc-defg-hij", meetingUrl: MEET, sessionId: "old", pid: 4242, processStartedAt: "T0", until: "2026-10-12T15:00:00.000Z", startedAt: "2026-10-12T09:00:00.000Z", ...over };
}
function seed(dir: string, e: LiveRecordingEntry, name = "dead.json") {
  mkdirSync(path.join(dir, e.tenantId), { recursive: true });
  writeFileSync(path.join(dir, e.tenantId, name), JSON.stringify(e));
}

test("stale entries never block: dead pid, reused pid (start time differs), and past until + grace", () => {
  const dir = mk();
  try {
    seed(dir, entry());
    assert.equal(readLiveRecordings({ dir, tenantId: "vidysea" }, NOW, { isAlive: () => false }).length, 0, "pid dead");
    assert.equal(readLiveRecordings({ dir, tenantId: "vidysea" }, NOW, { isAlive: () => true, startTime: () => "T-REUSED" }).length, 0, "pid reused by another process");
    assert.equal(readLiveRecordings({ dir, tenantId: "vidysea" }, NOW, ALIVE).length, 1, "control: alive and same start time blocks");
    assert.equal(readLiveRecordings({ dir, tenantId: "vidysea" }, NOW, { isAlive: () => true, startTime: () => undefined }).length, 1, "start time unknown: trust the pid");
    const late = new Date(Date.parse("2026-10-12T15:00:00.000Z") + UNTIL_GRACE_MS + 1);
    assert.equal(entryIsLive(entry(), late, ALIVE), false, "past until + grace");
    assert.equal(entryIsLive(entry(), new Date(late.getTime() - 2), ALIVE), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a dead holder is replaced by the next claim (no manual cleanup), and a live holder is not", () => {
  const dir = mk();
  try {
    seed(dir, entry(), `${createHash("sha256").update("meet:abc-defg-hij").digest("hex").slice(0, 32)}.json`); // the very file a claim of this meeting contends for
    const src = { dir, tenantId: "vidysea", meetingUrl: MEET, sessionId: "new", until: null };
    const dead = claimLiveRecording(src, NOW, { isAlive: () => false, startTime: () => "T9" }, 777);
    assert.equal(dead.ok, true);
    const held = claimLiveRecording({ ...src, sessionId: "third" }, NOW, { isAlive: (p) => p === 777, startTime: () => "T9" }, 888);
    assert.deepEqual(held.ok === false && held.heldBy, { sessionId: "new", pid: 777 });
    assert.deepEqual(readdirSync(path.join(dir, "vidysea")).filter((n) => n.startsWith(".tmp-")), [], "no temp files left");
    if (dead.ok) dead.release();
    assert.equal(readdirSync(path.join(dir, "vidysea")).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("release removes only OUR entry: a recorder whose stale entry was replaced does not delete the new holder's", () => {
  const dir = mk();
  try {
    const src = { dir, tenantId: "vidysea", meetingUrl: MEET, until: null };
    const a = claimLiveRecording({ ...src, sessionId: "a" }, NOW, ALIVE, 1001);
    assert.ok(a.ok);
    const b = claimLiveRecording({ ...src, sessionId: "b" }, NOW, { isAlive: (p) => p !== 1001, startTime: () => "T0" }, 1002); // a died, b replaced it
    assert.ok(b.ok);
    if (a.ok) a.release();
    assert.equal(readLiveRecordings({ dir, tenantId: "vidysea" }, NOW, ALIVE).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("UNREADABLE view: corrupt, wrong-shape, foreign-tenant or stray files -> the reader THROWS and send-now refuses with the clear message, nothing launched", async () => {
  for (const [label, write] of [
    ["not json", (d: string) => { mkdirSync(path.join(d, "vidysea"), { recursive: true }); writeFileSync(path.join(d, "vidysea", "x.json"), "{ nope"); }],
    ["wrong shape", (d: string) => seed(d, { ...entry(), pid: "1" as unknown as number })],
    ["other tenant tag", (d: string) => { mkdirSync(path.join(d, "vidysea"), { recursive: true }); writeFileSync(path.join(d, "vidysea", "x.json"), JSON.stringify(entry({ tenantId: "acme" }))); }],
    ["stray file", (d: string) => { mkdirSync(path.join(d, "vidysea"), { recursive: true }); writeFileSync(path.join(d, "vidysea", "notes.txt"), "x"); }],
  ] as const) {
    const dir = mk();
    try {
      write(dir);
      assert.throws(() => readLiveRecordings({ dir, tenantId: "vidysea" }, NOW, ALIVE), /live-recording|unexpected file/, label);
      const h = sendNow(dir); h.release();
      assert.equal(await runSendNow([MEET], h.deps), 1, label);
      assert.match(h.out.join(""), /send-now refused: cannot tell whether a bot is already in this meeting \(.*\); nothing was launched/, label);
      assert.equal(h.launched.length, 0, label);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const dir = mk();
  try { assert.deepEqual(readLiveRecordings({ dir: path.join(dir, "absent"), tenantId: "vidysea" }, NOW, ALIVE), [], "a missing dir is 'no recordings', not 'cannot tell'"); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("record path: claim refused while held (runRecord never starts); released when runRecord throws; link with no meeting identity is not claimed", async () => {
  const dir = mk();
  try {
    let stop: () => void = () => {}; const gate = new Promise<void>((r) => { stop = r; });
    const first = runClaimedRecord([MEET, "--until", "15:00", "--session-id", "s1"], () => gate, claimDeps(dir));
    await tick();
    let started = false;
    await assert.rejects(runClaimedRecord([MEET, "--until", "15:00", "--session-id", "s2"], async () => { started = true; }, claimDeps(dir)), /session s1.*not starting a second recording/);
    assert.equal(started, false);
    stop(); await first;
    await assert.rejects(runClaimedRecord([MEET, "--until", "15:00"], async () => { throw new Error("boom"); }, claimDeps(dir)), /boom/);
    assert.equal(readdirSync(path.join(dir, "vidysea")).length, 0, "released on error");
    await runClaimedRecord(["https://example.com/not-a-meeting", "--until", "15:00"], async () => {}, claimDeps(dir));
    await runClaimedRecord([], async () => {}, claimDeps(dir)).catch(() => {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("record path: bookkeeping failure (view dir unwritable) warns and still records; it does not cost a recording", async () => {
  const dir = mk();
  try {
    const blocker = path.join(dir, "file"); writeFileSync(blocker, "x"); // a FILE where the directory should be
    const warns: string[] = []; let ran = false;
    await runClaimedRecord([MEET, "--until", "15:00"], async () => { ran = true; }, claimDeps(path.join(blocker, "sub"), { warn: (m) => warns.push(m) }));
    assert.equal(ran, true);
    assert.match(warns.join(""), /live-recording view not updated/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("wiring: cli.ts `record` and defaultSendNowDeps' runRecord both go through the claim; the entry is on disk while recording", () => {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const cli = readFileSync(path.join(here, "..", "cli.ts"), "utf8");
  assert.match(cli, /argv\[0\] === "record"\) return claimedRecordWithDefaults\(argv\.slice\(1\), runRecord\)/);
  const cmd = readFileSync(path.join(here, "..", "send-now-command.ts"), "utf8");
  assert.match(cmd, /runRecord: \(rest\) => claimedRecordWithDefaults\(rest, runRecord\)/);
  assert.match(cmd, /readLiveJobs: \(\) => readAllLiveJobs\(/);
});

/**
 * packages/meeting-bot/src/live-recording/live-recording.ts - ISS-T039CMD-001 / -002. ONE authoritative "who is recording which
 * meeting" view. Every launch path ends in `cli.ts record` (manual `lkb record`, `lkb send-now`, the send-now API's detached child,
 * the poller's launchControlledRecording, the Task Scheduler's start-record-detached.ps1), so that one chokepoint CLAIMS the meeting
 * here before `runRecord` starts and RELEASES it after. send-now reads this view (`readLiveRecordings`) next to the scheduler stores.
 *
 * Why a new store: the only per-recording state `runRecord` writes is `.record-state.json` (one slot per record dir, no meeting URL)
 * and the tab status file (no URL either); neither can answer "is THIS meeting being recorded". Editing runRecord to add the URL
 * was out of bounds for this unit, so the claim lives in the CLI dispatch instead; it reuses `controller-state`'s start-time probe.
 *
 * Layout: <dir>/<tenantId>/<sha256(meetingKey)[0..32]>.json  (tenant + normalised meetingIdentity = the key).
 * Claim = write a temp file, then `linkSync` it to the final name: atomic create-with-content, EEXIST for the loser.
 * A STALE entry is replaced by an exclusive claim-then-rename takeover (one winner per judged-dead content; ISS-T039DUPES-004).
 * Liveness: an entry is LIVE while its pid exists (ESRCH is the only death; EPERM = exists) AND the pid's OS start time still equals
 * the one recorded (PID reuse) AND `until` + grace has not passed. A dead entry never blocks and is replaced by the next claim.
 * Fail direction (reader): anything unreadable, malformed or tagged for another tenant THROWS = "cannot tell" = send-now refuses.
 */
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { controllerMatchesIdentity, getProcessStartTime } from "../capture/controller-state.js";
import { meetingIdentity, type SendNowJob } from "../send-now.js";

export interface LiveRecordingEntry {
  version: 1;
  tenantId: string;
  meetingKey: string;
  meetingUrl: string;
  sessionId: string;
  pid: number;
  /** OS start time of `pid` when claimed; undefined when the probe could not tell (then only the pid is trusted). */
  processStartedAt?: string;
  /** ISO `--until` bound, or null when it could not be parsed (then only liveness bounds the entry). */
  until: string | null;
  startedAt: string;
}

/** After `until` the bot has left the meeting (finalisation may run on); a send-now into it is no longer a duplicate. */
export const UNTIL_GRACE_MS = 10 * 60 * 1000;
const TENANT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

export interface LiveProbes {
  /** Default: signal 0 (ESRCH = dead, anything else = alive). */
  isAlive?: (pid: number) => boolean;
  startTime?: (pid: number) => string | undefined;
}
export const liveRecordingDir = (root: string) => path.join(root, "raw", "webinars", "live-recordings");

function alive(pid: number, probes: LiveProbes): boolean {
  if (probes.isAlive) return probes.isAlive(pid);
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== "ESRCH"; }
}

/** True when the entry still stands for a running recorder. Never throws. */
export function entryIsLive(e: LiveRecordingEntry, now: Date, probes: LiveProbes = {}): boolean {
  if (e.until !== null) {
    const until = Date.parse(e.until);
    if (Number.isFinite(until) && now.getTime() > until + UNTIL_GRACE_MS) return false;
  }
  if (!alive(e.pid, probes)) return false;
  let actual: string | undefined;
  try { actual = (probes.startTime ?? getProcessStartTime)(e.pid); } catch { actual = undefined; }
  return controllerMatchesIdentity(e.processStartedAt, actual); // proven mismatch = PID reuse = dead; unknown = trust the pid
}

function parseEntry(text: string, where: string, tenantId: string): LiveRecordingEntry {
  let v: any;
  try { v = JSON.parse(text); } catch { throw new Error(`live-recording entry ${where} is not JSON`); }
  if (!v || typeof v !== "object" || v.version !== 1 || typeof v.meetingUrl !== "string" || typeof v.meetingKey !== "string" ||
      typeof v.sessionId !== "string" || !Number.isSafeInteger(v.pid) || (v.until !== null && typeof v.until !== "string")) {
    throw new Error(`live-recording entry ${where} has an unexpected shape`);
  }
  if (v.tenantId !== tenantId) throw new Error(`live-recording entry ${where} is not tagged for tenant ${tenantId}`);
  return v as LiveRecordingEntry;
}

/** Live recordings for one tenant as send-now jobs (status "recording" = blocks). Missing dir = none. THROWS when it cannot tell. */
export function readLiveRecordings(src: { dir: string; tenantId: string }, now: Date, probes: LiveProbes = {}): SendNowJob[] {
  if (!TENANT.test(src.tenantId)) throw new Error("invalid tenant id");
  const tdir = path.join(src.dir, src.tenantId);
  if (!existsSync(tdir)) return [];
  const jobs: SendNowJob[] = [];
  for (const name of readdirSync(tdir)) {
    if (name.startsWith(".tmp-")) continue; // a claim in flight; its linked name shows up atomically
    if (!name.endsWith(".json")) throw new Error(`unexpected file ${name} in the live-recording directory`);
    const entry = parseEntry(readFileSync(path.join(tdir, name), "utf8"), name, src.tenantId);
    if (entryIsLive(entry, now, probes)) jobs.push({ meetingUrl: entry.meetingUrl, status: "recording" });
  }
  return jobs;
}

export type ClaimResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: "held"; heldBy: { sessionId: string; pid: number } };

/** Atomically claim (tenant, meeting). A live holder -> `held`. A dead/stale holder is removed and replaced. Other I/O errors THROW. */
export function claimLiveRecording(
  src: { dir: string; tenantId: string; meetingUrl: string; sessionId: string; until: Date | null },
  now: Date, probes: LiveProbes = {}, pid: number = process.pid,
): ClaimResult {
  if (!TENANT.test(src.tenantId)) throw new Error("invalid tenant id");
  const meetingKey = meetingIdentity(src.meetingUrl);
  if (!meetingKey) throw new Error("not a recognisable meeting link");
  const tdir = path.join(src.dir, src.tenantId);
  mkdirSync(tdir, { recursive: true });
  const file = path.join(tdir, `${createHash("sha256").update(meetingKey).digest("hex").slice(0, 32)}.json`);
  let startedAt: string | undefined;
  try { startedAt = (probes.startTime ?? getProcessStartTime)(pid); } catch { startedAt = undefined; }
  const entry: LiveRecordingEntry = {
    version: 1, tenantId: src.tenantId, meetingKey, meetingUrl: src.meetingUrl, sessionId: src.sessionId, pid,
    ...(startedAt ? { processStartedAt: startedAt } : {}), until: src.until ? src.until.toISOString() : null, startedAt: now.toISOString(),
  };
  const tmp = path.join(tdir, `.tmp-${pid}-${createHash("sha256").update(`${src.sessionId}|${Math.random()}`).digest("hex").slice(0, 10)}`);
  const body = JSON.stringify(entry, null, 2) + "\n";
  writeFileSync(tmp, body);
  const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  try {
    for (let attempt = 0; ; attempt++) {
      try { linkSync(tmp, file); break; }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        let raw: string;
        try { raw = readFileSync(file, "utf8"); } catch { continue; } // vanished meanwhile (a release): try the link again
        const held = parseEntry(raw, path.basename(file), src.tenantId); // unreadable holder = THROW (cannot tell)
        if (entryIsLive(held, now, probes)) return { ok: false, reason: "held", heldBy: { sessionId: held.sessionId, pid: held.pid } };
        if (attempt >= 100) throw new Error("could not replace a stale live-recording entry");
        // ATOMIC TAKEOVER of a dead holder (ISS-T039DUPES-004), the run-state lock's claim-then-rename: every contender that judged THIS
        // exact content dead races for ONE exclusive claim file keyed by that content; only the claim holder may touch the entry. It
        // re-reads the bytes under the claim, replaces the entry by rename (never absent, a live entry is never moved) and verifies.
        const claim = path.join(tdir, `.tmp-takeover-${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`);
        const claimTmp = `${tmp}.claim`;
        writeFileSync(claimTmp, JSON.stringify({ pid }));
        let got = false;
        try { linkSync(claimTmp, claim); got = true; }
        catch (ce) {
          if ((ce as NodeJS.ErrnoException).code !== "EEXIST") throw ce;
          let other: { pid?: unknown } = {};
          try { other = JSON.parse(readFileSync(claim, "utf8")); } catch { /* being removed or half-written: retry */ }
          if (typeof other.pid === "number" && other.pid !== pid && !alive(other.pid, probes)) rmSync(claim, { force: true }); // abandoned by a dead taker
        } finally { rmSync(claimTmp, { force: true }); }
        if (!got) { sleep(15); continue; } // someone else is replacing it: re-read (they will win -> we see "held")
        let won = false;
        try {
          let again = ""; try { again = readFileSync(file, "utf8"); } catch { /* removed meanwhile */ }
          if (again === raw) { renameSync(tmp, file); won = readFileSync(file, "utf8") === body; }
        } finally { rmSync(claim, { force: true }); }
        if (won) break;
      }
    }
  } finally { rmSync(tmp, { force: true }); }
  const release = () => {
    try { // only delete our own entry: a stale-replaced one now belongs to someone else
      if (existsSync(file) && statSync(file).isFile()) {
        const cur = JSON.parse(readFileSync(file, "utf8"));
        if (cur?.pid === pid && cur?.sessionId === src.sessionId) rmSync(file, { force: true });
      }
    } catch { /* a stale leftover is harmless: entryIsLive ignores it once this process is gone */ }
  };
  return { ok: true, release };
}

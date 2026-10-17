/**
 * ISS-T039DUPES-006: deterministic contender-injection tests for claimLiveRecording's takeover. No process timing: a second contender is
 * injected through the optional ClaimHooks seam at the exact instants of the race. Real files in a temp dir, fake liveness probes, no
 * browser/recorder. Each test names the recorded mutant(s) it kills.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { claimLiveRecording, type ClaimHooks, type ClaimResult, type LiveProbes, type LiveRecordingEntry } from "./live-recording.js";

const MEET = "https://meet.google.com/abc-defg-hij";
const NOW = new Date("2026-10-12T10:00:00.000Z");
const DEAD_PID = 4242, A = 3131, B = 5151, C = 6161;
// everything except the seeded holder is alive; the seeded holder (pid 4242) is dead => its entry is stale
const probes: LiveProbes = { isAlive: (p) => p !== DEAD_PID, startTime: () => "T9" };
const fileName = `${createHash("sha256").update("meet:abc-defg-hij").digest("hex").slice(0, 32)}.json`;
const mk = () => mkdtempSync(path.join(tmpdir(), "live-rec-seam-"));
const staleEntry = (): LiveRecordingEntry => ({ version: 1, tenantId: "vidysea", meetingKey: "meet:abc-defg-hij", meetingUrl: MEET, sessionId: "old",
  pid: DEAD_PID, until: null, startedAt: "2026-10-12T09:00:00.000Z" });
function seed(dir: string) { mkdirSync(path.join(dir, "vidysea"), { recursive: true }); writeFileSync(path.join(dir, "vidysea", fileName), JSON.stringify(staleEntry())); }
const src = (dir: string, sessionId: string) => ({ dir, tenantId: "vidysea", meetingUrl: MEET, sessionId, until: null });
const onDisk = (dir: string) => JSON.parse(readFileSync(path.join(dir, "vidysea", fileName), "utf8")) as LiveRecordingEntry;
const leftovers = (dir: string) => readdirSync(path.join(dir, "vidysea")).filter((n) => n.startsWith(".tmp-"));
function attempt(f: () => ClaimResult): ClaimResult | "threw" { try { return f(); } catch { return "threw"; } }
const won = (r: ClaimResult | "threw" | undefined) => r !== undefined && r !== "threw" && r.ok;

test("no hooks (production call shape): a stale entry is still taken over and a live one is still held", () => {
  const dir = mk();
  try {
    seed(dir);
    const r = claimLiveRecording(src(dir, "X"), NOW, probes, A);
    assert.equal(r.ok, true);
    const held = claimLiveRecording(src(dir, "Y"), NOW, probes, B);
    assert.deepEqual(held.ok === false && held.heldBy, { sessionId: "X", pid: A });
    assert.deepEqual(leftovers(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T039DUPES-006: contender wins between 'judged dead' and 'take over' -> exactly one winner, its live entry is never moved", () => {
  const dir = mk();
  try {
    seed(dir);
    let a: ClaimResult | undefined, calls = 0, seenRaw = "";
    const hooks: ClaimHooks = { afterJudgedDead: ({ raw }) => { if (calls++ === 0) { seenRaw = raw; a = claimLiveRecording(src(dir, "A"), NOW, probes, A); } } };
    const b = claimLiveRecording(src(dir, "B"), NOW, probes, B, hooks);
    assert.equal(calls >= 1, true, "the hook ran between 'judged dead' and 'take over'");
    assert.equal(JSON.parse(seenRaw).sessionId, "old", "hook saw the judged-dead content");
    assert.equal(a?.ok, true, "A took the stale entry over inside B's decision");
    assert.equal(b.ok, false, "TWO WINNERS: B also took over after A already did");
    assert.deepEqual(b.ok === false && b.heldBy, { sessionId: "A", pid: A });
    assert.equal(onDisk(dir).sessionId, "A", "A's live entry was not moved or overwritten");
    assert.deepEqual(leftovers(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T039DUPES-006: contender injected while B HOLDS the takeover claim (after its re-read, before its replace) cannot also win", () => {
  const dir = mk();
  try {
    seed(dir);
    let c: ClaimResult | "threw" | undefined, calls = 0;
    const hooks: ClaimHooks = { beforeReplace: () => { if (calls++ === 0) c = attempt(() => claimLiveRecording(src(dir, "C"), NOW, probes, C)); } };
    const b = claimLiveRecording(src(dir, "B"), NOW, probes, B, hooks);
    assert.equal(calls, 1, "the hook ran once, inside B's claim");
    assert.equal(won(c), false, "SECOND WINNER: C replaced the entry while B held the takeover claim (claim skipped or not exclusive)");
    assert.equal(b.ok, true, "B, the claim holder, wins");
    assert.equal(onDisk(dir).sessionId, "B");
    assert.deepEqual(leftovers(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T039DUPES-006: the takeover claim is taken through the exclusive-create primitive on the content-keyed claim file; a contender that wins inside it leaves B 'held'", () => {
  const dir = mk();
  try {
    seed(dir);
    const targets: string[] = [];
    let a: ClaimResult | undefined, injected = false;
    const hooks: ClaimHooks = { link: (from, target) => {
      targets.push(path.basename(target));
      if (!injected && path.basename(target).startsWith(".tmp-takeover-")) { injected = true; a = claimLiveRecording(src(dir, "A"), NOW, probes, A); }
      linkSync(from, target);
    } };
    const b = claimLiveRecording(src(dir, "B"), NOW, probes, B, hooks);
    assert.equal(targets[0], fileName, "first the primary entry is created exclusively");
    assert.equal(targets.filter((t) => t.startsWith(".tmp-takeover-")).length >= 1, true, "the takeover goes through an exclusive claim file, not a check-then-write");
    assert.equal(a?.ok, true);
    assert.equal(b.ok, false, "TWO WINNERS");
    assert.equal(onDisk(dir).sessionId, "A");
    assert.deepEqual(leftovers(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ISS-T039DUPES-006: primary claim is an exclusive create - a contender that appears first makes B 'held' and its entry is not overwritten", () => {
  const dir = mk();
  try {
    let a: ClaimResult | undefined, injected = false, linkCalls = 0;
    const hooks: ClaimHooks = { link: (from, target) => {
      linkCalls++;
      if (!injected) { injected = true; a = claimLiveRecording(src(dir, "A"), NOW, probes, A); } // A creates the entry just before B's create
      linkSync(from, target); // EEXIST for B
    } };
    const b = claimLiveRecording(src(dir, "B"), NOW, probes, B, hooks);
    assert.ok(linkCalls >= 1, "the primary claim goes through the exclusive-create primitive");
    assert.equal(a?.ok, true);
    assert.equal(b.ok, false, "TWO WINNERS on the primary claim: B overwrote A's entry (check-then-write)");
    assert.deepEqual(b.ok === false && b.heldBy, { sessionId: "A", pid: A });
    assert.equal(onDisk(dir).sessionId, "A");
    assert.deepEqual(leftovers(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/** ISS-SENDNOWAPI-003: readSessionStatus. Real files in a temp dir, probes injected; no process is started. */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { claimLiveRecording, type LiveProbes } from "./live-recording.js";
import { readSessionStatus } from "./session-status.js";

const MEET = "https://meet.google.com/abc-defg-hij";
const NOW = new Date("2026-10-12T10:00:00.000Z");
const ALIVE: LiveProbes = { isAlive: () => true, startTime: () => "T0" };
const DEAD: LiveProbes = { isAlive: () => false, startTime: () => "T0" };
const mk = () => mkdtempSync(path.join(tmpdir(), "sess-status-"));
const claim = (dir: string, tenantId: string, sessionId: string, until: Date | null = new Date("2026-10-12T15:00:00.000Z")) =>
  claimLiveRecording({ dir, tenantId, meetingUrl: MEET, sessionId, until }, NOW, ALIVE);
const listing = (d: string) => readdirSync(d).map((n) => [n, readFileSync(path.join(d, n), "utf8")] as [string, string]);

test("a live claim is running and reports key/start/until; another session id is not", () => {
  const dir = mk();
  try {
    assert.equal(claim(dir, "t1", "send-now-20261012100000-aaaaaa").ok, true);
    const s = readSessionStatus({ dir, tenantId: "t1", sessionId: "send-now-20261012100000-aaaaaa" }, NOW, ALIVE);
    assert.deepEqual(s, { running: true, meetingKey: "meet:abc-defg-hij", startedAt: NOW.toISOString(), until: "2026-10-12T15:00:00.000Z" });
    assert.deepEqual(readSessionStatus({ dir, tenantId: "t1", sessionId: "send-now-20261012100000-bbbbbb" }, NOW, ALIVE), { running: false });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("dead pid, passed until+grace, absent dir, released claim: all not running", () => {
  const dir = mk();
  try {
    assert.deepEqual(readSessionStatus({ dir, tenantId: "t1", sessionId: "x" }, NOW, ALIVE), { running: false });
    const c = claim(dir, "t1", "s1"); assert.equal(c.ok, true);
    assert.deepEqual(readSessionStatus({ dir, tenantId: "t1", sessionId: "s1" }, NOW, DEAD), { running: false });
    assert.deepEqual(readSessionStatus({ dir, tenantId: "t1", sessionId: "s1" }, new Date("2026-10-12T15:11:00.000Z"), ALIVE), { running: false });
    if (c.ok) c.release();
    assert.deepEqual(readSessionStatus({ dir, tenantId: "t1", sessionId: "s1" }, NOW, ALIVE), { running: false });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("tenant isolation: tenant B cannot see tenant A's session even with the exact id", () => {
  const dir = mk();
  try {
    claim(dir, "tenant-a", "s1");
    assert.equal(readSessionStatus({ dir, tenantId: "tenant-a", sessionId: "s1" }, NOW, ALIVE).running, true);
    assert.deepEqual(readSessionStatus({ dir, tenantId: "tenant-b", sessionId: "s1" }, NOW, ALIVE), { running: false });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("cannot tell -> throws: corrupt entry, stray file, entry tagged for another tenant, bad tenant id; reading writes nothing", () => {
  const dir = mk();
  try {
    claim(dir, "t1", "s1");
    const tdir = path.join(dir, "t1");
    const before = JSON.stringify(listing(tdir));
    readSessionStatus({ dir, tenantId: "t1", sessionId: "s1" }, NOW, ALIVE);
    assert.equal(JSON.stringify(listing(tdir)), before, "status must not write");
    writeFileSync(path.join(tdir, "bad.json"), "{nope");
    assert.throws(() => readSessionStatus({ dir, tenantId: "t1", sessionId: "s1" }, NOW, ALIVE), /not JSON/);
    rmSync(path.join(tdir, "bad.json"));
    writeFileSync(path.join(tdir, "stray.txt"), "x");
    assert.throws(() => readSessionStatus({ dir, tenantId: "t1", sessionId: "s1" }, NOW, ALIVE), /unexpected file/);
    rmSync(path.join(tdir, "stray.txt"));
    const [name, body] = listing(tdir)[0]!;
    assert.ok(body.includes('"t1"'));
    writeFileSync(path.join(tdir, "other.json"), body.replace('"t1"', '"t2"'));
    assert.ok(name);
    assert.throws(() => readSessionStatus({ dir, tenantId: "t1", sessionId: "s1" }, NOW, ALIVE), /not tagged for tenant/);
    assert.throws(() => readSessionStatus({ dir, tenantId: "../x", sessionId: "s1" }, NOW, ALIVE), /invalid tenant id/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

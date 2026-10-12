/** ISS-T039DUPES-004: replacing a STALE live-recording entry must have exactly one winner across REAL processes (fake meeting, no Chrome/OBS). */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { meetingIdentity } from "../send-now.js";

const MEET = "https://meet.google.com/abc-defg-hij";
const WORKER = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "stale-race-worker.ts");
const RUNS = Number(process.env.STALE_RACE_RUNS ?? 5);
const PROCS = Number(process.env.STALE_RACE_PROCS ?? 4);
const RUN_TIMEOUT_MS = 30_000;

function seedStale(dir: string): void {
  const key = meetingIdentity(MEET)!;
  const tdir = path.join(dir, "t1");
  mkdirSync(tdir, { recursive: true });
  const entry = { version: 1, tenantId: "t1", meetingKey: key, meetingUrl: MEET, sessionId: "dead", pid: 2147483000, until: null, startedAt: "2026-10-12T00:00:00.000Z" };
  writeFileSync(path.join(tdir, `${createHash("sha256").update(key).digest("hex").slice(0, 32)}.json`), JSON.stringify(entry));
}

type Answer = { sid: string; ok: boolean; error?: string };
/** Workers hold any claim they win until the stop file appears (written once ALL have answered), so a late starter can only ever see
 *  a live holder: "winners > 1" now means a genuine exclusivity break, never start skew. Answers are read from each worker's first line. */
async function runOnce(dir: string): Promise<Answer[]> {
  const at = Date.now() + 2500;
  const stopFile = path.join(dir, "STOP");
  const closed: Array<Promise<void>> = [];
  try {
    return await Promise.all(Array.from({ length: PROCS }, (_, i) => new Promise<Answer>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", WORKER, dir, MEET, `p${i}`, String(at), stopFile], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      closed.push(new Promise<void>((r) => child.on("close", () => r())));
      let out = "", err = "", done = false;
      // fast-fail: a hung or crashed worker is an assertion failure with a clear message, never a suite hang
      const timer = setTimeout(() => { done = true; child.kill(); reject(new Error(`worker p${i} produced no answer within ${RUN_TIMEOUT_MS} ms (hang in claimLiveRecording?) stderr=${err.slice(0, 300)}`)); }, RUN_TIMEOUT_MS);
      child.stderr.on("data", (d) => { err += d; });
      child.stdout.on("data", (d) => {
        out += d;
        if (!done && out.includes("\n")) { done = true; clearTimeout(timer); try { resolve(JSON.parse(out.split("\n")[0] ?? "")); } catch { reject(new Error(`worker p${i} gave bad JSON: ${out.slice(0, 200)}`)); } }
      });
      child.on("close", () => { clearTimeout(timer); if (!done) { done = true; reject(new Error(`worker p${i} exited without an answer: stdout=${out.slice(0, 200)} stderr=${err.slice(0, 300)}`)); } });
    })));
  } finally {
    writeFileSync(stopFile, "x"); // release every holder (also on failure), then wait for them to exit before the dir is removed
    await Promise.race([Promise.all(closed), new Promise((r) => setTimeout(r, 10_000))]);
  }
}

for (const stale of [true, false]) {
  test(`${stale ? "STALE-seeded" : "fresh"} entry + ${PROCS} real processes racing: exactly one winner in each of ${RUNS} runs`, { timeout: RUNS * (RUN_TIMEOUT_MS + 5000) }, async () => {
    const bad: string[] = [];
    for (let n = 1; n <= RUNS; n++) {
      const dir = mkdtempSync(path.join(tmpdir(), "stale-race-"));
      try {
        if (stale) seedStale(dir);
        const res = await runOnce(dir);
        const winners = res.filter((r) => r.ok).length;
        if (winners !== 1) bad.push(`run ${n}: ${winners} winners ${JSON.stringify(res)}`);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    assert.equal(bad.length, 0, `${stale ? "stale" : "fresh"} claim was not exclusive: ${bad.join(" | ")}`);
  });
}

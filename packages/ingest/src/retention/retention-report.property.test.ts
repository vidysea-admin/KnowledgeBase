import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import { finalEligible, guard, QUIET_PERIOD_MS, type GuardInput } from "./retention-report-guards.js";
import type { MediaEvidence, MediaState } from "./retention-report-media.js";
import { gatherState } from "./retention-report-state.js";
import { planRetentionSweep } from "./retention-sweep.js";
import { DAY, NOW, baseArgs, iso, runCmd, tempRoot, writeSession, type SessionSpec } from "./retention-report.fixtures.js";

/** mulberry32: a small seeded PRNG so every run sees the same 'random' inputs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("downgrade-only: for 1,000 seeded random inputs a guard never turns a planner KEEP into eligible", () => {
  const r = rng(46046);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const states: MediaState[] = ["present", "present", "present", "not-found", "outside-root", "unreadable", "no-root"];
  const times = [0, 1000, 5000, 60_000, 3_600_000, QUIET_PERIOD_MS - 1, QUIET_PERIOD_MS, QUIET_PERIOD_MS + 1, 7 * DAY, 400 * DAY];
  let eligibleIn = 0, eligibleOut = 0, downgraded = 0;
  for (let i = 0; i < 1000; i++) {
    const planned = pick(["purge-eligible", "purge-eligible", "keep", "keep", "", "PURGE-ELIGIBLE", "purge-eligible "]);
    const state = pick(states);
    const age = pick(times) * (r() < 0.2 ? -1 : 1);
    const size = state === "present" ? Math.floor(r() * 2000) : null;
    const media: MediaEvidence = { state, sizeBytes: size, mtimeMs: state === "present" ? (r() < 0.05 ? null : NOW - age) : null };
    const mtime = media.mtimeMs;
    const rec = r() < 0.5 ? null : r() < 0.8 ? size : Math.floor(r() * 2000);
    const input: GuardInput = {
      media, recordedBytes: rec, processedAtMs: mtime === null || r() < 0.2 ? null : mtime + pick([0, 3_600_000, -3_600_000, 7_200_000, 10 * DAY]),
    };
    const out = finalEligible(planned, input, NOW);
    if (out.eligible) assert.equal(planned, "purge-eligible", `case ${i}: guard produced eligible from planner verdict ${JSON.stringify(planned)}`);
    if (planned !== "purge-eligible") { assert.equal(out.hit, null, `case ${i}`); assert.equal(guard(planned, input, NOW), null); }
    if (planned === "purge-eligible") { eligibleIn++; if (out.eligible) eligibleOut++; else downgraded++; }
  }
  assert.ok(eligibleOut > 10 && downgraded > 100, `property test must not be vacuous (kept eligible ${eligibleOut}, downgraded ${downgraded} of ${eligibleIn})`);
});

function sessionSpec(r: () => number, i: number): SessionSpec {
  const processed = r() < 0.8 ? { processedAt: iso(Math.floor(r() * 40 * DAY)) } : r() < 0.5 ? {} : { processedAt: "tomorrow" };
  const mtimeAgo = [5000, 3_600_000, QUIET_PERIOD_MS, 3 * DAY, 20 * DAY, 60 * DAY, -9 * DAY, -1000][Math.floor(r() * 8)] as number;
  const bytes = 1 + Math.floor(r() * 50);
  return {
    name: `r${i}`, ...processed, mediaBytes: bytes, mediaMtimeMs: NOW - mtimeAgo,
    ...(r() < 0.1 ? { createMedia: false } : {}),
    ...(r() < 0.1 ? { mediaPath: ["../x.webm", "C:\\x.webm", null, "/abs.webm"][Math.floor(r() * 4)] as string | null } : {}),
    ...(r() < 0.15 ? { recordedBytes: bytes * 3 } : r() < 0.3 ? { recordedBytes: bytes } : {}),
    ...(r() < 0.15 ? { claims: [{ _id: "c", tenantId: "toc", text: "x", status: "needs-review", evidence: [{ turnId: `r${i}-t1`, sessionId: `r${i}` }] }] } : {}),
    ...(r() < 0.05 ? { status: { transcribe: "pending", index: "done" } } : {}),
  };
}

test("downgrade-only through the command: 150 random sessions, reported-eligible is a subset of what the planner alone says", () => {
  const root = tempRoot();
  const media = tempRoot();
  try {
    const r = rng(2026);
    for (let i = 0; i < 150; i++) writeSession(root, media, sessionSpec(r, i));
    const args = baseArgs(root, media);
    const out = runCmd(args);
    assert.equal(out.code, 0, out.err);
    const reported = new Set([...out.out.matchAll(/^RECORDING (\S+) => ELIGIBLE$/gm)].map((m) => m[1]));
    const opts = { tenant: "toc", dataRoot: root, mediaRoot: media, minAgeDays: 7, clipPaddingSeconds: 15, operationsState: "x" };
    const g = gatherState(opts);
    assert.ok(g.ok);
    if (!g.ok) return;
    const planned = planRetentionSweep({
      tenantId: "toc", media: g.value.media, claims: g.value.claims, turns: g.value.turns, now: NOW,
      params: { minAgeAfterProcessedMs: 7 * DAY, clipPaddingSeconds: 15 },
    });
    assert.ok(planned.ok);
    if (!planned.ok) return;
    const alone = new Set(planned.plan.items.filter((it) => it.decision === "purge-eligible").map((it) => it.mediaId));
    for (const id of reported) assert.ok(alone.has(id as string), `${id} reported ELIGIBLE but the planner alone did not say so`);
    assert.ok(reported.size > 5 && alone.size > reported.size + 10, `not vacuous: planner ${alone.size}, reported ${reported.size}`);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(media, { recursive: true, force: true }); }
});

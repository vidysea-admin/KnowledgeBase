/**
 * T-054 refresh execution: after a durable commit the refresh state is `pending` until the injected executor has run every
 * target (claims, session-page, chunks, tree, graph). Failure is recorded honestly, retry resumes without redoing finished
 * targets, and a newer revision is never overwritten by an older run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, SESSION } from "./persist.testkit.js";

const A0 = `tenant-A-${SESSION}-t0`;
const fix = (text: string) => ({ reason: "Fix transcription error", corrections: [{ turnId: A0, text }] });
const TARGETS = ["claims", "session-page", "chunks", "tree", "graph"];
const refreshOf = async (h: Awaited<ReturnType<typeof boot>>) => (await h.call("POST", `/sessions/${SESSION}/transcript-review/refresh`, "key-a", {}));

test("no executor configured: 503 and the refresh stays pending (never reported complete)", async () => {
  const h = await boot();
  try {
    const r0 = (await h.get("key-a")).body.revision;
    await h.post("key-a", r0, fix("v1"));
    assert.equal((await refreshOf(h)).status, 503);
    assert.equal((await h.get("key-a")).body.refresh, "pending");
  } finally { await h.close(); }
});

test("success: every target runs once, in order, for the committed revision; state becomes complete", async () => {
  const jobs: { tenantId: string; sessionId: string; revision: string; target: string }[] = [];
  const h = await boot({ refresh: async (j) => { jobs.push(j); } });
  try {
    const r0 = (await h.get("key-a")).body.revision;
    const r1 = ((await (await h.post("key-a", r0, fix("v1"))).json()) as { revision: string }).revision;
    const res = await refreshOf(h);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { refresh: string; completed: string[]; revision: string };
    assert.equal(body.refresh, "complete");
    assert.deepEqual(body.completed, TARGETS);
    assert.deepEqual(jobs.map((j) => j.target), TARGETS);
    assert.ok(jobs.every((j) => j.tenantId === "tenant-A" && j.sessionId === SESSION && j.revision === r1));
    assert.equal((await h.get("key-a")).body.refresh, "complete");
    const again = await refreshOf(h);
    assert.equal(((await again.json()) as { refresh: string }).refresh, "complete");
    assert.equal(jobs.length, TARGETS.length, "a completed refresh is not re-run");
  } finally { await h.close(); }
});

test("failure is recorded (failed + failedTarget), earlier targets are kept, retry resumes at the failed target", async () => {
  const ran: string[] = [];
  let broken = true;
  const h = await boot({ refresh: async (j) => { if (j.target === "chunks" && broken) throw new Error("secret internal detail"); ran.push(j.target); } });
  try {
    const r0 = (await h.get("key-a")).body.revision;
    await h.post("key-a", r0, fix("v1"));
    const res = await refreshOf(h);
    const text = await res.text();
    assert.equal(text.includes("secret internal detail"), false, "executor error text is not echoed");
    const failed = JSON.parse(text) as { refresh: string; failedTarget: string; completed: string[] };
    assert.equal(failed.refresh, "failed");
    assert.equal(failed.failedTarget, "chunks");
    assert.deepEqual(failed.completed, ["claims", "session-page"]);
    assert.equal((await h.get("key-a")).body.refresh, "failed");
    broken = false;
    const ok = (await (await refreshOf(h)).json()) as { refresh: string };
    assert.equal(ok.refresh, "complete");
    assert.deepEqual(ran, ["claims", "session-page", "chunks", "tree", "graph"], "claims/session-page were not re-run");
  } finally { await h.close(); }
});

test("a newer correction supersedes an in-flight refresh: the old run cannot overwrite the new revision's state", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let first = true;
  const ran: string[] = [];
  const h = await boot({ refresh: async (j) => { ran.push(`${j.revision}:${j.target}`); if (first && j.target === "session-page") { first = false; await gate; } } });
  try {
    const r0 = (await h.get("key-a")).body.revision;
    const r1 = ((await (await h.post("key-a", r0, fix("v1"))).json()) as { revision: string }).revision;
    const running = refreshOf(h);
    await new Promise((r) => setTimeout(r, 50));
    const r2 = ((await (await h.post("key-a", r1, fix("v2"))).json()) as { revision: string }).revision;
    release();
    await (await running).text();
    // ISS-T054-PERSIST-002: the superseded run stops at once - it must not keep executing the OLD revision's remaining targets.
    assert.deepEqual(ran, [`${r1}:claims`, `${r1}:session-page`], "no chunks/tree/graph for the superseded revision");
    const head = h.m.rows("transcript_reviews")[0] as { revision: string; refresh: { status: string; revision: string; completed: string[] } };
    assert.equal(head.revision, r2);
    assert.equal(head.refresh.revision, r2);
    assert.equal(head.refresh.status, "pending", "the new revision still needs its own refresh");
    assert.deepEqual(head.refresh.completed, []);
    assert.equal((await h.get("key-a")).body.refresh, "pending");
  } finally { await h.close(); }
});

test("cross-tenant refresh cannot run or observe another tenant's refresh", async () => {
  let calls = 0;
  const h = await boot({ refresh: async () => { calls++; } });
  try {
    const r0 = (await h.get("key-a")).body.revision;
    await h.post("key-a", r0, fix("v1"));
    const res = await h.call("POST", "/sessions/only-a/transcript-review/refresh", "key-b", {});
    assert.equal(res.status, 404);
    // B has its own session-1: refreshing it must not touch A's pending refresh
    const own = await h.call("POST", `/sessions/${SESSION}/transcript-review/refresh`, "key-b", {});
    assert.equal(own.status, 200);
    assert.equal(calls, 0, "B has no head, so nothing ran");
    assert.equal((await h.get("key-a")).body.refresh, "pending");
  } finally { await h.close(); }
});

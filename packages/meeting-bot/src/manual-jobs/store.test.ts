import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ManualJobStore } from "./store.js";

const NOW = new Date("2026-10-14T10:00:00.000Z"), until = "2026-10-14T11:00:00.000Z";
const plan = { meetingUrl: "https://meet.google.com/abc-defg-hij?authuser=0", meetingKey: "meet:abc-defg-hij", platform: "meet" };
function fixture(fn: (store: ManualJobStore, dir: string) => void) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "manual-jobs-"));
  try { fn(new ManualJobStore(dir, () => NOW), dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
test("durable history, cancellation intent and terminal acknowledgement survive a new store instance without secret disclosure", () => fixture((store, dir) => {
  const req = store.create("a", plan, until);
  store.writeProgress(req, "running");
  const restarted = new ManualJobStore(dir, () => NOW);
  assert.equal(restarted.list("a")[0]!.state, "running");
  assert.equal(restarted.cancel("a", req.jobId)!.state, "cancel-requested");
  assert.equal(restarted.cancel("a", req.jobId)!.state, "cancel-requested");
  restarted.writeProgress(req, "cancel-acknowledged");
  assert.equal(restarted.summary("a", req.jobId)!.state, "cancel-acknowledged");
  restarted.writeProgress(req, "cancelled");
  assert.equal(restarted.cancel("a", req.jobId)!.state, "cancelled");
  const text = JSON.stringify(restarted.list("a"));
  for (const privateValue of [req.nonce, req.meetingUrl, req.meetingKey, "authuser"]) assert.ok(!text.includes(privateValue));
  assert.equal(restarted.create("a", plan, until).platform, "meet");
  assert.ok(!readdirSync(path.join(dir, "a")).includes(".dispatch-lock"));
}));
test("tenant ownership, traversal and forged worker nonce cannot read or mutate another job", () => fixture(store => {
  const req = store.create("a", plan, until);
  assert.equal(store.summary("b", req.jobId), null);
  assert.equal(store.cancel("b", req.jobId), null);
  assert.deepEqual(store.list("b"), []);
  assert.throws(() => store.list("../a"));
  assert.throws(() => store.cancel("a", "../../anything"));
  assert.throws(() => store.writeProgress({ ...req, nonce: "b".repeat(64) }, "cancelled"));
  assert.equal(store.summary("a", req.jobId)!.state, "queued");
}));
test("restart with stale heartbeat or malformed state cannot erase ownership or allow a duplicate", () => fixture((store, dir) => {
  const req = store.create("a", plan, until);
  assert.throws(() => store.create("a", plan, until), /already owned/);
  const stale = new ManualJobStore(dir, () => new Date(NOW.getTime() + 16_000));
  assert.equal(stale.summary("a", req.jobId)!.state, "unknown");
  assert.throws(() => stale.create("a", plan, until), /already owned/);
  writeFileSync(path.join(dir, "a", `${req.jobId}.state.json`), '{"tenantId":"b"}');
  assert.throws(() => store.list("a"), /progress unavailable/);
  assert.throws(() => store.create("a", plan, until));
}));
test("one durable job can only claim one owner worker, and forged cancellation state is refused", () => fixture((store, dir) => {
  const req = store.create("a", plan, until);
  store.claimWorker(req);
  assert.throws(() => store.claimWorker(req), /EEXIST/);
  writeFileSync(path.join(dir, "a", `${req.jobId}.cancel.json`), JSON.stringify({ version: 1, tenantId: "a", jobId: req.jobId, nonce: "b".repeat(64) }));
  assert.throws(() => store.cancel("a", req.jobId), /cancel request unavailable/);
}));
test("stray or orphaned durable state is unavailable rather than an empty history", () => fixture((store, dir) => {
  const req = store.create("a", plan, until);
  writeFileSync(path.join(dir, "a", "unexpected.json"), "{}");
  assert.throws(() => store.list("a"), /unexpected/);
  rmSync(path.join(dir, "a", "unexpected.json"));
  rmSync(path.join(dir, "a", `${req.jobId}.json`));
  assert.throws(() => store.list("a"), /claim unavailable/);
}));

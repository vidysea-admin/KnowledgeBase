/**
 * Real-Mongo tests of the hosted capture queue (unit `hosted-send-now`). The duplicate guard IS a unique index, so a
 * fake would prove nothing. Runs when LKB_TEST_MONGO_URL is set (e.g. a throwaway `docker run mongo:7`); each test
 * uses its own database and drops it. Without the variable the suite is skipped and says so.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { CAPTURE_JOBS, CaptureJobDuplicate, CaptureJobQueue, STALE_OWNER_MS, OWNER_SILENT_MS } from "./capture-job-queue.js";
import { createQueuedSendNowDeps } from "./send-now-queue.js";

const URL_ENV = process.env.LKB_TEST_MONGO_URL;
const skip = URL_ENV ? false : "LKB_TEST_MONGO_URL not set (needs a real Mongo for the unique-index guard)";
let client: MongoClient | undefined;
before(async () => { if (URL_ENV) client = await new MongoClient(URL_ENV).connect(); });
after(async () => { await client?.close(); });

const plan = { meetingUrl: "https://meet.google.com/abc-defg-hij", meetingKey: "meet:abc-defg-hij", platform: "meet" };
async function withDb(fn: (db: Db, clock: { t: number }) => Promise<void>) {
  const db = client!.db(`lkb_sendnow_test_${randomBytes(4).toString("hex")}`), clock = { t: Date.parse("2026-11-26T10:00:00.000Z") };
  try { await fn(db, clock); } finally { await db.dropDatabase(); }
}
const queueOf = async (db: Db, clock: { t: number }) => { const q = new CaptureJobQueue(db, () => new Date(clock.t)); await q.ensureIndexes(); return q; };

test("one live job per tenant and meeting; a second create is a duplicate, another tenant is not", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const first = await q.create("a", plan, "2026-11-26T11:00:00.000Z");
  assert.match(first._id, /^send-now-\d{14}-[0-9a-f]{6}$/);
  await assert.rejects(q.create("a", plan, "2026-11-26T11:00:00.000Z"), CaptureJobDuplicate);
  await q.create("b", plan, "2026-11-26T11:00:00.000Z");
  assert.equal(await q.hasLiveJob("a", plan.meetingKey), true);
}));

test("concurrent creates for one meeting: exactly one wins", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => q.create("a", plan, "2026-11-26T11:00:00.000Z")));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.ok(results.filter(r => r.status === "rejected").every(r => (r as PromiseRejectedResult).reason instanceof CaptureJobDuplicate));
}));

test("claim takes the oldest queued job of a served tenant, once; terminal progress frees the meeting", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const job = await q.create("a", plan, "2026-11-26T11:00:00.000Z");
  assert.equal(await q.claimNext("w1", ["other"]), null);
  const claimed = await q.claimNext("w1", ["a"]);
  assert.equal(claimed?._id, job._id); assert.equal(claimed?.state, "launching");
  assert.equal(await q.claimNext("w2", ["a"]), null);
  assert.equal(await q.writeProgress(job, "w2", "running"), false, "a non-owner cannot write");
  assert.equal(await q.writeProgress(job, "w1", "running", true), true);
  assert.equal((await q.detail("a", job._id))?.state, "running");
  assert.equal(await q.writeProgress(job, "w1", "completed"), true);
  assert.equal(await q.hasLiveJob("a", plan.meetingKey), false);
  assert.equal(await q.writeProgress(job, "w1", "running"), false, "terminal is final");
  await q.create("a", plan, "2026-11-26T12:00:00.000Z");
}));

test("cancel: a queued job ends cancelled and is never claimed; a claimed job gets cancel intent", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const queued = await q.create("a", plan, "2026-11-26T11:00:00.000Z");
  assert.equal((await q.cancel("a", queued._id))?.state, "cancelled");
  assert.equal(await q.claimNext("w1", ["a"]), null);
  assert.equal(await q.cancel("b", queued._id), null, "another tenant cannot see or cancel it");
  const other = { ...plan, meetingUrl: "https://meet.google.com/xyz-wxyz-xyz", meetingKey: "meet:xyz-wxyz-xyz" };
  const live = await q.create("a", other, "2026-11-26T11:00:00.000Z");
  await q.claimNext("w1", ["a"]);
  assert.equal(await q.cancelRequested(live), false);
  assert.equal((await q.cancel("a", live._id))?.state, "cancel-requested");
  assert.equal(await q.cancelRequested(live), true);
}));

test("a silent owner shows unknown, then is reaped to failed and the meeting is free again", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const job = await q.create("a", plan, "2026-11-26T11:00:00.000Z");
  await q.claimNext("w1", ["a"]);
  clock.t += OWNER_SILENT_MS + 1000;
  assert.equal((await q.detail("a", job._id))?.state, "unknown");
  clock.t += STALE_OWNER_MS;
  await q.create("a", plan, "2026-11-26T11:30:00.000Z");
  assert.equal((await q.detail("a", job._id))?.state, "failed");
  assert.equal(await q.writeProgress(job, "w1", "running"), false, "the reaped owner lost the job");
}));

test("a queued job whose window passed is reaped, not claimed", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const job = await q.create("a", plan, "2026-11-26T10:30:00.000Z");
  clock.t = Date.parse("2026-11-26T10:31:00.000Z");
  assert.equal(await q.claimNext("w1", ["a"]), null);
  assert.equal((await q.detail("a", job._id))?.state, "failed");
}));

test("summaries carry no URL, meeting key, nonce or owner", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  await q.create("a", { ...plan, meetingUrl: "https://meet.google.com/abc-defg-hij?pwd=secret" }, "2026-11-26T11:00:00.000Z");
  await q.claimNext("owner-xyz", ["a"]);
  const text = JSON.stringify(await q.list("a"));
  for (const leak of ["meet.google", "abc-defg-hij", "secret", "owner-xyz", "nonce"]) assert.ok(!text.includes(leak), leak);
  assert.equal((await db.collection(CAPTURE_JOBS).countDocuments()), 1);
}));

test("hosted deps: queue end to end through plan, launch, list, status and cancel", { skip }, () => withDb(async (db, clock) => {
  const deps = createQueuedSendNowDeps({ db, env: { LKB_SEND_NOW_TENANTS: "a" }, now: () => new Date(clock.t) });
  const until = "2026-11-26T17:00:00+05:30";
  assert.deepEqual(await deps.plan("b", { meetingUrl: plan.meetingUrl, until }), { ok: false, kind: "forbidden", reason: "tenant-not-served", message: "the server bot does not capture for your tenant" });
  const checked = await deps.plan("a", { meetingUrl: plan.meetingUrl, until });
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  const { jobId } = await deps.launch("a", checked, until);
  const dup = await deps.plan("a", { meetingUrl: "https://meet.google.com/ABC-DEFG-HIJ?authuser=1", until });
  assert.equal(dup.ok ? "ok" : dup.kind, "duplicate");
  await assert.rejects(deps.launch("a", checked, until), (e: { code?: string }) => e.code === "manual_duplicate");
  assert.deepEqual(await deps.status!("a", jobId), { ok: true, status: "launching", startedAt: new Date(clock.t).toISOString() });
  assert.equal((await deps.manualJobs!.list("a"))[0]?.state, "queued");
  await assert.rejects(Promise.resolve().then(() => deps.manualJobs!.list("b")), (e: { code?: string }) => e.code === "tenant_not_served");
  assert.equal((await deps.manualJobs!.cancel("a", jobId))?.state, "cancelled");
  const job = await db.collection(CAPTURE_JOBS).findOne({ _id: jobId as never });
  assert.equal(job?.until, "2026-11-26T11:30:00.000Z");
}));

test("review A1: an expired queued job reads failed from detail and list, with no claim or create in between", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const job = await q.create("a", plan, "2026-11-26T10:30:00.000Z");
  clock.t = Date.parse("2026-11-26T12:00:00.000Z");
  assert.equal((await q.detail("a", job._id))?.state, "failed");
  assert.deepEqual((await q.list("a")).map(j => j.state), ["failed"]);
  const deps = createQueuedSendNowDeps({ db, env: { LKB_SEND_NOW_TENANTS: "a" }, now: () => new Date(clock.t) });
  const status = await deps.status!("a", job._id);
  assert.equal(status.ok && status.status, "not-running");
}));

test("review A2: another tenant cannot cancel or list a LIVE claimed job, even with both tenants served", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const job = await q.create("a", plan, "2026-11-26T11:00:00.000Z");
  await q.claimNext("w1", ["a", "b"]);
  assert.equal(await q.cancel("b", job._id), null);
  assert.equal(await q.cancelRequested(job), false);
  assert.equal((await q.detail("a", job._id))?.state, "launching");
  assert.deepEqual(await q.list("b"), []);
  const queued = await q.create("a", { ...plan, meetingUrl: "https://meet.google.com/xyz-wxyz-xyz", meetingKey: "meet:xyz-wxyz-xyz" }, "2026-11-26T11:00:00.000Z");
  assert.equal(await q.cancel("b", queued._id), null);
  assert.equal((await q.detail("a", queued._id))?.state, "queued");
}));

test("review B-low: a terminal row no longer holds the meeting URL (it can carry a passcode)", { skip }, () => withDb(async (db, clock) => {
  const q = await queueOf(db, clock);
  const secret = { ...plan, meetingUrl: "https://meet.google.com/abc-defg-hij?pwd=s3cret" };
  const done = await q.create("a", secret, "2026-11-26T11:00:00.000Z");
  await q.claimNext("w1", ["a"]); await q.writeProgress(done, "w1", "completed");
  const cancelled = await q.create("a", secret, "2026-11-26T11:00:00.000Z"); await q.cancel("a", cancelled._id);
  const expired = await q.create("a", secret, "2026-11-26T10:30:00.000Z");
  clock.t = Date.parse("2026-11-26T10:45:00.000Z"); await q.reap();
  const raw = await db.collection(CAPTURE_JOBS).find({}).toArray();
  assert.equal(raw.length, 3);
  for (const row of raw) assert.ok(!JSON.stringify(row).includes("s3cret"), `${row._id} ${row.state}`);
  void expired;
}));

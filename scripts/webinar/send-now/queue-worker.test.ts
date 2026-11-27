/**
 * unit `hosted-send-now`: the recorder-side queue worker against a REAL Mongo (LKB_TEST_MONGO_URL; skipped without it).
 * The recorder itself is faked at the manual worker's `launch` seam; everything between the API's queued row and the
 * terminal state is real: claim, the mirror's coalesced writes and cancel polling, runManualWorker's lifecycle.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CAPTURE_JOBS, CaptureJobQueue } from "../../../apps/api/src/join-rules/capture-job-queue.js";
import { createQueuedSendNowDeps } from "../../../apps/api/src/join-rules/send-now-queue.js";
import type { ManualWorkerDeps } from "../../../packages/meeting-bot/src/manual-jobs/worker.js";
import { parseArgs, recordArgsFor, runQueueOnce } from "./queue-worker.js";

/** Typed from the queue, so the test never resolves a second `mongodb` copy for types. */
type Db = ConstructorParameters<typeof CaptureJobQueue>[0];
type MongoClient = { connect(): Promise<MongoClient>; db(name: string): Db; close(): Promise<void> };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const URL_ENV = process.env.LKB_TEST_MONGO_URL;
const skip = URL_ENV ? false : "LKB_TEST_MONGO_URL not set";
let client: MongoClient | undefined;
before(async () => {
  if (!URL_ENV) return;
  const { MongoClient: Client } = await import(pathToFileURL(createRequire(path.join(root, "apps/api/package.json")).resolve("mongodb")).href) as { MongoClient: new (url: string) => MongoClient };
  client = await new Client(URL_ENV).connect();
});
after(async () => { await client?.close(); });

const until = () => new Date(Date.now() + 3600_000).toISOString();
async function withQueued(fn: (ctx: { db: Db; queue: CaptureJobQueue; jobId: string }) => Promise<void>, tenant = "a") {
  const db = client!.db(`lkb_sendnow_worker_${randomBytes(4).toString("hex")}`);
  try {
    const api = createQueuedSendNowDeps({ db, env: { LKB_SEND_NOW_TENANTS: tenant } });
    const checked = await api.plan(tenant, { meetingUrl: "https://meet.google.com/abc-defg-hij?pwd=secret", until: until() });
    assert.equal(checked.ok, true); if (!checked.ok) return;
    const { jobId } = await api.launch(tenant, checked, until());
    await fn({ db, queue: new CaptureJobQueue(db), jobId });
  } finally { await db.dropDatabase(); }
}
const quiet = { log: () => {}, sleep: async () => {} };
const noTicks = { schedule: () => () => {} };

test("args and record flags: --index only on explicit opt-in", () => {
  assert.deepEqual(parseArgs(["--once"]), { maxWaitS: 0 });
  assert.deepEqual(parseArgs(["--once", "--max-wait-s", "240"]), { maxWaitS: 240 });
  for (const bad of [[], ["--once", "--max-wait-s"], ["--once", "--max-wait-s", "-1"], ["--loop"]]) assert.throws(() => parseArgs(bad));
  assert.deepEqual(recordArgsFor({}), ["--transcribe"]);
  assert.deepEqual(recordArgsFor({ LKB_SEND_NOW_INDEX: "1" }), ["--transcribe", "--process-video", "--index"]);
  assert.deepEqual(recordArgsFor({ LKB_SEND_NOW_TRANSCRIBE: "0", LKB_SEND_NOW_INDEX: "1" }), []);
});

test("a queued job is claimed, recorded with the fixed flags and ends completed; the meeting is free again", { skip }, () => withQueued(async ({ queue, jobId }) => {
  let argv: string[] = [], seenRunning = "";
  const deps: ManualWorkerDeps = { ...noTicks, async launch(_root, args, env, onLine) {
    argv = args; assert.equal(env.LKB_TENANT_ID, "a");
    onLine("[bot] recording until 11:00");
    // Poll (not a fixed 50 ms): under machine load the coalesced "running" write can take longer to land.
    for (let i = 0; i < 60 && seenRunning !== "running"; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      seenRunning = (await queue.detail("a", jobId))!.state;
    }
  } };
  const result = await runQueueOnce({ queue, tenants: ["a"], root, maxWaitS: 0, recordArgs: ["--transcribe"], deps, ...quiet });
  assert.deepEqual(result, { job: jobId, state: "completed" });
  assert.equal(seenRunning, "running");
  assert.equal(argv[0], "record"); assert.equal(argv[1], "https://meet.google.com/abc-defg-hij?pwd=secret");
  assert.deepEqual(argv.slice(-1), ["--transcribe"]); assert.ok(argv.includes(jobId));
  assert.equal(await queue.hasLiveJob("a", "meet:abc-defg-hij"), false);
}));

test("cancel from the API while recording reaches the recorder through the poll and ends cancelled", { skip }, () => withQueued(async ({ queue, jobId }) => {
  let tick!: () => void, stops = 0;
  const deps: ManualWorkerDeps = {
    schedule: fn => { tick = fn; const t = setInterval(fn, 100); return () => clearInterval(t); },
    async launch(_root, _args, _env, onLine, onControl) {
      let finish!: () => void; const done = new Promise<void>(resolve => { finish = resolve; });
      onControl({ generation: "g", stop: async () => { stops++; setTimeout(finish, 20); return "accepted"; } });
      onLine("[bot] recording until 11:00");
      setTimeout(() => { void queue.cancel("a", jobId); }, 100);
      await done;
    },
  };
  const result = await runQueueOnce({ queue, tenants: ["a"], root, maxWaitS: 0, recordArgs: [], deps, ...quiet });
  assert.ok(tick); assert.equal(stops, 1);
  assert.deepEqual(result, { job: jobId, state: "cancelled" });
}));

test("a recorder that fails ends the job failed, with no URL or passcode in the worker log", { skip }, () => withQueued(async ({ queue, jobId }) => {
  const lines: string[] = [];
  const result = await runQueueOnce({ queue, tenants: ["a"], root, maxWaitS: 0, recordArgs: [], log: line => lines.push(line), sleep: async () => {},
    deps: { ...noTicks, launch: async () => { throw new Error("https://meet.google.com/abc-defg-hij?pwd=secret"); } } });
  assert.deepEqual(result, { job: jobId, state: "failed" });
  assert.ok(lines.length >= 2 && !lines.join("\n").includes("secret") && !lines.join("\n").includes("meet.google"));
}));

test("nothing queued for a served tenant: waits until the deadline, claims nothing", { skip }, () => withQueued(async ({ queue, db }) => {
  let sleeps = 0;
  const result = await runQueueOnce({ queue, tenants: ["other"], root, maxWaitS: 1, recordArgs: [], pollMs: 300,
    log: () => {}, sleep: ms => { sleeps++; return new Promise(resolve => setTimeout(resolve, ms)); }, deps: { ...noTicks, launch: async () => { throw new Error("must not launch"); } } });
  assert.deepEqual(result, { job: null });
  assert.ok(sleeps >= 2);
  assert.equal((await db.collection(CAPTURE_JOBS).findOne({}))?.state, "queued");
}));

test("a link the worker's own planSendNow refuses is failed without launching", { skip }, () => withQueued(async ({ queue, db, jobId }) => {
  await db.collection(CAPTURE_JOBS).updateOne({ _id: jobId as never }, { $set: { meetingKey: "meet:zzz-zzzz-zzz" } });
  let launches = 0;
  const result = await runQueueOnce({ queue, tenants: ["a"], root, maxWaitS: 0, recordArgs: [], deps: { ...noTicks, launch: async () => { launches++; } }, ...quiet });
  assert.equal(launches, 0);
  assert.deepEqual(result, { job: jobId, state: "failed" });
}));

test("review B1: container shutdown mid-recording ends the job failed at once and frees the meeting", { skip }, () => withQueued(async ({ queue, jobId }) => {
  const stop = new AbortController();
  let stateAtAbort = "";
  const deps: ManualWorkerDeps = { ...noTicks, async launch(_root, _args, _env, onLine) {
    onLine("[bot] recording until 11:00");
    await new Promise(resolve => setTimeout(resolve, 50));
    stop.abort();
    await new Promise(resolve => setTimeout(resolve, 200));   // the recorder is still being killed
    stateAtAbort = (await queue.detail("a", jobId))!.state;
    throw new Error("recorder killed");
  } };
  const result = await runQueueOnce({ queue, tenants: ["a"], root, maxWaitS: 0, recordArgs: [], deps, stop: stop.signal, ...quiet });
  assert.equal(stateAtAbort, "failed", "written while the recorder was still dying, not at reap time");
  assert.deepEqual(result, { job: jobId, state: "failed" });
  assert.equal(await queue.hasLiveJob("a", "meet:abc-defg-hij"), false);
}));

test("review B1: a shutdown before any claim claims nothing", { skip }, () => withQueued(async ({ queue, db }) => {
  const stop = new AbortController(); stop.abort();
  const result = await runQueueOnce({ queue, tenants: ["a"], root, maxWaitS: 5, recordArgs: [], stop: stop.signal,
    deps: { ...noTicks, launch: async () => { throw new Error("must not launch"); } }, ...quiet });
  assert.deepEqual(result, { job: null });
  assert.equal((await db.collection(CAPTURE_JOBS).findOne({}))?.state, "queued");
}));

test("review A3/B-low: close() after a completed final write returns; ownership lost before close throws", { skip }, () => withQueued(async ({ queue, db, jobId }) => {
  const { QueueJobMirror } = await import("./queue-store.js");
  const job = (await queue.claimNext("w1", ["a"]))!;
  const timers = { every: () => () => {}, sleep: async () => {} };
  const m = new QueueJobMirror(queue, job, "w1", timers);
  m.writeProgress(m.request, "completed");
  await m.close();
  assert.equal((await queue.detail("a", jobId))?.state, "completed");
  await db.collection(CAPTURE_JOBS).updateOne({ _id: jobId as never }, { $set: { ownerId: "someone-else" } });
  const m2 = new QueueJobMirror(queue, job, "w1", timers);
  m2.writeProgress(m2.request, "failed");
  await assert.rejects(m2.close(), /ownership was lost/);
}));

test("ISS-B3HOSTID-001: a bad LKB_CAPTURE_HOST_ID refuses before any claim, so the job stays queued", { skip }, () => withQueued(async ({ queue, db }) => {
  await assert.rejects(runQueueOnce({ queue, tenants: ["a"], root, maxWaitS: 0, recordArgs: [], env: { LKB_CAPTURE_HOST_ID: "" },
    deps: { ...noTicks, launch: async () => { throw new Error("must not launch"); } }, ...quiet }), /LKB_CAPTURE_HOST_ID refused: empty/);
  assert.equal((await db.collection(CAPTURE_JOBS).findOne({}))?.state, "queued");
}));

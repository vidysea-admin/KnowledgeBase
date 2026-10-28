import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, chmodSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import type { SourceIntakeResult } from "../store.js";
import { buildSourceIntakeDeps } from "../wiring.js";
import { queueFixtureStore as createSourceJobStore } from "./test-fixture.js";
import { runSourceJob } from "./worker.js";
import type { SourceJobInput, SourceJobStore } from "./types.js";
import { buildConfiguredSourceJobStore, sourceWorkerConfiguration } from "../../composition/integrations/source-jobs.js";

const input: SourceJobInput = { tenantId: "a", actorKeyId: "actor-a", url: "https://www.youtube.com/watch?v=abcdefghijk", idempotencyKey: "provided-request-1" };
const authorize = async (value: Readonly<SourceJobInput>) => ({ approvedBy: value.actorKeyId, approvalRef: "trusted-test-approval" });
function fixture(context: { after(fn: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), "lkb-source-job-test-")); chmodSync(root, 0o700);
  context.after(() => {
    const path = relative(tmpdir(), root);
    assert.ok(path && !isAbsolute(path) && !path.startsWith("..") && path.startsWith("lkb-source-job-test-"));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function complete(): SourceIntakeResult {
  return { status: "created", sessionId: "session-a", sourceId: "a:fixturehash", turnCount: 1,
    indexing: { status: "done", receipt: { sessionId: "session-a", summary: { degraded: null }, claims: { degraded: null },
      entities: null, gapRecorded: true, chunks: { written: 1, skipped: null }, completion: { version: 2, strict: true, complete: true,
        treeWritten: true, generation: "test-generation", turnCount: 1 } } } };
}
const runner = (store: SourceJobStore, intake: () => Promise<SourceIntakeResult>, allowed = true) => ({
  store, intake: { intake }, authorizeExecution: async () => allowed,
});

test("enqueue is immutable/durable/idempotent and cannot execute intake; tenant isolation survives reconstruction", async t => {
  const root = fixture(t), store = createSourceJobStore(root);
  const caller = { ...input };
  const queued = await store.enqueue(caller, async frozen => { assert.equal(Object.isFrozen(frozen), true); return authorize(frozen); });
  caller.url = "https://www.youtube.com/watch?v=lmnopqrstuv";
  assert.equal(queued.state, "queued"); assert.equal(queued.result, undefined);
  assert.deepEqual(await createSourceJobStore(root).poll("a", queued.jobId), queued);
  assert.equal(await store.poll("b", queued.jobId), null);
  assert.deepEqual(await store.enqueue(input, authorize), queued);
  await assert.rejects(store.enqueue(caller, authorize), /source_job_idempotency_conflict/);
  assert.equal(await store.completed("a", queued.jobId), null);
  const claim = await createSourceJobStore(root).claim("a", "worker-1"); assert.equal(claim!.url, input.url);
  assert.equal(await store.claim("a", "worker-2"), null);
});

test("claimed worker consumes actual complete fixture receipt before publishing; safe receipt survives restart", async t => {
  const root = fixture(t), store = createSourceJobStore(root), queued = await store.enqueue(input, authorize);
  let calls = 0;
  assert.equal(await runSourceJob(runner(store, async () => { calls++; return complete(); }), "a", "worker"), true);
  assert.equal(calls, 1);
  const restarted = createSourceJobStore(root), view = await restarted.poll("a", queued.jobId);
  assert.equal(view!.state, "succeeded"); assert.deepEqual(view!.result, { sessionId: "session-a", sourceId: "a:fixturehash", turnCount: 1 });
  assert.equal("url" in view!, false); assert.equal("approval" in view!, false); assert.equal("indexing" in view!.result!, false);
  assert.equal((await restarted.completed("a", queued.jobId))!.indexing!.receipt!.completion!.complete, true);
  assert.equal(await restarted.completed("b", queued.jobId), null);
  assert.equal(await runSourceJob(runner(restarted, async () => { calls++; return complete(); }), "a", "worker-2"), false);
  assert.equal(calls, 1);
});

test("two reconstructed workers cannot claim the same queued source concurrently", async t => {
  const root = fixture(t), a = createSourceJobStore(root), b = createSourceJobStore(root);
  const queued = await a.enqueue(input, authorize);
  const claims = await Promise.allSettled([a.claim("a", "worker-a"), b.claim("a", "worker-b")]);
  const winners = claims.filter((claim): claim is PromiseFulfilledResult<Awaited<ReturnType<SourceJobStore["claim"]>>> => claim.status === "fulfilled" && claim.value !== null);
  assert.equal(winners.length, 1); assert.equal(winners[0]!.value!.jobId, queued.jobId);
  assert.equal(await b.claim("a", "worker-c"), null);
  await assert.rejects(b.finish("a", queued.jobId, "stale-attempt", complete()), /source_job_claim_lost/);
  assert.equal((await a.poll("a", queued.jobId))!.state, "running");
});

test("incomplete downstream index never publishes success and never blindly retries", async t => {
  const store = createSourceJobStore(fixture(t)), queued = await store.enqueue(input, authorize);
  let calls = 0;
  await runSourceJob(runner(store, async () => { calls++; return { ...complete(), indexing: { status: "failed", reason: "indexing-incomplete" } }; }), "a", "worker");
  const view = await store.poll("a", queued.jobId);
  assert.equal(view!.state, "uncertain"); assert.equal(view!.reason, "indexing-incomplete"); assert.equal(view!.result, undefined);
  assert.equal(await store.completed("a", queued.jobId), null); assert.equal(await store.claim("a", "retry"), null);
  assert.equal((await store.enqueue(input, authorize)).state, "uncertain"); assert.equal(calls, 1);
});

test("expired/crashed attempt fences late writes and cannot be reclaimed by another worker", async t => {
  const root = fixture(t); let time = 1_000;
  const store = createSourceJobStore(root, { now: () => time, leaseMs: 1_000 });
  const queued = await store.enqueue(input, authorize), claimed = await store.claim("a", "worker-1");
  time += 1_001;
  const restarted = createSourceJobStore(root, { now: () => time, leaseMs: 1_000 });
  assert.equal((await restarted.poll("a", queued.jobId))!.state, "uncertain");
  assert.equal(await restarted.claim("a", "worker-2"), null);
  assert.equal(await store.renew("a", queued.jobId, claimed!.attemptId!), false);
  await assert.rejects(store.finish("a", queued.jobId, claimed!.attemptId!, complete()), /source_job_claim_lost/);
});

test("current authorization refusal and thrown execution retain safe uncertainty with no diagnostic leakage", async t => {
  const store = createSourceJobStore(fixture(t)), queued = await store.enqueue(input, authorize);
  let calls = 0;
  await runSourceJob(runner(store, async () => { calls++; return complete(); }, false), "a", "worker");
  assert.equal(calls, 0); assert.equal((await store.poll("a", queued.jobId))!.reason, "authorization-unavailable");
  const second = await store.enqueue({ ...input, idempotencyKey: "next-request" }, authorize);
  await runSourceJob(runner(store, async () => { throw new Error("secret-provider-token"); }), "a", "worker");
  const view = await store.poll("a", second.jobId);
  assert.equal(view!.state, "uncertain"); assert.equal(view!.reason, "execution-unconfirmed");
  assert.equal(JSON.stringify(view).includes("secret-provider-token"), false);
});

test("secret/ambiguous URLs and absent approval refuse before journal persistence", async t => {
  const root = fixture(t), store = createSourceJobStore(root); let approvals = 0;
  for (const url of ["http://www.youtube.com/watch?v=abcdefghijk", "https://x:y@www.youtube.com/watch?v=abcdefghijk",
    "https://www.youtube.com/watch?v=abcdefghijk&token=secret", "https://www.youtube.com/watch?v=abcdefghijk&v=lmnopqrstuv", "https://cloudonair.withgoogle.com/events/example?token=secret",
    "https://zoom.us/rec/play/abcdefghijk?passcode=secret", "https://example.com/recording"]) {
    await assert.rejects(store.enqueue({ ...input, url }, async value => { approvals++; return authorize(value); }));
  }
  assert.equal(approvals, 0); assert.deepEqual(readdirSync(root), []);
  await assert.rejects(store.enqueue(input, async () => ({ approvedBy: "other-actor", approvalRef: "forged" })), /source_approval_required/);
  assert.deepEqual(readdirSync(root), []);
});

test("abandoned journal lock fails closed; another process cannot ignore a crash lock", async t => {
  const root = fixture(t), store = createSourceJobStore(root), directory = join(root, createHash("sha256").update("a").digest("hex"));
  mkdirSync(directory, { mode: 0o700 }); writeFileSync(join(directory, "writer.lock"), "", { mode: 0o600 });
  await assert.rejects(store.enqueue(input, authorize), /hosting_busy/);
  await assert.rejects(createSourceJobStore(root).claim("a", "worker"), /hosting_busy/);
});

test("production HTTP source wiring refuses configured inline SDK transcription without explicit worker composition", async () => {
  const deps = buildSourceIntakeDeps({ LKB_SOURCE_INTAKE: "1", GEMINI_API_KEY: "synthetic-placeholder", LKB_SOURCE_INTAKE_MODEL: "gemini-fixture" });
  await assert.rejects(deps!.intake({ tenantId: "a", url: input.url }), /durable worker/);
});

test("API queue factory is lazy/pure and protects database, trusted tenants and private authority roots", t => {
  const root = fixture(t);
  const env = { LKB_SOURCE_INTAKE: "1", LKB_SOURCE_JOB_DIR: join(root, "source-spool"), LKB_SOURCE_WORKER_TENANTS: '["a"]',
    GEMINI_API_KEY: "synthetic-placeholder", LKB_SOURCE_INTAKE_MODEL: "gemini-fixture", MONGODB_URL: "mongodb://ci-only.invalid", MONGODB_DB: "lkb_work_fixture" };
  assert.ok(buildConfiguredSourceJobStore(env)); assert.deepEqual(readdirSync(root), []);
  assert.ok(buildConfiguredSourceJobStore({ ...env, GEMINI_API_KEY: undefined, LKB_SOURCE_INTAKE_MODEL: undefined }));
  assert.equal(sourceWorkerConfiguration({ ...env, GEMINI_API_KEY: undefined }), undefined);
  assert.equal(sourceWorkerConfiguration({ ...env, LKB_SOURCE_INTAKE: "0" }), undefined);
  assert.throws(() => sourceWorkerConfiguration({ ...env, MONGODB_DB: "lkb" }), /source_worker_database_refused/);
  assert.throws(() => sourceWorkerConfiguration({ ...env, MONGODB_DB: " lkb ", LKB_I_KNOW_THIS_IS_PRODUCTION: "1" }), /source_worker_database_refused/);
  assert.throws(() => sourceWorkerConfiguration({ ...env, LKB_SOURCE_WORKER_TENANTS: '["a","a"]' }), /source_worker_tenants_invalid/);
  assert.throws(() => sourceWorkerConfiguration({ ...env, LKB_HOSTING_STATE_DIR: root }), /unsafe_source_spool/);
  assert.deepEqual(readdirSync(root), []);
});

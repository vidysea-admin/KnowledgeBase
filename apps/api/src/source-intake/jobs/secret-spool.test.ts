import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, chmodSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HostingJournal } from "../../hosting/journal.js";
import type { SourceIntakeResult } from "../store.js";
import { jobIdentity, sourceJobInputHash } from "./input.js";
import { redactedSourceUrl } from "./store.js";
import { queueFixtureStore } from "./test-fixture.js";
import type { SourceJob, SourceJobInput } from "./types.js";

const bearer = "https://zoom.us/rec/share/fixturebearer";
const input: SourceJobInput = { tenantId: "tenant-a", actorKeyId: "actor-a", url: bearer, idempotencyKey: "spool-1" };
const approve = async (value: Readonly<SourceJobInput>) => ({ approvedBy: value.actorKeyId, approvalRef: "fixture-approval" });
const result = (): SourceIntakeResult => ({ status: "created", sessionId: "s", sourceId: "tenant-a:hash", turnCount: 1,
  indexing: { status: "done", receipt: { sessionId: "s", summary: { degraded: null }, claims: { degraded: null }, entities: null, gapRecorded: true,
    chunks: { written: 1, skipped: null }, completion: { version: 2, strict: true, complete: true, treeWritten: true, generation: "g", turnCount: 1 } } } });
function setup(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), "lkb-source-spool-test-")); chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const dir = (root: string) => join(root, createHash("sha256").update(input.tenantId).digest("hex"));
const audit = (root: string) => readFileSync(join(dir(root), "audit.jsonl"), "utf8");
const secrets = (root: string) => readdirSync(dir(root)).filter(name => name.endsWith(".secret"));

test("no URL reaches audit.jsonl at any stage; the worker still receives it; the secret is deleted on settle", async t => {
  const root = setup(t), store = queueFixtureStore(root), view = await store.enqueue(input, approve);
  assert.equal(audit(root).includes("fixturebearer"), false);
  assert.deepEqual(secrets(root), [`${view.jobId}.secret`]);
  const job = await store.claim(input.tenantId, "w1");
  assert.equal(job?.url, bearer);
  assert.equal(audit(root).includes("fixturebearer"), false);
  assert.equal(JSON.parse(audit(root).trim().split("\n").at(-1)!).data.url, redactedSourceUrl(bearer));
  await store.renew(input.tenantId, view.jobId, job!.attemptId!);
  assert.deepEqual(secrets(root), [`${view.jobId}.secret`]);
  await store.finish(input.tenantId, view.jobId, job!.attemptId!, result());
  assert.equal(audit(root).includes("fixturebearer"), false);
  assert.deepEqual(secrets(root), []);
  assert.equal((await store.poll(input.tenantId, view.jobId))?.state, "succeeded");
});

test("uncertain also deletes the secret", async t => {
  const root = setup(t), store = queueFixtureStore(root), view = await store.enqueue(input, approve);
  const job = await store.claim(input.tenantId, "w1");
  await store.uncertain(input.tenantId, view.jobId, job!.attemptId!, "execution-unconfirmed");
  assert.deepEqual(secrets(root), []);
  assert.equal(audit(root).includes("fixturebearer"), false);
});

test("a missing secret fails closed to uncertain and never yields work", async t => {
  const root = setup(t), store = queueFixtureStore(root), view = await store.enqueue(input, approve);
  rmSync(join(dir(root), `${view.jobId}.secret`));
  assert.equal(await store.claim(input.tenantId, "w1"), null);
  assert.equal((await store.poll(input.tenantId, view.jobId))?.state, "uncertain");
  assert.equal((await store.poll(input.tenantId, view.jobId))?.reason, "execution-unconfirmed");
  assert.equal(await store.claim(input.tenantId, "w1"), null);
});

test("a secret whose hash does not match the journal is refused and deleted", async t => {
  const root = setup(t), store = queueFixtureStore(root), view = await store.enqueue(input, approve);
  writeFileSync(join(dir(root), `${view.jobId}.secret`), "https://zoom.us/rec/share/swappedbearer");
  assert.equal(await store.claim(input.tenantId, "w1"), null);
  assert.equal((await store.poll(input.tenantId, view.jobId))?.state, "uncertain");
  assert.deepEqual(secrets(root), []);
});

test("a stale lease settles and deletes the secret", async t => {
  let clock = 1_000_000;
  const root = setup(t), store = queueFixtureStore(root, { now: () => clock, leaseMs: 1000 });
  const view = await store.enqueue(input, approve); await store.claim(input.tenantId, "w1"); clock += 5000;
  assert.equal((await store.poll(input.tenantId, view.jobId))?.state, "uncertain");
  assert.deepEqual(secrets(root), []);
});

test("legacy rows that still hold the URL replay unchanged and redact on settle", async t => {
  const root = setup(t), store = queueFixtureStore(root);
  const jobId = jobIdentity(createHash("sha256").update("legacy").digest("hex")), at = new Date().toISOString();
  const legacy: SourceJob = { version: 1, jobId, tenantId: input.tenantId, actorKeyId: input.actorKeyId, url: bearer,
    inputHash: sourceJobInputHash(input), approval: { approvedBy: input.actorKeyId, approvalRef: "fixture-approval" },
    state: "queued", revision: 1, createdAt: at, updatedAt: at };
  await new HostingJournal(root).transaction(input.tenantId, "legacy", at, async () =>
    ({ value: null, operation: "source.job", target: jobId, outcome: "queued", data: legacy }));
  assert.equal((await store.poll(input.tenantId, jobId))?.state, "queued");
  const job = await store.claim(input.tenantId, "w1");
  assert.equal(job?.url, bearer);
  assert.equal(existsSync(join(dir(root), `${jobId}.secret`)), false);
  await store.finish(input.tenantId, jobId, job!.attemptId!, result());
  const last = JSON.parse(audit(root).trim().split("\n").at(-1)!);
  assert.equal(last.data.url, redactedSourceUrl(bearer));
  assert.equal((await store.poll(input.tenantId, jobId))?.state, "succeeded");
});

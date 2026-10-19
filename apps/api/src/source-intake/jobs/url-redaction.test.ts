import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HostingJournal } from "../../hosting/journal.js";
import type { SourceIntakeResult } from "../store.js";
import { redactedSourceUrl } from "./store.js";
import { queueFixtureStore } from "./test-fixture.js";
import type { SourceJobInput } from "./types.js";

const bearer = "https://zoom.us/rec/share/fixturebearer";
const input: SourceJobInput = { tenantId: "tenant-a", actorKeyId: "actor-a", url: bearer, idempotencyKey: "redact-1" };
const approve = async (value: Readonly<SourceJobInput>) => ({ approvedBy: value.actorKeyId, approvalRef: "fixture-approval" });
const result = (): SourceIntakeResult => ({ status: "created", sessionId: "s", sourceId: "tenant-a:hash", turnCount: 1,
  indexing: { status: "done", receipt: { sessionId: "s", summary: { degraded: null }, claims: { degraded: null }, entities: null,
    chunks: { written: 1, skipped: null }, completion: { version: 2, strict: true, complete: true, treeWritten: true, generation: "g", turnCount: 1 } } } });
function setup(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), "lkb-source-redact-test-")); chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const rows = (root: string, tenant = input.tenantId) => readFileSync(join(root, createHash("sha256").update(tenant).digest("hex"), "audit.jsonl"), "utf8")
  .split("\n").filter(Boolean).map(line => JSON.parse(line) as { data: { url: string; state: string; inputHash: string } });

test("a claimed job still carries the URL; the settled row keeps only its digest (succeeded)", async t => {
  const root = setup(t), store = queueFixtureStore(root);
  const queued = await store.enqueue(input, approve);
  const job = await store.claim(input.tenantId, "w1");
  assert.equal(job?.url, bearer);
  await store.finish(input.tenantId, queued.jobId, job!.attemptId!, result());
  const last = rows(root).at(-1)!;
  assert.equal(last.data.state, "succeeded");
  assert.equal(last.data.url, redactedSourceUrl(bearer));
  assert.equal(JSON.stringify(last).includes("fixturebearer"), false);
  assert.equal((await store.poll(input.tenantId, queued.jobId))?.state, "succeeded");
  assert.ok(await store.completed(input.tenantId, queued.jobId));
  assert.equal(await store.claim(input.tenantId, "w2"), null);
});

test("uncertain, stale-lease and poll-detected interruption also redact; idempotency still resolves by input hash", async t => {
  let clock = 1_000_000;
  const root = setup(t), store = queueFixtureStore(root, { now: () => clock, leaseMs: 1000 });
  const a = await store.enqueue(input, approve), claimed = await store.claim(input.tenantId, "w1");
  await store.uncertain(input.tenantId, a.jobId, claimed!.attemptId!, "execution-unconfirmed");
  const b = await store.enqueue({ ...input, idempotencyKey: "redact-2" }, approve);
  await store.claim(input.tenantId, "w1"); clock += 5000;
  assert.equal((await store.poll(input.tenantId, b.jobId))?.state, "uncertain");
  const c = await store.enqueue({ ...input, idempotencyKey: "redact-3" }, approve);
  await store.claim(input.tenantId, "w1"); clock += 5000;
  await store.claim(input.tenantId, "w1");
  assert.equal((await store.poll(input.tenantId, c.jobId))?.state, "uncertain");
  const settled = rows(root).filter(row => row.data.state === "uncertain");
  assert.equal(settled.length, 3);
  for (const row of settled) assert.equal(row.data.url, redactedSourceUrl(bearer));
  assert.equal((await store.enqueue(input, approve)).jobId, a.jobId);
  await assert.rejects(store.enqueue({ ...input, url: "https://zoom.us/rec/share/otherbearer" }, approve), /source_job_idempotency_conflict/);
});

test("forged or unmatched redaction markers are corruption, not accepted state", async t => {
  const root = setup(t), store = queueFixtureStore(root);
  const queued = await store.enqueue(input, approve), job = await store.claim(input.tenantId, "w1");
  const forged = { ...job!, state: "uncertain" as const, revision: job!.revision + 1, reason: "worker-interrupted" as const,
    url: redactedSourceUrl("https://zoom.us/rec/share/someoneelse") };
  await new HostingJournal(root).transaction(input.tenantId, "w1", new Date().toISOString(), async () =>
    ({ value: null, operation: "source.job", target: queued.jobId, outcome: forged.state, data: forged }));
  await assert.rejects(store.poll(input.tenantId, queued.jobId), /source_spool_corrupt/);
});

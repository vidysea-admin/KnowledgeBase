import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { approvedSourceInput, sourceJobInputHash, digest } from "../source-intake/jobs/input.js";
import { createSourceJobStore } from "../source-intake/jobs/store.js";
import { runSourceJob } from "../source-intake/jobs/worker.js";
import type { SourceJob, SourceJobInput } from "../source-intake/jobs/types.js";
import type { ConnectorWorkflowDeps } from "./types.js";
import { executeWatchedSnapshotJob } from "./watched-job.js";
import { createGuardedFetcher } from "@lkb/ingest";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth.js";
import { createConnectorWorkflowRouter } from "./router.js";

const text = "Public synthetic guidance: पढ़ाई 🎓 is available.\n\nCheck the official instructions.";
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const input = (): SourceJobInput => ({ tenantId: "watch-fixture", actorKeyId: "actor-fixture", url: "https://public.example/guidance",
  idempotencyKey: "watch-first", watchedSnapshot: { version: 1, watchedSourceId: "watch-fixture", text, hash: hash(text),
    fetchedAt: "2026-10-15T00:00:00.000Z", previousHash: null } });
const approve = async (value: Readonly<SourceJobInput>) => ({ approvedBy: value.actorKeyId, approvalRef: "synthetic-approval" });

// All storage/artifact/ACL authority below is synthetic. This never claims native ACL, actual
// model/DB readback, current stored actor authorization or operational provider acceptance.
function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "lkb-watched-public-"));
  t.after(() => {
    const child = relative(tmpdir(), directory);
    assert.ok(child && !isAbsolute(child) && !child.startsWith("..") && child.startsWith("lkb-watched-public-"));
    rmSync(directory, { recursive: true, force: true });
  });
  const open = () => createSourceJobStore(directory, { verifier: { directory() {}, artifact() {} } });
  const row: any = { _id: "watch-fixture", tenantId: "watch-fixture", url: input().url, active: true, checkIntervalHours: 1 };
  const plans: any[] = [], artifacts = new Set<string>();
  let partial = false, physical = true, sequence = 0;
  const index = t.mock.fn(async (_tenant: string, sessionId: string) => {
    const plan = plans.find(plan => plan.session._id === sessionId)!;
    return { sessionId, summary: { degraded: null }, claims: { degraded: null }, entities: null,
      chunks: { written: 1, skipped: null }, completion: { version: 2, strict: true, complete: !partial,
        treeWritten: true, generation: "synthetic-generation", turnCount: plan.turns.length } };
  });
  const fetch = t.mock.fn(async () => { throw new Error("worker must not refetch"); });
  const deps = {
    store: {
      assertWritableTenant(tenant: string) { assert.equal(tenant, row.tenantId); },
      listWatched: async () => [structuredClone(row)],
      recordConsumedSource: async (_tenant: string, sourceId: string) => { artifacts.add(sourceId); return true; },
      hasConsumedSource: async (_tenant: string, sourceId: string) => physical && artifacts.has(sourceId),
      recordFetch: async (_tenant: string, id: string, previous: string | null, lastFetch: unknown) => {
        if (id !== row._id || (row.lastFetch?.hash ?? null) !== previous) return false;
        row.lastFetch = structuredClone(lastFetch); return true;
      },
      resolveWatchedFailures: async () => {},
      createGap: async () => {},
    },
    watched: { fetcher: fetch, indexSession: index, sink: {
      findSessionBySource: async (_tenant: string, sourceId: string) => {
        const plan = plans.find(plan => plan.source._id === sourceId);
        return plan ? { sessionId: plan.session._id } : undefined;
      },
      save: async (plan: unknown) => { plans.push(structuredClone(plan)); },
    } },
    capabilities: [], now: () => input().watchedSnapshot!.fetchedAt, newId: () => `watch-public-${++sequence}`,
  } as unknown as ConnectorWorkflowDeps;
  return { open, deps, row, plans, index, fetch, partial: () => { partial = true; }, losePhysical: () => { physical = false; } };
}

test("watched snapshot validation binds exact Unicode bytes, provenance and legacy media identity", () => {
  const source = approvedSourceInput(input());
  assert.equal(source.watchedSnapshot!.text, text);
  assert.ok(Object.isFrozen(source.watchedSnapshot));
  assert.notEqual(sourceJobInputHash(source), sourceJobInputHash({ ...source, watchedSnapshot: { ...source.watchedSnapshot!, previousHash: "a".repeat(64) } }));
  for (const patch of [{ text: text + " changed" }, { text: "\ud800" }, { text: "x".repeat(1_000_001) },
    { version: 2 }, { previousHash: "bad" }, { fetchedAt: "invalid" }, { watchedSourceId: "" }]) {
    assert.throws(() => approvedSourceInput({ ...input(), watchedSnapshot: { ...input().watchedSnapshot!, ...patch } as any }));
  }
  const media = approvedSourceInput({ ...input(), watchedSnapshot: undefined, url: "https://www.youtube.com/watch?v=abcdefghijk" });
  assert.equal(sourceJobInputHash(media), digest([media.tenantId, media.actorKeyId, media.url]));
});

test("durable snapshot reopens, consumes exact guarded bytes without refetch and publishes once", async t => {
  const f = fixture(t), store = f.open(), queued = await store.enqueue(input(), approve);
  assert.equal(f.plans.length, 0); assert.equal(f.row.lastFetch, undefined);
  assert.equal(await store.poll("other-tenant", queued.jobId), null);
  assert.deepEqual(await f.open().poll(input().tenantId, queued.jobId), queued);
  const worker = { store: f.open(), intake: { intake: async () => { throw new Error("no URL intake"); } },
    authorizeExecution: async () => true, executeJob: (job: Readonly<SourceJob>) => executeWatchedSnapshotJob(job, f.deps) };
  await runSourceJob(worker, input().tenantId, "synthetic-worker");
  assert.equal((await store.poll(input().tenantId, queued.jobId))!.state, "succeeded");
  assert.equal(f.fetch.mock.callCount(), 0); assert.equal(f.index.mock.callCount(), 1);
  assert.equal(f.row.lastFetch.hash, hash(text)); assert.equal(f.row.lastFetch.diffFrom, null);
  assert.equal(f.plans[0].turns.map((turn: any) => turn.text).join("\n\n"), text);
  assert.equal(f.plans[0].source.sourceMeta.watchedSourceId, "watch-fixture");
  assert.equal(await runSourceJob(worker, input().tenantId, "again"), false);
  assert.equal(f.index.mock.callCount(), 1);
  assert.equal("watchedSnapshot" in (await store.poll(input().tenantId, queued.jobId))!, false);
});

test("tampering, foreign/current-source mismatch and stale previous hash refuse before ingest", async t => {
  const f = fixture(t), store = f.open(); await store.enqueue(input(), approve);
  const job = (await store.claim(input().tenantId, "synthetic-worker"))!;
  await assert.rejects(executeWatchedSnapshotJob({ ...job, watchedSnapshot: { ...job.watchedSnapshot!, text: "tamper" } }, f.deps));
  f.row.tenantId = "foreign"; await assert.rejects(executeWatchedSnapshotJob(job, f.deps)); f.row.tenantId = input().tenantId;
  f.row.url = "https://public.example/changed"; await assert.rejects(executeWatchedSnapshotJob(job, f.deps)); f.row.url = input().url;
  f.row.lastFetch = { hash: "b".repeat(64) }; await assert.rejects(executeWatchedSnapshotJob(job, f.deps));
  assert.equal(f.plans.length, 0); assert.equal(f.index.mock.callCount(), 0);
});

test("partial index, missing physical proof and revoked actor never advance watched health", async t => {
  for (const mode of ["partial", "physical", "revoked"]) {
    const f = fixture(t), store = f.open(); const queued = await store.enqueue(input(), approve);
    if (mode === "partial") f.partial(); if (mode === "physical") f.losePhysical();
    await runSourceJob({ store, intake: { intake: async () => { throw new Error("no URL intake"); } },
      authorizeExecution: async () => mode !== "revoked", executeJob: job => executeWatchedSnapshotJob(job, f.deps) }, input().tenantId, "synthetic-worker");
    assert.equal((await store.poll(input().tenantId, queued.jobId))!.state, "uncertain");
    assert.equal(f.row.lastFetch, undefined);
    if (mode === "revoked") assert.equal(f.plans.length, 0);
  }
});

test("reachable durable watched route queues one guarded snapshot and requires authenticated ingestion", async t => {
  const f = fixture(t); f.deps.sourceJobs = f.open();
  const request = t.mock.fn(async () => ({ status: 200, body: text, location: null }));
  f.deps.watched!.fetcher = createGuardedFetcher({ lookup: async () => ["93.184.216.34"], request });
  const router = Router();
  router.use(requireAuth({ verify: async key => ({ tenantId: input().tenantId, keyId: "actor-fixture",
    scopes: key === "sources-only" ? ["sources"] : ["sources", "ingest"] }) }));
  router.use(createConnectorWorkflowRouter(f.deps));
  const call = (key: string): Promise<{ status: number; body: any }> => new Promise((resolve, reject) => {
    let status = 200;
    const url = "/connector-workflow/watched/verify";
    const req = { method: "POST", url, originalUrl: url, headers: {},
      body: { tenantId: "foreign", watchedSnapshot: { text: "untrusted body" } }, header: () => `Bearer ${key}` } as unknown as Request;
    const res = { status(code: number) { status = code; return res; }, json(body: unknown) { resolve({ status, body }); return res; } } as unknown as Response;
    (router as any).handle(req, res, (error: unknown) => error ? reject(error) : resolve({ status: 404, body: {} }));
  });
  assert.equal((await call("sources-only")).status, 403);
  assert.equal(request.mock.callCount(), 0);
  const result = await call("full");
  assert.equal(result.status, 200); assert.equal(result.body.outcomes[0]!.status, "queued");
  assert.equal(f.row.lastFetch, undefined); assert.equal(f.plans.length, 0);
  const again = await call("full");
  assert.equal(again.body.outcomes[0]!.jobId, result.body.outcomes[0]!.jobId);
  const job = await f.deps.sourceJobs.claim(input().tenantId, "synthetic-worker");
  assert.equal(job!.watchedSnapshot!.text, text); assert.equal(job!.watchedSnapshot!.hash, hash(text));
});

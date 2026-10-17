import { test } from "node:test";
import assert from "node:assert/strict";
import { connectorFixture } from "./fixtures.js";
import { createConnectorWatchVerifier } from "./watched.js";
import { createConnectorMongoStore } from "./mongo-store.js";
import { buildConnectorWorkflowDeps } from "./wiring.js";
import { createHash } from "node:crypto";
import { assertConnectorIndexConsumed } from "./types.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// Queue protocol fixtures use a deterministic ACL reader; native Windows ACL remains a separate live gate.
// The real private journal, immutable store, worker and indexing consumer still execute.
import { queueFixtureStore as createSourceJobStore } from "../source-intake/jobs/test-fixture.js";
import { runSourceJob } from "../source-intake/jobs/worker.js";

test("durable caller enqueue survives spool reopen, worker consumes once, and recording receipt waits for physical proof", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "lkb-t053-job-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = connectorFixture(); f.useHostedRecording(true);
  f.deps.sourceJobs = createSourceJobStore(directory);
  const request = await f.call("POST", "/connector-workflow/recording-requests", { description: "Awaiting real recording", requestedFrom: "org:toc" });
  const path = `/connector-workflow/recording-requests/${request.body.gap._id}`;
  const input = { url: "https://zoom.us/rec/share/AbCdEfGh12345678", requestId: "receipt-retry", tenantId: "tenant-b", actorKeyId: "forged-key" };
  const queued = await f.call("POST", `${path}/receive`, input);
  assert.equal(queued.status, 202); assert.equal(queued.body.job.state, "queued");
  assert.equal(f.rows("sessions").length, 0); assert.equal(f.rows("gaps")[0]!.status, "open");
  assert.equal((await f.call("POST", `${path}/receive`, input)).body.job.jobId, queued.body.job.jobId);
  assert.equal((await f.call("POST", `/connector-workflow/jobs/${queued.body.job.jobId}/check`, undefined, "b")).status, 404);
  assert.equal((await f.call("POST", `${path}/receive-job`, { jobId: queued.body.job.jobId })).status, 202);
  assert.equal(f.rows("gaps")[0]!.status, "open");
  const reopened = createSourceJobStore(directory);
  assert.equal((await reopened.poll("tenant-a", queued.body.job.jobId))!.state, "queued");
  const worker = { store: reopened, intake: f.deps.sourceIntake!, authorizeExecution: async (job: any) => {
    assert.equal(job.tenantId, "tenant-a"); assert.equal(job.actorKeyId, "key-a"); assert.equal(job.approval.approvedBy, "key-a"); return true;
  } };
  assert.equal(await runSourceJob(worker, "tenant-a", "fixture-worker"), true);
  assert.equal(await runSourceJob(worker, "tenant-a", "fixture-worker"), false);
  assert.equal(f.counters().indexes, 1);
  const workerReceipt = await reopened.completed("tenant-a", queued.body.job.jobId);
  assert.equal(workerReceipt!.indexing!.receipt!.completion!.strict, true);
  assert.equal(workerReceipt!.indexing!.receipt!.completion!.complete, true);
  // A succeeded spool record alone cannot conceal lost or incomplete consumer artifacts.
  const chunks = f.rows("chunks").splice(0);
  assert.equal((await f.call("POST", `${path}/receive-job`, { jobId: queued.body.job.jobId })).status, 502);
  assert.equal(f.rows("gaps")[0]!.status, "open"); assert.equal(f.counters().indexes, 1);
  f.rows("chunks").push(...chunks);
  const done = await f.call("POST", `${path}/receive-job`, { jobId: queued.body.job.jobId });
  assert.equal(done.status, 200); assert.equal(done.body.receipt.status, "received");
  assert.equal(f.rows("gaps")[0]!.status, "received"); assert.equal(f.rows("gaps")[1]!.status, "received");
  assert.equal((await f.call("POST", `${path}/receive-job`, { jobId: queued.body.job.jobId })).body.receipt.repeated, true);
  assert.equal(f.counters().indexes, 1);
  // Later artifact loss reopens the source action gap without fabricating a new provider attempt.
  f.rows("chunks").splice(0);
  assert.equal((await f.call("POST", `/connector-workflow/jobs/${queued.body.job.jobId}/check`)).status, 502);
  assert.equal(f.rows("gaps")[1]!.status, "open");
  f.rows("chunks").push(...chunks);
  assert.equal((await f.call("POST", `/connector-workflow/jobs/${queued.body.job.jobId}/check`)).status, 200);
  assert.equal(f.rows("gaps")[1]!.status, "received"); assert.equal(f.counters().indexes, 1);
  const serialized = JSON.stringify(done.body);
  for (const privateField of ["approvalRef", "actorKeyId", "indexing", "zoom.us", "generation"]) assert.equal(serialized.includes(privateField), false);
});

test("durable jobs refuse unsafe inputs and bypasses before any direct intake; watched snapshot enqueues without inline indexing", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "lkb-t053-job-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = connectorFixture(); f.useHostedRecording(true); f.deps.sourceJobs = createSourceJobStore(directory);
  for (const url of ["https://public.example/article", "https://zoom.us/rec/share/AbCdEfGh12345678?token=secret", "https://user:secret@zoom.us/rec/share/AbCdEfGh12345678"]) {
    assert.equal((await f.call("POST", "/connector-workflow/intake", { url, requestId: "test-input" })).status, 400);
  }
  assert.equal((await f.call("POST", "/connector-workflow/intake", { url: "https://zoom.us/rec/share/AbCdEfGh12345678", requestId: "valid" }, "no-id")).status, 503);
  assert.equal((await f.call("POST", "/connector-workflow/intake", { url: "https://zoom.us/rec/share/AbCdEfGh12345678", requestId: "valid" }, "source")).status, 403);
  f.watch();
  assert.equal((await f.call("POST", "/connector-workflow/watched/verify", undefined, "source")).status, 403);
  const watched = await f.call("POST", "/connector-workflow/watched/verify");
  assert.equal(watched.body.outcomes[0].status, "queued");
  assert.equal(f.rows("watched_sources")[0]!.lastFetch, undefined);
  const overview = await f.call("GET", "/connector-workflow");
  assert.equal(overview.body.intakeMode, "durable-jobs"); assert.equal(overview.body.watchedConfigured, true);
  assert.equal(f.counters().fetches, 1); assert.equal(f.counters().indexes, 0); assert.equal(f.rows("sources").length, 0);
});

test("durable worker indexing uncertainty creates one visible action gap and never confirms recording or retries providers", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "lkb-t053-job-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = connectorFixture(); f.useHostedRecording(true); f.failIndex(true); f.deps.sourceJobs = createSourceJobStore(directory);
  const queued = await f.call("POST", "/connector-workflow/intake", { url: "https://zoom.us/rec/share/AbCdEfGh12345678", requestId: "uncertain" });
  assert.equal(queued.status, 202);
  await runSourceJob({ store: f.deps.sourceJobs, intake: f.deps.sourceIntake!, authorizeExecution: async () => true }, "tenant-a", "fixture-worker");
  const path = `/connector-workflow/jobs/${queued.body.job.jobId}/check`;
  const uncertain = await f.call("POST", path);
  assert.equal(uncertain.body.job.state, "uncertain"); assert.equal(uncertain.body.job.result, undefined); assert.ok(uncertain.body.gapId);
  const repeat = await f.call("POST", path);
  assert.equal(repeat.body.gapId, uncertain.body.gapId); assert.equal(f.rows("gaps").length, 1); assert.equal(f.rows("gaps")[0]!.status, "open");
  assert.equal(await runSourceJob({ store: f.deps.sourceJobs, intake: f.deps.sourceIntake!, authorizeExecution: async () => true }, "tenant-a", "fixture-worker"), false);
  assert.equal(f.counters().indexes, 1);
});

test("nonthrowing incomplete worker receipt cannot publish succeeded even after actual strict consumer writes", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "lkb-t053-job-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = connectorFixture(); f.useHostedRecording(true); f.deps.sourceJobs = createSourceJobStore(directory);
  const actual = f.deps.sourceIntake!.intake;
  f.deps.sourceIntake!.intake = async input => {
    const consumed = await actual(input);
    assert.equal(consumed.indexing!.receipt!.completion!.strict, true);
    return { ...consumed, indexing: { status: "done", receipt: { ...consumed.indexing!.receipt!,
      completion: { ...consumed.indexing!.receipt!.completion!, complete: false } } } };
  };
  const queued = await f.call("POST", "/connector-workflow/intake", { url: "https://zoom.us/rec/share/AbCdEfGh12345678", requestId: "partial-worker" });
  assert.equal(queued.status, 202);
  await runSourceJob({ store: f.deps.sourceJobs, intake: f.deps.sourceIntake!, authorizeExecution: async () => true }, "tenant-a", "fixture-worker");
  assert.ok(f.rows("session_pages").length); assert.ok(f.rows("claims").length); assert.ok(f.rows("chunks").length); assert.ok(f.rows("tree_index").length);
  assert.equal(await f.deps.sourceJobs.completed("tenant-a", queued.body.job.jobId), null);
  const checked = await f.call("POST", `/connector-workflow/jobs/${queued.body.job.jobId}/check`);
  assert.equal(checked.body.job.state, "uncertain"); assert.equal(checked.body.job.reason, "indexing-incomplete");
  assert.equal(checked.body.job.result, undefined); assert.equal(f.counters().indexes, 1);
  assert.equal(f.rows("sources")[0]!.sourceMeta?.connectorIndex, undefined); assert.equal(f.rows("gaps")[0]!.status, "open");
});

test("authenticated caller intake reaches real source/turn planner, Mongo sink and indexing consumer", async () => {
  const f = connectorFixture();
  const result = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa", tenantId: "tenant-b" });
  assert.equal(result.status, 201);
  const session = f.rows("sessions")[0]!;
  assert.equal(session.tenantId, "tenant-a"); assert.equal(session.status.index, "done");
  const source = f.rows("sources")[0]!;
  assert.equal(source.url, "https://public.example/visa"); assert.ok(source.hash); assert.equal(source.createdAt, "2026-10-14T00:00:00.000Z");
  assert.equal(f.rows("turns").length, 2);
  assert.ok(f.rows("claims").length > 0); assert.ok(f.rows("session_pages").length > 0); assert.ok(f.rows("tree_index").length > 0); assert.ok(f.rows("chunks").length > 0);
  const turnId = f.rows("claims")[0]!.evidence[0].turnId;
  assert.ok(f.rows("turns").some((t) => t._id === turnId && t.sessionId === session._id));
  const retry = await f.call("POST", "/connector-workflow/intake", { url: source.url });
  assert.equal(retry.status, 200); assert.equal(retry.body.sessionId, result.body.sessionId);
  assert.equal(f.rows("sources").length, 1); assert.equal(f.rows("sessions").length, 1);
});

test("cached receipt refuses partial chunk turn coverage or foreign claim evidence after real consumption", async () => {
  const f = connectorFixture();
  const result = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" });
  assert.equal(result.status, 201);
  const { sessionId, sourceId } = result.body;
  assert.equal(await f.deps.store.hasConsumedSource("tenant-a", sourceId, sessionId), true);
  const chunks = structuredClone(f.rows("chunks"));
  for (const chunk of f.rows("chunks")) chunk.turnRefs = [f.rows("turns")[0]!._id];
  assert.equal(await f.deps.store.hasConsumedSource("tenant-a", sourceId, sessionId), false);
  f.rows("chunks").splice(0, f.rows("chunks").length, ...chunks);
  const claim = f.rows("claims")[0]!; const evidence = structuredClone(claim.evidence);
  claim.evidence[0].turnId = "another-tenant-turn";
  assert.equal(await f.deps.store.hasConsumedSource("tenant-a", sourceId, sessionId), false);
  claim.evidence = evidence;
  assert.equal(await f.deps.store.hasConsumedSource("tenant-a", sourceId, sessionId), true);
});

test("auth, scope, body tenancy and unsafe URLs cannot bypass caller boundaries", async () => {
  const f = connectorFixture();
  assert.equal((await f.call("GET", "/connector-workflow", undefined, "bad")).status, 401);
  assert.equal((await f.call("GET", "/connector-workflow", undefined, "read")).status, 403);
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "http://name:password@public.example/"]) {
    assert.equal((await f.call("POST", "/connector-workflow/intake", { url })).status, 400);
  }
  assert.equal(f.counters().fetches, 0);
  const denied = await f.call("POST", "/connector-workflow/intake", { url: "http://127.0.0.1/" });
  assert.equal(denied.status, 502); assert.equal(f.counters().fetches, 0);
  assert.equal(f.rows("gaps").length, 1);
  assert.equal((await f.call("GET", "/connector-workflow", undefined, "b")).body.gaps.length, 0);
});

test("owner gap inventory pagination keeps all requests reachable and excludes other tenants", async () => {
  const f = connectorFixture();
  for (let i = 0; i < 252; i++) f.rows("gaps").push({ _id: `gap-${String(i).padStart(3, "0")}`, tenantId: "tenant-a", kind: "recording-pending", status: "open" });
  f.rows("gaps").push({ _id: "gap-other", tenantId: "tenant-b", kind: "recording-pending", status: "open" });
  const first = await f.call("GET", "/connector-workflow");
  assert.equal(first.body.gaps.length, 250); assert.equal(first.body.nextGapCursor, "gap-249");
  const next = await f.call("GET", `/connector-workflow?after=${first.body.nextGapCursor}`);
  assert.equal(next.body.gaps.length, 2); assert.equal(next.body.nextGapCursor, null);
  assert.equal([...first.body.gaps, ...next.body.gaps].some((g) => g.tenantId !== "tenant-a"), false);
});

test("public indexing degradation is a source-linked gap and successful retry resolves it", async () => {
  const f = connectorFixture();
  const realIndex = f.deps.indexSession!;
  f.deps.indexSession = async (_tenantId, sessionId) => ({ sessionId, summary: { degraded: "fixture-provider-failed" }, chunks: { written: 0, skipped: "embedding-failed" }, entities: null });
  const failed = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa?token=private-fixture" });
  assert.equal(failed.status, 502); assert.ok(failed.body.gapId);
  assert.ok(f.rows("gaps")[0]!.sourceUrlHash); assert.ok(!JSON.stringify(failed.body).includes("private-fixture"));
  assert.equal(f.rows("gaps")[0]!.status, "open");
  f.deps.indexSession = realIndex;
  const retry = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa?token=private-fixture" });
  assert.equal(retry.status, 200); assert.equal(f.rows("sessions").length, 1);
  assert.equal(f.rows("gaps")[0]!.status, "received"); assert.equal(f.rows("gaps")[0]!.sourceRef, f.rows("sources")[0]!._id);
});

test("production-shaped intake reuses successful receipt and never double-indexes", async () => {
  const f = connectorFixture(); f.useSourceIntakeIndexing();
  const created = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" });
  assert.equal(created.status, 201); assert.equal(f.counters().indexes, 1);
  assert.equal(created.body.indexing, undefined);
  assert.equal(f.rows("sources")[0]!.sourceMeta.connectorIndex.sessionId, created.body.sessionId);
  const retry = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" });
  assert.equal(retry.status, 200); assert.equal(f.counters().indexes, 1); assert.equal(f.rows("sessions").length, 1);
});

test("production-shaped intake failure is visible; deduped retry consumes once after recovery", async () => {
  const f = connectorFixture(); f.useSourceIntakeIndexing(); f.failIndex(true);
  const failed = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" });
  assert.equal(failed.status, 502); assert.equal(f.counters().indexes, 1);
  assert.equal(f.rows("sources")[0]!.sourceMeta?.connectorIndex, undefined);
  assert.equal(f.rows("gaps")[0]!.status, "open");
  f.failIndex(false);
  const retry = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" });
  assert.equal(retry.status, 200); assert.equal(f.counters().indexes, 2);
  assert.equal(f.rows("sessions").length, 1); assert.equal(f.rows("gaps")[0]!.status, "received");
});

test("producer done status without receipt cannot trigger success or seed a consumption proof", async () => {
  const f = connectorFixture();
  const raw = f.deps.sourceIntake!.intake;
  f.deps.sourceIntake!.intake = async (input) => ({ ...await raw(input), indexing: { status: "done" } });
  const failed = await f.call("POST", "/connector-workflow/intake", { url: "https://public.example/visa" });
  assert.equal(failed.status, 502); assert.equal(f.counters().indexes, 0);
  assert.equal(f.rows("sources")[0]!.sourceMeta?.connectorIndex, undefined);
  assert.equal(f.rows("gaps")[0]!.status, "open");
});

test("missing recording has durable owner/SLA and refuses nonexistent or unconsumed receipt", async () => {
  const f = connectorFixture();
  const opened = await f.call("POST", "/connector-workflow/recording-requests", { description: "Missing session recording", requestedFrom: "org:toc-bhakti", tenantId: "tenant-b" });
  assert.equal(opened.status, 201);
  const gap = opened.body.gap;
  assert.equal(gap.tenantId, "tenant-a"); assert.equal(gap.sla.dueAt, "2026-10-17T00:00:00.000Z");
  const path = `/connector-workflow/recording-requests/${gap._id}`;
  assert.equal((await f.call("PUT", path, { status: "received", sourceRef: "missing" })).status, 404);
  assert.equal((await f.call("PUT", path, { status: "expired" })).status, 409);
  assert.equal((await f.call("PUT", path, { status: "received", sourceRef: "missing" }, "b")).status, 404);
  f.rows("sources").push({ _id: "recording-a", tenantId: "tenant-a", kind: "recording", path: "/fixture-media/recording.mp4",
    hash: "recording-fixture-hash", captureMode: "provided", consent: { given: true, recordedBy: "fixture-organizer" }, createdAt: "2026-10-14T00:00:00.000Z" });
  assert.equal((await f.call("PUT", path, { status: "received", sourceRef: "recording-a" }, "source")).status, 403);
  assert.equal((await f.call("PUT", path, { status: "received", sourceRef: "recording-a" })).status, 409);
  f.rows("sessions").push({ _id: "recorded-session", tenantId: "tenant-a", sourceId: "recording-a", title: "Recording fixture", date: "2026-10-14", status: { transcribe: "done", index: "done" } });
  f.rows("turns").push({ _id: "recorded-turn", tenantId: "tenant-a", sessionId: "recorded-session", speakerRef: "fixture-speaker", text: "Provided recording fixture.", tStart: 0, tEnd: 1 });
  f.rows("media").push({ _id: "recorded-media", tenantId: "tenant-a", sourceRef: "recording-a", kind: "recording" });
  f.failIndex(true);
  assert.equal((await f.call("PUT", path, { status: "received", sourceRef: "recording-a" })).status, 502);
  assert.equal(f.rows("gaps")[0]!.status, "open");
  assert.equal(f.rows("gaps")[1]!.sourceRef, "recording-a");
  f.failIndex(false);
  const received = await f.call("PUT", path, { status: "received", sourceRef: "recording-a" });
  assert.equal(received.status, 200); assert.equal(received.body.repeated, false);
  const repeat = await f.call("PUT", path, { status: "received", sourceRef: "recording-a" });
  assert.equal(repeat.body.repeated, true);
  assert.equal((await f.call("PUT", path, { status: "expired" })).status, 409);
  assert.equal(f.rows("gaps")[0]!.sourceRef, "recording-a");
  assert.equal(f.rows("gaps")[1]!.status, "received");
});

test("expiration requires overdue SLA and CAS loss is an explicit conflict", async () => {
  const f = connectorFixture();
  const opened = await f.call("POST", "/connector-workflow/recording-requests", { description: "Awaiting recording", requestedFrom: "owner" });
  const path = `/connector-workflow/recording-requests/${opened.body.gap._id}`;
  f.setClock("2026-10-17T00:00:00.000Z");
  const realTransition = f.deps.store.transitionGap;
  f.deps.store.transitionGap = async () => false;
  assert.equal((await f.call("PUT", path, { status: "expired" })).status, 409);
  assert.equal(f.rows("gaps")[0]!.status, "open");
  f.deps.store.transitionGap = realTransition;
  assert.equal((await f.call("PUT", path, { status: "expired" })).body.status, "expired");
});

test("recording receipt URL cannot fabricate recording success from a generic page", async () => {
  const f = connectorFixture();
  const opened = await f.call("POST", "/connector-workflow/recording-requests", { description: "Missing recording", requestedFrom: "owner" });
  const path = `/connector-workflow/recording-requests/${opened.body.gap._id}/receive`;
  assert.equal((await f.call("POST", path, { url: "https://public.example/article" }, "b")).status, 404);
  assert.equal(f.counters().fetches, 0);
  assert.equal((await f.call("POST", path, { url: "https://public.example/article" })).status, 400);
  assert.equal(f.rows("gaps")[0]!.status, "open");
  assert.equal(f.rows("sources").length, 0); assert.equal(f.counters().fetches, 0);
});

test("hosted recording fixture receipt selects adapter, stores media and consumes indexed transcript", async () => {
  const f = connectorFixture(); f.useHostedRecording();
  const opened = await f.call("POST", "/connector-workflow/recording-requests", { description: "Missing meeting recording", requestedFrom: "organizer" });
  const path = `/connector-workflow/recording-requests/${opened.body.gap._id}/receive`;
  const received = await f.call("POST", path, { url: "https://zoom.us/rec/share/AbCdEfGh12345678", tenantId: "tenant-b" });
  assert.equal(received.status, 200); assert.equal(received.body.status, "received");
  assert.equal(f.rows("sources")[0]!.sourceMeta.platform, "zoom-recording");
  assert.equal(f.rows("media")[0]!.kind, "video");
  assert.equal(f.rows("gaps")[0]!.sourceRef, f.rows("sources")[0]!._id);
  assert.equal(f.rows("sessions")[0]!.status.index, "done");
  assert.ok(f.rows("claims").length); assert.ok(f.rows("chunks").length);
  assert.equal((await f.call("POST", path, { url: "https://zoom.us/rec/share/AbCdEfGh12345678" })).status, 409);
});

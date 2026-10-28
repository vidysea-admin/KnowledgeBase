/** Actual output repository/scoped adapter with a captured in-process fake driver.
 * No Mongo connection, provider, genuine approval, or durable-store acceptance. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import candidate from "../../../../qa/packets/t058-output-workbench.fixture.json" with { type: "json" };
import { createMongoOutputRepository } from "./repository.js";
import { assertOutputDraft } from "./validator.js";
import { OutputError, record, type OutputDraft, type OutputDeps, type OutputSources } from "./types.js";
import { createOutputService } from "./service.js";
import { createAnswerPolicyService } from "../answer-policy/service.js";
import { createInMemoryAnswerPolicyStore } from "../answer-policy/store.js";
import { lookupEffectivePolicy } from "../answer-policy/application.js";

interface Trace {
  method: "insertOne" | "findOne" | "find" | "replaceOne";
  filter?: Record<string, unknown>;
  replacement?: OutputDraft;
  options?: Record<string, unknown>;
}
function capturedDriver() {
  let stored: OutputDraft | null = null;
  const trace: Trace[] = [];
  const raw = {
    async insertOne(replacement: OutputDraft) {
      trace.push({ method: "insertOne", replacement: structuredClone(replacement) });
      stored = structuredClone(replacement);
      return { acknowledged: true, insertedId: replacement._id };
    },
    async findOne(filter: Record<string, unknown>) {
      trace.push({ method: "findOne", filter: structuredClone(filter) });
      return stored && stored._id === filter._id && stored.tenantId === filter.tenantId ? structuredClone(stored) : null;
    },
    find(filter: Record<string, unknown>) {
      const entry: Trace = { method: "find", filter: structuredClone(filter), options: {} };
      trace.push(entry);
      const cursor = {
        sort(order: Record<string, unknown>) { entry.options!.sort = structuredClone(order); return cursor; },
        limit(count: number) { entry.options!.limit = count; return cursor; },
        async toArray() { return stored && stored.tenantId === filter.tenantId ? [structuredClone(stored)] : []; },
      };
      return cursor;
    },
    async replaceOne(filter: Record<string, unknown>, replacement: OutputDraft, options: Record<string, unknown> = {}) {
      trace.push({ method: "replaceOne", filter: structuredClone(filter), replacement: structuredClone(replacement), options: structuredClone(options) });
      if (!stored || stored._id !== filter._id || stored.tenantId !== filter.tenantId || stored.revision !== filter.revision) {
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      stored = structuredClone(replacement);
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
  };
  // Explicit fake-driver type boundary; no live database object or credentials exist.
  const db = { databaseName: "test_t058_captured_adapter", collection(name: string) {
    assert.equal(name, "knowledge_outputs"); return raw;
  } } as unknown as Db;
  return { db, trace };
}

test("actual output Mongo adapter scopes identity/revision CAS, stamps tenant and never upserts a lost race", async () => {
  assertOutputDraft(candidate);
  const draft: OutputDraft = structuredClone(candidate), capture = capturedDriver();
  assert.equal(draft.sections[0]!.items[0]!.validation, "needs-review"); // The synthetic fixture asserts no trusted model/human assessment.
  const repository = createMongoOutputRepository(capture.db), tenant = draft.tenantId;
  const unchangedInput = JSON.stringify(draft);
  await repository.insert(tenant, draft);
  assert.equal(JSON.stringify(draft), unchangedInput);
  assert.equal(capture.trace[0]?.replacement?.tenantId, tenant);
  assert.equal(await repository.get("foreign-tenant", draft._id), null);
  assert.deepEqual(capture.trace.at(-1)?.filter, { _id: draft._id, tenantId: "foreign-tenant" });
  assert.deepEqual(await repository.list("foreign-tenant"), []);
  assert.deepEqual(capture.trace.at(-1)?.filter, { tenantId: "foreign-tenant" });
  assert.deepEqual((await repository.list(tenant)).map((row) => row._id), [draft._id]);
  assert.deepEqual(capture.trace.at(-1)?.options, { sort: { updatedAt: -1 }, limit: 100 });

  const updates = ["Writer one", "Writer two"].map((title): OutputDraft => ({ ...structuredClone(draft), revision: 2, title }));
  const results = await Promise.all(updates.map((next) => repository.replace(tenant, next, 1)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.filter((matched) => !matched).length, 1);
  const swaps = capture.trace.filter((entry) => entry.method === "replaceOne");
  assert.equal(swaps.length, 2);
  for (const swap of swaps) {
    assert.deepEqual(swap.filter, { _id: draft._id, revision: 1, tenantId: tenant });
    assert.equal(swap.replacement?.tenantId, tenant);
    assert.equal(swap.replacement?.revision, 2);
    assert.deepEqual(swap.options, {}); // Actual driver default: upsert is not enabled.
  }
  const reopened = await createMongoOutputRepository(capture.db).get(tenant, draft._id);
  assert.equal(reopened?.revision, 2);
  assert.equal(reopened?.title, updates[results.findIndex(Boolean)]!.title);
  const foreign = { ...structuredClone(draft), tenantId: "foreign-tenant", revision: 2 };
  assert.equal(await repository.replace("foreign-tenant", foreign, 1), false);
  assert.deepEqual(capture.trace.at(-1)?.filter, { _id: draft._id, revision: 1, tenantId: "foreign-tenant" });
  assert.deepEqual(capture.trace.at(-1)?.options, {});
  const missing = { ...structuredClone(draft), _id: "a4510c58-343f-4874-a31f-2734d8ef1852", revision: 2 };
  assert.equal(await repository.replace(tenant, missing, 1), false);
  assert.deepEqual(capture.trace.at(-1)?.filter, { _id: missing._id, revision: 1, tenantId: tenant });
  assert.deepEqual(capture.trace.at(-1)?.options, {});
  assert.equal((await repository.get(tenant, draft._id))?.tenantId, tenant);
});

test("output repository rejects mismatched write tenant or revision before the captured driver", async () => {
  assertOutputDraft(candidate);
  const draft: OutputDraft = structuredClone(candidate), capture = capturedDriver(), repository = createMongoOutputRepository(capture.db);
  const refused = (error: unknown) => error instanceof OutputError && error.code === "invalid_request";
  await assert.rejects(repository.insert("foreign-tenant", draft), refused);
  await assert.rejects(repository.insert("", draft), refused);
  await assert.rejects(repository.replace("foreign-tenant", { ...draft, revision: 2 }, 1), refused);
  await assert.rejects(repository.replace(draft.tenantId, { ...draft, revision: 3 }, 1), refused);
  await assert.rejects(repository.insert(draft.tenantId, { ...draft, revision: 2 }), refused);
  const damaged = structuredClone(draft); damaged.sections[0]!.items[0]!.assessmentDigest = "invented";
  await assert.rejects(repository.insert(draft.tenantId, damaged), (error: unknown) => error instanceof OutputError && error.code === "unavailable");
  await assert.rejects(repository.replace(draft.tenantId, { ...damaged, revision: 2 }, 1), (error: unknown) => error instanceof OutputError && error.code === "unavailable");
  assert.deepEqual(capture.trace, []);
});

test("actual output service creates through the Mongo adapter, reopens and exports synthetic grounded content, then refuses a stale edit", async () => {
  assertOutputDraft(candidate);
  const tenant = candidate.tenantId, citation = candidate.citations[0]!, capture = capturedDriver();
  // Declared synthetic authorized-source/model fixture only; no genuine review or useful-provider proof.
  const sources: OutputSources = {
    sessions: [{ _id: citation.sessionId, tenantId: tenant, sourceId: "source-fixture", date: "2026-10-14", title: "Synthetic source", status: { transcribe: "done", index: "done" } }],
    claims: [{ _id: citation.claimId, tenantId: tenant, text: citation.quote, status: "verified", evidence: [{ sessionId: citation.sessionId, turnId: citation.turnId, quote: citation.quote }] }],
    turns: [{ _id: citation.turnId, tenantId: tenant, sessionId: citation.sessionId, speakerRef: citation.speakerRef, speakerLabel: citation.speakerLabel,
      tStart: citation.start, tEnd: citation.end, text: citation.quote }],
  };
  const policies = createAnswerPolicyService(createInMemoryAnswerPolicyStore());
  let syntheticCompletionCalls = 0;
  const deps: OutputDeps = {
    repository: createMongoOutputRepository(capture.db),
    readSources: async (requestedTenant) => requestedTenant === tenant ? structuredClone(sources) : { sessions: [], claims: [], turns: [] },
    policy: (requestedTenant, selection) => lookupEffectivePolicy(policies, requestedTenant, selection),
    now: () => new Date("2026-10-15T00:30:00.000Z"),
    complete: async (requestedTenant, job) => {
      assert.equal(requestedTenant, tenant); syntheticCompletionCalls++;
      const payload: unknown = JSON.parse(job.messages[1]!.content); assert.ok(record(payload));
      const json = Array.isArray(payload.items) ? { checks: payload.items.map((value: unknown) => {
        assert.ok(record(value) && typeof value.id === "string"); return { id: value.id, supported: true };
      }) } : { sections: [{ key: "faq", items: [{ text: "Q: What does the synthetic source state?\nA: Applications open Monday.", citationIds: ["e1"] }] }] };
      return { text: JSON.stringify(json), json, provider: "synthetic-local-fixture", model: "synthetic-local-fixture",
        usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 };
    },
  };
  const service = createOutputService(deps), created = await service.create(tenant, {
    kind: "faq", title: "Synthetic adapter consumer", purpose: "Exercise the actual adapter with a declared synthetic source", sessionIds: [citation.sessionId],
  });
  assert.equal(syntheticCompletionCalls, 2); assert.equal(capture.trace[0]?.method, "insertOne");
  const reopenedService = createOutputService({ ...deps, repository: createMongoOutputRepository(capture.db) });
  assert.equal((await reopenedService.get(tenant, created._id)).sourceDigest, created.sourceDigest);
  const exported = await reopenedService.export(tenant, created._id, 1);
  assert.match(exported.markdown, /AI draft/u); assert.match(exported.markdown, /Applications open Monday/u);
  assert.ok(exported.markdown.includes(citation.href));
  const item = created.sections[0]!.items[0]!;
  const saved = await service.edit(tenant, created._id, { revision: 1, title: "Winning edit", edits: [{ id: item.id, text: item.text }] });
  assert.equal(saved.revision, 2);
  await assert.rejects(reopenedService.edit(tenant, created._id, { revision: 1, title: "Stale edit", edits: [] }),
    (error: unknown) => error instanceof OutputError && error.code === "conflict");
  assert.equal((await service.get(tenant, created._id)).title, "Winning edit");
  await assert.rejects(service.export(tenant, created._id, 2), (error: unknown) => error instanceof OutputError && error.code === "needs_review");
  assert.equal(syntheticCompletionCalls, 2); // Read/export/edit have not started a further grounding request.
});

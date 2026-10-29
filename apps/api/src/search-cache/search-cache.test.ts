/** D-206 K5: per-tenant short-TTL /search result cache - isolation, invalidation and the deadline, through the real store. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMongoSearchDeps } from "../search-store.js";
import { headId } from "../transcript-review/store.js";
import { detectWhatsAppReviewCandidates, type WhatsAppReviewCandidate } from "../whatsapp/review/detection.js";
import { whatsAppClaimId } from "../whatsapp/review/materializer.js";
import { capturingDb, type Call } from "./search-fixture.testsupport.js";

// ---- K5: per-tenant short-TTL result cache (D-206) -----------------------------------------------------------------
const turnReads = (calls: Call[]) => calls.filter((c) => c.coll === "turns").length;

test("K5 cache: a repeat of the same query is served from cache with no turns read", async () => {
  const { db, calls } = capturingDb();
  const deps = createMongoSearchDeps({ db });
  const first = await deps.search("toc", "2026", 10);
  const readsAfterFirst = turnReads(calls);
  assert.ok(readsAfterFirst > 0);
  const second = await deps.search("toc", "  2026  ", 10); // normalised key: whitespace/case
  assert.deepEqual(second, first);
  assert.equal(turnReads(calls), readsAfterFirst, "second call must not touch turns");
  second[0]!.score = -1; // mutation of a returned hit must not poison the cache
  assert.deepEqual(await deps.search("toc", "2026", 10), first);
});

test("K5 cache: k is part of the key", async () => {
  const { db, calls } = capturingDb();
  const deps = createMongoSearchDeps({ db });
  assert.equal((await deps.search("toc", "2026", 1)).length, 1);
  const reads = turnReads(calls);
  assert.equal((await deps.search("toc", "2026", 10)).length, 3);
  assert.ok(turnReads(calls) > reads, "a different k is a different entry");
});

test("K5 cache: never serves one tenant's result to another tenant, even for the identical query", async () => {
  const { db } = capturingDb();
  const deps = createMongoSearchDeps({ db });
  const toc = await deps.search("toc", "2026", 10);
  const other = await deps.search("other", "2026", 10);
  assert.ok(toc.length > 0 && other.length > 0, "precondition: both tenants have matches");
  assert.ok(toc.every((h) => h.turn?.tenantId === "toc"));
  assert.ok(other.every((h) => h.turn?.tenantId === "other"), `other tenant was served ${JSON.stringify(other.map((h) => h.turn?.tenantId))}`);
  assert.deepEqual((await deps.search("toc", "2026", 10)).map((h) => h.turnId), toc.map((h) => h.turnId));
});

test("K5 cache: consent withdrawn between two identical requests is honoured immediately (fingerprint, not TTL)", async () => {
  const { db, data } = capturingDb();
  const deps = createMongoSearchDeps({ db, cacheTtlMs: 600_000 });
  const before = await deps.search("toc", "visa", 10);
  assert.deepEqual(before.map((h) => h.turnId), ["t1"]);
  (data.sources.find((s) => s._id === "src1") as Record<string, unknown>).consent = { given: false, recordedBy: "owner" };
  assert.deepEqual(await deps.search("toc", "visa", 10), [], "a withdrawn source must vanish on the very next request");
});

test("K5 cache: source relabelled to whatsapp-batch and transcript correction both invalidate", async () => {
  const { db, data } = capturingDb();
  const deps = createMongoSearchDeps({ db, cacheTtlMs: 600_000 });
  assert.equal((await deps.search("toc", "visa", 10)).length, 1);
  data.transcript_reviews.push({ _id: headId("toc", "s1"), tenantId: "toc", sessionId: "s1", revision: "r1",
    overlay: [{ turnId: "t1", text: "Corrected New Zealand statement.", speakerRef: "spk:0" }] });
  assert.deepEqual(await deps.search("toc", "visa", 10), [], "the corrected text no longer says visa");
  (data.sources.find((s) => s._id === "src1") as Record<string, unknown>).kind = "whatsapp-batch";
  assert.deepEqual(await deps.search("toc", "new zealand", 10), []);
});

test("K5 cache: a WhatsApp review-candidate link added over a recording session hides it on the very next request", async () => {
  const { db, data } = capturingDb({ more: { whatsapp_candidates: [] } });
  const deps = createMongoSearchDeps({ db, cacheTtlMs: 600_000 });
  assert.deepEqual((await deps.search("toc", "visa", 10)).map((h) => h.turnId), ["t1"]);
  data.whatsapp_candidates!.push({ _id: "cand", tenantId: "toc", sessionId: "s1", sourceId: "src1" });
  assert.deepEqual(await deps.search("toc", "visa", 10), [], "a candidate link over the source makes the session invisible");
});

test("K5 cache: entries expire after the TTL", async () => {
  const { db, calls } = capturingDb();
  const deps = createMongoSearchDeps({ db, cacheTtlMs: 30 });
  await deps.search("toc", "2026", 10);
  const reads = turnReads(calls);
  await new Promise((resolve) => setTimeout(resolve, 60));
  await deps.search("toc", "2026", 10);
  assert.ok(turnReads(calls) > reads, "expired entry must be recomputed");
});

test("K5 cache: a result that touches an APPROVED whatsapp-batch session is never cached (its approval can be withdrawn)", async () => {
  // Real approved-WhatsApp state, built the way visibility/knowledge.test.ts builds it.
  const source = { _id: "src-wa", tenantId: "toc", kind: "whatsapp-batch", path: "group@g.us", consent: { given: true, recordedBy: "owner" } } as never;
  const session = { _id: "s-wa", tenantId: "toc", sourceId: "src-wa", title: "PRIVATE", participants: [], date: "2026-10-14", status: { transcribe: "done", index: "pending" } } as never;
  const turn = { _id: "wa1", tenantId: "toc", sessionId: "s-wa", speakerRef: "expert", speakerLabel: "Asha", tStart: 0, tEnd: 0, text: "Scholarship closes Friday.", occurredAt: "2026-10-14T10:00:00.000Z" } as never;
  const sib = { ...(turn as object), _id: "wa2", text: "Unreviewed sibling.", tStart: 1, tEnd: 1 } as never;
  const detected = detectWhatsAppReviewCandidates("toc", { source, session, turns: [turn, sib] }, "2026-10-14T11:00:00.000Z");
  const candidate = { ...detected[0]!, status: "approved", decision: { action: "approved", actor: "reviewer", at: "2026-10-14T11:00:00.000Z" } } as never as WhatsAppReviewCandidate;
  const claim = { _id: whatsAppClaimId(candidate._id), tenantId: "toc", text: candidate.text, source: "whatsapp", status: "verified", origin: "speaker-statement",
    evidence: candidate.evidence.map((e) => ({ turnId: e.turnId, sessionId: e.sessionId, quote: e.quote })),
    waReview: { candidateId: candidate._id, kind: candidate.kind, approvedBy: candidate.decision?.actor, approvedAt: candidate.decision?.at } };
  const fx = capturingDb({ turns: [turn as never, sib], more: { whatsapp_candidates: [candidate as never, ...detected.slice(1) as never[]], claims: [claim as never], whatsapp_review_log: [] } });
  fx.data.sessions.push(session as never); fx.data.sources.push(source as never);
  const deps = createMongoSearchDeps({ db: fx.db });
  const first = await deps.search("toc", "scholarship", 5);
  assert.deepEqual(first.map((h) => h.turnId), ["wa1"], "precondition: the approved WA turn is a visible hit");
  const reads = turnReads(fx.calls);
  // Withdraw the approval WITHOUT touching anything the fingerprint reads (claims/candidates only).
  fx.data.claims = [];
  assert.deepEqual(await deps.search("toc", "scholarship", 5), [], "withdrawn WA guidance must disappear on the next request");
  assert.ok(turnReads(fx.calls) > reads);
});

test("K5 cache: if the fingerprint cannot be read the cache is bypassed, not trusted", async () => {
  const { db, calls } = capturingDb();
  let failFingerprint = false;
  const flaky = { collection: (name: string) => { const c = (db as never as { collection: (n: string) => Record<string, unknown> }).collection(name);
    return name === "transcript_reviews" && failFingerprint ? { ...c, find: (f: unknown, o?: unknown) => ((o as { projection?: unknown } | undefined)?.projection ? { toArray: async () => { throw new Error("down"); } } : (c.find as (f: unknown, o?: unknown) => unknown)(f, o)) } : c; } };
  const deps = createMongoSearchDeps({ db: flaky as never });
  const first = await deps.search("toc", "2026", 10);
  const reads = turnReads(calls);
  failFingerprint = true;
  assert.deepEqual((await deps.search("toc", "2026", 10)).map((h) => h.turnId), first.map((h) => h.turnId));
  assert.ok(turnReads(calls) > reads, "recomputed rather than served from an unverified entry");
});

test("K5 deadline: an already-expired deadline fails the search instead of returning partial or empty hits", async () => {
  const { db } = capturingDb();
  await assert.rejects(createMongoSearchDeps({ db, cacheTtlMs: 0 }).search("toc", "2026", 10, { deadlineAt: Date.now() - 1 }), /deadline/);
});

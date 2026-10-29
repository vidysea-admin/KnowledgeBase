/** D-206 K5: per-tenant short-TTL /search result cache - isolation, invalidation and the deadline, through the real store. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMongoSearchDeps } from "../search-store.js";
import { withReadDeadline } from "./search-cache.js";
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

// ---- ISS-420 / ISS-425: the fingerprint's own pins (fake now honours find() projections) ----------------------------
test("ISS-425 fake honours projections: a field outside the projection never reaches the caller", async () => {
  const { db } = capturingDb();
  const rows = await (db as never as { collection: (n: string) => { find: (f: object, o: object) => { toArray(): Promise<Record<string, unknown>[]> } } })
    .collection("sources").find({ tenantId: "toc" }, { projection: { _id: 1, tenantId: 1, kind: 1 } }).toArray();
  assert.ok(rows.length > 0 && rows.every((r) => !("consent" in r) && !("path" in r) && "kind" in r));
});

test("ISS-425 fingerprint reads sources WITH consent, sessions WITH status, heads and candidates, each under a projection", async () => {
  const { db, calls } = capturingDb({ more: { whatsapp_candidates: [] } });
  await createMongoSearchDeps({ db, cacheTtlMs: 600_000 }).search("toc", "visa", 10);
  const projected = (coll: string) => calls.find((c) => c.coll === coll && (c.options?.projection as object | undefined))?.options!.projection as Record<string, unknown> | undefined;
  assert.equal(projected("sources")?.consent, 1, "consent must be in the sources projection");
  assert.equal(projected("sessions")?.status, 1, "status (index done/failed) must be in the sessions projection");
  assert.equal(projected("sessions")?.sourceId, 1);
  assert.equal(projected("transcript_reviews")?.revision, 1);
  assert.ok(projected("whatsapp_candidates"));
});

test("ISS-420 index failure: a session status change invalidates the cached /search result on the very next request (sessions are in the fingerprint)", async () => {
  const { db, data, calls } = capturingDb();
  const deps = createMongoSearchDeps({ db, cacheTtlMs: 600_000 });
  const first = await deps.search("toc", "visa", 10);
  assert.deepEqual(first.map((h) => h.turnId), ["t1"]);
  assert.equal(first[0]!.session?.status.index, "done");
  const reads = turnReads(calls);
  ((data.sessions.find((s) => s._id === "s1") as { status: { index: string } }).status).index = "failed";
  const second = await deps.search("toc", "visa", 10);
  assert.ok(turnReads(calls) > reads, "the stale entry must be recomputed, not served");
  assert.equal(second[0]?.session?.status.index, "failed", "the fresh label, not the cached one (/search itself does not hide index-failed sessions; /route does)");
});

test("ISS-425 a fingerprint that cannot be read is NOT replaced by a constant: two failing reads never serve the cached result", async () => {
  const { db, calls, data } = capturingDb();
  const failing = { collection: (name: string) => { const c = (db as never as { collection: (n: string) => Record<string, unknown> }).collection(name);
    return name === "transcript_reviews" ? { ...c, find: (f: unknown, o?: unknown) => ((o as { projection?: unknown } | undefined)?.projection ? { toArray: async () => { throw new Error("down"); } } : (c.find as (f: unknown, o?: unknown) => unknown)(f, o)) } : c; } };
  const deps = createMongoSearchDeps({ db: failing as never, cacheTtlMs: 600_000 });
  assert.deepEqual((await deps.search("toc", "visa", 10)).map((h) => h.turnId), ["t1"]);
  const reads = turnReads(calls);
  (data.sources.find((s) => s._id === "src1") as Record<string, unknown>).consent = { given: false, recordedBy: "owner" };
  assert.deepEqual(await deps.search("toc", "visa", 10), [], "with the fingerprint unreadable, a withdrawn source must still vanish");
  assert.ok(turnReads(calls) > reads, "bypassed, not served");
});

test("ISS-427 every Mongo read of a /search call carries maxTimeMS derived from the deadline", async () => {
  const { db, calls } = capturingDb();
  await createMongoSearchDeps({ db, cacheTtlMs: 600_000 }).search("toc", "visa", 10, { deadlineAt: Date.now() + 900 });
  assert.ok(calls.length > 0);
  for (const c of calls) {
    const ms = c.options?.maxTimeMS as number | undefined;
    assert.ok(typeof ms === "number" && ms >= 1 && ms <= 900, `${c.coll} ${c.op} maxTimeMS=${ms}`);
  }
});

test("cycle 1: a never-resolving fingerprint read is bounded by the call's deadline in the store itself; the cache is bypassed", async () => {
  const { db, calls } = capturingDb();
  const hung = { collection: (name: string) => { const c = (db as never as { collection: (n: string) => Record<string, unknown> }).collection(name);
    return name === "transcript_reviews" ? { ...c, find: (f: unknown, o?: unknown) => ((o as { projection?: unknown } | undefined)?.projection ? { toArray: () => new Promise(() => undefined) } : (c.find as (f: unknown, o?: unknown) => unknown)(f, o)) } : c; } };
  const deps = createMongoSearchDeps({ db: hung as never, cacheTtlMs: 600_000 });
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now(), hits = await deps.search("toc", "visa", 10, { deadlineAt: Date.now() + 150 });
    assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
    assert.deepEqual(hits.map((h) => h.turnId), ["t1"]);
  }
  assert.ok(turnReads(calls) >= 2, "both calls recomputed: nothing was cached");
});

test("cycle 1: withReadDeadline keeps the LOWER of the caller's own maxTimeMS/timeoutMS and the time left", async () => {
  const seen: Array<Record<string, unknown> | undefined> = [];
  const raw = { collection: () => ({ find: (_f: unknown, o?: Record<string, unknown>) => { seen.push(o); return { toArray: async () => [] }; },
    findOne: async (_f: unknown, o?: Record<string, unknown>) => { seen.push(o); return null; } }) };
  const db = withReadDeadline(raw as never as { collection(n: string): never }, 10_000, () => 0) as never as { collection(n: string): { find(f: object, o?: object): unknown; findOne(f: object, o?: object): unknown } };
  const c = db.collection("x");
  c.find({}, { maxTimeMS: 50 }); c.find({}, { maxTimeMS: 60_000 }); c.find({}); c.findOne({}, { maxTimeMS: 50, timeoutMS: 70 }); c.findOne({}, { timeoutMS: 60_000 });
  assert.deepEqual(seen.map((o) => o?.maxTimeMS), [50, 10_000, 10_000, 50, 10_000], "a lower caller maxTimeMS wins, a higher one is clamped to the time left");
  assert.deepEqual(seen.map((o) => o?.timeoutMS), [undefined, undefined, undefined, 70, 10_000], "timeoutMS is clamped the same way");
});

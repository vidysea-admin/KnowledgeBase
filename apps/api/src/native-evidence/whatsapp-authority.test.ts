import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db, ClientSession } from "mongodb";
import type { MessageSourceLocator } from "@lkb/core";
import { createWhatsAppNativeAuthority } from "./whatsapp-authority.js";
import { createNativeEvidenceResolver } from "./resolver.js";
import { detectWhatsAppReviewCandidates } from "../whatsapp/review/detection.js";
import { materializeWhatsAppClaim } from "../whatsapp/review/materializer.js";
import { reviewInput, REVIEW_TIME } from "../whatsapp/review/test-fixtures.js";
import { wireMongoFixture } from "../whatsapp/review/wire-fixtures.js";
import { headId } from "../transcript-review/store.js";

type Row = Record<string, unknown>;
const names = ["sources", "sessions", "turns", "claims", "whatsapp_candidates", "whatsapp_review_log", "transcript_reviews"];
async function fixture(text = "Scholarship 😀 closes Friday.") {
  const input = reviewInput(text);
  const candidate = { ...detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!, status: "approved" as const,
    decision: { action: "approved" as const, actor: "verified-owner", at: REVIEW_TIME } };
  const stored = wireMongoFixture({ sources: [{ ...input.source, consent: { given: true, recordedBy: "owner" } }],
    sessions: [input.session], turns: [...input.turns], whatsapp_candidates: [candidate] });
  const seedSession = stored.db.client.startSession();
  try { await seedSession.withTransaction(() => materializeWhatsAppClaim({ candidate, db: stored.db, session: seedSession })); }
  finally { await seedSession.endSession(); }
  const calls: { name: string; session: unknown }[] = []; let starts = 0, ends = 0, transactions = 0;
  let errorCollection: string | undefined; let unsupported = false;
  const snapshots = new Map<unknown, Db>();
  const db = {
    client: { startSession() {
      starts++;
      let active = false;
      const session = { inTransaction: () => active, async withTransaction<T>(run: () => Promise<T>, options: unknown): Promise<T> {
        assert.deepEqual(options, { readConcern: { level: "snapshot" }, readPreference: "primary" });
        if (unsupported) throw new Error("PRIVATE replica disabled");
        transactions++;
        snapshots.set(session, wireMongoFixture(Object.fromEntries(names.map(name => [name, stored.rows(name)]))).db);
        active = true; try { return await run(); } finally { active = false; }
      }, async endSession() { ends++; snapshots.delete(session); } };
      return session;
    } },
    collection(name: string) {
      const collection = (options: { session?: unknown }) => {
        calls.push({ name, session: options.session });
        assert.ok(options.session && snapshots.has(options.session), "every source/guard/overlay read uses transaction snapshot");
        if (errorCollection === name) throw new Error("PRIVATE infrastructure detail");
        return snapshots.get(options.session)!.collection(name);
      };
      return {
        findOne: (filter: object, options: object = {}) => collection(options).findOne(filter),
        find: (filter: object, options: object = {}) => {
          const cursor = collection(options).find(filter); let cap = Infinity;
          const view = { limit(value: number) { cap = value; return view; }, async toArray() { return (await cursor.toArray()).slice(0, cap); } };
          return view;
        },
      };
    },
  } as unknown as Db;
  return { input, candidate, stored, calls, db, authority: createWhatsAppNativeAuthority(db),
    counts: () => ({ starts, ends, transactions }),
    failReads: (name: string) => { errorCollection = name; },
    disableTransactions: () => { unsupported = true; },
    async replace(name: string, row: Row) { await stored.db.collection<{ _id: string; [key: string]: unknown }>(name)
      .replaceOne({ _id: String(row._id) }, { ...row, _id: String(row._id) }); },
  };
}

test("actual canonical approval becomes exact internal message evidence through single native resolver", async () => {
  const f = await fixture(); const locators = await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id });
  assert.equal(locators.length, 1); const locator = locators[0]!;
  assert.equal(locator.sourceId, f.input.source._id); assert.equal(locator.threadId, f.input.session._id);
  assert.equal(locator.messageId, f.input.turns[0]!._id); assert.equal(locator.passage.end, f.input.turns[0]!.text.length);
  const resolver = createNativeEvidenceResolver({ loadCurrent: (tenant, value) => value.kind === "message" ? f.authority.loadCurrent(tenant, value) : Promise.resolve(null) });
  const evidence = await resolver.resolve("tenant-a", locator);
  assert.equal(evidence?.quote, f.input.turns[0]!.text); assert.equal(evidence?.title, "Approved WhatsApp message");
  assert.ok(f.calls.length > 5); assert.equal(f.counts().starts, f.counts().ends);
});

test("pending/rejected/attachment/quarantine/withdrawn/deleted source never becomes native authority", async () => {
  for (const kind of ["pending", "rejected", "attachment", "quarantine", "withdrawn", "deleted"] as const) {
    const f = await fixture(); const [locator] = await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }); assert.ok(locator);
    if (kind === "pending" || kind === "rejected" || kind === "attachment") {
      const row = f.stored.rows("whatsapp_candidates")[0]!;
      await f.replace("whatsapp_candidates", { ...row, ...(kind === "attachment" ? { kind: "attachment" } : { status: kind === "pending" ? "needs-review" : "rejected" }) });
    } else if (kind === "quarantine") {
      f.stored.put("whatsapp_review_log", { _id: "pending", tenantId: "tenant-a", kind: "pending-invalidation", groupJid: f.input.source.path });
    } else {
      const row = f.stored.rows("sources")[0]!;
      await f.replace("sources", { ...row, ...(kind === "withdrawn" ? { consent: { given: false, recordedBy: "owner" } } : { deletedAt: REVIEW_TIME }) });
    }
    assert.equal(await f.authority.loadCurrent("tenant-a", locator), null, kind);
    assert.deepEqual(await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }), [], kind);
  }
});

test("foreign tenant and changed raw text invalidate old message revision without leaking original evidence", async () => {
  const f = await fixture(); const [locator] = await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }); assert.ok(locator);
  assert.equal(await f.authority.loadCurrent("tenant-b", locator), null);
  assert.deepEqual(await f.authority.listCurrent("tenant-b", { sourceId: f.input.source._id }), []);
  await f.replace("turns", { ...f.input.turns[0]!, text: "Changed text needs reapproval" });
  assert.equal(await f.authority.loadCurrent("tenant-a", locator), null);
  assert.deepEqual(await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }), []);
});

test("deleted source message and missing current materialized claim refuse authority", async () => {
  for (const name of ["turns", "claims"]) {
    const f = await fixture(); const [locator] = await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }); assert.ok(locator);
    const row = f.stored.rows(name)[0]!; await f.replace(name, { ...row, tenantId: "other" });
    assert.equal(await f.authority.loadCurrent("tenant-a", locator), null);
  }
});

test("current consent provenance changes revision while a fresh approval fence alone does not", async () => {
  const f = await fixture(); const [before] = await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }); assert.ok(before);
  const source = f.stored.rows("sources")[0]!;
  await f.replace("sources", { ...source, sourceMeta: { whatsappReviewFence: "new-transaction-fence" } });
  assert.ok(await f.authority.loadCurrent("tenant-a", before));
  await f.replace("sources", { ...source, consent: { given: true, recordedBy: "new-approved-owner" } });
  assert.equal(await f.authority.loadCurrent("tenant-a", before), null);
  const [after] = await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }); assert.ok(after);
  assert.notEqual(after.revisionHash, before.revisionHash);
});

test("effective transcript correction invalidates raw-bound approval inside the same source snapshot", async () => {
  const f = await fixture(); const [locator] = await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }); assert.ok(locator);
  f.stored.put("transcript_reviews", { _id: headId("tenant-a", f.input.session._id), tenantId: "tenant-a", sessionId: f.input.session._id,
    revision: "corrected-revision", parentRevision: "original", committedAt: REVIEW_TIME,
    overlay: [{ turnId: f.input.turns[0]!._id, text: "Corrected text requires reapproval", speakerRef: f.input.turns[0]!.speakerRef }],
    audit: { actorRef: "reviewer", reviewedAt: REVIEW_TIME, reason: "correction", changes: [] },
    refresh: { status: "complete", revision: "corrected-revision", targets: [], completed: [] } });
  assert.equal(await f.authority.loadCurrent("tenant-a", locator), null);
  assert.deepEqual(await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }), []);
});

test("message slicing uses exact UTF16 offsets and refuses oversized passage inventory", async () => {
  const f = await fixture("x".repeat(1023) + "😀" + "y".repeat(5));
  const locators = await f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id });
  assert.deepEqual(locators.map(l => [l.passage.start, l.passage.end]), [[0, 1023], [1023, 1030]]);
  await assert.rejects(f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }, 1), /whatsapp_native_authority_unavailable/);
  await assert.rejects(f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }, 129), /unavailable/);
  const altered: MessageSourceLocator = { ...locators[0]!, revisionHash: "f".repeat(64) };
  assert.equal(await f.authority.loadCurrent("tenant-a", altered), null);
});

test("infrastructure and unsupported snapshot transactions are sanitized failures, never empty-success fallback", async () => {
  for (const name of ["sources", "claims", "turns", "transcript_reviews"]) {
    const f = await fixture(); f.failReads(name);
    await assert.rejects(f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }), error =>
      error instanceof Error && error.message === "whatsapp_native_authority_unavailable");
    assert.equal(f.counts().starts, f.counts().ends);
  }
  const f = await fixture(); f.disableTransactions();
  await assert.rejects(f.authority.listCurrent("tenant-a", { sourceId: f.input.source._id }), /whatsapp_native_authority_unavailable/);
  assert.equal(f.calls.length, 0); assert.equal(f.counts().starts, f.counts().ends);
});

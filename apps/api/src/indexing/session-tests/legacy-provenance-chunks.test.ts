// ISS-LEGACYSEED-008: indexSession must carry a session's legacy-unbound provenance stamp onto its chunks
// (backfill already did). Fakes only: in-memory fakeDb, no Mongo, no provider.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Chunks, Sessions } from "@lkb/core";
import { indexSession } from "../session.js";
import { fakeDb } from "../testutils.js";

const STAMP = { status: "legacy-unbound", reason: "D-149" };

function groundedComplete() {
  return async (job: { messages: { content: string }[] }) => {
    const input = JSON.parse(job.messages[1]!.content);
    const claims = input.spans.map((span: { text: string; origin: string; turnId: string; sessionId: string }) => ({
      text: span.text, origin: span.origin, verification: "unverified",
      evidence: [{ turnId: span.turnId, sessionId: span.sessionId, quote: span.text }],
    }));
    const result = input.phase === "extract-summary" ? { processed: input.inventory, items: claims.map((claim: object) => ({ ...claim, kind: "insight" })), qa: [] }
      : input.phase === "extract-claims" ? { processed: input.inventory, claims }
      : { processed: input.inventory, complete: true, noContent: false, verdicts: input.items.map((item: { id: string }) => ({
        id: item.id, supported: true, categoryCorrect: true, answerRelevant: true,
      })) };
    return { text: JSON.stringify(result), usage: { inputTokens: 0, outputTokens: 0 }, provider: "fixture", model: "fixture", costUsd: 0 };
  };
}
const embed = async (job: { texts: string[] }) => ({ vectors: job.texts.map(() => [1, 0]), dims: 2, provider: "fixture", model: "fixture" });

async function stampSession(db: ReturnType<typeof fakeDb>["db"], provenance: unknown) {
  await db.collection<Sessions>("sessions").updateOne({ tenantId: "t", _id: "s1" }, { $set: { provenance } as never });
}
const chunksOf = (db: ReturnType<typeof fakeDb>["db"]) => db.collection<Chunks>("chunks").find({ tenantId: "t", sourceRef: "s1" }).toArray();

for (const mode of ["vectorless", "vector"] as const) {
  test(`${mode}: legacy-unbound session stamps every chunk it writes`, async () => {
    const { db } = fakeDb();
    await stampSession(db, STAMP);
    await indexSession("t", "s1", { db, strictWebinar: true, retrievalMode: mode, complete: groundedComplete(), embed });
    const chunks = await chunksOf(db);
    assert.ok(chunks.length);
    for (const chunk of chunks) assert.deepEqual((chunk as { provenance?: unknown }).provenance, STAMP);
  });
  test(`${mode}: session without a stamp (or with a foreign status) leaves chunks unstamped`, async () => {
    for (const provenance of [undefined, { status: "bound", reason: "x" }, { status: "legacy-unbound" }]) {
      const { db } = fakeDb();
      if (provenance) await stampSession(db, provenance);
      await indexSession("t", "s1", { db, strictWebinar: true, retrievalMode: mode, complete: groundedComplete(), embed });
      const chunks = await chunksOf(db);
      assert.ok(chunks.length);
      for (const chunk of chunks) assert.equal((chunk as { provenance?: unknown }).provenance, undefined);
    }
  });
}

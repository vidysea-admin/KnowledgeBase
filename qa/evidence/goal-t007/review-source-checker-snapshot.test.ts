import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db, FindOneOptions } from "mongodb";
import type { Sources } from "../../../packages/core/src/index.js";
import { reviewInput, reviewMongoFixture, REVIEW_TIME } from "../../../apps/api/src/whatsapp/review/test-fixtures.js";
import { detectWhatsAppReviewCandidates } from "../../../apps/api/src/whatsapp/review/detection.js";
import { createMongoWhatsAppReviewRepository } from "../../../apps/api/src/whatsapp/review/store.js";
import { createMongoWhatsAppReviewSourceReader, ReviewSourceStaleError } from "../../../apps/api/src/whatsapp-review/review-source.js";

async function pending() {
  const input = reviewInput();
  const fixture = reviewMongoFixture([input]);
  const candidate = detectWhatsAppReviewCandidates("tenant-a", input, REVIEW_TIME)[0]!;
  await createMongoWhatsAppReviewRepository(fixture.db).insert("tenant-a", [candidate]);
  return { fixture, input, candidate };
}

for (const event of ["consent-withdrawal", "pending-invalidation"] as const) test(`independent review privacy: ${event} during the final transcript-head lookup cannot return earlier evidence`, async () => {
  const { fixture, input, candidate } = await pending();
  let headReads = 0, triggered = false;
  const db = { client: fixture.db.client, collection(name: string) {
    const collection = fixture.db.collection(name);
    return { ...collection, async findOne(filter: Record<string, unknown>, options: FindOneOptions = {}) {
      const result = await collection.findOne(filter, options);
      if (name === "transcript_reviews" && ++headReads === 6) {
        triggered = true;
        if (event === "consent-withdrawal") await fixture.db.collection<Sources>("sources").updateOne(
          { tenantId: "tenant-a", _id: input.source._id }, { $set: { consent: { given: false, recordedBy: "owner" } } });
        else await fixture.db.collection<{ _id: string; tenantId: string; kind: string; groupJid: string }>("whatsapp_review_log").updateOne(
          { tenantId: "tenant-a", _id: "checker-pending" }, { $set: { kind: "pending-invalidation", groupJid: candidate.groupJid } }, { upsert: true });
      }
      return result;
    } };
  } } as unknown as Pick<Db, "collection" | "client">;
  await assert.rejects(createMongoWhatsAppReviewSourceReader(db).get("tenant-a", candidate._id), ReviewSourceStaleError);
  assert.equal(triggered, true, "probe must reach the last checked read rather than pass on an earlier refusal");
  assert.deepEqual(fixture.rows("whatsapp_candidates")[0], candidate, "unchanged candidate cannot establish current source permission");
});

test("independent review control: unchanged pending candidate remains inspectable with exact evidence", async () => {
  const { fixture, input, candidate } = await pending();
  const result = await createMongoWhatsAppReviewSourceReader(fixture.db).get("tenant-a", candidate._id);
  assert.equal(result?.evidence[0].quote, input.turns[0]!.text);
  assert.equal(result?.candidateId, candidate._id);
});

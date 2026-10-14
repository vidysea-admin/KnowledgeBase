// migrations/20261014100000-transcript-reviews.cjs - T-054 durable transcript corrections.
// Creates `transcript_reviews` (head, one row per tenant+session) and `transcript_review_revisions` (append-only history)
// and applies their schema/index.json entries - same shape as 20261013100000-speaker-suggestions.cjs. NOT RUN by the lane
// that wrote it; applying it is the Approver's step. The unique { tenantId, sessionId } index on the head is what makes
// "first review wins" atomic (a concurrent first commit gets a duplicate-key error, reported as a conflict).
// Idempotent: createCollection is skipped when present and createIndex is a no-op for an identical index.
// down() drops BOTH collections: that deletes all human corrections and their history - never run it against real data.
const { readFileSync } = require("fs");
const { join } = require("path");

const COLLECTIONS = ["transcript_reviews", "transcript_review_revisions"];

function loadIndexes() {
  const path = join(__dirname, "..", "schema", "index.json");
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  delete parsed.$comment;
  return parsed;
}

module.exports = {
  async up(db) {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    for (const name of COLLECTIONS) {
      if (!existing.has(name)) await db.createCollection(name);
    }
    const indexes = loadIndexes();
    for (const name of COLLECTIONS) {
      for (const spec of indexes[name] ?? []) {
        const options = { ...spec };
        delete options.keys;
        await db.collection(name).createIndex(spec.keys, options);
      }
    }
  },

  async down(db) {
    for (const name of COLLECTIONS) {
      await db.collection(name).drop().catch(() => {});
    }
  },
};

// migrations/20261013100000-speaker-suggestions.cjs - U2.4 suggested speaker names (D-141, pending append).
// Creates the `speaker_suggestions` collection and applies its schema/index.json entries - same shape as
// 20261012100000-usage-events.cjs. NOT RUN by the lane that wrote it; applying it is the Approver's step.
// Indexes come from schema/index.json (the only place index changes are made). The unique
// { tenantId, sessionId, speakerRef, personId } index is what makes a suggestion (and a rejection tombstone) one row.
// Idempotent: createCollection is skipped when present and createIndex is a no-op for an identical index.
const { readFileSync } = require("fs");
const { join } = require("path");

const COLLECTIONS = ["speaker_suggestions"];

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

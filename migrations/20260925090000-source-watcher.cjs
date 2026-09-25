// migrations/20260925090000-source-watcher.cjs — U2 source-watcher. Adds the two new
// collections the watcher needs (watch_state, watch_reports) and applies their schema/
// index.json entries — same shape as 20260904120000-meeting-candidates.cjs. The additive
// fields U2 also put on `meeting_candidates` (kind/startTime/endTime/recordingUrl/
// registrationOnly) need no migration: that collection already exists with
// `additionalProperties: true` and no new index was added for them.
const { readFileSync } = require("fs");
const { join } = require("path");

const COLLECTIONS = ["watch_state", "watch_reports"];

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

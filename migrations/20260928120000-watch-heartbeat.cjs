// migrations/20260928120000-watch-heartbeat.cjs — U4b/R2 watcher liveness (D-048). Creates the
// `watch_heartbeat` collection and applies its schema/index.json entries — same shape as
// 20260925090000-source-watcher.cjs, which created watch_state + watch_reports.
//
// Indexes come from schema/index.json (its own $comment: "the only place index changes are made"),
// never hand-written here, so this file cannot drift from the declared index set. The
// `{ tenantId: 1, sourceType: 1 }` index is UNIQUE because there is exactly one heartbeat row per
// (tenantId, sourceType) — the same pair `_id` is built from — so a duplicate row is a bug the
// database refuses rather than a silently split liveness record.
const { readFileSync } = require("fs");
const { join } = require("path");

const COLLECTIONS = ["watch_heartbeat"];

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

// migrations/20261012100000-usage-events.cjs - T-057 D4 usage analytics (Approver ruling 2026-10-12 (2)).
// Creates the `usage_events` collection and applies its schema/index.json entries - same shape as
// 20260928120000-watch-heartbeat.cjs.
//
// Indexes come from schema/index.json (its own $comment: "the only place index changes are made"),
// never hand-written here: { tenantId: 1 } and { tenantId: 1, day: 1 } (the key GET /usage reads by).
// There is deliberately NO TTL index: no DECISIONS entry sets a retention period for usage events,
// so none is invented here. Adding one is a later migration once the Approver decides.
// Idempotent: createCollection is skipped when present and createIndex is a no-op for an identical index.
const { readFileSync } = require("fs");
const { join } = require("path");

const COLLECTIONS = ["usage_events"];

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

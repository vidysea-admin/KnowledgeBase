// migrations/20261013110000-gaps-source-ref-index.cjs - ISS-TENANTSRCID-003: gaps.updateMany({tenantId, sourceRef}) (used by
// 20261012150000-tenant-scoped-source-ids.cjs and any gap-by-source lookup) had no supporting index; `gaps` had no
// schema/index.json entry at all. Applies the schema/index.json entries for `gaps`: { tenantId: 1 } and
// { tenantId: 1, sourceRef: 1 }, same shape as 20261013100000-speaker-suggestions.cjs. NOT RUN by the lane that wrote it.
// Idempotent: createCollection is skipped when present and createIndex is a no-op for an identical index.
const { readFileSync } = require("fs");
const { join } = require("path");

const COLLECTIONS = ["gaps"];

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

  // `gaps` holds real rows: down() drops only the indexes this migration declared, NEVER the collection.
  async down(db) {
    const indexes = loadIndexes();
    for (const name of COLLECTIONS) {
      for (const spec of indexes[name] ?? []) {
        const indexName = Object.entries(spec.keys).map(([k, v]) => `${k}_${v}`).join("_");
        await db.collection(name).dropIndex(indexName).catch(() => {});
      }
    }
  },
};

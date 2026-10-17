// SOURCEONLY — authored for review; never applied by the maker.
// Owns only speaker_relationships. No existing graph_edges rows are touched.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mongoSchema } = require("./20261014200000-knowledge-workflows.cjs");
const COLLECTIONS = ["speaker_relationships"];

async function assertIsolatedWorkTarget(db) {
  const guardPath = pathToFileURL(join(__dirname, "..", "scripts", "lib", "transcript-provenance.mjs")).href;
  const { requireWorkDatabase } = await import(guardPath);
  const target = requireWorkDatabase(process.env);
  // This source-only migration never accepts production or staging activation.
  if (db?.databaseName !== target.dbName || target.dbName.toLowerCase() === "lkb_staging") {
    throw new Error("speaker_relationships: explicit isolated work database required; protected database refused");
  }
}

module.exports = {
  COLLECTIONS,
  async up(db) {
    await assertIsolatedWorkTarget(db);
    const root = join(__dirname, "..", "schema");
    const source = JSON.parse(readFileSync(join(root, "speaker_relationships.schema.json"), "utf8"));
    const indexes = JSON.parse(readFileSync(join(root, "index.json"), "utf8")).speaker_relationships;
    const options = { validator: { $jsonSchema: mongoSchema(source, source) }, validationLevel: "strict", validationAction: "error" };
    const existing = await db.listCollections({ name: COLLECTIONS[0] }, { nameOnly: true }).toArray();
    if (existing.length) await db.command({ collMod: COLLECTIONS[0], ...options });
    else await db.createCollection(COLLECTIONS[0], options);
    for (const { keys, ...spec } of indexes) await db.collection(COLLECTIONS[0]).createIndex(keys, spec);
  },
  async down() {
    throw new Error("Refusing destructive rollback of speaker relationship reviews; use an explicitly reviewed forward migration.");
  },
};

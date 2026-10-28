// SOURCEONLY — authored for review; never applied by the maker.
// Owns only speaker_attributes. Existing confirmed speakers are untouched.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mongoSchema } = require("./20261014200000-knowledge-workflows.cjs");
const COLLECTIONS = ["speaker_attributes"];

async function assertIsolatedWorkTarget(db) {
  const guardPath = pathToFileURL(join(__dirname, "..", "scripts", "lib", "transcript-provenance.mjs")).href;
  const { requireWorkDatabase } = await import(guardPath);
  const target = requireWorkDatabase(process.env);
  if (db?.databaseName !== target.dbName || target.dbName.toLowerCase() === "lkb_staging") {
    throw new Error("speaker_attributes: explicit isolated work database required; protected database refused");
  }
}

module.exports = {
  COLLECTIONS,
  async up(db) {
    await assertIsolatedWorkTarget(db);
    const root = join(__dirname, "..", "schema");
    const source = JSON.parse(readFileSync(join(root, "speaker_attributes.schema.json"), "utf8"));
    const indexes = JSON.parse(readFileSync(join(root, "index.json"), "utf8")).speaker_attributes;
    if (!Array.isArray(indexes) || indexes.length === 0) throw new Error("speaker_attributes: canonical index declaration required");
    const options = { validator: { $jsonSchema: mongoSchema(source, source) }, validationLevel: "strict", validationAction: "error" };
    const existing = await db.listCollections({ name: COLLECTIONS[0] }, { nameOnly: true }).toArray();
    if (existing.length) await db.command({ collMod: COLLECTIONS[0], ...options });
    else await db.createCollection(COLLECTIONS[0], options);
    for (const { keys, ...spec } of indexes) await db.collection(COLLECTIONS[0]).createIndex(keys, spec);
  },
  async down() {
    throw new Error("Refusing destructive rollback of speaker attribute reviews; use an explicitly reviewed forward migration.");
  },
};

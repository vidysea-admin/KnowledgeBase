// SOURCEONLY — authored for review; never applied by the maker (D-180).
// Owns only registration_link_approvals. No existing collection is touched.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mongoSchema } = require("./20261014200000-knowledge-workflows.cjs");
const COLLECTIONS = ["registration_link_approvals"];

async function assertIsolatedWorkTarget(db) {
  const guardPath = pathToFileURL(join(__dirname, "..", "scripts", "lib", "transcript-provenance.mjs")).href;
  const { requireWorkDatabase } = await import(guardPath);
  const target = requireWorkDatabase(process.env);
  if (db?.databaseName !== target.dbName || target.dbName.toLowerCase() === "lkb_staging") {
    throw new Error("registration_link_approvals: explicit isolated work database required; protected database refused");
  }
}

/** Mongo $jsonSchema has no draft-2020 dependentRequired; its array-form `dependencies` is the equivalent. */
function mongoValidator(source) {
  const { dependentRequired, ...rest } = source;
  const out = mongoSchema(rest, rest);
  if (dependentRequired) out.dependencies = dependentRequired;
  return out;
}

module.exports = {
  COLLECTIONS,
  mongoValidator,
  async up(db) {
    await assertIsolatedWorkTarget(db);
    const root = join(__dirname, "..", "schema");
    const source = JSON.parse(readFileSync(join(root, "registration_link_approvals.schema.json"), "utf8"));
    const indexes = JSON.parse(readFileSync(join(root, "index.json"), "utf8")).registration_link_approvals;
    if (!Array.isArray(indexes) || indexes.length === 0) throw new Error("registration_link_approvals: canonical index declaration required");
    const options = { validator: { $jsonSchema: mongoValidator(source) }, validationLevel: "strict", validationAction: "error" };
    const existing = await db.listCollections({ name: COLLECTIONS[0] }, { nameOnly: true }).toArray();
    if (existing.length) await db.command({ collMod: COLLECTIONS[0], ...options });
    else await db.createCollection(COLLECTIONS[0], options);
    for (const { keys, ...spec } of indexes) await db.collection(COLLECTIONS[0]).createIndex(keys, spec);
  },
  async down() {
    throw new Error("Refusing destructive rollback of registration link approvals; use an explicitly reviewed forward migration.");
  },
};

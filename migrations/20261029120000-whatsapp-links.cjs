// SOURCEONLY — authored for review; never applied by the maker (D-180, D-205/D-206 whatsapp-multiuser W1).
// Owns only whatsapp_links, whatsapp_sync_runs, whatsapp_events. No existing collection is touched.
// Creates the collections with a strict $jsonSchema validator derived from schema/*.schema.json and the
// indexes declared in schema/index.json, including the two unique PARTIAL indexes of R-2:
//   whatsapp_links_live_user       unique (tenantId, userId) where live=true and userId is a string
//   whatsapp_links_archiver_owner  unique (archiverOwnerId) across tenants where it is a string
// Idempotent: an existing collection gets collMod; createIndex with an identical spec is a no-op.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { mongoSchema } = require("./20261014200000-knowledge-workflows.cjs");

const COLLECTIONS = ["whatsapp_links", "whatsapp_sync_runs", "whatsapp_events"];
const ROOT = join(__dirname, "..", "schema");
const read = (name) => JSON.parse(readFileSync(join(ROOT, name), "utf8"));

/** Production Mongo is read-only by construction: refuse anything but an explicit isolated work database. */
async function assertIsolatedWorkTarget(db) {
  const guardPath = pathToFileURL(join(__dirname, "..", "scripts", "lib", "transcript-provenance.mjs")).href;
  const { requireWorkDatabase } = await import(guardPath);
  const target = requireWorkDatabase(process.env);
  if (db?.databaseName !== target.dbName || target.dbName.toLowerCase() === "lkb_staging") {
    throw new Error("whatsapp_links: explicit isolated work database required; protected database refused");
  }
}

/** Mongo's bsonType alias for JSON-schema "boolean" is "bool"; knowledge-workflows' mongoSchema passes "boolean" through, which Mongo rejects. */
function fixBsonAliases(node) {
  if (Array.isArray(node)) return node.map(fixBsonAliases);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "bsonType") out[key] = Array.isArray(value) ? value.map((t) => (t === "boolean" ? "bool" : t)) : value === "boolean" ? "bool" : value;
    else out[key] = fixBsonAliases(value);
  }
  return out;
}

/** Mongo $jsonSchema subset of the canonical draft-2020 schema (formats dropped, const -> enum, boolean -> bool). */
function mongoValidator(source) {
  return fixBsonAliases(mongoSchema(source, source));
}

/** Creates or updates the three collections and their indexes. Guard-free: `up` adds the guard. */
async function applyWhatsappLinks(db) {
  const indexes = read("index.json");
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name));
  for (const name of COLLECTIONS) {
    if (!Array.isArray(indexes[name]) || indexes[name].length === 0) throw new Error(`${name}: canonical index declaration required`);
    const options = { validator: { $jsonSchema: mongoValidator(read(`${name}.schema.json`)) }, validationLevel: "strict", validationAction: "error" };
    if (existing.has(name)) await db.command({ collMod: name, ...options });
    else await db.createCollection(name, options);
    for (const { keys, ...spec } of indexes[name]) await db.collection(name).createIndex(keys, spec);
  }
}

module.exports = {
  COLLECTIONS,
  mongoValidator,
  applyWhatsappLinks,
  async up(db) {
    await assertIsolatedWorkTarget(db);
    await applyWhatsappLinks(db);
  },
  async down() {
    throw new Error("Refusing destructive rollback of WhatsApp links, run records and the audit event log; use an explicitly reviewed forward migration.");
  },
};

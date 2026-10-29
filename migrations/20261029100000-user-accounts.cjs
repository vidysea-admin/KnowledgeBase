// SOURCEONLY - authored for review; never applied to production by the maker (D-206, user-accounts A1).
// Creates the five user-account collections (users, user_sessions, user_tokens, auth_throttles, auth_events) with
// their $jsonSchema validators and the indexes declared in schema/index.json (the only place index changes are made):
// unique emailNormalized (global: one email = one user = one tenant), unique tokenHash on sessions and tokens,
// unique (tenantId, subjectHash) on throttles, and a TTL index on `purgeAt` (expireAfterSeconds 0) on sessions,
// tokens, throttles and events. Active sessions carry no purgeAt, so the TTL never touches them.
// Refuses any database that is not an explicit isolated work database (same guard as 20261017120000), and refuses rollback.
// Idempotent: createCollection is replaced by collMod when the collection exists and createIndex is a no-op for an identical index.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const COLLECTIONS = ["users", "user_sessions", "user_tokens", "auth_throttles", "auth_events"];

async function assertIsolatedWorkTarget(db) {
  const guardPath = pathToFileURL(join(__dirname, "..", "scripts", "lib", "transcript-provenance.mjs")).href;
  const { requireWorkDatabase } = await import(guardPath);
  const target = requireWorkDatabase(process.env);
  if (db?.databaseName !== target.dbName || target.dbName.toLowerCase() === "lkb_staging") {
    throw new Error("user-accounts: explicit isolated work database required; protected database refused");
  }
}

const DROPPED = new Set(["$schema", "$id", "$defs", "title", "description", "format", "default", "tsType"]);
const BSON = { integer: ["int", "long"], number: ["int", "long", "double", "decimal"] };
const bson = (t) => BSON[t] ?? t;

/**
 * JSON Schema (draft 2020-12 subset used by schema/<collection>.schema.json) -> Mongo $jsonSchema. Written here, not shared
 * with 20261014200000's mongoSchema, because that walker rewrites a PROPERTY NAMED "type" as if it were the keyword (the
 * auth_events `type` field then fails additionalProperties). `properties` is therefore walked as a name -> schema map.
 * `x-bsonType` becomes the field's bsonType (TTL indexes act only on BSON Date); annotations Mongo rejects are dropped;
 * `dependentRequired` becomes Mongo's `dependencies`; `const` becomes a one-element enum.
 */
function toMongo(node) {
  if (Array.isArray(node)) return node.map(toMongo);
  if (!node || typeof node !== "object") return node;
  if (typeof node["x-bsonType"] === "string") return { bsonType: node["x-bsonType"] };
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED.has(key)) continue;
    if (key === "properties") out.properties = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, toMongo(sub)]));
    else if (key === "type") out.bsonType = Array.isArray(value) ? value.flatMap((t) => [].concat(bson(t))) : bson(value);
    else if (key === "const") out.enum = [value];
    else if (key === "dependentRequired") out.dependencies = value;
    else out[key] = toMongo(value);
  }
  return out;
}

function validatorFor(name) {
  return toMongo(JSON.parse(readFileSync(join(__dirname, "..", "schema", `${name}.schema.json`), "utf8")));
}

module.exports = {
  COLLECTIONS,
  validatorFor,
  async up(db) {
    await assertIsolatedWorkTarget(db);
    const indexes = JSON.parse(readFileSync(join(__dirname, "..", "schema", "index.json"), "utf8"));
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    for (const name of COLLECTIONS) {
      const options = { validator: { $jsonSchema: validatorFor(name) }, validationLevel: "strict", validationAction: "error" };
      if (existing.has(name)) await db.command({ collMod: name, ...options });
      else await db.createCollection(name, options);
      const declared = indexes[name];
      if (!Array.isArray(declared) || declared.length === 0) throw new Error(`user-accounts: canonical index declaration required for ${name}`);
      for (const { keys, ...spec } of declared) await db.collection(name).createIndex(keys, spec);
    }
  },
  async down() {
    throw new Error("Refusing destructive rollback of user accounts, sessions and the audit log; use an explicitly reviewed forward migration.");
  },
};

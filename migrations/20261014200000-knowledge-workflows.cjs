// Canonical all-forty integration. Source only; never applied during the maker build.
// Runtime services additionally enforce ownership, digests, immutable revisions and CAS.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const COLLECTIONS = ['document_documents', 'knowledge_collections', 'knowledge_outputs',
  'answer_policy_revisions', 'answer_policy_review_items', 'answer_runs',
  'answer_source_conflicts', 'championship_events', 'automation_runs',
  'application_operations', 'operations_schedules'];
const ROOT = join(__dirname, '..', 'schema');
const read = (name) => JSON.parse(readFileSync(join(ROOT, name), 'utf8'));

/** Mongo's $jsonSchema uses a subset of Draft2020; canonical runtime validators retain
 * formats and recursive source proof. No coercion or widening of required/enum bounds. */
function mongoSchema(schema, owner, resolving = new Set()) {
  if (Array.isArray(schema)) return schema.map((value) => mongoSchema(value, owner, resolving));
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/$defs/')) throw new Error('Unsupported external schema reference');
    const name = schema.$ref.slice(8), target = owner.$defs?.[name];
    if (!target) throw new Error('Unresolved canonical schema reference');
    // Recursive tree children retain their object boundary; complete tree/provenance
    // validation remains the existing canonical runtime reader's responsibility.
    if (resolving.has(name)) return { bsonType: 'object' };
    return mongoSchema(target, owner, new Set([...resolving, name]));
  }
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (['$schema', '$id', '$defs', 'title', 'description', 'format', 'default'].includes(key)) continue;
    if (key === 'const') { out.enum = [value]; continue; }
    if (key === 'type') {
      const bson = (type) => type === 'integer' ? ['int', 'long'] : type === 'number' ? ['int', 'long', 'double', 'decimal'] : type;
      out.bsonType = Array.isArray(value) ? value.flatMap(bson) : bson(value);
      continue;
    }
    out[key] = mongoSchema(value, owner, resolving);
  }
  return out;
}
module.exports = {
  COLLECTIONS,
  mongoSchema,
  async up(db) {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name));
    const indexes = read('index.json');
    for (const name of COLLECTIONS) {
      const source = read(`${name}.schema.json`);
      const options = { validator: { $jsonSchema: mongoSchema(source, source) }, validationLevel: 'strict', validationAction: 'error' };
      if (existing.has(name)) await db.command({ collMod: name, ...options });
      else await db.createCollection(name, options);
      for (const { keys, ...spec } of indexes[name] ?? []) await db.collection(name).createIndex(keys, spec);
    }
  },
  async down() {
    throw new Error('Refusing destructive rollback of knowledge, human reviews and audited workflow history; use an explicitly reviewed forward migration.');
  },
};

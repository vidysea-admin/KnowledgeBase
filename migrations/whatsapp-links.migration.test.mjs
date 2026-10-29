// Dry-run + schema acceptance for 20261029120000-whatsapp-links.cjs (whatsapp-multiuser W1).
// Unconditional: schema fixtures through ajv (draft 2020), the Mongo $jsonSchema subset, the work-DB guard.
// Real-Mongo (acceptance 2 and 5): only when WA_REVIEW_TEST_MONGO_URL is set; a throwaway lkb_test_wa_links_* database.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const migration = require("./20261029120000-whatsapp-links.cjs");
// mongodb and ajv are not root dependencies: resolve them from the packages that declare them.
const { MongoClient } = createRequire(new URL("../packages/db/package.json", import.meta.url))("mongodb");
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const Ajv2020 = apiRequire("ajv/dist/2020").default ?? apiRequire("ajv/dist/2020");
const addFormats = apiRequire("ajv-formats").default ?? apiRequire("ajv-formats");

const schemaUrl = (name) => new URL(`../schema/${name}.schema.json`, import.meta.url);
const schemaOf = (name) => JSON.parse(readFileSync(schemaUrl(name), "utf8"));
const fixtureDir = (name) => new URL(`../schema/fixtures/${name}/`, import.meta.url);
const fixture = (name, file) => JSON.parse(readFileSync(new URL(file, fixtureDir(name)), "utf8"));
const validatorFor = (name) => { const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv); return ajv.compile(schemaOf(name)); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const drop = (o, ...ks) => { const c = clone(o); for (const k of ks) delete c[k]; return c; };

test("every valid fixture passes and every invalid fixture fails, per collection", () => {
  for (const name of migration.COLLECTIONS) {
    const validate = validatorFor(name);
    const files = readdirSync(fixtureDir(name));
    assert.ok(files.some((f) => f.startsWith("valid")) && files.some((f) => f.startsWith("invalid")));
    for (const f of files) {
      const ok = validate(fixture(name, f));
      assert.equal(ok, f.startsWith("valid"), `${name}/${f}: ${JSON.stringify(validate.errors?.map((e) => `${e.instancePath} ${e.message}`))}`);
    }
  }
});

test("links: every lifecycle state validates and each acceptance rejection fires for its stated reason", () => {
  const v = validatorFor("whatsapp_links");
  const reasons = (doc) => { v(doc); return (v.errors ?? []).map((e) => `${e.keyword}:${e.instancePath}`); };
  const valid = Object.fromEntries(["", "-approved", "-active", "-suspended", "-rejected", "-unlinked", "-revoked", "-legacy-active"].map((s) => [s, fixture("whatsapp_links", `valid${s}.json`)]));
  assert.deepEqual(new Set(Object.values(valid).map((d) => d.state)), new Set(["requested", "approved", "active", "suspended", "rejected", "unlinked", "revoked"]));
  assert.equal(valid["-legacy-active"].userId, null);
  assert.ok(reasons(drop(valid[""], "tenantId")).includes("required:"), "missing tenantId");
  assert.ok(reasons({ ...valid[""], extra: 1 }).includes("additionalProperties:"), "unknown field");
  assert.ok(reasons({ ...valid["-active"], archiverOwnerId: "6A8D0C692FCC75F0E911B878" }).includes("pattern:/archiverOwnerId"), "owner id must be lowercase 24-hex");
  assert.ok(reasons({ ...valid["-active"], archiverOwnerId: "abc" }).includes("pattern:/archiverOwnerId"));
  assert.ok(reasons(drop(valid["-active"], "approvedBy")).includes("anyOf:"), "active without approvedBy");
  assert.ok(reasons(drop(valid["-active"], "activatedAt")).includes("anyOf:"), "active without activatedAt");
  assert.ok(reasons({ ...valid[""], studentData: "maybe" }).includes("enum:/studentData"), "studentData outside yes|no|unknown");
  for (const sd of ["yes", "no", "unknown"]) assert.equal(v({ ...valid[""], studentData: sd }), true, sd);
  assert.equal(v({ ...valid[""], live: false }), false, "live must agree with state");
});

test("sync runs: closed error codes only; events: R-39 forbidden payload fields are rejected", () => {
  const runs = validatorFor("whatsapp_sync_runs");
  assert.equal(runs({ ...fixture("whatsapp_sync_runs", "valid.json"), errorCode: "connect ECONNREFUSED 10.0.0.5:27017" }), false);
  assert.equal(runs({ ...fixture("whatsapp_sync_runs", "valid.json"), errorCode: "archive_unreachable" }), true);
  const events = validatorFor("whatsapp_events");
  const base = fixture("whatsapp_events", "valid.json");
  for (const field of ["text", "groupSubject", "groupJid", "jid", "phone", "qr", "archiverOwnerId", "name", "displayName", "ownerUserId", "subject"]) {
    assert.equal(events({ ...base, data: { [field]: "x" } }), false, `data.${field}`);
    assert.equal(events({ ...base, [field]: "x" }), false, `top-level ${field}`);
  }
  assert.equal(events({ ...base, data: { reason: "free text with spaces" } }), false);
  assert.equal(events(base), true);
});

test("Mongo validator keeps only $jsonSchema-supported keywords and every required field", () => {
  const ALLOWED = new Set(["bsonType", "properties", "required", "items", "enum", "pattern", "minimum", "minLength", "maxLength", "additionalProperties", "allOf", "anyOf", "not", "uniqueItems"]);
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if (!node || typeof node !== "object") return;
    const inProps = path.endsWith(".properties");
    for (const [k, v] of Object.entries(node)) {
      if (!inProps) assert.ok(ALLOWED.has(k), `${path}.${k} is not a Mongo $jsonSchema keyword`);
      if (!inProps && k === "bsonType") for (const t of [v].flat()) assert.ok(["object", "array", "string", "bool", "null", "int", "long", "double", "decimal"].includes(t), `${path}: bsonType alias ${t} is not valid in Mongo`);
      walk(v, `${path}.${k}`);
    }
  };
  for (const name of migration.COLLECTIONS) {
    const src = schemaOf(name), v = migration.mongoValidator(src);
    assert.deepEqual(v.required, src.required);
    assert.equal(v.additionalProperties, false);
    walk(v, name);
  }
  assert.deepEqual(migration.mongoValidator(schemaOf("whatsapp_links")).properties.userId.bsonType, ["string", "null"]);
});

test("index declarations: the two unique partial indexes of R-2 are present with the right filters", () => {
  const idx = JSON.parse(readFileSync(new URL("../schema/index.json", import.meta.url), "utf8")).whatsapp_links;
  const live = idx.find((i) => i.name === "whatsapp_links_live_user");
  assert.deepEqual(live.keys, { tenantId: 1, userId: 1 });
  assert.equal(live.unique, true);
  assert.deepEqual(live.partialFilterExpression, { live: true, userId: { $type: "string" } });
  const owner = idx.find((i) => i.name === "whatsapp_links_archiver_owner");
  assert.deepEqual(owner.keys, { archiverOwnerId: 1 });
  assert.equal(owner.unique, true);
  assert.deepEqual(owner.partialFilterExpression, { archiverOwnerId: { $type: "string" } });
});

test("up refuses without an explicit isolated work database; down refuses rollback", async () => {
  const saved = { ...process.env };
  try {
    for (const k of ["MONGO_WORK_DB", "MONGODB_DB", "MONGODB_URL"]) delete process.env[k];
    await assert.rejects(migration.up({ databaseName: "lkb_prod" }), /isolated work database|production writes refused/);
    process.env.MONGO_WORK_DB = "lkb_prod"; process.env.MONGODB_URL = "mongodb://127.0.0.1:1";
    await assert.rejects(migration.up({ databaseName: "lkb_prod" }), /production writes refused/);
    process.env.MONGO_WORK_DB = "lkb_test_wa_links_guard";
    await assert.rejects(migration.up({ databaseName: "some_other_db" }), /isolated work database required/);
  } finally { process.env = saved; }
  await assert.rejects(migration.down(), /Refusing destructive rollback/);
});

const url = process.env.WA_REVIEW_TEST_MONGO_URL;
const realOpts = { skip: url ? false : "WA_REVIEW_TEST_MONGO_URL not set (needs a test Mongo)" };
const T = "2026-10-29T10:00:00.000Z";
const OWNER_X = "6a8d0c692fcc75f0e911b878", OWNER_Y = "6a8d0c692fcc75f0e911b879";
const hex = (n) => n.toString(16).padStart(24, "0");
const link = (n, over = {}) => ({ ...fixture("whatsapp_links", "valid.json"), _id: hex(n), ...over });
const activeLink = (n, over = {}) => ({ ...fixture("whatsapp_links", "valid-active.json"), _id: hex(n), archiverOwnerId: OWNER_X, ...over });
const unlinkedLink = (n, over = {}) => ({ ...fixture("whatsapp_links", "valid-unlinked.json"), _id: hex(n), ...over });
const dup = (p) => p.then(() => assert.fail("expected a duplicate-key error"), (e) => assert.equal(e.code, 11000, `${e.code} ${e.message}`));
const invalidDoc = (p) => p.then(() => assert.fail("expected a validator error"), (e) => assert.equal(e.code, 121, `${e.code} ${e.message}`));

test("real Mongo: migration applies, re-applies idempotently, enforces the validator and the unique partial indexes", realOpts, async () => {
  const name = `lkb_test_wa_links_${Date.now()}`;
  assert.match(name, /^lkb_test_wa_links_\d+$/u);
  const client = await new MongoClient(url).connect();
  try {
    const db = client.db(name);
    await migration.applyWhatsappLinks(db);
    const snapshot = async () => Object.fromEntries(await Promise.all(migration.COLLECTIONS.map(async (c) => [c, (await db.collection(c).indexes()).map((i) => i.name).sort()])));
    const first = await snapshot();
    assert.ok(first.whatsapp_links.includes("whatsapp_links_live_user") && first.whatsapp_links.includes("whatsapp_links_archiver_owner"));
    await migration.applyWhatsappLinks(db);
    assert.deepEqual(await snapshot(), first, "re-apply changes nothing");
    const infos = await db.listCollections({}, { nameOnly: false }).toArray();
    for (const c of migration.COLLECTIONS) assert.equal(infos.find((i) => i.name === c).options.validationAction, "error");

    const links = db.collection("whatsapp_links");
    // R-2: one non-terminal link per (tenantId, userId)
    await links.insertOne(link(1));
    await dup(links.insertOne(link(2)));
    await dup(links.insertOne(link(3, { state: "approved", approvedBy: "admin-1", approvedAt: T })));
    await links.insertOne(link(4, { tenantId: "other" })); // same person id in another tenant is fine
    // a terminal link does not block a new one, and a new request after unlink is allowed
    await links.replaceOne({ _id: hex(1) }, unlinkedLink(1, { archiverOwnerId: "6a8d0c692fcc75f0e911b8e0" }));
    await links.insertOne(link(5));
    await dup(links.insertOne(link(6)));
    // archiverOwnerId unique across tenants and states, including terminal rows (never reused)
    await links.insertOne(activeLink(10, { userId: "user-10" }));
    await dup(links.insertOne(activeLink(11, { userId: "user-11", tenantId: "other" })));
    await links.insertOne(unlinkedLink(12, { userId: "user-12", archiverOwnerId: OWNER_Y }));
    await dup(links.insertOne(activeLink(13, { userId: "user-13", archiverOwnerId: OWNER_Y })));
    // legacy links (userId null): several per tenant allowed, unique per owner
    const legacy = (n, owner) => ({ ...fixture("whatsapp_links", "valid-legacy-active.json"), _id: hex(n), archiverOwnerId: owner });
    await links.insertOne(legacy(20, "6a8d0c692fcc75f0e911b8c1"));
    await links.insertOne(legacy(21, "6a8d0c692fcc75f0e911b8c2"));
    await dup(links.insertOne(legacy(22, "6a8d0c692fcc75f0e911b8c1")));

    // validator: invalid documents are refused by Mongo itself
    await invalidDoc(links.insertOne(drop(activeLink(30, { userId: "u30", archiverOwnerId: "6a8d0c692fcc75f0e911b8d0" }), "activatedAt")));
    await invalidDoc(links.insertOne(link(31, { userId: "u31", unexpected: true })));
    await invalidDoc(links.insertOne(link(32, { userId: "u32", studentData: "maybe" })));
    await invalidDoc(links.insertOne(link(33, { userId: "u33", live: false })));
    await invalidDoc(links.insertOne(drop(link(34, { userId: "u34" }), "tenantId")));
    await invalidDoc(links.insertOne(link(35, { userId: "u35", archiverOwnerId: "not-hex" })));
    const events = db.collection("whatsapp_events");
    await events.insertOne({ ...fixture("whatsapp_events", "valid.json"), _id: hex(40) });
    await invalidDoc(events.insertOne({ ...fixture("whatsapp_events", "valid.json"), _id: hex(41), data: { text: "Scholarship closes Friday." } }));
    await invalidDoc(events.insertOne({ ...fixture("whatsapp_events", "valid.json"), _id: hex(42), data: { archiverOwnerId: OWNER_X } }));
    const runs = db.collection("whatsapp_sync_runs");
    await runs.insertOne({ ...fixture("whatsapp_sync_runs", "valid.json"), _id: hex(50) });
    await invalidDoc(runs.insertOne({ ...fixture("whatsapp_sync_runs", "valid.json"), _id: hex(51), errorCode: "connect ECONNREFUSED 10.0.0.5" }));
    // every valid fixture is accepted by Mongo (alone: the fixtures share users and owners)
    for (const f of readdirSync(fixtureDir("whatsapp_links")).filter((x) => x.startsWith("valid"))) {
      await links.deleteMany({});
      await links.insertOne(fixture("whatsapp_links", f));
    }
  } finally { await client.db(name).dropDatabase(); await client.close(); }
});

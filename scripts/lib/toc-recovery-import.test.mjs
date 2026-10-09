import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync, readFileSync, writeFileSync} from "node:fs";
import {join, resolve, dirname} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {buildTree} from "../../packages/index/src/tree/build.ts";
import {scopedCollection} from "../../packages/db/src/lib/tenantScope.ts";
import {readRecoveryInputs, buildRecoveryPacket, writeRecoveryPacket, readRecoveryPacket} from "./toc-recovery.mjs";
import {importRecoveryPacket, requireRecoveryDatabase, RECOVERY_COLLECTIONS} from "./toc-recovery-import.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../.."), CORPUS = join(ROOT, "data/toc-migrated");
const source = readRecoveryInputs(CORPUS, join(ROOT, "data/eval/extraction-reconciliation-reviewed.json"), join(ROOT, "data/eval/extraction-corpus.json"));
const temporary = mkdtempSync(join(tmpdir(), "lkb-recovery-import-")), directory = join(temporary, "packet");
writeRecoveryPacket(buildRecoveryPacket(source, buildTree), directory, CORPUS);
const packet = readRecoveryPacket(directory, source, buildTree);
test.after(() => rmSync(temporary, {recursive: true, force: true}));
function fakeDb({nonempty, failName, partial = false, receiptFailure = false} = {}) {
  const rows = Object.fromEntries(RECOVERY_COLLECTIONS.map(name => [name, []])), rawCounts = [], inserts = [], receipts = [];
  const db = {databaseName: "lkb_work_recovery_test", collection(name) {
    assert.ok(RECOVERY_COLLECTIONS.includes(name));
    return {
      async countDocuments(filter) {
        if (!Object.hasOwn(filter, "tenantId")) {rawCounts.push({name, filter}); return name === nonempty ? 1 : rows[name].length;}
        assert.equal(filter.tenantId, "toc"); return rows[name].filter(d => d.tenantId === filter.tenantId).length;
      },
      async insertMany(batch) {
        assert.ok(batch.every(d => d.tenantId === "toc")); inserts.push({name, batch});
        if (name === failName) {if (partial) rows[name].push(...batch.slice(0, 2)); throw new Error("test DB failure");}
        rows[name].push(...batch); return {insertedCount: batch.length};
      },
    };
  }};
  const record = receipt => {receipts.push(receipt); if (receiptFailure && receipt.status === "writing") throw new Error("receipt failure");};
  const deps = {db, dbName: db.databaseName, scoped: scopedCollection, record};
  return {deps, rows, rawCounts, inserts, receipts};
}
test("requires exact loopback isolated DB config, refuses absent/prod/foreign URL", () => {
  const env = {MONGODB_URL: "mongodb://127.0.0.1:27019", MONGO_WORK_DB: "lkb_work_test"};
  assert.deepEqual(requireRecoveryDatabase(env), {url: env.MONGODB_URL, dbName: env.MONGO_WORK_DB});
  for (const bad of [{}, {...env, MONGO_WORK_DB: "lkb"}, {...env, MONGODB_DB: "other"},
    {...env, MONGODB_URL: "mongodb://example.com:27019"}, {...env, MONGODB_URL: "mongodb://127.0.0.1:27017"},
    {...env, MONGODB_URL: "mongodb://user:password@127.0.0.1:27019"}, {...env, MONGODB_URL: `${env.MONGODB_URL}/other`}]) {
    assert.throws(() => requireRecoveryDatabase(bad));
  }
});
test("reject unverified/foreign/forged snapshots and wrong DB handle before writes", async () => {
  const fake = fakeDb();
  await assert.rejects(importRecoveryPacket(structuredClone(packet), fake.deps), /verified recovery snapshot/);
  await assert.rejects(importRecoveryPacket({...packet, manifest: {...packet.manifest, tenantId: "foreign"}}, fake.deps), /verified recovery snapshot/);
  await assert.rejects(importRecoveryPacket(packet, {...fake.deps, dbName: "other"}), /isolated DB/);
  assert.equal(fake.inserts.length, 0); assert.equal(fake.rawCounts.length, 0);
});
for (const name of RECOVERY_COLLECTIONS) test(`all-scope preflight: refuse existing ${name} including foreign data with zero writes`, async () => {
  const fake = fakeDb({nonempty: name});
  await assert.rejects(importRecoveryPacket(packet, fake.deps), /destination knowledge not empty/);
  assert.equal(fake.inserts.length, 0); assert.equal(fake.receipts.at(-1).status, "refused-before-writes");
  assert.equal(fake.receipts.at(-1).failure.includes(name), false);
  assert.ok(fake.rawCounts.every(call => Object.keys(call.filter).length === 0));
});
test("all seven collections pass preflight before first scoped insertion; receipt honest about pending vectors", async () => {
  const fake = fakeDb(); const result = await importRecoveryPacket(packet, fake.deps);
  assert.deepEqual(fake.rawCounts.map(c => c.name), RECOVERY_COLLECTIONS);
  assert.equal(result.status, "inserted-source-recovery"); assert.equal(result.strictIndexAcceptance, false);
  assert.equal(result.semanticAcceptance, false); assert.deepEqual(result.confirmedCounts, packet.manifest.counts);
  assert.ok(fake.inserts.every(({batch}) => batch.every(d => d.tenantId === "toc")));
  assert.equal(fake.rows.sessions.length, 29); assert.equal(fake.rows.turns.length, 3424);
  assert.equal(fake.rows.claims.length, 7); assert.equal(fake.rows.tree_index[0].node_id, "tenant:toc");
  assert.ok(fake.rows.claims.every(c => c.status === "needs-review"));
  assert.ok(fake.rows.sessions.every(s => s.status.index === "pending"));
});
test("packet file replacement after preflight cannot change inserted source snapshot", async () => {
  const fake = fakeDb(), id = packet.manifest.originalSessionIds[0], path = join(directory, `sessions/${id}/turns.json`);
  const original = readFileSync(path);
  try {
    await importRecoveryPacket(packet, {...fake.deps, beforeWrites: () => {
      const rows = JSON.parse(original); rows[0].text = "poison after preflight"; writeFileSync(path, JSON.stringify(rows));
    }});
    assert.equal(fake.rows.turns[0].text, packet.documents.turns[0].text);
    assert.equal(fake.rows.turns.some(t => t.text === "poison after preflight"), false);
  } finally {writeFileSync(path, original);}
});
test("partial batch failure records confirmed versus observed rows, refuses retry, preserves insert-only behavior", async () => {
  const fake = fakeDb({failName: "turns", partial: true});
  await assert.rejects(importRecoveryPacket(packet, fake.deps), /test DB failure/);
  const receipt = fake.receipts.at(-1);
  assert.equal(receipt.status, "failed-after-preflight-may-be-partial");
  assert.equal(receipt.confirmedCounts.sources, 29); assert.equal(receipt.confirmedCounts.turns, 0);
  assert.equal(receipt.observedCounts.turns, 2); assert.equal(receipt.observedCounts.sources, 29);
  const priorInsertCount = fake.inserts.length;
  await assert.rejects(importRecoveryPacket(packet, fake.deps), /destination knowledge not empty/);
  assert.equal(fake.inserts.length, priorInsertCount); assert.equal(fake.rows.turns.length, 2);
});
test("durable receipt failure after successful preflight still causes zero knowledge writes", async () => {
  const fake = fakeDb({receiptFailure: true});
  await assert.rejects(importRecoveryPacket(packet, fake.deps), /receipt failure/);
  assert.equal(fake.inserts.length, 0); assert.equal(fake.receipts.at(-1).status, "failed-after-preflight-may-be-partial");
});

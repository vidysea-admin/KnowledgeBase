// migrations/20261012150000-tenant-scoped-source-ids.cjs - D-136 (pending append), ISS-T045TENANTID-001.
// Every ingest adapter now stores sources._id as tenantSourceId(tenantId, contentHash) =
// `${encodeURIComponent(tenantId)}:${contentHash}` (packages/ingest/src/source.ts; the bare hash stays in `hash`).
// This rewrites rows written before that change, whose _id is the bare content hash, and every reference to them:
//   sources._id              old -> new   (insert-new + delete-old; _id is immutable)
//   sessions.sourceId        old -> new
//   gaps.sourceRef           old -> new   (schema/gaps: "link to the sources/_id")
//   media.sourceRef          old -> new
//   media._id                `${old}-media` -> `${new}-media`
//
// Which rows: only `_id === hash` where hash is a 64-hex SHA-256 (a content hash). Rows with other id shapes
// (`gdrive-*`, `<session>-src`, already-scoped ids) are not content-hash ids and are left alone.
// Tenant: taken from the row's own stored tenantId. A row with no usable tenantId is REPORTED and never guessed or touched.
//
// Idempotent / re-runnable and crash-safe: the old source doc is journaled (collection `source_id_migration_journal`)
// BEFORE anything changes, so a crash between "delete old" and "insert new" is repaired on the next run. Every
// step is a filtered updateMany / upsert that is a no-op once applied.
// Run order is pinned by the migration changelog; it is NEVER run against a live DB by the lane that wrote it.
//
// down(): restores the old bare ids from the journal (only rows this migration moved). The application reads both
// forms, so rolling back is safe for reads; it does reintroduce the cross-tenant collision hazard for those rows.
const { createHash } = require("crypto");

const JOURNAL = "source_id_migration_journal";
const SHA256_HEX = /^[0-9a-f]{64}$/;
// ISS-TENANTSRCID-003: collections are walked in _id-ordered pages of this many rows, never loaded whole, so memory
// stays bounded on a large `sources` / journal. Rows are string-id only here (non-string ids are never touched).
const BATCH_SIZE = 500;

// Yields rows of `coll` matching `filter` one bounded page at a time, ordered and resumed by _id. Resuming by _id (not by
// a live cursor) is safe while the loop deletes/inserts rows: a moved row's new _id is never the content hash, and a
// row whose state changed is simply not re-matched by the filter or already behind the resume point.
async function* pages(coll, filter, size) {
  let last;
  for (;;) {
    const idFilter = last === undefined ? { $type: "string" } : { $type: "string", $gt: last };
    const batch = await coll.find({ ...filter, _id: idFilter }).sort({ _id: 1 }).limit(size).toArray();
    if (batch.length === 0) return;
    yield* batch;
    last = batch[batch.length - 1]._id;
    if (batch.length < size) return;
  }
}

// Must stay identical to tenantSourceId() in packages/ingest/src/source.ts (the migration test asserts equality).
function tenantSourceId(tenantId, contentHash) {
  return `${encodeURIComponent(tenantId)}:${contentHash}`;
}
const journalKey = (tenantId, oldId) => createHash("sha256").update(`${tenantId}\u0000${oldId}`).digest("hex");

async function moveSourceId(db, tenantId, fromId, toId, doc, counts) {
  const media = db.collection("media");
  const sources = db.collection("sources");
  const reference = (collection, field) =>
    db.collection(collection).updateMany({ tenantId, [field]: fromId }, { $set: { [field]: toId } });
  await reference("sessions", "sourceId");
  await reference("gaps", "sourceRef");
  await reference("media", "sourceRef");
  for (const m of await media.find({ tenantId, _id: `${fromId}-media` }).toArray()) {
    await media.replaceOne({ _id: `${toId}-media`, tenantId }, { ...m, _id: `${toId}-media`, sourceRef: toId }, { upsert: true });
    await media.deleteOne({ _id: m._id, tenantId });
    counts.media += 1;
  }
  // _id is immutable and the unique {tenantId, hash} index forbids both rows at once: delete old, then insert new.
  await sources.deleteOne({ _id: fromId, tenantId });
  await sources.replaceOne({ _id: toId, tenantId }, { ...doc, _id: toId }, { upsert: true });
}

async function migrate(db, log, { batchSize = BATCH_SIZE } = {}) {
  const sources = db.collection("sources");
  const journal = db.collection(JOURNAL);
  const report = { migrated: 0, untenanted: [], skippedNonContentHash: 0, recovered: 0, media: 0 };

  // Recovery: a previous run journaled a row and died before the new row existed.
  for await (const j of pages(journal, { state: "pending" }, batchSize)) {
    const present = await sources.find({ _id: j.newId, tenantId: j.tenantId }).toArray();
    const counts = { media: 0 };
    if (present.length === 0) {
      await moveSourceId(db, j.tenantId, j.oldId, j.newId, j.doc, counts);
      report.recovered += 1;
    } else {
      await sources.deleteOne({ _id: j.oldId, tenantId: j.tenantId }); // new exists; drop a stray old twin if any
      await moveSourceId(db, j.tenantId, j.oldId, j.newId, present[0], counts);
    }
    report.media += counts.media;
    await journal.updateOne({ _id: j._id }, { $set: { state: "done" } });
  }

  for await (const row of pages(sources, {}, batchSize)) {
    if (typeof row._id !== "string" || row._id !== row.hash || !SHA256_HEX.test(row.hash)) {
      if (typeof row._id === "string" && row._id.length && !String(row._id).includes(":")) report.skippedNonContentHash += 1;
      continue;
    }
    if (typeof row.tenantId !== "string" || row.tenantId.length === 0) {
      report.untenanted.push(row._id);
      log(`tenant-scoped-source-ids: sources _id=${row._id} has no tenantId - NOT migrated (will not guess a tenant)`);
      continue;
    }
    const newId = tenantSourceId(row.tenantId, row.hash);
    const key = journalKey(row.tenantId, row._id);
    await journal.replaceOne(
      { _id: key },
      { _id: key, tenantId: row.tenantId, oldId: row._id, newId, doc: row, state: "pending", at: new Date().toISOString() },
      { upsert: true },
    );
    const counts = { media: 0 };
    await moveSourceId(db, row.tenantId, row._id, newId, row, counts);
    report.media += counts.media;
    await journal.updateOne({ _id: key }, { $set: { state: "done" } });
    report.migrated += 1;
  }
  if (report.untenanted.length > 0) log(`tenant-scoped-source-ids: ${report.untenanted.length} untenanted source row(s) left unmigrated: ${report.untenanted.join(", ")}`);
  return report;
}

async function down(db, { batchSize = BATCH_SIZE } = {}) {
  const sources = db.collection("sources");
  const journal = db.collection(JOURNAL);
  const counts = { media: 0 };
  let restored = 0;
  for await (const j of pages(journal, { state: "done" }, batchSize)) {
    const current = await sources.find({ _id: j.newId, tenantId: j.tenantId }).toArray();
    if (current.length === 0) continue; // already rolled back
    await moveSourceId(db, j.tenantId, j.newId, j.oldId, current[0], counts);
    await journal.updateOne({ _id: j._id }, { $set: { state: "rolled-back" } });
    restored += 1;
  }
  return { restored, media: counts.media };
}

async function up(db) {
  return migrate(db, console.warn); // migrate-mongo passes (db, client): never take a second argument from it
}
async function downEntry(db) {
  return down(db); // same: migrate-mongo's second argument is not options
}

module.exports = { up, down: downEntry, migrate, migrateDown: down, tenantSourceId, BATCH_SIZE };

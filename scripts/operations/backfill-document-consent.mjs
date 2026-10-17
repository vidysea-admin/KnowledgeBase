#!/usr/bin/env node
/**
 * scripts/operations/backfill-document-consent.mjs -- D-181 / ISS-T055STORE-001.
 *
 * Legacy imported documents have no `sources` row, so the highlights/page routes (collections-store sourceWithdrawn)
 * find no consent row and serve them. The Approver ruled that consent for all legacy imports was already obtained, so
 * this inserts ONE consent-given `sources` row per document whose `sourceId` has none, using the same lookup the route
 * check uses: sources.findOne({_id: sourceId}) scoped to the tenant.
 *
 * Usage: node scripts/operations/backfill-document-consent.mjs --tenant <id> [--tenant <id>...]
 *          [--execute --confirm-backfill D-181]
 *   Dry-run by default: prints counts and ids only (no titles, no text). Writes need BOTH flags.
 *   Database: MONGODB_DB must be exactly lkb_staging (plus the repo's staging opt-in env, see requireScriptDatabase).
 *   Anything else, including production, is refused before connecting; no production flag exists.
 * Rows are only ever inserted. An existing sources row (given, withdrawn, revoked, any state) is never modified.
 * Sessions: a session without a sources row is already hidden (visibility/knowledge.ts context()), so there is no
 * fail-open gap to close; they are counted in the report only and never written.
 */
import { pathToFileURL } from "node:url";

export const DECISION = "D-181";
export const RECORDED_BY = "owner-attestation:D-181";
export const STAGING_DB = "lkb_staging";
const KINDS = { pdf: "document", docx: "document" };

export function assertStagingDb(name) {
  if (name !== STAGING_DB) throw new Error(`backfill-document-consent: database must be exactly ${STAGING_DB}; refused (production is not authorized, D-117/D-181)`);
}

export function parseArgs(argv) {
  const out = { execute: false, confirm: null, tenants: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") out.execute = true;
    else if (a === "--confirm-backfill") out.confirm = argv[++i] ?? null;
    else if (a === "--tenant") { const t = argv[++i]; if (!t || t.startsWith("--")) throw new Error("--tenant needs a value"); out.tenants.push(t); }
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.tenants.length) throw new Error("at least one --tenant <id> is required (no unscoped runs)");
  if (out.execute && out.confirm !== DECISION) throw new Error(`writes need --execute --confirm-backfill ${DECISION}`);
  if (!out.execute && out.confirm !== null) throw new Error("--confirm-backfill is only meaningful with --execute");
  return out;
}

const isoOk = v => typeof v === "string" && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d\d-\d\dT/.test(v);

/** Row shape per schema/sources.schema.json. kind/captureMode derive from the document; no path or url is ever written. */
export function buildSourceRow(doc, at) {
  const kind = KINDS[doc.format];
  if (!kind || typeof doc.version !== "string" || doc.version.length < 8) return null;
  return {
    _id: doc.sourceId, kind, captureMode: "provided", hash: doc.version,
    consent: { given: true, recordedBy: RECORDED_BY, note: "Legacy import; owner attested consent was already obtained (D-181)." },
    createdAt: isoOk(doc.createdAt) ? doc.createdAt : at,
    backfill: { decision: DECISION, at },
  };
}

/** One tenant. `db` must be a connected lkb_staging Db; every collection handle is tenant-scoped via scopedCollection. */
export async function backfillDocumentConsent({ db, scopedCollection, tenantId, execute = false, now = () => new Date().toISOString() }) {
  assertStagingDb(db.databaseName);
  const docs = scopedCollection(db, "document_documents")(tenantId), sessions = scopedCollection(db, "sessions")(tenantId);
  const sources = scopedCollection(db, "sources")(tenantId);
  const at = now(), r = { tenantId, execute, documents: 0, documentsWithSource: 0, unusable: 0, raced: 0, inserted: 0,
    sessions: 0, sessionsWithoutSource: 0, missingDocumentIds: [], insertedIds: [], unusableIds: [] };
  const hasRow = async sourceId => { const row = await sources.findOne({ _id: sourceId }); return Boolean(row && row.tenantId === tenantId); };
  const plan = new Map();
  for (const doc of await docs.find({}).toArray()) {
    if (doc.tenantId !== tenantId) continue;
    r.documents++;
    if (typeof doc.sourceId !== "string" || !doc.sourceId) { r.unusable++; r.unusableIds.push(String(doc._id)); continue; }
    if (await hasRow(doc.sourceId)) { r.documentsWithSource++; continue; }
    const row = buildSourceRow(doc, at);
    if (!row) { r.unusable++; r.unusableIds.push(String(doc._id)); continue; }
    r.missingDocumentIds.push(String(doc._id));
    if (!plan.has(doc.sourceId)) plan.set(doc.sourceId, row);
  }
  for (const s of await sessions.find({}).toArray()) {
    if (s.tenantId !== tenantId) continue;
    r.sessions++;
    if (typeof s.sourceId !== "string" || !s.sourceId || !(await hasRow(s.sourceId))) r.sessionsWithoutSource++;
  }
  if (!execute) return r;
  for (const [id, row] of plan) {
    try { await sources.insertOne(row); r.inserted++; r.insertedIds.push(id); }
    catch (e) { if (e?.code === 11000) r.raced++; else throw e; }
  }
  return r;
}

export function format(r) {
  const head = `${r.execute ? "EXECUTE" : "DRY-RUN"} tenant=${r.tenantId}`;
  return [head, `  document_documents: total=${r.documents} withSourceRow=${r.documentsWithSource} missingSourceRow=${r.missingDocumentIds.length} unusable=${r.unusable}`,
    `  sessions: total=${r.sessions} withoutSourceRow=${r.sessionsWithoutSource} (report only, never written; already fail-closed)`,
    `  sources: ${r.execute ? `inserted=${r.inserted} raced=${r.raced}` : `wouldInsert=${new Set(r.missingDocumentIds).size}`}`,
    `  missingDocumentIds: ${r.missingDocumentIds.join(",") || "-"}`, `  unusableIds: ${r.unusableIds.join(",") || "-"}`].join("\n");
}

export async function main(argv, env, io = {}) {
  const out = io.out ?? console.log;
  const args = parseArgs(argv);
  assertStagingDb(env.MONGODB_DB?.trim());
  const { requireScriptDatabase } = await import("../lib/transcript-provenance.mjs");
  const target = requireScriptDatabase(env, argv, { allowProduction: false });
  assertStagingDb(target.dbName);
  const { connect, getDb, close, scopedCollection } = await io.loadDb();
  await connect(target.url, target.dbName);
  try {
    const db = getDb();
    for (const tenantId of args.tenants) out(format(await backfillDocumentConsent({ db, scopedCollection, tenantId, execute: args.execute })));
  } finally { await close?.(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const { register } = await import("tsx/esm/api");
  register();
  const { loadSharedDb } = await import("../lib/shared-db.mjs");
  try { await main(process.argv.slice(2), process.env, { loadDb: loadSharedDb }); }
  catch (e) { console.error(`backfill-document-consent: ${e.message}`); process.exit(1); }
}

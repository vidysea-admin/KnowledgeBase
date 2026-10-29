#!/usr/bin/env node
import { isProtectedWorkDbName, bindDerivedArtifacts, requireScriptDatabase, PRODUCTION_FLAG } from "../lib/transcript-provenance.mjs";
import { resolveWorkDb } from "../watch/test-data-route.mjs";
/**
 * scripts/webinar/sync-session.mjs (moved from scripts/sync-webinar-session.mjs 2026-09-24, ISS-285) - pushes ONE webinar
 * session into Mongo and builds its knowledge-graph edges (D-027). Inputs: data/toc-migrated/<id>/{source.json, turns.json,
 * meta.json}; meta.json is the hand-checked people/org/country/topic list. Writes, tenant-scoped via the packages/db accessors:
 *   sources · sessions · turns (speakerRef -> personId, speakerLabel, occurredAt) · speakers · orgs · topics · graph_edges
 * Graph edges are DETERMINISTIC (no LLM); each carries evidence[] (turn ids + timestamps; H3 "no fact without provenance"), sessionRef,
 * date and confidence. Edge types: person-spoke_in-session · person-represents-org · org-located_in-country · org-partner_of-org ·
 * session-covers-country/topic · person-discussed-topic/country · session-held_on-date · date-in_month-month · user-captured-session.
 * Re-running replaces this session's turns and edges only, as a generation swap (ISS-291, session-rows.mjs): new rows are upserted
 * first and the old generation deleted only after every write succeeded. (The Mongo is standalone - no transactions.)
 *
 * --emit-files (ISS-294): writes session.json / session_page.json / claims.json into the session dir, derived from meta/source/turns.
 * --index (ISS-296): after the sync, runs the SAME `indexSession` every live-ingested session goes through (apps/api/src/indexing/session.ts,
 *   bound by production.ts's `buildIndexer`): LLM summary -> session_pages, claims, lexical chunks, tree_index, entity promotion,
 *   status.index -> done. With --dry-run it prints the plan and connects to nothing.
 * Migrated provided documents (D-207): a source.json without `title` is accepted only when session.json states the matching title/date
 *   (session-rows.mjs providedSessionRow); such a session has no capture artifacts, so --index writes no index-proof/retention files.
 * --index-existing --tenant <t> (D-207): index a session whose rows ALREADY exist in the target database (e.g. a live capture with no local
 *   directory). Reads the rows, runs the same buildIndexer, never creates/replaces session, source or turn rows. Same guard, same opt-in.
 * An index failure's reason is persisted on the session row as `indexFailure` (indexAttempt is a closed schema); cleared on success.
 *
 * Production (D-204): lkb_prod is refused unless ALL THREE hold - this script passes allowProduction to requireScriptDatabase, argv carries
 *   --i-know-this-is-production, and MONGODB_DB=lkb_prod (with MONGO_WORK_DB=lkb_prod). Any part missing keeps the
 *   isProtectedWorkDbName refusal unchanged. The production path logs one "PRODUCTION WRITE ENABLED (D-204)" line.
 *
 * Usage: node scripts/webinar/sync-session.mjs <sessionId> [--dry-run] [--emit-files] [--index] [--grounded-notes]
 *        node scripts/webinar/sync-session.mjs <sessionId> --index-existing --tenant <tenantId> [--dry-run] [--grounded-notes]
 * --grounded-notes (T-040, D-162): with --index, also writes grounded notes and Q&A (every item cited to a verified
 *   quote in a real turn, judge + rules, ungrounded items dropped). OFF by default; KB_GROUNDED_NOTES=1 does the same.
 *   Existing verified claims are preserved on re-run; see apps/api/src/indexing/grounded-write.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import "dotenv/config";
import { register } from "tsx/esm/api";
import { replaceSessionRows, buildSessionFiles, loadWebinarSession, assertIndexComplete, recordIndexFailure, clearIndexFailure, indexExistingInDb, productionIndexer } from "./session-rows.mjs";
import { enrichSlideKnowledgeTurns } from './slides/slide-knowledge.mjs';
import { prepareWebinarIndexProof } from './index-proof.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sessionId = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");
const EMIT_FILES = process.argv.includes("--emit-files");
const INDEX_EXISTING = process.argv.includes("--index-existing"); // D-207: index rows already in the target DB, no local session dir
const tenantFlag = process.argv.indexOf("--tenant"), TENANT = tenantFlag > 2 ? process.argv[tenantFlag + 1] : undefined;
const INDEX = INDEX_EXISTING || process.argv.includes("--index");
const GROUNDED_NOTES = process.argv.includes("--grounded-notes");
if (!sessionId || (INDEX_EXISTING && (EMIT_FILES || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(TENANT ?? "")))) {
  console.error("usage: node scripts/webinar/sync-session.mjs <sessionId> [--dry-run] [--emit-files] [--index] [--grounded-notes]\n" +
    "       node scripts/webinar/sync-session.mjs <sessionId> --index-existing --tenant <tenantId> [--dry-run] [--grounded-notes]");
  process.exit(1);
}

/** The D-204 database guard, shared by the sync path and --index-existing so both honour exactly one opt-in. Nothing below may run when it throws. */
function guardDatabase(testData) {
  // Test-data routing (2026-10-14): a source tagged testData:true goes to lkb_staging only (scripts/watch/test-data-route.mjs).
  const route = resolveWorkDb({ testData, workDb: process.env.MONGO_WORK_DB?.trim(), env: process.env });
  const workDb = route.workDb;
  let target;
  if (route.testData) console.log(`  testData source: routed to ${workDb}${route.rerouted ? " (not the configured work database)" : ""}`);
  // D-204: the three-part production opt-in (same shape as mint-key.mjs). A testData source already routed to lkb_staging above, so it never matches.
  const productionOptIn = process.argv.includes(PRODUCTION_FLAG) && workDb === "lkb_prod" && process.env.MONGODB_DB?.trim() === "lkb_prod";
  if (productionOptIn) {
    target = requireScriptDatabase(process.env, process.argv.slice(2), { allowProduction: true });
    console.log(`  PRODUCTION WRITE ENABLED (D-204): target database ${target.dbName} (${PRODUCTION_FLAG} + MONGODB_DB=lkb_prod + MONGO_WORK_DB=lkb_prod)`);
  } else {
    if (isProtectedWorkDbName(workDb, process.env)) throw new Error("MONGO_WORK_DB must name an isolated work database; production writes refused");
    // ISS-LEGACYSEED-007: no localhost URL fallback. A missing/blank MONGODB_URL, or a MONGODB_DB that disagrees with the
    // resolved work database, refuses here, before any retention state or Mongo connection.
    const guardEnv = { ...process.env, MONGO_WORK_DB: workDb, MONGODB_DB: route.rerouted ? undefined : process.env.MONGODB_DB };
    if (workDb !== "lkb_staging") delete guardEnv.LKB_ALLOW_STAGING;
    target = requireScriptDatabase(guardEnv, process.argv.slice(2));
  }
  return { workDb, target };
}

if (INDEX_EXISTING) {
  console.log(`session ${sessionId} (tenant ${TENANT}) --index-existing: indexes the rows already in the target database; no session, source or turn row is created or replaced`);
  if (DRY_RUN) {
    console.log("  index plan: verify session/source/turns exist; summarize + claims (LLM, routed per config/ai-routing.yaml); lexical chunks; tree_index; entity promotion; status.index -> done");
    console.log("No Mongo connection attempted (--dry-run).");
    process.exit(0);
  }
  const { workDb, target } = guardDatabase(undefined);
  register();
  console.log(`  indexed: ${JSON.stringify((await indexExistingInDb({ target, workDb, tenantId: TENANT, sessionId, root: ROOT, groundedNotes: GROUNDED_NOTES })).completion)}`);
  process.exit(0);
}
const dir = join(ROOT, "data", "toc-migrated", sessionId);
const { source, rawTurns, meta, screenEvidence, notes, legacyProvided } = loadWebinarSession(dir, sessionId);
// A migrated provided document (D-207) has no capture artifacts (no validation.json, no raw media): no index-proof / retention files.
const localState = INDEX && !legacyProvided;
const finalizeIndexProof = localState && !DRY_RUN ? prepareWebinarIndexProof({ dir, sessionId, tenantId: meta.tenantId,
  inputArtifact: screenEvidence ? 'knowledge-turns.json' : 'turns.json', selectedTurns: rawTurns, retrievalMode: 'vectorless' }) : undefined;
const tenantId = meta.tenantId;
const t0 = new Date(meta.t0).getTime();

// ---- turns: stable person ids, readable labels, absolute timestamps -------------------------
const turns = enrichSlideKnowledgeTurns(rawTurns, { sessionId, people: meta.people, t0 });

// ---- graph edges ---------------------------------------------------------------------------
const edges = new Map();
const slug = (s) => s.replace(/[^a-zA-Z0-9:._-]+/g, "-");
function addEdge(from, type, to, turn, extra = {}) {
  const _id = `${tenantId}-edge:${slug(sessionId)}|${slug(from)}|${type}|${slug(to)}`;
  let e = edges.get(_id);
  if (!e) {
    e = { _id, from, to, type, weight: 0, sessionRef: sessionId, date: meta.date, evidence: [], ...extra };
    edges.set(_id, e);
  }
  e.weight += 1;
  if (turn && e.evidence.length < 5) e.evidence.push({ turnId: turn._id, tStart: turn.tStart, occurredAt: turn.occurredAt });
  return e;
}
const sessionNode = `session:${sessionId}`;
const dateNode = `date:${meta.date}`;
addEdge(sessionNode, "held_on", dateNode, null, { confidence: 1 });
addEdge(dateNode, "in_month", `month:${meta.date.slice(0, 7)}`, null, { confidence: 1 });
if (meta.capturedBy.id) addEdge(meta.capturedBy.id, "captured", sessionNode, null, { confidence: 1, via: meta.capturedBy.via }); // a provided transcript has no capture user

for (const p of meta.people) {
  const own = turns.filter((t) => t.speakerRef === p.personId);
  if (own.length === 0) continue;
  const e = addEdge(p.personId, "spoke_in", sessionNode, own[0], { confidence: p.confidence, role: p.role });
  e.weight = own.length;
  e.speakingSeconds = Math.round(own.reduce((s, t) => s + (t.tEnd - t.tStart), 0));
  if (p.org) addEdge(p.personId, "represents", p.org, own[0], { confidence: p.confidence, role: p.role });
}
for (const o of meta.orgs) {
  for (const c of o.countries) addEdge(o.id, "located_in", c, null, { confidence: 0.9 });
  if (o.partnerOf) {
    const re = new RegExp(o.pattern, "i");
    const hit = turns.find((t) => re.test(t.text));
    if (hit) addEdge(o.partnerOf, "partner_of", o.id, hit, { confidence: 0.85 });
  }
}
for (const [node, pattern] of [...Object.entries(meta.countries), ...Object.entries(meta.topics)]) {
  const re = new RegExp(pattern, "i");
  for (const t of turns) {
    if (!re.test(t.text)) continue;
    addEdge(sessionNode, "covers", node, t, { confidence: 0.8 });
    if (t.speakerRef.startsWith("person:")) addEdge(t.speakerRef, "discussed", node, t, { confidence: 0.7 });
  }
}

// ---- documents -----------------------------------------------------------------------------
const participants = meta.people.map((p) => p.personId);
const sessionDoc = {
  _id: sessionId,
  sourceId: source._id,
  title: meta.title,
  date: meta.date,
  org: meta.orgs.filter((o) => !o.partnerOf).map((o) => o.name).join(" · ") || (meta.org ?? ""),
  participants,
  platform: meta.platform,
  capturedBy: meta.capturedBy,
  status: { ...(meta.sessionStatus ?? { transcribe: "done", diarize: "done", summarize: "pending" }), index: "pending" },
  ...(screenEvidence ? { screenEvidence, notes } : {}),
};
const sourceDoc = { ...source, tenantId: undefined };
delete sourceDoc.tenantId;
const speakerDocs = meta.people.map((p) => ({
  _id: `${tenantId}-${p.personId}`,
  personId: p.personId,
  aliases: p.aliases,
  org: p.org ?? undefined,
  role: p.role,
  confidence: p.confidence,
  evidence: turns.filter((t) => t.speakerRef === p.personId).slice(0, 3).map((t) => ({ turnId: t._id, sessionId })),
}));
const orgDocs = meta.orgs.map((o) => ({ _id: `${tenantId}-${o.id}`, name: o.name, aliases: o.aliases }));
const topicDocs = Object.keys(meta.topics)
  .filter((k) => [...edges.values()].some((e) => e.to === k && e.type === "covers"))
  .map((k) => ({ _id: `${tenantId}-${k}`, name: k.replace("topic:", "").replace(/-/g, " "), sessionRefs: [sessionId] }));

const edgeList = [...edges.values()];
const byType = edgeList.reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
console.log(`session ${sessionId} (tenant ${tenantId})`);
console.log(`  turns ${turns.length} · speakers ${speakerDocs.length} · orgs ${orgDocs.length} · topics ${topicDocs.length}`);
console.log(`  graph_edges ${edgeList.length}: ${JSON.stringify(byType)}`);

// DB guard first: nothing below (file emission included) may run when the Mongo target is refused. A dry run touches no DB.
const { workDb, target } = DRY_RUN ? {} : guardDatabase(sourceDoc.testData);
register();
const retentionWrites = !DRY_RUN && (localState || EMIT_FILES) ? await import("../../packages/ingest/src/retention/production/retention-processed-proof.ts") : undefined;
if (EMIT_FILES) {
  const files = buildSessionFiles({ sessionId, tenantId, sessionDoc, meta, turns });
  for (const [name, doc] of [["session.json", files.session], ["session_page.json", files.sessionPage], ["claims.json", files.claims]]) {
    if (!DRY_RUN) {
      if (name === "session.json") {
        const emitted = retentionWrites.emitSessionPreservingAudit(dir, doc);
        if (!emitted.ok) throw new Error(`retention session emission refused: ${emitted.reason}`);
      } else writeFileSync(join(dir, name), `${JSON.stringify(doc, null, 2)}\n`);
    }
    console.log(`  ${DRY_RUN ? "would write" : "wrote"} ${name}`);
  }
  if (!DRY_RUN) bindDerivedArtifacts(dir, {turnArtifact: screenEvidence ? "knowledge-turns.json" : "turns.json"});
}

if (INDEX && DRY_RUN) {
  // No connection: the plan is computed from the same turns the live run will read back.
  const { buildChunks } = await import("../../packages/index/src/index.ts");
  console.log(`  index plan: summarize + claims (LLM, routed per config/ai-routing.yaml) -> session_pages/claims; ` +
    `${buildChunks(turns).length} lexical chunk(s) from ${turns.length} turns; tree_index regenerate([${sessionId}]); ` +
    `entity promotion; sessions.status.index -> done`);
}
if (DRY_RUN) {
  console.log("No Mongo connection attempted (--dry-run).");
  process.exit(0);
}

const { connect, close, getDb } = await import("../../packages/db/src/client.js");
const { sources } = await import("../../packages/db/src/collections/sources.js");
const { sessions } = await import("../../packages/db/src/collections/sessions.js");
const { scopedCollection } = await import("../../packages/db/src/lib/tenantScope.js");
const { mutateNativeCaptureSource } = await import("../../apps/api/src/indexing/native-archive/publication.ts");
const { speakers } = await import("../../packages/db/src/collections/speakers.js");
const { orgs } = await import("../../packages/db/src/collections/orgs.js");
const { topics } = await import("../../packages/db/src/collections/topics.js");
const { graphEdges } = await import("../../packages/db/src/collections/graph-edges.js");

const upsert = (coll, doc) => {
  const { _id, ...rest } = doc;
  return coll(tenantId).updateOne({ _id }, { $set: rest }, { upsert: true });
};
const strip = ({ tenantId: _t, ...rest }) => rest;

const gen = `gen-${Date.now()}`;
const retentionIdentity = { tenantId, sessionId, sourceId: source._id };
const retentionIo = localState ? await import("../../packages/ingest/src/retention/production/private-summary.ts") : undefined;
const retentionSourceBytes = localState ? retentionIo.readRetentionBytes(join(dir, "source.json"), 1024 * 1024) : undefined;
let connected = false;
try {
  if (localState) {
    if (!isDeepStrictEqual(JSON.parse(retentionSourceBytes), source)) throw new Error("source changed before actual indexing");
    const processing = retentionWrites.setSessionIndexStatus(dir, retentionIdentity, "processing");
    if (!processing.ok) throw new Error(`retention processing state refused: ${processing.reason}`);
  }
  await connect(target.url, target.dbName);
  connected = true;
  const priorSource = await sources(tenantId).findOne({ _id: source._id });
  const priorSession = await sessions(tenantId).findOne({ _id: sessionId });
  const nativeSwap = sourceDoc.captureConsent !== undefined || priorSource?.captureConsent !== undefined ||
    priorSession?.nativePublicationRevision !== undefined;
  const swap = async (db, native) => {
    const sourceRows = scopedCollection(db, "sources")(tenantId);
    const sessionRows = scopedCollection(db, "sessions")(tenantId);
    const { _id: sourceId, ...sourceFields } = sourceDoc;
    const { _id, ...sessionFields } = sessionDoc;
    if (Object.hasOwn(sessionFields, "nativePublicationRevision") || Object.hasOwn(sessionFields, "indexAttempt")) throw new Error("Reserved native state import refused");
    if (native) sessionFields.status = { ...sessionFields.status, index: "pending" };
    else if (priorSession?.status?.index === "done") sessionFields.status.index = "done";
    await sourceRows.updateOne({ _id: sourceId }, { $set: sourceFields }, { upsert: true });
    await sessionRows.updateOne({ _id }, { $set: sessionFields }, { upsert: true });
    return replaceSessionRows(scopedCollection(db, "turns")(tenantId), { sessionId }, turns.map(strip), gen);
  };
  // Native swaps invalidate and replace authoritative rows in ONE acknowledged transaction.
  // No provider/index work is inside the callback; unsupported standalone Mongo refuses.
  const tw = nativeSwap ? await mutateNativeCaptureSource(getDb(), retentionIdentity, db => swap(db, true))
    : await swap(getDb(), false);
  for (const s of speakerDocs) await upsert(speakers, s);
  for (const o of orgDocs) await upsert(orgs, o);
  for (const t of topicDocs) {
    await topics(tenantId).updateOne(
      { _id: t._id },
      { $set: { name: t.name }, $addToSet: { sessionRefs: sessionId } },
      { upsert: true },
    );
  }
  const ew = await replaceSessionRows(graphEdges(tenantId), { sessionRef: sessionId }, edgeList, gen);
  console.log(`written (${gen}): turns ${tw.upserted} upserted/${tw.removedStale} stale removed, ` +
    `graph_edges ${ew.upserted} upserted/${ew.removedStale} stale removed`);
  if (INDEX) {
    const res = await (await productionIndexer({ root: ROOT, groundedNotes: GROUNDED_NOTES }))(tenantId, sessionId);
    if (legacyProvided) assertIndexComplete(res, sessionId); // no capture artifacts to prove: the DB session row is the state
    else {
      const baseProof = finalizeIndexProof(res);
      if (!retentionIo.readRetentionBytes(join(dir, "source.json"), 1024 * 1024).equals(retentionSourceBytes)) throw new Error("source changed during actual indexing");
      const proof = { ...baseProof, version: baseProof.retrievalMode === 'vectorless' ? 4 : 3, sourceId: source._id, workDb,
        sourceHash: createHash("sha256").update(retentionSourceBytes).digest("hex") };
      retentionIo.writeRetentionAtomic(join(dir, "index-proof.json"), JSON.stringify(proof) + "\n");
      const indexed = retentionWrites.setSessionIndexStatus(dir, retentionIdentity, "done");
      if (!indexed.ok) throw new Error(`retention indexed state refused: ${indexed.reason}`);
      const stamped = retentionWrites.markSessionProcessedFromProof(dir, { ...retentionIdentity, workDb,
        generation: res.completion.generation, inputArtifact: baseProof.inputArtifact,
        ...(baseProof.retrievalMode === 'vectorless' ? { retrievalMode: 'vectorless' } : {}) }, Date.now());
      if (!stamped.ok) throw new Error(`retention processing stamp refused: ${stamped.reason}`);
    }
    if (res.groundedNotes) console.log(`grounded notes: ${JSON.stringify({ dropped: { summary: res.summary?.dropped ?? 0, claims: res.claims?.dropped ?? 0 }, ...res.groundedNotes })}`);
    console.log(`indexed: chunks ${res.chunks.written}${res.chunks.skipped ? ` (skipped: ${res.chunks.skipped})` : ""}` +
      `${res.entities ? `, entities ${JSON.stringify(res.entities)}` : ""}`);
    await clearIndexFailure(sessions(tenantId), sessionId);
  }
} catch (error) {
  if (connected && INDEX) await recordIndexFailure(sessions(tenantId), sessionId, error).catch(() => undefined); // D-207: persist WHY, not only the state flag
  if (localState) {
    const failed = retentionWrites.setSessionIndexStatus(dir, retentionIdentity, "failed");
    if (!failed.ok) throw new Error(`retention failed-state write refused: ${failed.reason}`, { cause: error });
  }
  throw error;
} finally {
  await close();
}

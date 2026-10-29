/**
 * scripts/webinar/session-rows.mjs — the write + file-emission helpers behind
 * scripts/webinar/sync-session.mjs, kept in their own module so they can be unit-tested with a
 * fake collection (sync-session.mjs runs its whole job at import time).
 *
 * replaceSessionRows — ISS-291. The sync used to `deleteMany` a session's turns / graph_edges and
 * then `insertOne` the new set in a loop, with no transaction: a throw mid-loop left the old rows
 * gone and only part of the new set written. The production Mongo is a STANDALONE server (`hello`
 * reports no `setName`), so multi-document transactions are unavailable; this is the safe swap
 * instead:
 *   1. upsert every new row by its (deterministic) `_id`, stamped with a fresh `syncGen`;
 *   2. only after EVERY upsert succeeded, delete this scope's rows whose `syncGen` differs
 *      (old-generation rows, including ones the new set no longer contains).
 * A failure in step 1 deletes nothing: every row is either its old version or its new one, and a
 * re-run converges. The collection handle is a packages/db `coll(tenantId)` accessor, so tenant
 * scoping is still applied by the accessor, never by this function.
 */

/** @param {{updateOne: Function, deleteMany: Function}} scoped  coll(tenantId) accessor result
 *  @param {object} scope   filter naming this session's rows, e.g. `{ sessionId }`
 *  @param {Array<{_id: string}>} docs  the complete new set (tenantId already stripped)
 *  @param {string} gen     generation id for this run
 *  @returns {Promise<{upserted: number, removedStale: number}>} */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, isAbsolute, resolve } from "node:path";
import { verifyTrustedRecordingPrivacyAdmission } from '../lib/transcription/private-recording.mjs';
import { screenEvidenceTurns } from "./process-video.mjs";
import { assertTurnTimings } from "../lib/turn-timing.mjs";
import { slideFrameSpans } from "./slides/slide-knowledge.mjs";

/** Resolve validated speech/screen generation and safe metadata for unattended recordings. */
export function loadWebinarSession(dir, sessionId, readBytes = readFileSync) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("invalid sessionId");
  dir = realpathSync(dir);
  const file = (name) => {
    const actual = realpathSync(join(dir, name)), rel = relative(dir, actual);
    if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) throw new Error("screen file outside session directory");
    return actual;
  };
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const read = (name) => JSON.parse(readBytes(file(name), "utf8"));
  const sourceBytes = readBytes(file('source.json'));
  const source = JSON.parse(sourceBytes.toString('utf8'));
  // D-207: a toc-migrated provided document has no `title` in source.json; its session.json states it. Narrow on purpose.
  const legacy = source.tenantId && source._id && !source.title ? providedSessionRow(dir, sessionId, source, read) : undefined;
  if (!source.tenantId || !source._id || !(source.title || legacy) || source.audioLevel?.silent) throw new Error("invalid/silent webinar source");
  const validation = existsSync(join(dir, "validation.json")) ? read("validation.json") : undefined;
  if (validation && Object.hasOwn(validation, 'sourceSha256') &&
      (typeof validation.sourceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(validation.sourceSha256) || validation.sourceSha256 !== sha(sourceBytes))) {
    throw new Error('Webinar validation source snapshot is stale or invalid');
  }
  if (source.captureConsent && !validation?.sourceSha256) throw new Error('Capture requires current source-bound privacy validation');
  if (validation && (validation.status !== "passed" || !validation.transcriptValidated)) throw new Error("webinar validation has not passed");
  const captured = source.captureMode === "silent";
  if (captured && (!validation || !Number.isFinite(validation.durationSec) || validation.durationSec <= 0)) {
    throw new Error("captured webinar requires passed media and transcript validation");
  }
  const speechBytes = readBytes(file("turns.json"));
  let rawTurns = JSON.parse(speechBytes.toString("utf8"));
  if (source.captureConsent || source.captureMode === 'silent' || source.privateWindows !== undefined || source.guardedPrivateWindows !== undefined) verifyTrustedRecordingPrivacyAdmission({ root: resolve(dir, '../../..'), sessionId,
    source, durationSeconds: validation.durationSec, validation, turns: rawTurns });
  if (validation && Object.hasOwn(validation, "turnsSha256") &&
      (typeof validation.turnsSha256 !== "string" || !/^[0-9a-f]{64}$/.test(validation.turnsSha256) || validation.turnsSha256 !== sha(speechBytes))) {
    throw new Error("webinar validation transcript hash is stale or invalid");
  }
  const qaExists = existsSync(join(dir, "transcript-qa.json"));
  const qaBytes = qaExists ? readBytes(file("transcript-qa.json")) : undefined;
  if (validation && Object.hasOwn(validation, "qaSha256")) {
    const bound = validation.qaSha256;
    if ((bound === null && qaExists) || (bound !== null &&
        (typeof bound !== "string" || !/^[0-9a-f]{64}$/.test(bound) || !qaBytes || sha(qaBytes) !== bound))) {
      throw new Error("webinar validation QA generation is stale or invalid");
    }
  } else if (qaBytes && JSON.parse(qaBytes.toString("utf8"))?.version === 1) {
    throw new Error("hash-bound QA requires current webinar validation");
  }
  if (source.captureConsent && (!qaBytes || JSON.parse(qaBytes.toString('utf8'))?.version !== 1 || !validation?.qaSha256)) {
    throw new Error('Capture requires current generation-bound raw-anomaly QA');
  }
  const originalSpeech = rawTurns;
  let screenEvidence, notes;
  if (existsSync(join(dir, "video-stage.json"))) {
    const stage = read("video-stage.json");
    if (stage.status !== "done") throw new Error("screen stage incomplete; refusing partial knowledge ingestion");
    for (const name of ["knowledge-turns.json", "screen-evidence.json", "notes.json"]) {
      const bytes = readBytes(file(name));
      if (sha(bytes) !== stage.outputs?.[name]) throw new Error(`screen artifact hash mismatch: ${name}`);
    }
    rawTurns = read("knowledge-turns.json");
    screenEvidence = read("screen-evidence.json"); notes = read("notes.json");
    if (screenEvidence.sessionId !== sessionId || notes.sessionId !== sessionId) throw new Error("screen session identity mismatch");
    if (screenEvidence.version === 3) {
      for (const { frame, turnIds } of slideFrameSpans(screenEvidence.frames, screenEvidence.duration, originalSpeech)) {
        if (!Array.isArray(frame.turnIds) || !isDeepStrictEqual(frame.turnIds, turnIds)) {
          throw new Error("screen frame speech attachment turnIds mismatch");
        }
      }
    }
    const expected = screenEvidenceTurns(sessionId, source.tenantId, screenEvidence);
    for (const frame of screenEvidence.frames) {
      if (sha(readBytes(file(frame.file))) !== frame.hash) throw new Error("screen frame byte hash mismatch");
      if (frame.id !== `${sessionId}-frame-${sha(`${frame.hash}|${frame.tStart}`).slice(0, 32)}`) throw new Error("screen frame identity mismatch");
    }
    if (!Array.isArray(rawTurns)) throw new Error("invalid screen knowledge turns");
    if (!Array.isArray(originalSpeech)) throw new Error("invalid original speech turns");
    const speech = rawTurns.filter((t) => t.speakerRef !== "screen" && !t.screenEvidence);
    const originals = new Map(originalSpeech.map((t) => [t._id, t]));
    const speechIds = new Set(speech.map((t) => t._id));
    if (originals.size !== originalSpeech.length || speechIds.size !== speech.length || speech.length !== originals.size ||
      speech.some((t) => !isDeepStrictEqual(t, originals.get(t._id)))) {
      throw new Error("combined knowledge does not match current raw speech");
    }
    const screenTurns = rawTurns.filter((t) => t.speakerRef === "screen" || t.screenEvidence);
    if (screenTurns.length !== expected.length) throw new Error("screen evidence turn coverage mismatch");
    const consumed = new Set();
    for (const turn of screenTurns) {
      const match = expected.find((row) => row._id === turn._id);
      if (!match || consumed.has(turn._id) || ["tenantId", "sessionId", "speakerRef", "text", "tStart", "tEnd"].some((key) => turn[key] !== match[key]) ||
        !turn.screenEvidence || ["frameId", "file", "hash", "tStart"].some((key) => turn.screenEvidence[key] !== match.screenEvidence[key])) {
        throw new Error("screen turn evidence reference mismatch");
      }
      consumed.add(turn._id);
    }
  }
  if (Array.isArray(rawTurns)) assertTurnTimings(rawTurns, sessionId); // names the session and turn; the generic check below stays
  if (!Array.isArray(rawTurns) || !rawTurns.length || new Set(rawTurns.map((t) => t._id)).size !== rawTurns.length ||
    rawTurns.some((t) => t.sessionId !== sessionId ||
    t.tenantId !== source.tenantId || typeof t._id !== "string" || !t._id.trim() || !t.speakerRef || !Number.isFinite(t.tStart) ||
    !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart || (captured && t.tEnd > validation.durationSec) || typeof t.text !== "string" || !t.text.trim())) {
    throw new Error("invalid turns or session/tenant identity mismatch");
  }
  const meta = existsSync(join(dir, "meta.json")) ? read("meta.json") : {
    tenantId: source.tenantId, title: source.title ?? legacy?.title, date: legacy?.date ?? source.createdAt?.slice(0, 10),
    t0: legacy ? `${legacy.date}T00:00:00.000Z` : source.createdAt, platform: source.platform ?? "unknown", hostOrg: legacy?.org ?? "Unresolved",
    people: [], orgs: [], countries: {}, topics: {},
    capturedBy: legacy ? { via: "provided" } : { id: "user:vidysea-webinar-capture", via: source.captureMode ?? "provided" },
    ...(legacy ? { org: legacy.org, sessionStatus: legacy.status } : {}),
  };
  if (meta.tenantId !== source.tenantId || !meta.date || !Number.isFinite(Date.parse(meta.t0))) throw new Error("invalid metadata identity/date");
  return { source, rawTurns, meta, screenEvidence, notes, legacyProvided: Boolean(legacy) };
}

/** D-207: session.json of a migrated provided-document session, only when it matches this source exactly (never invents a title). */
function providedSessionRow(dir, sessionId, source, read) {
  if (source.captureMode !== "provided" || source.captureConsent || source.audioLevel || !existsSync(join(dir, "session.json"))) return undefined;
  const row = read("session.json");
  return row?._id === sessionId && row.tenantId === source.tenantId && row.sourceId === source._id && typeof row.title === "string" && row.title.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date ?? "") && Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) ? row : undefined;
}

export async function replaceSessionRows(scoped, scope, docs, gen) {
  for (const doc of docs) {
    const { _id, ...rest } = doc;
    await scoped.updateOne({ _id }, { $set: { ...rest, ...scope, syncGen: gen } }, { upsert: true });
  }
  const del = await scoped.deleteMany({ ...scope, syncGen: { $ne: gen } });
  return { upserted: docs.length, removedStale: del.deletedCount ?? 0 };
}

/**
 * ISS-294 ([C7]). Every other data/toc-migrated/<id>/ directory carries session.json +
 * session_page.json (+ claims.json), and packages/index's real-data tree test and seed-toc.mjs
 * both read them unconditionally. These are DERIVED from what sync-session.mjs already loads —
 * meta.json (title/date/people/orgs), source.json (source id) and turns.json (evidence turn ids)
 * — so nothing here is written that the session's own inputs do not already state.
 * claims.json is an empty list: no claims were hand-written for this session; the real ones come
 * from the indexing step (`--index`), not from a file.
 */
export function buildSessionFiles({ sessionId, tenantId, sessionDoc, meta, turns }) {
  const session = {
    _id: sessionId,
    tenantId,
    sourceId: sessionDoc.sourceId,
    title: sessionDoc.title,
    date: sessionDoc.date,
    org: sessionDoc.org,
    status: sessionDoc.status,
  };
  const orgName = new Map(meta.orgs.map((o) => [o.id, o.name]));
  const who = (p) => `${p.label} (${p.role}${p.org ? `, ${orgName.get(p.org) ?? p.org}` : ""})`;
  const hosts = meta.orgs.filter((o) => !o.partnerOf);
  const countries = [...new Set(hosts.flatMap((o) => o.countries))].map((c) => c.replace("country:", ""));
  const firstTurn = (p) => turns.find((t) => t.speakerRef !== 'screen' && !t.screenEvidence && (t.speakerRef === p.personId || t.speakerRef === p.label));
  const speaking = meta.people.filter((p) => firstTurn(p));
  const summary =
    `${meta.title} — ${meta.hostOrg}, ${meta.date}, captured by ${meta.capturedBy.via}. ` +
    `Speakers: ${speaking.map(who).join("; ")}. ` +
    `Institutions presented: ${hosts.map((o) => o.name).join(", ")} (${countries.join(", ")}). ` +
    `${turns.length} transcript turns.`;
  const keyInsights = meta.orgs
    .filter((o) => o.partnerOf)
    .map((o) => `${orgName.get(o.partnerOf)} partners with ${o.name} (${o.countries.map((c) => c.replace("country:", "")).join(", ")}).`);
  const evidence = speaking.map((p) => ({ turnId: firstTurn(p)._id, sessionId }));
  // Unresolved speaker names do not block valid speech/screen knowledge. Cite actual turns.
  if (evidence.length === 0) for (const turn of turns.slice(0, 3)) evidence.push({ turnId: turn._id, sessionId });
  if (evidence.length === 0) throw new Error("buildSessionFiles: no transcript evidence");
  const sessionPage = { _id: `${sessionId}-page`, tenantId, sessionId, summary, keyInsights, evidence };
  return { session, sessionPage, claims: [] };
}

/** D-207: the same completeness gate prepareWebinarIndexProof applies, for sessions that have no capture artifacts to prove
 *  (migrated provided documents, index-existing). Throws "index incomplete: <every reason>"; returns the result when complete. */
export function assertIndexComplete(res, sessionId) {
  const c = res?.completion, why = [];
  if (!c) why.push("no completion");
  else {
    if (c.version !== 2 || c.complete !== true) why.push("completion not complete");
    if (c.treeWritten !== true) why.push("tree not written");
    if (!c.generation || !Number.isInteger(c.turnCount) || c.turnCount <= 0) why.push("no generation/turn count");
    const mode = c.retrievalMode;
    if (!(mode === "vectorless" ? c.lexicalWritten === true && c.provenanceValidated === true : mode === undefined || mode === "vector")) why.push("retrieval mode not ready");
  }
  if (res?.sessionId !== sessionId) why.push("session id mismatch");
  if (res?.summary?.degraded) why.push(`summary degraded: ${res.summary.degraded}`);
  if (res?.claims?.degraded) why.push(`claims degraded: ${res.claims.degraded}`);
  if (res?.chunks?.skipped || !(res?.chunks?.written > 0)) why.push(`chunks not written${res?.chunks?.skipped ? ` (skipped: ${res.chunks.skipped})` : ""}`);
  if (why.length) throw new Error(`index incomplete: ${why.join("; ")}`);
  return res;
}

/** D-207: the previous failures were only a state flag (indexAttempt.state=failed, phase=preflight) with no reason. indexAttempt is a
 *  closed schema, so the reason goes on a sibling `indexFailure` field of the session row (sessions allow extra fields). */
export async function recordIndexFailure(sessionsScoped, sessionId, error, via = "sync-session") {
  const reason = String(error instanceof Error ? error.message : error).replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "mongodb://[redacted]").replace(/\s+/g, " ").slice(0, 1000);
  const attempt = (await sessionsScoped.findOne({ _id: sessionId }))?.indexAttempt;
  const doc = { at: new Date().toISOString(), via, reason, ...(attempt ? { generation: attempt.generation, state: attempt.state, phase: attempt.phase } : {}) };
  await sessionsScoped.updateOne({ _id: sessionId }, { $set: { indexFailure: doc } });
  return doc;
}
export const clearIndexFailure = (sessionsScoped, sessionId) => sessionsScoped.updateOne({ _id: sessionId }, { $unset: { indexFailure: "" } });

/** D-207: --index-existing. Index a session whose rows are ALREADY in the target database (no local directory): verify they exist,
 *  run the injected indexer (production: buildIndexer, as sync-session.mjs runs it after a sync), record why on failure. Writes nothing
 *  but what the indexer writes and the indexFailure field; it never creates or replaces session/source/turn rows. */
export async function indexExistingRows({ tenantId, sessionId, workDb, sessions, sources, turns, indexer, log = console.log }) {
  const session = await sessions.findOne({ _id: sessionId });
  if (!session) throw new Error(`index-existing: session ${sessionId} (tenant ${tenantId}) not found in ${workDb}; nothing indexed`);
  const source = session.sourceId ? await sources.findOne({ _id: session.sourceId }) : null;
  if (!source) throw new Error(`index-existing: source ${session.sourceId} of session ${sessionId} not found in ${workDb}; nothing indexed`);
  if (source.testData === true && workDb !== "lkb_staging") throw new Error("index-existing: testData source: refusing to index it anywhere but lkb_staging");
  const count = await turns.countDocuments({ sessionId });
  if (!count) throw new Error(`index-existing: session ${sessionId} has no turns in ${workDb}; nothing indexed`);
  const prior = session.indexAttempt;
  log(`  existing rows in ${workDb}: turns ${count}, status.index ${session.status?.index}, prior attempt ${prior ? `${prior.state}/${prior.phase}` : "none"}${session.indexFailure ? `, last failure: ${session.indexFailure.reason}` : ""}`);
  try {
    const res = assertIndexComplete(await indexer(tenantId, sessionId), sessionId);
    await clearIndexFailure(sessions, sessionId);
    return res;
  } catch (error) {
    await recordIndexFailure(sessions, sessionId, error, "index-existing").catch(() => undefined);
    throw error;
  }
}

/** D-207: the production indexing step every path shares (sync --index and --index-existing): buildIndexer exactly as the live ingest binds it. */
export async function productionIndexer({ root, groundedNotes }) {
  const { buildIndexer } = await import("../../apps/api/src/composition/production.ts");
  const { configuredNativeArchiveService } = await import("../native-capture/server.ts");
  const { getDb } = await import("../../packages/db/src/client.js");
  const nativeArchive = await configuredNativeArchiveService(process.env, getDb(), root);
  if (nativeArchive) await nativeArchive.drain({ limit: 100 });
  return buildIndexer(undefined, { strictWebinar: true,
    ...(nativeArchive ? { onIndexCommitted: binding => nativeArchive.onIndexCommitted(binding) } : {}),
    ...(groundedNotes ? { groundedNotes: true } : {}) });
}

/** D-207: connect to the already-guarded target (sync-session.mjs ran guardDatabase), index the existing rows, always close. */
export async function indexExistingInDb({ target, workDb, tenantId, sessionId, root, groundedNotes }) {
  const { connect, close, getDb } = await import("../../packages/db/src/client.js");
  const { scopedCollection } = await import("../../packages/db/src/lib/tenantScope.js");
  try {
    await connect(target.url, target.dbName);
    const coll = (name) => scopedCollection(getDb(), name)(tenantId);
    return await indexExistingRows({ tenantId, sessionId, workDb, sessions: coll("sessions"), sources: coll("sources"), turns: coll("turns"),
      indexer: async (t, s) => (await productionIndexer({ root, groundedNotes }))(t, s) });
  } finally { await close(); }
}
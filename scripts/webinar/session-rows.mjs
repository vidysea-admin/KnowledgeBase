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
import { join, relative, isAbsolute } from "node:path";
import { screenEvidenceTurns } from "./process-video.mjs";

/** Resolve validated speech/screen generation and safe metadata for unattended recordings. */
export function loadWebinarSession(dir, sessionId) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId)) throw new Error("invalid sessionId");
  dir = realpathSync(dir);
  const file = (name) => {
    const actual = realpathSync(join(dir, name)), rel = relative(dir, actual);
    if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) throw new Error("screen file outside session directory");
    return actual;
  };
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const read = (name) => JSON.parse(readFileSync(file(name), "utf8"));
  const source = read("source.json");
  if (!source.tenantId || !source._id || !source.title || source.audioLevel?.silent) throw new Error("invalid/silent webinar source");
  const validation = existsSync(join(dir, "validation.json")) ? read("validation.json") : undefined;
  if (validation && (validation.status !== "passed" || !validation.transcriptValidated)) throw new Error("webinar validation has not passed");
  const captured = source.captureMode === "silent";
  if (captured && (!validation || !Number.isFinite(validation.durationSec) || validation.durationSec <= 0)) {
    throw new Error("captured webinar requires passed media and transcript validation");
  }
  let rawTurns = read("turns.json");
  const originalSpeech = rawTurns;
  let screenEvidence, notes;
  if (existsSync(join(dir, "video-stage.json"))) {
    const stage = read("video-stage.json");
    if (stage.status !== "done") throw new Error("screen stage incomplete; refusing partial knowledge ingestion");
    for (const name of ["knowledge-turns.json", "screen-evidence.json", "notes.json"]) {
      const bytes = readFileSync(file(name));
      if (sha(bytes) !== stage.outputs?.[name]) throw new Error(`screen artifact hash mismatch: ${name}`);
    }
    rawTurns = read("knowledge-turns.json");
    screenEvidence = read("screen-evidence.json"); notes = read("notes.json");
    if (screenEvidence.sessionId !== sessionId || notes.sessionId !== sessionId) throw new Error("screen session identity mismatch");
    const expected = screenEvidenceTurns(sessionId, source.tenantId, screenEvidence);
    for (const frame of screenEvidence.frames) {
      if (sha(readFileSync(file(frame.file))) !== frame.hash) throw new Error("screen frame byte hash mismatch");
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
  if (!Array.isArray(rawTurns) || !rawTurns.length || new Set(rawTurns.map((t) => t._id)).size !== rawTurns.length ||
    rawTurns.some((t) => t.sessionId !== sessionId ||
    t.tenantId !== source.tenantId || typeof t._id !== "string" || !t._id.trim() || !t.speakerRef || !Number.isFinite(t.tStart) ||
    !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart || (captured && t.tEnd > validation.durationSec) || typeof t.text !== "string" || !t.text.trim())) {
    throw new Error("invalid turns or session/tenant identity mismatch");
  }
  const meta = existsSync(join(dir, "meta.json")) ? read("meta.json") : {
    tenantId: source.tenantId, title: source.title, date: source.createdAt?.slice(0, 10),
    t0: source.createdAt, platform: source.platform ?? "unknown", hostOrg: "Unresolved",
    people: [], orgs: [], countries: {}, topics: {},
    capturedBy: { id: "user:vidysea-webinar-capture", via: source.captureMode ?? "provided" },
  };
  if (meta.tenantId !== source.tenantId || !meta.date || !Number.isFinite(Date.parse(meta.t0))) throw new Error("invalid metadata identity/date");
  return { source, rawTurns, meta, screenEvidence, notes };
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
  const firstTurn = (p) => turns.find((t) => t.speakerRef === p.personId || t.speakerRef === p.label);
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

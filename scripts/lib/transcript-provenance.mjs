/** Immutable transcript identities and fail-closed local derivation/work-DB boundaries. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { loadWebinarSession } from "../webinar/session-rows.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const valid = value => typeof value === "string" && value.trim().length > 0;
const load = path => JSON.parse(readFileSync(path, "utf8"));
const bytes = value => `${JSON.stringify(value, null, 2)}\n`;
function atomicWrite(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, value); renameSync(temp, path); }
  finally { rmSync(temp, {force: true}); }
}
/** Identical repeated tuples receive stable occurrence identities, never duplicate IDs. */
export function immutableTranscriptTurns(tenantId, sessionId, turns) {
  if (!valid(tenantId) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(sessionId) || !Array.isArray(turns) || !turns.length) throw new Error("invalid transcript identity");
  const occurrences = new Map();
  return turns.map(t => {
    if (!t || !valid(t.speakerRef) || !valid(t.text) || !Number.isFinite(t.tStart) || !Number.isFinite(t.tEnd) || t.tStart < 0 || t.tEnd < t.tStart) throw new Error("invalid transcript turn");
    const tuple = JSON.stringify([tenantId, sessionId, t.speakerRef, t.tStart, t.tEnd, t.text]);
    const occurrence = occurrences.get(tuple) ?? 0; occurrences.set(tuple, occurrence + 1);
    return {_id: `${sessionId}-t-${sha(`${tuple}|${occurrence}`)}`, tenantId, sessionId,
      speakerRef: t.speakerRef, tStart: t.tStart, tEnd: t.tEnd, text: t.text};
  });
}
/** Archive originals and invalidate derived knowledge BEFORE committing different transcript bytes. */
export function writeTranscriptGeneration(dir, tenantId, sessionId, turns, write = atomicWrite) {
  const rows = immutableTranscriptTurns(tenantId, sessionId, turns), next = bytes(rows), path = join(dir, "turns.json");
  const previous = existsSync(path) ? readFileSync(path) : null;
  if (previous?.equals(Buffer.from(next))) return rows;
  if (previous) {
    const history = join(dir, ".transcript-history"); mkdirSync(history, {recursive: true});
    const archive = join(history, `${sha(previous)}.json`);
    if (existsSync(archive)) {if (!readFileSync(archive).equals(previous)) throw new Error("transcript archive conflict");}
    else write(archive, previous);
  }
  write(join(dir, "derivation-provenance.json"), bytes({version: 1, status: "stale", tenantId, sessionId,
    turnsSha256: sha(next), previousTurnsSha256: previous ? sha(previous) : null, reason: "transcript-replaced"}));
  write(path, next); return rows;
}
function artifactGeneration(dir, turnArtifact = "turns.json", readBytes = readFileSync) {
  if (!["turns.json", "knowledge-turns.json"].includes(turnArtifact)) throw new Error("invalid selected turn artifact");
  const buffers = new Map();
  const read = (path, encoding) => {
    if (!buffers.has(path)) buffers.set(path, Buffer.from(readBytes(path)));
    const value = buffers.get(path); return encoding ? value.toString(encoding) : value;
  };
  const json = name => JSON.parse(read(join(dir, name), "utf8"));
  const source = json("source.json"), session = json("session.json"), speech = json("turns.json");
  const turns = turnArtifact === "turns.json" ? speech : json(turnArtifact);
  const claims = json("claims.json"), page = json("session_page.json");
  const tenantId = source.tenantId, sessionId = session._id;
  if (!valid(tenantId) || !valid(sessionId) || session.tenantId !== tenantId || !Array.isArray(turns) || !turns.length ||
      !Array.isArray(claims) || page?.tenantId !== tenantId || page?.sessionId !== sessionId ||
      turns.some(t => t?.tenantId !== tenantId || t?.sessionId !== sessionId || !valid(t._id)) ||
      new Set(turns.map(t => t._id)).size !== turns.length) throw new Error("invalid derivation identity");
  if (turnArtifact === "knowledge-turns.json") {
    const validated = loadWebinarSession(dir, sessionId, read);
    if (!validated.screenEvidence || JSON.stringify(validated.rawTurns) !== JSON.stringify(turns)) throw new Error("combined turn artifact not validated");
  }
  const ids = new Set(turns.map(t => t._id));
  for (const doc of [...claims, page]) {
    if (doc?.tenantId !== tenantId || !Array.isArray(doc.evidence) || !doc.evidence.length ||
        doc.evidence.some(e => e?.sessionId !== sessionId || !ids.has(e?.turnId))) throw new Error("invalid derived evidence");
  }
  const hashes = Object.fromEntries([...buffers].map(([path, value]) => [relative(dir, path).replaceAll("\\", "/"), sha(value)]));
  return {version: 1, status: "current", tenantId, sessionId, turnArtifact, hashes, documents: {source, session, turns, claims, page}};
}
/** Only a producer that just generated claims/page from these turns may bind a fresh generation. */
export function bindDerivedArtifacts(dir, {turnArtifact = "turns.json"} = {}) {
  const {documents: _documents, ...generation} = artifactGeneration(dir, turnArtifact);
  atomicWrite(join(dir, "derivation-provenance.json"), bytes(generation)); return generation;
}
/** Freeze the exact validated buffers. Seed never rereads a potentially newer mixed generation. */
export function assertDerivedArtifactsCurrent(dir, readBytes = readFileSync) {
  const path = join(dir, "derivation-provenance.json");
  if (!existsSync(path)) throw new Error("derived provenance absent; independently reconcile or regenerate knowledge");
  const proof = JSON.parse(readBytes(path).toString("utf8")), current = artifactGeneration(dir, proof.turnArtifact, readBytes);
  if (proof?.version !== 1 || proof.status !== "current" || proof.tenantId !== current.tenantId || proof.sessionId !== current.sessionId ||
      Object.keys(current.hashes).some(name => proof.hashes?.[name] !== current.hashes[name]) ||
      Object.keys(proof.hashes ?? {}).length !== Object.keys(current.hashes).length) throw new Error("derived provenance stale or mismatched; knowledge writes refused");
  return current;
}
/** lkb_staging (any casing) is usable only as the exact name with LKB_ALLOW_STAGING=lkb_staging (ISS-LEGACYSEED-010). */
export function stagingRefused(name, env) {
  const n = String(name ?? "").trim();
  return n.toLowerCase() === "lkb_staging" && !(n === "lkb_staging" && env.LKB_ALLOW_STAGING === "lkb_staging");
}
export function isProtectedWorkDbName(name, env) {
  const n = String(name ?? "").trim();
  return !n || ["lkb", "global_university_db"].includes(n.toLowerCase()) || stagingRefused(n, env);
}
export function requireWorkDatabase(env) {
  const work = env.MONGO_WORK_DB?.trim(), selected = env.MONGODB_DB?.trim();
  if (stagingRefused(work, env) || stagingRefused(selected, env)) throw new Error("lkb_staging requires LKB_ALLOW_STAGING=lkb_staging; production writes refused");
  if (!work || !/^[a-zA-Z0-9_-]{1,64}$/.test(work) || ["lkb", "global_university_db"].includes(work.toLowerCase()) ||
      (selected && selected !== work) || !valid(env.MONGODB_URL)) throw new Error("explicit isolated work database and Mongo URL required; production writes refused");
  return {url: env.MONGODB_URL, dbName: work};
}
/** All scopes are checked before any transcript mutation, including older sequential-ID records. */
export async function assertTranscriptReplacementSafe({turns, claims, sessionPages}, tenantId, sessionId, incoming) {
  const existing = await turns(tenantId).find({sessionId}).toArray();
  const content = rows => JSON.stringify(rows.map(t => [t._id, t.tenantId, t.sessionId, t.speakerRef, t.tStart, t.tEnd, t.text]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  if (content(existing) === content(incoming)) return;
  const priorClaims = await claims(tenantId).findOne({"evidence.sessionId": sessionId});
  const priorPage = await sessionPages(tenantId).findOne({sessionId});
  if (priorClaims || priorPage) throw new Error("transcript replacement has existing derived knowledge; version-aware reindex required before mutation");
}
/** D-149 (pending append): the stamp carried by every doc seeded without derivation provenance. */
export const LEGACY_UNBOUND = Object.freeze({status: "legacy-unbound", reason: "D-149"});
const stamp = doc => ({...doc, provenance: {...LEGACY_UNBOUND}});
/**
 * Opt-in (`--legacy-unbound`) loader. Accepts a session ONLY when derivation-provenance.json is absent; a
 * present proof (current, stale or mismatched) still goes through assertDerivedArtifactsCurrent unchanged.
 * Identity/evidence integrity is still enforced by artifactGeneration. Never writes or binds provenance.
 */
export function loadSessionArtifacts(dir, {legacyUnbound = false} = {}) {
  if (!legacyUnbound || existsSync(join(dir, "derivation-provenance.json"))) return assertDerivedArtifactsCurrent(dir);
  const {documents: d} = artifactGeneration(dir);
  return {documents: {source: stamp(d.source), session: stamp(d.session), turns: d.turns.map(stamp),
    claims: d.claims.map(stamp), page: stamp(d.page)}};
}
/**
 * Target database for a `--legacy-unbound` live write. LKB_ALLOW_STAGING=lkb_staging selects the staging
 * path, which accepts ONLY database `lkb_staging`; anything else (lkb, empty, other names, mismatched
 * MONGODB_DB) is refused. Without that env the existing requireWorkDatabase rules apply unchanged.
 */
export function requireLegacyUnboundDatabase(env) {
  const allow = env.LKB_ALLOW_STAGING;
  if (allow === undefined) return requireWorkDatabase(env);
  const work = env.MONGO_WORK_DB?.trim(), selected = env.MONGODB_DB?.trim();
  if (allow !== "lkb_staging" || work !== "lkb_staging" || (selected && selected !== "lkb_staging") || !valid(env.MONGODB_URL))
    throw new Error("legacy-unbound staging requires LKB_ALLOW_STAGING=lkb_staging, MONGO_WORK_DB=lkb_staging and a Mongo URL; other databases refused");
  return {url: env.MONGODB_URL, dbName: "lkb_staging"};
}
/**
 * DB guard for writers that previously defaulted to `lkb` (backfill, sync-speakers). No default database:
 * refuses lkb/empty/unset. LKB_ALLOW_STAGING selects the lkb_staging path and is honoured ONLY together
 * with the `--legacy-unbound` flag; otherwise the existing requireWorkDatabase rules apply.
 */
export function requireBackfillDatabase(env, {legacyUnbound = false} = {}) {
  if (env.LKB_ALLOW_STAGING === undefined) return requireWorkDatabase(env);
  if (!legacyUnbound) throw new Error("LKB_ALLOW_STAGING requires --legacy-unbound; staging write refused");
  return requireLegacyUnboundDatabase(env);
}

export const PRODUCTION_FLAG = "--i-know-this-is-production";
/**
 * ISS-LEGACYSEED-001/003/005/006 shared guard for scripts that used to default MONGODB_DB to `lkb`.
 * No default database. Isolated work DB / lkb_staging go through requireLegacyUnboundDatabase unchanged.
 * `lkb` itself is reachable ONLY when allowProduction is set by the script AND argv carries
 * --i-know-this-is-production AND MONGODB_DB is exactly "lkb" (a flag alone, or an env alone, is refused).
 */
export function requireScriptDatabase(env, argv = [], {allowProduction = false} = {}) {
  if (allowProduction && argv.includes(PRODUCTION_FLAG)) {
    if (env.MONGODB_DB?.trim() !== "lkb" || !valid(env.MONGODB_URL))
      throw new Error(`${PRODUCTION_FLAG} requires an explicit MONGODB_DB=lkb and a Mongo URL`);
    return {url: env.MONGODB_URL, dbName: "lkb"};
  }
  return requireLegacyUnboundDatabase(env);
}

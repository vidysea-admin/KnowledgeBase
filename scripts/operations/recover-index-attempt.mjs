#!/usr/bin/env node
/**
 * scripts/operations/recover-index-attempt.mjs -- explicit, supported recovery of ONE stuck index attempt.
 *
 * A session whose `indexAttempt.state` is `uncertain` (or `running` after a crash) is fail-closed: it stays hidden and
 * acquireIndexAttempt refuses it with `index_attempt_requires_recovery`. This is the "explicit recovery" that refusal names.
 *
 * Usage: node scripts/operations/recover-index-attempt.mjs --tenant <id> --session <id>
 *          [--apply --reason "<why>" [--by <who>] [--force-running] [--running-threshold-minutes N]]
 *          [--i-know-this-is-production]   (production also needs MONGODB_DB=lkb; see requireScriptDatabase)
 *   Exactly one tenant and one session: there is no bulk mode. Dry run by default (no writes).
 *   --apply is ONE conditional single-document update matching tenant + session + the exact attempt generation, state
 *   and phase that was read. If the attempt changed in between, nothing is written and the result is `conflict`.
 *   It resets the attempt to failed/preflight (the state acquireIndexAttempt will claim) and records indexRecovery
 *   {at, by, reason, generation, previousState, previousPhase, forced}. A `running` attempt younger than the threshold
 *   (default 30 min) is refused unless --force-running.
 * Nothing is deleted. Leftover artifacts of the abandoned generation stay invisible (verifyIndexGeneration requires the
 * complete generation) and the next index run rewrites them in place; no garbage-collection helper exists, so none runs.
 */
import { pathToFileURL } from "node:url";
import os from "node:os";

export const RUNNING_THRESHOLD_MINUTES = 30;
const FLAGS = new Set(["--apply", "--force-running", "--i-know-this-is-production"]);
const VALUED = new Set(["--tenant", "--session", "--reason", "--by", "--running-threshold-minutes"]);

export function parseArgs(argv) {
  const out = { apply: false, forceRunning: false, tenant: null, session: null, reason: null, by: null, thresholdMinutes: RUNNING_THRESHOLD_MINUTES };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAGS.has(a)) { if (a === "--apply") out.apply = true; if (a === "--force-running") out.forceRunning = true; continue; }
    if (!VALUED.has(a)) throw new Error(`unknown argument ${a}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
    if (seen.has(a)) throw new Error(`${a} given more than once (one tenant and one session only)`);
    seen.add(a);
    if (a === "--tenant") out.tenant = v; else if (a === "--session") out.session = v; else if (a === "--reason") out.reason = v;
    else if (a === "--by") out.by = v;
    else { out.thresholdMinutes = Number(v); if (!Number.isFinite(out.thresholdMinutes) || out.thresholdMinutes < 0) throw new Error("--running-threshold-minutes must be a number >= 0"); }
  }
  if (!out.tenant || !out.session) throw new Error("--tenant and --session are required (no bulk or all-tenants mode)");
  if (out.apply) {
    if (!out.reason || !out.reason.trim()) throw new Error("--apply requires --reason \"<why>\"");
    if (out.reason.length > 500) throw new Error("--reason is limited to 500 characters");
  } else if (out.forceRunning || out.reason) throw new Error("--reason and --force-running only apply together with --apply");
  return out;
}

/** An attempt acquireIndexAttempt refuses (or that was left running by a crash). Complete and failed/preflight are claimable already. */
export function isStuck(attempt) {
  return Boolean(attempt) && (attempt.state === "running" || attempt.state === "uncertain" || (attempt.state === "failed" && attempt.phase !== "preflight"));
}

async function artifactReport(db, scopedCollection, tenantId, sessionId, generation) {
  const probes = { session_pages: { sessionId }, chunks: { sourceRef: sessionId }, claims: { "evidence.sessionId": sessionId } };
  const out = {};
  for (const [name, filter] of Object.entries(probes)) {
    const coll = scopedCollection(db, name)(tenantId);
    out[name] = { total: await coll.countDocuments(filter), fromAbandonedGeneration: await coll.countDocuments({ ...filter, "indexArtifact.generation": generation }) };
  }
  return out;
}

/** One tenant, one session. `db` is a connected Db; every handle is tenant-scoped via scopedCollection. */
export async function recoverIndexAttempt({ db, scopedCollection, tenantId, sessionId, apply = false, reason = null, by = "unknown", forceRunning = false,
  thresholdMinutes = RUNNING_THRESHOLD_MINUTES, now = () => new Date() }) {
  const sessions = scopedCollection(db, "sessions")(tenantId);
  const r = { tenantId, sessionId, apply, status: null, warnings: [] };
  const session = await sessions.findOne({ _id: sessionId });
  if (!session) return { ...r, status: "session_not_found" };
  const attempt = session.indexAttempt;
  if (!attempt) return { ...r, status: "no_attempt", detail: `statusIndex=${session.status?.index ?? "-"}; no indexAttempt to recover` };
  const at = now(), started = Date.parse(attempt.startedAt), ageMinutes = Number.isFinite(started) ? (at.getTime() - started) / 60000 : null;
  Object.assign(r, { generation: attempt.generation, state: attempt.state, phase: attempt.phase, startedAt: attempt.startedAt ?? null,
    ageMinutes: ageMinutes === null ? null : Math.round(ageMinutes * 10) / 10, statusIndex: session.status?.index ?? null,
    artifacts: await artifactReport(db, scopedCollection, tenantId, sessionId, attempt.generation) });
  if (!isStuck(attempt)) return { ...r, status: "not_stuck", detail: `state=${attempt.state} phase=${attempt.phase} is already claimable or complete` };
  let forced = false;
  if (attempt.state === "running" && (ageMinutes === null || ageMinutes < thresholdMinutes)) {
    if (!forceRunning) return { ...r, status: "refused_running_young", detail: `running and ${ageMinutes === null ? "of unknown age" : `${r.ageMinutes} min old`} (< ${thresholdMinutes} min); a live indexer may own it. Use --force-running only if sure it is dead` };
    forced = true;
    r.warnings.push("FORCED: resetting a running attempt younger than the threshold; a live indexer could still be writing");
  }
  if (!apply) return { ...r, status: "dry_run", wouldReset: { from: `${attempt.state}/${attempt.phase}`, to: "failed/preflight" }, forced };
  const stamp = at.toISOString();
  const saved = await sessions.updateOne(
    { _id: sessionId, tenantId, sourceId: session.sourceId, "indexAttempt.generation": attempt.generation, "indexAttempt.state": attempt.state, "indexAttempt.phase": attempt.phase },
    { $set: { "indexAttempt.state": "failed", "indexAttempt.phase": "preflight", "indexAttempt.finishedAt": stamp, "status.index": "failed",
      indexRecovery: { at: stamp, by, reason, generation: attempt.generation, previousState: attempt.state, previousPhase: attempt.phase, forced } } });
  if (saved.acknowledged !== true || saved.matchedCount !== 1)
    return { ...r, status: "conflict", detail: "the attempt changed (or the session was removed) since it was read; nothing was written. Re-run the dry run" };
  return { ...r, status: "recovered", forced, reset: { from: `${attempt.state}/${attempt.phase}`, to: "failed/preflight" } };
}

export function format(r) {
  const a = r.artifacts, art = a ? Object.entries(a).map(([k, v]) => `${k}=${v.total}(abandoned-gen ${v.fromAbandonedGeneration})`).join(" ") : "-";
  return [`${r.apply ? "APPLY" : "DRY-RUN"} tenant=${r.tenantId} session=${r.sessionId} => ${String(r.status).toUpperCase()}`,
    `  attempt: generation=${r.generation ?? "-"} state=${r.state ?? "-"} phase=${r.phase ?? "-"} startedAt=${r.startedAt ?? "-"} ageMinutes=${r.ageMinutes ?? "-"} status.index=${r.statusIndex ?? "-"}`,
    `  artifacts for session: ${art}`,
    ...(r.wouldReset ? [`  would reset ${r.wouldReset.from} -> ${r.wouldReset.to}`] : []), ...(r.reset ? [`  reset ${r.reset.from} -> ${r.reset.to}`] : []),
    ...(r.detail ? [`  ${r.detail}`] : []), ...r.warnings.map(w => `  WARNING: ${w}`)].join("\n");
}

export async function main(argv, env, io = {}) {
  const out = io.out ?? console.log, args = parseArgs(argv);
  const { requireScriptDatabase } = await import("../lib/transcript-provenance.mjs");
  const target = requireScriptDatabase(env, argv, { allowProduction: true });
  const { connect, getDb, close, scopedCollection } = await io.loadDb();
  await connect(target.url, target.dbName);
  try {
    const result = await recoverIndexAttempt({ db: getDb(), scopedCollection, tenantId: args.tenant, sessionId: args.session, apply: args.apply, reason: args.reason,
      by: args.by ?? `${os.userInfo().username}@${os.hostname()}`, forceRunning: args.forceRunning, thresholdMinutes: args.thresholdMinutes });
    out(`database=${target.dbName}\n${format(result)}`);
    return result;
  } finally { await close?.(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const { register } = await import("tsx/esm/api");
  register();
  const { loadSharedDb } = await import("../lib/shared-db.mjs");
  try {
    const result = await main(process.argv.slice(2), process.env, { loadDb: loadSharedDb });
    if (!["dry_run", "recovered"].includes(result.status)) process.exitCode = 1;
  } catch (e) { console.error(`recover-index-attempt: ${e.message}`); process.exitCode = 1; }
}

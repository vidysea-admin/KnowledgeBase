#!/usr/bin/env node
/**
 * scripts/whatsapp/sync-links.mjs - whatsapp-multiuser W9 (R-31, R-33..R-35, R-37). Scheduled sync of every `active`
 * whatsapp_links row: one lock per link, the same reviewed ingest composition the route uses, one whatsapp_sync_runs
 * row per link run, archiver liveness into `health.*`. Operator notes: docs/whatsapp/sync.md.
 *   node --import tsx scripts/whatsapp/sync-links.mjs [--once] [--i-know-this-is-production=true]
 * Everything outside this file is a PORT (`deps`), so the cycle is testable with fakes and a fake clock. The lock is the
 * T-038 token-owned protocol (docs/t038-scheduler-service.md). Never logs a jid, owner id, message text or upstream text.
 */
import { join, resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIN_INTERVAL_MIN = 5, MAX_INTERVAL_MIN = 1440, DEFAULT_INTERVAL_MIN = 15;
export const DEFAULT_GROUP_TIMEOUT_MS = 120_000, DEFAULT_MAX_MESSAGES = 20_000; // spec section 10 [ASSUMPTION]
export const ERROR_CODES = Object.freeze(["archive_unreachable", "archiver_api_unreachable", "not_configured", "link_inactive", "store_transaction_unavailable", "snapshot_shrink_refused", "unknown"]);
const LINK_ID = /^[0-9a-f]{24}$/, GROUP_JID = /^[0-9A-Za-z._-]{1,64}@g\.us$/;
const STATUS_ENUM = ["connecting", "awaiting_qr", "connected", "reconnecting", "logged_out", "closed"];
const ADMIN_KEY = Object.freeze({ kind: "key", admin: true }); // internal caller: every active link of one tenant, narrowed per link below

/** Cadence in minutes, clamped to 5..1440; anything non-numeric falls back to 15. */
export function clampIntervalMinutes(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && String(raw ?? "").trim() !== "" ? Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.trunc(n))) : DEFAULT_INTERVAL_MIN;
}
/** Maps any failure to the closed R-33 list. Names and codes only; the message text is never read or kept. */
export function classifyError(error) {
  const name = error?.name, code = error?.code;
  if (name === "WhatsAppNotConfiguredError") return "not_configured";
  if (name === "WhatsAppUnavailableError") return "archive_unreachable";
  if (name === "SnapshotShrinkError") return "snapshot_shrink_refused";
  if (name === "ArchiverError") return code === "archiver_api_unavailable" ? "archiver_api_unreachable" : "unknown";
  if (code === 20 || code === 251 || /ransaction/.test(String(error?.message ?? "")) && /replica|ransaction numbers|unavailable/.test(String(error?.message ?? ""))) return "store_transaction_unavailable";
  return "unknown";
}
const capError = (name) => Object.assign(new Error(name), { name });
const isCap = (error) => error?.name === "GroupTimeoutError" || error?.name === "GroupSizeCapError";
function withTimeout(promise, ms, onLate) {
  let timer;
  const cap = new Promise((_, reject) => { timer = setTimeout(() => reject(capError("GroupTimeoutError")), ms); });
  return Promise.race([promise, cap]).catch((e) => { if (isCap(e)) promise.then(onLate, onLate); throw e; }).finally(() => clearTimeout(timer));
}
const diff = (after, before) => [...after].filter((id) => !before.has(id)).length;

/** One link, one cycle. Returns the run row (also persisted). A lock that is lost mid-run refuses every further write. */
export async function syncLink(deps, tenantId, grant) {
  const startedAt = deps.now().toISOString(), { linkId, ownerUserId } = grant;
  const lockPath = join(deps.lockDir, `link-${linkId}.lock`);
  if (!LINK_ID.test(linkId)) throw new Error("syncLink: invalid link id");
  const row = { linkId, startedAt, status: "ok", errorCode: null, groups: [] };
  const persist = async () => { row.endedAt = deps.now().toISOString(); await deps.recordRun(tenantId, row); return row; };
  let token;
  try { token = deps.lock.acquire(lockPath); } catch { row.status = "skipped"; return persist(); } // another instance holds it (T-038)
  const owned = () => { if (!deps.lock.owned(lockPath, token)) throw capError("LockLostError"); };
  const end = async (status, errorCode = null) => { row.status = status; row.errorCode = errorCode; owned(); return persist(); };
  try {
    const link = await deps.getLink(tenantId, linkId);
    if (!link || link.state !== "active" || link.archiverOwnerId !== ownerUserId) return await end("skipped", "link_inactive");
    const flags = new Set(link.health?.flags ?? []), patch = { lastRunAt: startedAt }, raised = [];
    const flag = (name, on) => { if (on && !flags.has(name)) raised.push(name); on ? flags.add(name) : flags.delete(name); };
    // R-34 liveness. An unreachable control plane never stops the data-plane sync of already marked groups (section 10).
    const live = await deps.getStatus(ownerUserId).catch(() => null);
    if (live?.status && STATUS_ENUM.includes(live.status)) { patch.lastStatus = live.status; patch.lastStatusAt = startedAt; }
    const loggedOut = live?.status === "logged_out";
    if (live?.status) flag("needs-relink", loggedOut);
    let hitCap = false, listFailure = null, aborted = false;
    if (!loggedOut) {
      let groups = [];
      try { groups = (await deps.listGroups(tenantId, grant)).filter((g) => GROUP_JID.test(g.groupJid)); } catch (e) { listFailure = classifyError(e); }
      for (const { groupJid } of groups) {
        owned();
        const fresh = await deps.getLink(tenantId, linkId);
        if (fresh?.state !== "active") { aborted = true; break; } // suspended/unlinked mid-run: nothing new is scheduled (section 10)
        const key = `${tenantId}|${linkId}|${groupJid}`, g = { groupJid, fetched: 0, newTurns: 0, candidatesCreated: 0, skippedDeleted: 0, errorCode: null };
        row.groups.push(g);
        if (deps.inflight.has(key)) { g.errorCode = "unknown"; hitCap = true; continue; } // an earlier timed-out ingest is still finishing
        const done = () => deps.inflight.delete(key);
        try {
          const before = await deps.footprint(tenantId, grant, groupJid);
          deps.inflight.add(key);
          const result = await withTimeout(deps.ingestGroup(tenantId, grant, groupJid), deps.groupTimeoutMs, done);
          done();
          const after = await deps.footprint(tenantId, grant, groupJid, result.sessionId);
          Object.assign(g, { fetched: result.turnCount, newTurns: diff(after.turns, before.turns), skippedDeleted: diff(before.turns, after.turns), candidatesCreated: diff(after.candidates, before.candidates) });
        } catch (e) {
          if (e?.name === "LockLostError") throw e;
          g.errorCode = isCap(e) ? "unknown" : classifyError(e);
          if (isCap(e)) { hitCap = true; if (e.name === "GroupTimeoutError") break; } else done();
        }
      }
    }
    const errs = row.groups.filter((g) => g.errorCode), ok = !listFailure && errs.length === 0 && !aborted && !loggedOut;
    if (loggedOut) { row.status = "skipped"; row.errorCode = "link_inactive"; }
    else if (listFailure) { row.status = "failed"; row.errorCode = listFailure; }
    else if (errs.length) {
      row.errorCode = errs[0].errorCode;
      row.status = !hitCap && errs.length === row.groups.length && errs.every((g) => g.errorCode !== "snapshot_shrink_refused") ? "failed" : "partial";
    } else if (aborted) { row.status = "partial"; row.errorCode = "link_inactive"; }
    if (ok) { patch.lastSuccessAt = startedAt; }
    const base = Date.parse(link.health?.lastSuccessAt ?? link.activatedAt ?? startedAt);
    flag("error", row.status === "failed");
    flag("stale", !ok && Date.parse(startedAt) - base > 3 * deps.intervalMs);
    patch.flags = [...flags];
    owned();
    await persist();
    await deps.updateHealth(tenantId, linkId, patch);
    for (const kind of raised.filter((k) => k === "needs-relink" || k === "error")) deps.alert({ kind, tenantId, linkId }); // R-35, admins only, once per transition
    return row;
  } catch (e) {
    if (e?.name === "LockLostError") { deps.log(`link ${linkId}: lock ownership lost; writes refused`); return row; }
    throw e;
  } finally { try { deps.lock.release(lockPath, token); } catch { /* a lost lock is left untouched by the protocol */ } }
}

/** R-7 follow-through owned by W8: archiver unlink retried each cycle for terminal links still flagged pending, until confirmed. */
export async function driveArchiverUnlinks(deps, tenantId) {
  for (const { linkId, ownerUserId } of await deps.pendingUnlinks(tenantId)) {
    try { await deps.unlinkArchiver(ownerUserId); await deps.confirmUnlink(tenantId, linkId); deps.log(`link ${linkId}: archiver unlink confirmed`); }
    catch (e) { deps.log(`link ${linkId}: archiver unlink retry later (${classifyError(e)})`); }
  }
}

/** One tick over every tenant. One failing link, tenant or lookup never stops the others (R-31). */
export async function runCycle(deps) {
  const runs = [];
  let tenants = [];
  try { tenants = await deps.listTenantIds(); } catch (e) { deps.log(`tenant listing failed (${classifyError(e)})`); }
  for (const tenantId of tenants) {
    let grants = [];
    try { grants = await deps.activeLinks(tenantId); }
    catch (e) { if (classifyError(e) !== "not_configured") deps.log(`tenant ${tenantId}: link lookup failed (${classifyError(e)})`); }
    for (const grant of grants) {
      try { runs.push(await syncLink(deps, tenantId, grant)); } catch (e) { deps.log(`link ${grant.linkId}: run not recorded (${classifyError(e)})`); }
    }
    try { await driveArchiverUnlinks(deps, tenantId); } catch (e) { deps.log(`tenant ${tenantId}: unlink retries failed (${classifyError(e)})`); }
  }
  return runs;
}

/** Repeats runCycle every `intervalMin` (clamped). `schedule(fn, ms)` returns a cancel function; tests drive it with a fake clock. */
export function startScheduler(deps, { intervalMin, schedule = (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); } } = {}) {
  const intervalMs = clampIntervalMinutes(intervalMin) * 60_000;
  let stopped = false, cancel = () => {}, running = Promise.resolve();
  const tick = async () => {
    running = runCycle(deps).catch((e) => deps.log(`cycle failed (${classifyError(e)})`));
    await running;
    if (!stopped) cancel = schedule(tick, intervalMs);
  };
  const first = tick();
  return { intervalMs, first, async stop() { stopped = true; cancel(); await running; } };
}

/** T-038 token-owned file lock behind the three-method port the cycle uses. */
export async function createFileLock(options = {}) {
  const { acquireLock, lockStillOwned, releaseLock } = await import("../../packages/ingest/src/join-policy/join-rules-store-lock.ts");
  return { acquire: (p) => acquireLock(p, { waitMs: 0, ...options }), owned: (p, t) => lockStillOwned(p, t), release: (p, t) => releaseLock(p, t) };
}

/**
 * Real wiring. Needs tsx registered by the caller. `db` is the configured app database; archiver calls go through the W3 client;
 * the per-link ingest uses a resolver pinned to that one link, so a link can only ever sync its own owner's marked groups.
 */
export async function createWiredDeps({ db, env = process.env, root, log = console.log, now = () => new Date(), archiver, storeOptions = {}, lockOptions, limits = {} }) {
  const ownerConfig = await import("../../apps/api/src/whatsapp/owner-config.ts");
  const { createWhatsAppReviewWiring } = await import("../../apps/api/src/whatsapp/review/compose.ts");
  const { fetchWhatsAppMessages } = await import("../../apps/api/src/whatsapp/store.ts");
  const { sha256Hex } = await import("../../apps/api/src/hash.ts");
  const { whatsAppLinkStores, newWhatsAppId } = await import("../../packages/db/src/collections/whatsapp-links.ts");
  const { scopedCollection } = await import("../../packages/db/src/lib/tenantScope.ts");
  const { loadArchiverConfig } = await import("../../apps/api/src/whatsapp/archiver/config.ts");
  const { createArchiverClient } = await import("../../apps/api/src/whatsapp/archiver/client.ts");
  const stores = whatsAppLinkStores(db), maxMessages = limits.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const entries = ownerConfig.parseWhatsAppOwnerMap(env.WHATSAPP_TENANT_OWNER_MAP); // throws on an invalid map: the service refuses to start
  const resolver = ownerConfig.createDbBackedWhatsAppOwners({ rawMap: env.WHATSAPP_TENANT_OWNER_MAP, db, log: { info: log, warn: log } });
  const config = archiver === undefined ? loadArchiverConfig(env) : null, client = archiver ?? (config ? createArchiverClient(config) : null);
  const capped = async (jid, owner) => {
    const messages = await (storeOptions.fetchMessages ?? fetchWhatsAppMessages)(jid, owner);
    if (messages.length > maxMessages) throw capError("GroupSizeCapError");
    return messages;
  };
  // Pinned resolver: re-reads the link row, so a suspension between enumeration and ingest fails closed.
  const wiringFor = ({ linkId, ownerUserId }) => createWhatsAppReviewWiring({ ...storeOptions, appDb: () => db, fetchMessages: capped, now: () => now().toISOString(),
    resolveOwners: async (tenantId) => {
      const link = await stores.getLink(tenantId, linkId);
      if (link?.state === "active" && link.archiverOwnerId === ownerUserId) return [{ linkId, ownerUserId }];
      throw new ownerConfig.WhatsAppNotConfiguredError();
    } }).whatsapp;
  const lockDir = join(root, "data", "whatsapp-sync");
  mkdirSync(lockDir, { recursive: true });
  return {
    now, log, lockDir, lock: await createFileLock(lockOptions), inflight: new Set(), intervalMs: clampIntervalMinutes(env.WHATSAPP_SYNC_INTERVAL_MIN) * 60_000,
    groupTimeoutMs: limits.groupTimeoutMs ?? DEFAULT_GROUP_TIMEOUT_MS,
    // ISS-WAOWNER-001: the legacy seed runs (through the resolver) before whatsapp_links is read to find tenants or links.
    async listTenantIds() {
      for (const { tenantId } of entries) await resolver(tenantId, ADMIN_KEY).catch(() => {});
      return [...new Set([...entries.map((e) => e.tenantId), ...await db.collection("whatsapp_links").distinct("tenantId", { state: "active" })])];
    },
    activeLinks: async (tenantId) => (await resolver(tenantId, ADMIN_KEY)).map(({ linkId, ownerUserId }) => ({ linkId, ownerUserId })),
    getLink: (tenantId, linkId) => stores.getLink(tenantId, linkId),
    listGroups: async (tenantId, grant) => (await wiringFor(grant).listGroups(tenantId)).filter((g) => g.ownerUserId === grant.ownerUserId),
    ingestGroup: (tenantId, grant, groupJid) => wiringFor(grant).ingestGroup(tenantId, groupJid),
    async footprint(tenantId, { ownerUserId }, groupJid, sessionId = sha256Hex(`${groupJid}:${ownerUserId}`)) {
      const ids = async (name, filter) => new Set((await scopedCollection(db, name)(tenantId).find(filter).project({ _id: 1 }).toArray()).map((r) => r._id));
      return { turns: await ids("turns", { sessionId }), candidates: await ids("whatsapp_candidates", { sessionId }) };
    },
    getStatus: async (ownerUserId) => (client ? client.getSession(ownerUserId) : null),
    recordRun: (tenantId, run) => stores.syncRuns(tenantId).insertOne({ _id: newWhatsAppId(), ...run }),
    updateHealth: (tenantId, linkId, patch) => stores.links(tenantId).updateOne({ _id: linkId }, { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`health.${k}`, v])) }),
    alert: ({ kind, tenantId, linkId }) => console.error(`ALERT whatsapp-sync: link ${linkId} ${kind} (tenant ${tenantId})`), // Telegram channel is plan H-13
    // W8 contract: a terminal link with `archiverUnlinkPending: true` still owes the archiver an unlink.
    pendingUnlinks: async (tenantId) => client ? (await stores.links(tenantId).find({ state: { $in: ["unlinked", "revoked"] }, archiverUnlinkPending: true }).toArray())
      .filter((l) => typeof l.archiverOwnerId === "string").map((l) => ({ linkId: l._id, ownerUserId: l.archiverOwnerId })) : [],
    unlinkArchiver: async (ownerUserId) => { await client.unlinkSession(ownerUserId).catch((e) => { if (!["owner_not_found", "owner_unlinked"].includes(e?.code)) throw e; }); },
    confirmUnlink: (tenantId, linkId) => stores.links(tenantId).updateOne({ _id: linkId }, { $unset: { archiverUnlinkPending: "" } }),
  };
}

async function main(argv, env) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  (await import("tsx/esm/api")).register();
  await import("dotenv/config");
  const { requireScriptDatabase } = await import("../lib/transcript-provenance.mjs");
  const { url, dbName } = requireScriptDatabase(env, argv, { allowProduction: true }); // refuses lkb/lkb_prod unless the explicit production flag is given
  const { MongoClient } = await import("mongodb");
  const client = await new MongoClient(url).connect();
  const deps = await createWiredDeps({ db: client.db(dbName), env, root });
  if (argv.includes("--once")) { await runCycle(deps); await client.close(); return; }
  const scheduler = startScheduler(deps, { intervalMin: env.WHATSAPP_SYNC_INTERVAL_MIN });
  const stop = async () => { await scheduler.stop(); await client.close(); process.exit(0); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2), process.env).catch((e) => { console.error(`sync-links failed (${classifyError(e)})`); process.exit(1); });

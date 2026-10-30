// scripts/whatsapp/sync-links.test.mjs - W9. Fakes only (no Mongo, no network beyond the in-repo fake archiver on 127.0.0.1); run:
//   node --test --import tsx scripts/whatsapp/sync-links.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clampIntervalMinutes, classifyError, runCycle, startScheduler, syncLink, createFileLock, createWiredDeps, ERROR_CODES, createAdminAlertSink, feedChannel } from "./sync-links.mjs";
import { startFakeArchiver } from "../../apps/api/src/whatsapp/archiver/fake-archiver.ts";
import { createArchiverClient } from "../../apps/api/src/whatsapp/archiver/client.ts";
import { loadArchiverConfig } from "../../apps/api/src/whatsapp/archiver/config.ts";

const dirs = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "w9-sync-")); dirs.push(d); return d; };
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const T = "tenant-a", LA = "a".repeat(24), LB = "b".repeat(24), OA = "1".repeat(24), OB = "2".repeat(24);
const JA = "111111-1@g.us", JB = "222222-2@g.us";
const T0 = Date.parse("2026-10-30T10:00:00.000Z");

/** In-memory ports. `world.messages[jid]` is the archive; ingest mirrors the real store's upsert so counts can be derived. */
async function harness(over = {}) {
  const lockDir = scratch(), clock = { t: T0 };
  const world = { links: { [LA]: { _id: LA, tenantId: T, state: "active", archiverOwnerId: OA, activatedAt: "2026-10-30T09:55:00.000Z" }, [LB]: { _id: LB, tenantId: T, state: "active", archiverOwnerId: OB, activatedAt: "2026-10-30T09:55:00.000Z" } },
    groups: { [OA]: [JA], [OB]: [JB] }, messages: { [JA]: ["m1", "m2"], [JB]: ["m1"] }, turns: {}, candidates: {}, runs: [], health: {}, alerts: [], events: [], ingests: [], statuses: {}, unlinked: [], pending: [], logs: [], failIngest: {} };
  const deps = {
    now: () => new Date(clock.t), log: (l) => world.logs.push(l), lockDir, lock: await createFileLock(), inflight: new Set(), intervalMs: 15 * 60_000, groupTimeoutMs: 200,
    listTenantIds: async () => [T], activeLinks: async () => Object.values(world.links).filter((l) => l.state === "active").map((l) => ({ linkId: l._id, ownerUserId: l.archiverOwnerId })),
    getLink: async (_t, id) => world.links[id] ? { ...world.links[id], health: { ...world.links[id].health, ...world.health[id] } } : null,
    listGroups: async (_t, g) => (world.listFail?.[g.linkId] ? Promise.reject(Object.assign(new Error("secret-host:27018 down"), { name: "WhatsAppUnavailableError" })) : world.groups[g.ownerUserId].map((groupJid) => ({ groupJid }))),
    ingestGroup: async (_t, g, jid) => {
      world.ingests.push(`${g.linkId}:${jid}`);
      if (world.failIngest[g.linkId]) throw Object.assign(new Error("raw upstream text SECRET-BODY"), { name: world.failIngest[g.linkId] });
      if (world.hang) await new Promise(() => {});
      const sid = `s:${jid}:${g.ownerUserId}`; world.turns[sid] ??= new Set(); world.candidates[sid] ??= new Set();
      const before = world.turns[sid].size;
      for (const m of world.messages[jid]) { world.turns[sid].add(m); if (/^m[12]$/.test(m)) world.candidates[sid].add(`c-${m}`); }
      return { sessionId: sid, sourceId: "src", turnCount: world.messages[jid].length, before };
    },
    footprint: async (_t, g, jid) => { const sid = `s:${jid}:${g.ownerUserId}`; return { turns: new Set(world.turns[sid] ?? []), candidates: new Set(world.candidates[sid] ?? []) }; },
    getStatus: async (o) => world.statuses[o] ?? null,
    recordRun: async (_t, run) => { world.runs.push(structuredClone(run)); return world.runs.length.toString(16).padStart(24, "0"); },
    appendEvent: async (t, e) => { if (world.eventsFail) throw new Error("SECRET-EVENT-TEXT"); world.events.push({ tenantId: t, ...structuredClone(e) }); },
    updateHealth: async (_t, id, { flagsAdd = [], flagsRemove = [], ...rest }) => { // mirrors the wired $set + $addToSet + $pull
      const h = { ...world.health[id], ...rest }; h.flags = [...new Set([...(h.flags ?? []), ...flagsAdd])].filter((f) => !flagsRemove.includes(f)); world.health[id] = h;
    },
    alert: (a) => world.alerts.push(a), pendingUnlinks: async () => world.pending, unlinkArchiver: async (o) => { world.unlinked.push(o); }, confirmUnlink: async (_t, id) => { world.pending = world.pending.filter((p) => p.linkId !== id); },
    ...over,
  };
  return { deps, world, clock, lockDir };
}
const runOf = (world, linkId) => world.runs.filter((r) => r.linkId === linkId);

test("W9-1 cadence is clamped 5..1440 minutes and the loop reschedules at that cadence (fake clock)", async () => {
  assert.deepEqual([undefined, "", "abc", 1, 5, 15, 1440, 99999, "30"].map(clampIntervalMinutes), [15, 15, 15, 5, 5, 15, 1440, 1440, 30]);
  const { deps, world } = await harness();
  const timers = [];
  const s = startScheduler(deps, { intervalMin: 1, schedule: (fn, ms) => { timers.push({ fn, ms }); return () => { timers.length = 0; }; } });
  await s.first;
  assert.equal(s.intervalMs, 5 * 60_000); assert.deepEqual(timers.map((t) => t.ms), [5 * 60_000]);
  assert.equal(runOf(world, LA).length, 1);
  await timers[0].fn(); // the fake clock fires the timer
  assert.equal(runOf(world, LA).length, 2); assert.equal(timers.length, 2);
  await s.stop();
  assert.equal(timers.length, 0, "stop cancels the pending timer");
});

test("W9-1 only active links sync: requested/approved/suspended/unlinked/revoked/rejected never; a link suspended after enumeration is skipped link_inactive", async () => {
  const { deps, world } = await harness();
  for (const [i, state] of ["requested", "approved", "suspended", "unlinked", "revoked", "rejected"].entries()) world.links[`${i}`.repeat(24)] = { _id: `${i}`.repeat(24), tenantId: T, state, archiverOwnerId: `${i + 3}`.repeat(24) };
  world.groups[`${3}`.repeat(24)] = ["999999-9@g.us"];
  await runCycle(deps);
  assert.deepEqual(world.ingests.sort(), [`${LA}:${JA}`, `${LB}:${JB}`].sort());
  world.runs.length = 0; world.ingests.length = 0; world.links[LA].state = "suspended"; // suspended between enumeration and the run
  const grants = [{ linkId: LA, ownerUserId: OA }];
  deps.activeLinks = async () => grants;
  await runCycle(deps);
  assert.equal(world.ingests.length, 0);
  assert.deepEqual([runOf(world, LA)[0].status, runOf(world, LA)[0].errorCode], ["skipped", "link_inactive"]);
});

test("W9-1 only the groups the link's owner marked are ingested, each once, with counts in the run row", async () => {
  const { deps, world } = await harness();
  world.groups[OA] = [JA, "333333-3@g.us"]; world.messages["333333-3@g.us"] = ["x1"];
  await runCycle(deps);
  assert.deepEqual(world.ingests.filter((i) => i.startsWith(LA)), [`${LA}:${JA}`, `${LA}:333333-3@g.us`]);
  assert.ok(!world.ingests.some((i) => i.includes(OB) || (i.startsWith(LA) && i.endsWith(JB))), "never crosses owners");
  const row = runOf(world, LA)[0];
  assert.equal(row.status, "ok"); assert.deepEqual(row.groups[0], { groupJid: JA, fetched: 2, newTurns: 2, candidatesCreated: 2, skippedDeleted: 0, errorCode: null });
  assert.match(row.startedAt, /Z$/); assert.ok(row.endedAt);
});

test("W9-2 two instances: the second is refused by the token-owned lock and records skipped; the first still finishes", async () => {
  const { deps, world, lockDir } = await harness();
  let release; const gate = new Promise((r) => { release = r; });
  const slow = { ...deps, ingestGroup: async (...a) => { await gate; return deps.ingestGroup(...a); } };
  const first = syncLink(slow, T, { linkId: LA, ownerUserId: OA });
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(readdirSync(lockDir).includes(`link-${LA}.lock`));
  const second = await syncLink(deps, T, { linkId: LA, ownerUserId: OA });
  assert.equal(second.status, "skipped"); assert.equal(world.ingests.length, 0, "the loser ingested nothing");
  release(); const done = await first;
  assert.equal(done.status, "ok"); assert.deepEqual(readdirSync(lockDir), [], "release removes only our lock");
  assert.deepEqual(runOf(world, LA).map((r) => r.status).sort(), ["ok", "skipped"]);
});

test("W9-2 stale lock follows t038: a dead holder on this host past staleMs is taken over, a live holder is not", async () => {
  const { lockDir, world, deps } = await harness();
  const path = join(lockDir, `link-${LA}.lock`);
  const old = await createFileLock({ now: () => T0 - 3_600_000 });
  const stale = old.acquire(path); assert.ok(stale);
  const alive = await createFileLock({ isAlive: () => "alive", now: () => T0 });
  assert.equal((await syncLink({ ...deps, lock: alive }, T, { linkId: LA, ownerUserId: OA })).status, "skipped");
  const dead = await createFileLock({ isAlive: () => "dead", staleMs: 1, now: () => T0 });
  assert.equal((await syncLink({ ...deps, lock: dead }, T, { linkId: LA, ownerUserId: OA })).status, "ok");
  assert.equal(world.ingests.length, 1);
});

test("W9-2 a lock lost mid-run refuses every further write (no run row, no health, no second group)", async () => {
  const { deps, world, lockDir } = await harness();
  world.groups[OA] = [JA, "333333-3@g.us"]; world.messages["333333-3@g.us"] = ["x"];
  const ingest = deps.ingestGroup;
  deps.ingestGroup = async (...a) => { const r = await ingest(...a); unlinkSync(join(lockDir, `link-${LA}.lock`)); writeFileSync(join(lockDir, `link-${LA}.lock`), JSON.stringify({ token: "someone-else", pid: 1, host: "x", at: 1 })); return r; };
  await syncLink(deps, T, { linkId: LA, ownerUserId: OA });
  assert.equal(world.ingests.length, 1); assert.equal(runOf(world, LA).length, 0); assert.equal(world.health[LA], undefined);
  assert.ok(world.logs.some((l) => /lock ownership lost/.test(l)));
  assert.deepEqual(readdirSync(lockDir), [`link-${LA}.lock`], "someone else's lock is left untouched");
});

test("W9-3 link A failing does not stop link B; both have a run row with a closed-list errorCode and no upstream text", async () => {
  const { deps, world } = await harness();
  world.failIngest[LA] = "WhatsAppUnavailableError";
  await runCycle(deps);
  const [a, b] = [runOf(world, LA)[0], runOf(world, LB)[0]];
  assert.deepEqual([a.status, a.errorCode, a.groups[0].errorCode], ["failed", "archive_unreachable", "archive_unreachable"]);
  assert.equal(b.status, "ok");
  for (const r of world.runs) { assert.ok(!JSON.stringify(r).includes("SECRET-BODY")); for (const c of [r.errorCode, ...r.groups.map((g) => g.errorCode)]) assert.ok(c === null || ERROR_CODES.includes(c)); }
  assert.ok(!world.logs.join("\n").includes("SECRET-BODY"));
  assert.deepEqual(world.health[LA].flags, ["error"]); assert.deepEqual(world.alerts, [{ kind: "error", tenantId: T, linkId: LA }]);
  await runCycle(deps); // still failing: the flag is already set, so no second alert
  assert.equal(world.alerts.length, 1);
  world.failIngest[LA] = undefined; await runCycle(deps);
  assert.deepEqual(world.health[LA].flags, [], "a good run clears error");
});

test("W9-3 a store failure while recording link A's run does not stop link B (runCycle isolates each link)", async () => {
  const { deps, world } = await harness();
  const real = deps.recordRun;
  deps.recordRun = async (t, run) => { if (run.linkId === LA) throw Object.assign(new Error("SECRET-STORE-TEXT"), { name: "MongoServerError" }); return real(t, run); };
  const runs = await runCycle(deps);
  assert.deepEqual(runs.map((r) => r.linkId), [LB]);
  assert.equal(runOf(world, LB)[0].status, "ok");
  assert.ok(world.logs.some((l) => l.includes(LA) && l.includes("run not recorded")) && !world.logs.join(String.fromCharCode(10)).includes("SECRET-STORE-TEXT"));
  deps.recordRun = real; assert.equal((await syncLink(deps, T, { linkId: LA, ownerUserId: OA })).status, "ok", "A's lock was released, so a later run can take it");
});

test("W9-3 classifyError maps to the closed list and never reads message text", () => {
  const e = (name, extra = {}) => Object.assign(new Error("SECRET"), { name, ...extra });
  assert.deepEqual([e("WhatsAppNotConfiguredError"), e("WhatsAppUnavailableError"), e("SnapshotShrinkError"), e("ArchiverError", { code: "archiver_api_unavailable" }), e("ArchiverError", { code: "rate_limited" }), e("MongoServerError", { code: 20 }), e("Error")].map(classifyError),
    ["not_configured", "archive_unreachable", "snapshot_shrink_refused", "archiver_api_unreachable", "unknown", "store_transaction_unavailable", "unknown"]);
});

test("W9-3 a shrink-refused group is partial (not failed); a listing failure is failed", async () => {
  const { deps, world } = await harness();
  world.failIngest[LA] = "SnapshotShrinkError"; world.listFail = { [LB]: true };
  await runCycle(deps);
  assert.deepEqual([runOf(world, LA)[0].status, runOf(world, LA)[0].errorCode], ["partial", "snapshot_shrink_refused"]);
  assert.deepEqual([runOf(world, LB)[0].status, runOf(world, LB)[0].errorCode], ["failed", "archive_unreachable"]);
});

test("W9-4 re-run with no new messages: zero new turns and zero new candidates (counts), then one new message adds exactly one turn", async () => {
  const { deps, world } = await harness();
  await runCycle(deps); world.runs.length = 0;
  await runCycle(deps);
  for (const r of world.runs) for (const g of r.groups) assert.deepEqual([g.newTurns, g.candidatesCreated, g.skippedDeleted], [0, 0, 0]);
  world.messages[JA].push("m3"); world.runs.length = 0;
  await runCycle(deps);
  assert.deepEqual([runOf(world, LA)[0].groups[0].newTurns, runOf(world, LA)[0].groups[0].fetched], [1, 3]);
});

test("W9-5 a hung ingest hits the per-group time cap: run is partial, the lock is released, the late ingest is tracked, no hang", async () => {
  const { deps, world, lockDir } = await harness();
  world.hang = true; const t0 = Date.now();
  const row = await syncLink(deps, T, { linkId: LA, ownerUserId: OA });
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual([row.status, row.errorCode], ["partial", "unknown"]); assert.deepEqual(readdirSync(lockDir), []);
  assert.equal(deps.inflight.size, 1, "the detached ingest is remembered");
  world.hang = false; world.ingests.length = 0; world.runs.length = 0;
  await syncLink(deps, T, { linkId: LA, ownerUserId: OA }); // next cycle must not start a second ingest of the same group
  assert.equal(world.ingests.length, 0); assert.equal(runOf(world, LA)[0].status, "partial");
});

test("W9-5 the size cap (GroupSizeCapError) is partial, not failed", async () => {
  const { deps, world } = await harness();
  world.failIngest[LA] = "GroupSizeCapError";
  assert.equal((await syncLink(deps, T, { linkId: LA, ownerUserId: OA })).status, "partial");
});

test("W9-6 status poll updates health.lastStatus; logged_out sets needs-relink, skips sync, raises ONE alert; connected clears it", async () => {
  const { deps, world } = await harness();
  world.statuses[OA] = { status: "connected", updatedAt: "x" };
  await runCycle(deps);
  assert.equal(world.health[LA].lastStatus, "connected"); assert.equal(world.health[LA].lastStatusAt, "2026-10-30T10:00:00.000Z");
  world.statuses[OA] = { status: "logged_out", updatedAt: "x" }; world.ingests.length = 0; world.runs.length = 0;
  await runCycle(deps); await runCycle(deps);
  assert.deepEqual(world.health[LA].flags, ["needs-relink"]); assert.equal(world.ingests.filter((i) => i.startsWith(LA)).length, 0);
  assert.deepEqual(world.alerts, [{ kind: "needs-relink", tenantId: T, linkId: LA }]);
  assert.deepEqual([runOf(world, LA)[0].status, runOf(world, LA)[0].errorCode], ["skipped", "link_inactive"]);
  world.statuses[OA] = { status: "connected", updatedAt: "x" }; await runCycle(deps);
  assert.deepEqual(world.health[LA].flags, []);
  world.statuses[OA] = { status: "not_started", updatedAt: "x" }; await runCycle(deps);
  assert.equal(world.health[LA].lastStatus, "connected", "a status outside the schema enum is not written");
});

test("W9-6 an unreachable control plane keeps the data-plane sync going and writes no status; stale appears after 3 cycles without success", async () => {
  const { deps, world, clock } = await harness();
  deps.getStatus = async () => { throw Object.assign(new Error("x"), { name: "ArchiverError", code: "archiver_api_unavailable" }); };
  await runCycle(deps);
  assert.equal(runOf(world, LA)[0].status, "ok"); assert.equal(world.health[LA].lastStatus, undefined);
  world.failIngest[LA] = "WhatsAppUnavailableError"; clock.t += 4 * 15 * 60_000; await runCycle(deps);
  assert.deepEqual(world.health[LA].flags.sort(), ["error", "stale"]);
});

test("W9-7 pending archiver unlinks are retried each cycle until confirmed, then stop; failures are logged by code only", async () => {
  const { deps, world } = await harness();
  world.pending = [{ linkId: "c".repeat(24), ownerUserId: "3".repeat(24) }];
  let fail = true; deps.unlinkArchiver = async (o) => { world.unlinked.push(o); if (fail) throw Object.assign(new Error("SECRET"), { name: "ArchiverError", code: "archiver_api_unavailable" }); };
  await runCycle(deps); await runCycle(deps);
  assert.equal(world.unlinked.length, 2); assert.equal(world.pending.length, 1); assert.ok(!world.logs.join().includes("SECRET"));
  fail = false; await runCycle(deps); await runCycle(deps);
  assert.equal(world.unlinked.length, 3, "confirmed once, never called again"); assert.equal(world.pending.length, 0);
});

// ---- the real wiring over an in-memory Db and the in-repo fake archiver (W3) ----
function fakeDb({ failInserts = 0 } = {}) {
  const tables = {}; const t = (n) => (tables[n] ??= []); let failing = failInserts;
  const leaf = (r, path) => { const p = path.split("."); let o = r; for (const s of p.slice(0, -1)) o = o[s] ??= {}; return [o, p.at(-1)]; };
  const match = (r, f) => Object.entries(f).every(([k, v]) => (v && typeof v === "object" && "$in" in v ? v.$in.includes(r[k]) : r[k] === v));
  const cursor = (rows) => ({ toArray: async () => rows, project: () => cursor(rows) });
  const db = { collection: (n) => ({
    find: (f) => cursor(t(n).filter((r) => match(r, f))), findOne: async (f) => t(n).find((r) => match(r, f)) ?? null,
    distinct: async (k, f) => [...new Set(t(n).filter((r) => match(r, f)).map((r) => r[k]))],
    insertOne: async (d) => { if (n === "whatsapp_links" && failing > 0) { failing--; throw Object.assign(new Error("store down SECRET-INSERT"), { name: "MongoNetworkError" }); } if (n === "whatsapp_links" && t(n).some((r) => r.archiverOwnerId === d.archiverOwnerId)) throw Object.assign(new Error("dup"), { code: 11000 }); t(n).push(structuredClone(d)); return { acknowledged: true }; },
    updateOne: async (f, u) => { const r = t(n).find((x) => match(x, f)); if (!r) return { matchedCount: 0 }; for (const [k, v] of Object.entries(u.$set ?? {})) { const [o, last] = leaf(r, k); o[last] = v; }
      for (const [k, v] of Object.entries(u.$addToSet ?? {})) { const [o, last] = leaf(r, k); o[last] ??= []; for (const x of v.$each) if (!o[last].includes(x)) o[last].push(x); }
      for (const [k, v] of Object.entries(u.$pull ?? {})) { const [o, last] = leaf(r, k); if (Array.isArray(o[last])) o[last] = o[last].filter((x) => !v.$in.includes(x)); }
      for (const k of Object.keys(u.$unset ?? {})) delete r[k]; return { matchedCount: 1 }; },
  }) };
  return { db, tables };
}
const quiet = () => {};

test("ISS-WAOWNER-001: a tenant with ONLY the env map (no link rows yet) is seeded before whatsapp_links is read, then syncs", async () => {
  const { db, tables } = fakeDb();
  const reads = [];
  const spy = { collection: (n) => { const c = db.collection(n); return { ...c, find: (f) => { reads.push(`find:${n}:${tables.whatsapp_links?.length ?? 0}`); return c.find(f); }, distinct: (...a) => { reads.push(`distinct:${n}:${tables.whatsapp_links?.length ?? 0}`); return c.distinct(...a); } }; } };
  const env = { WHATSAPP_TENANT_OWNER_MAP: JSON.stringify([{ tenantId: "legacy-t", ownerUserId: OA }]) };
  const ingested = [];
  const deps = await createWiredDeps({ db: spy, env, root: scratch(), log: quiet, archiver: null,
    storeOptions: { listGroups: async (o) => [{ groupJid: JA, ownerUserId: o, subject: "S", trackedPersonCount: 1 }], fetchMessages: async () => [] } });
  deps.ingestGroup = async (t, g, jid) => { ingested.push([t, g.ownerUserId, jid]); return { sessionId: "s", sourceId: "x", turnCount: 0 }; };
  assert.deepEqual(await deps.listTenantIds(), ["legacy-t"]);
  const dist = reads.find((r) => r.startsWith("distinct:")); assert.equal(dist, "distinct:whatsapp_links:1", "the seed row existed before the first tenant-listing read");
  assert.equal(reads.filter((r) => r.endsWith(":0")).length, 1, "the only read of an empty collection is the seed's own existence check");
  deps.footprint = async () => ({ turns: new Set(), candidates: new Set() });
  const runs = await runCycle(deps);
  assert.equal(runs.length, 1); assert.equal(runs[0].status, "ok");
  assert.deepEqual(ingested, [["legacy-t", OA, JA]]);
  assert.equal(tables.whatsapp_sync_runs.length, 1); assert.equal(tables.whatsapp_sync_runs[0].tenantId, "legacy-t");
  assert.ok(tables.whatsapp_links[0].health.lastRunAt, "health written back to the link");
});
test("wired deps: only requested/suspended/other-tenant rows exist -> nothing to sync; listGroups of a link never returns another owner's groups", async () => {
  const { db, tables } = fakeDb();
  tables.whatsapp_links = [{ _id: LA, tenantId: T, state: "active", archiverOwnerId: OA }, { _id: LB, tenantId: T, state: "suspended", archiverOwnerId: OB }, { _id: "c".repeat(24), tenantId: "other", state: "active", archiverOwnerId: "3".repeat(24) }];
  const deps = await createWiredDeps({ db, env: {}, root: scratch(), log: quiet, archiver: null,
    storeOptions: { listGroups: async () => [{ groupJid: JA, ownerUserId: OA, subject: "x", trackedPersonCount: 1 }, { groupJid: JB, ownerUserId: OB, subject: "x", trackedPersonCount: 1 }], fetchMessages: async () => [] } });
  assert.deepEqual((await deps.listTenantIds()).sort(), [T, "other"].sort());
  assert.deepEqual((await deps.activeLinks(T)).map((g) => g.linkId), [LA]);
  assert.deepEqual((await deps.listGroups(T, { linkId: LA, ownerUserId: OA })).map((g) => g.groupJid), [JA]);
  tables.whatsapp_links[0].state = "suspended";
  await assert.rejects(() => deps.listGroups(T, { linkId: LA, ownerUserId: OA }), { name: "WhatsAppNotConfiguredError" }); // pinned resolver re-reads the row
  await assert.rejects(() => deps.ingestGroup(T, { linkId: LA, ownerUserId: OA }, JA), { name: "WhatsAppNotConfiguredError" });
});

test("W9-5 wired size cap: a group over limits.maxMessages is refused before anything is written, within the cap it is not", async () => {
  const { db, tables } = fakeDb();
  tables.whatsapp_links = [{ _id: LA, tenantId: T, state: "active", archiverOwnerId: OA }];
  const msgs = (n) => Array.from({ length: n }, (_, i) => ({ messageId: `m${i}`, personId: "p", displayName: "E", text: "Scholarship closes Friday.", ts: "2026-10-14T10:00:00.000Z" }));
  const mk = (n) => createWiredDeps({ db, env: {}, root: scratch(), log: quiet, archiver: null, limits: { maxMessages: 2 },
    storeOptions: { listGroups: async () => [{ groupJid: JA, ownerUserId: OA, subject: "S", trackedPersonCount: 1 }], fetchMessages: async () => msgs(n) } });
  await assert.rejects(async () => (await mk(3)).ingestGroup(T, { linkId: LA, ownerUserId: OA }, JA), { name: "GroupSizeCapError" });
  assert.equal((tables.turns ?? []).length, 0, "nothing written for the refused group");
  await assert.rejects(async () => (await mk(2)).ingestGroup(T, { linkId: LA, ownerUserId: OA }, JA), (e) => e?.name !== "GroupSizeCapError"); // within the cap it proceeds, then fails on the in-memory db (no transactions)
});

test("W3 fake archiver: the real client drives the status poll and the unlink retry through createWiredDeps", async () => {
  const fake = await startFakeArchiver(); after(() => fake.stop());
  const client = createArchiverClient(loadArchiverConfig({ WHATSAPP_ARCHIVER_API_URL: fake.url, WHATSAPP_ARCHIVER_API_TOKEN: fake.token, WHATSAPP_ARCHIVER_API_ALLOW_PRIVATE_HTTP: "1" }));
  const owner = await client.ensureOwner("d".repeat(24)); await client.startSession(owner.ownerId);
  fake.control.setStatus(owner.ownerId, "logged_out");
  const { db, tables } = fakeDb();
  tables.whatsapp_links = [{ _id: LA, tenantId: T, state: "active", archiverOwnerId: owner.ownerId }, { _id: LB, tenantId: T, state: "unlinked", archiverOwnerId: owner.ownerId, archiverUnlinkPending: true }];
  const deps = await createWiredDeps({ db, env: {}, root: scratch(), log: quiet, archiver: client, storeOptions: { listGroups: async () => [], fetchMessages: async () => [] } });
  const runs = await runCycle(deps);
  assert.equal(runs.length, 1); assert.deepEqual([runs[0].status, runs[0].errorCode], ["skipped", "link_inactive"]);
  assert.equal(tables.whatsapp_links[0].health.lastStatus, "logged_out"); assert.deepEqual(tables.whatsapp_links[0].health.flags, ["needs-relink"]);
  assert.equal(tables.whatsapp_links[1].archiverUnlinkPending, undefined, "confirmed unlink clears the pending flag");
  assert.equal(fake.control.owner(owner.ownerId).state, "unlinked");
  const again = await runCycle(deps); assert.equal(again.length, 1);
});

// ---- fix cycle 1 ----
test("W9-7 wired: a tenant whose ONLY link is a pending terminal link is listed (no faked listTenantIds); the unlink is retried until confirmed, then never again", async () => {
  const { db, tables } = fakeDb();
  const OC = "3".repeat(24), OD = "4".repeat(24);
  tables.whatsapp_links = [
    { _id: LA, tenantId: "solo", state: "unlinked", archiverOwnerId: OA, archiverUnlinkPending: true },
    { _id: LB, tenantId: "solo-revoked", state: "revoked", archiverOwnerId: OB, archiverUnlinkPending: true },
    { _id: "c".repeat(24), tenantId: "confirmed", state: "unlinked", archiverOwnerId: OC },
    { _id: "d".repeat(24), tenantId: "still-live", state: "suspended", archiverOwnerId: OD, archiverUnlinkPending: true }, // not terminal: no retry
  ];
  const calls = []; let fail = true;
  const archiver = { getSession: async () => null, unlinkSession: async (o) => { calls.push(o); if (fail && o === OA) throw Object.assign(new Error("SECRET"), { name: "ArchiverError", code: "archiver_api_unavailable" }); return {}; } };
  const deps = await createWiredDeps({ db, env: {}, root: scratch(), log: quiet, archiver, storeOptions: { listGroups: async () => [], fetchMessages: async () => [] } });
  assert.deepEqual((await deps.listTenantIds()).sort(), ["solo", "solo-revoked"]);
  assert.deepEqual(await runCycle(deps), [], "no active link anywhere: nothing to sync, but unlinks are still driven");
  assert.deepEqual(calls.sort(), [OA, OB].sort());
  assert.equal(tables.whatsapp_links[0].archiverUnlinkPending, true, "a failed unlink keeps the flag");
  assert.equal(tables.whatsapp_links[1].archiverUnlinkPending, undefined, "a confirmed unlink clears it");
  assert.equal(tables.whatsapp_links[3].archiverUnlinkPending, true);
  fail = false; calls.length = 0; await runCycle(deps);
  assert.deepEqual(calls, [OA]); assert.equal(tables.whatsapp_links[0].archiverUnlinkPending, undefined);
  calls.length = 0; await runCycle(deps); assert.deepEqual(calls, [], "confirmed: no more retries");
  assert.deepEqual(await deps.listTenantIds(), [], "and the tenant stops being listed");
});

test("W9-8 wired: an env-map tenant whose seed fails once is still listed, so the seed is retried in the same cycle and the link syncs (kills the env-tenant union mutant)", async () => {
  const { db, tables } = fakeDb({ failInserts: 1 });
  const logs = [];
  const env = { WHATSAPP_TENANT_OWNER_MAP: JSON.stringify([{ tenantId: "legacy-t", ownerUserId: OA }]) };
  const deps = await createWiredDeps({ db, env, root: scratch(), log: (l) => logs.push(l), archiver: null, storeOptions: { listGroups: async (o) => [{ groupJid: JA, ownerUserId: o, subject: "S", trackedPersonCount: 1 }], fetchMessages: async () => [] } });
  deps.ingestGroup = async () => ({ sessionId: "s", sourceId: "x", turnCount: 0 }); deps.footprint = async () => ({ turns: new Set(), candidates: new Set() });
  const runs = await runCycle(deps);
  assert.ok(logs.some((l) => /legacy seed failed/.test(l)) && !logs.join().includes("SECRET-INSERT"), "the seed failure is logged by code only");
  assert.equal(runs.length, 1); assert.equal(runs[0].status, "ok"); assert.equal(tables.whatsapp_links.length, 1);
});

test("W9-1 a link suspended between two groups of one run: the second group is never ingested, run is partial/link_inactive", async () => {
  const { deps, world } = await harness();
  world.groups[OA] = [JA, "333333-3@g.us"]; world.messages["333333-3@g.us"] = ["x"];
  const ingest = deps.ingestGroup;
  deps.ingestGroup = async (...a) => { const r = await ingest(...a); world.links[LA].state = "suspended"; return r; }; // admin suspends right after group 1
  const row = await syncLink(deps, T, { linkId: LA, ownerUserId: OA });
  assert.deepEqual(world.ingests, [`${LA}:${JA}`]);
  assert.deepEqual([row.status, row.errorCode, row.groups.length], ["partial", "link_inactive", 1]);
});

test("W9-2 a held lock is skipped (errorCode null, quiet); any other acquire failure is recorded failed/unknown and logged by code, never as healthy skipping", async () => {
  const { deps, world, lockDir } = await harness();
  const lockThrowing = (code) => ({ acquire: () => { throw Object.assign(new Error("EACCES /secret/path"), { name: "LockFailure", code }); }, owned: () => false, release() {} });
  const held = await syncLink({ ...deps, lock: lockThrowing("locked") }, T, { linkId: LA, ownerUserId: OA });
  assert.deepEqual([held.status, held.errorCode], ["skipped", null]); assert.equal(world.logs.length, 0);
  const fault = await syncLink({ ...deps, lock: lockThrowing("lock-failed") }, T, { linkId: LA, ownerUserId: OA });
  assert.deepEqual([fault.status, fault.errorCode], ["failed", "unknown"]);
  assert.ok(world.logs.some((l) => /lock acquire failed \(lock-failed\)/.test(l)) && !world.logs.join().includes("secret/path"));
  const real = await syncLink({ ...deps, lockDir: join(lockDir, "no", "such", "dir") }, T, { linkId: LB, ownerUserId: OB }); // a real lock-dir fault
  assert.deepEqual([real.status, real.errorCode], ["failed", "unknown"]);
  assert.equal(world.ingests.length, 0); assert.deepEqual(runOf(world, LA).map((r) => r.status), ["skipped", "failed"]);
});

test("health flags are written with $addToSet/$pull: a flag another writer sets during the run survives, and a clean run clears only ours", async () => {
  const { db, tables } = fakeDb();
  tables.whatsapp_links = [{ _id: LA, tenantId: T, state: "active", archiverOwnerId: OA, activatedAt: new Date().toISOString() }];
  const deps = await createWiredDeps({ db, env: {}, root: scratch(), log: quiet, archiver: null, storeOptions: { listGroups: async (o) => [{ groupJid: JA, ownerUserId: o, subject: "S", trackedPersonCount: 1 }], fetchMessages: async () => [] } });
  deps.footprint = async () => ({ turns: new Set(), candidates: new Set() });
  let failing = true;
  deps.ingestGroup = async () => {
    const h = (tables.whatsapp_links[0].health ??= {}); if (!(h.flags ?? []).includes("quiet")) h.flags = [...(h.flags ?? []), "quiet"]; // a concurrent writer
    if (failing) throw Object.assign(new Error("x"), { name: "WhatsAppUnavailableError" });
    return { sessionId: "s", sourceId: "x", turnCount: 0 };
  };
  await runCycle(deps);
  assert.deepEqual([...tables.whatsapp_links[0].health.flags].sort(), ["error", "quiet"]);
  failing = false; await runCycle(deps);
  assert.deepEqual(tables.whatsapp_links[0].health.flags, ["quiet"], "our error flag is pulled, the other writer's flag is kept");
});

test("W12 sync.completed / sync.failed: one event per recorded run (ids, counts, codes); skipped runs emit none; a failing event write never fails the run", async () => {
  const { deps, world } = await harness();
  await runCycle(deps);
  const a = world.events.filter((e) => e.linkId === LA);
  assert.deepEqual(a.map((e) => [e.eventType, e.actorKind]), [["sync.completed", "system"]]);
  assert.deepEqual(a[0].data, { groupCount: 1, fetched: 2, newTurns: 2, candidatesCreated: 2, runId: "1".padStart(24, "0") });
  world.failIngest[LA] = "WhatsAppUnavailableError"; world.events.length = 0; await runCycle(deps);
  assert.deepEqual(world.events.filter((e) => e.linkId === LA).map((e) => [e.eventType, e.data.errorCode]), [["sync.failed", "archive_unreachable"]]);
  assert.equal(world.events.length, 2, "link B completed once, link A failed once");
  world.statuses[OA] = { status: "logged_out", updatedAt: "x" }; world.events.length = 0; await runCycle(deps);
  assert.deepEqual(world.events.map((e) => e.linkId), [LB], "A's run is skipped (logged out): no sync event");
  world.eventsFail = true; world.runs.length = 0; assert.equal((await syncLink(deps, T, { linkId: LB, ownerUserId: OB })).status, "ok");
  assert.equal(runOf(world, LB).length, 1); assert.ok(world.logs.some((l) => l.includes("event_write_failed")) && !world.logs.join("\n").includes("SECRET-EVENT-TEXT"));
});

test("W12/H-13 the admin alert sink writes link.needs_relink once per transition (not per cycle); an error alert is the run's own sync.failed; a broken channel never stops another", async () => {
  const { deps, world } = await harness();
  const bad = async () => { throw new Error("SECRET-MAIL-TEXT"); }, sink = createAdminAlertSink({ channels: [bad, feedChannel(deps.appendEvent)], log: deps.log });
  deps.alert = sink.notify; world.statuses[OA] = { status: "logged_out", updatedAt: "x" };
  await runCycle(deps); await runCycle(deps);
  assert.deepEqual(world.events.filter((e) => e.eventType === "link.needs_relink"), [{ tenantId: T, eventType: "link.needs_relink", actorKind: "system", linkId: LA, data: { reason: "logged_out" } }]);
  world.statuses[OA] = { status: "connected", updatedAt: "x" }; world.failIngest[LA] = "WhatsAppUnavailableError"; world.events.length = 0; await runCycle(deps);
  assert.deepEqual(world.events.filter((e) => e.linkId === LA).map((e) => e.eventType), ["sync.failed"], "the error flag raises an alert whose feed entry is the sync.failed above");
  assert.ok(!world.logs.join("\n").includes("SECRET-MAIL-TEXT")); assert.ok(!JSON.stringify(world.events).match(/@g\.us|SECRET|11111/), "no jid, owner id or text in any event");
});

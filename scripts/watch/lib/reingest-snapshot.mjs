// scripts/watch/lib/reingest-snapshot.mjs — iss-reingestsafe-001-004-typed-snapshot-replay.
// Durable, TYPE-EXACT pre-delete snapshot for `--reingest`, plus the single-run lock.
//
// FORMAT: MongoDB Extended JSON, CANONICAL mode (`EJSON.stringify(v, { relaxed: false })`), so ObjectId,
// Date, Binary (incl. float32 embedding vectors), Decimal128, Int32/Long/Double all survive the file.
// Plain JSON.stringify (the previous format) turned them into strings. JS numbers are first mapped to
// the BSON type the driver itself would have written (int32 range integer -> Int32, everything else ->
// Double) so a replayed row re-serialises to the same BSON bytes it was read from.
//
// FILE LAYOUT (one snapshot per tenant + Drive file, so recovery can find it by name):
//   <dir>/<tenant>/<driveFileId>.snapshot.json   { manifest, treeRoot, rows }  written atomically, BEFORE the first delete
//   <dir>/<tenant>/<driveFileId>.committed       marker: ingest finished, new data is complete (never restore over it)
//   <dir>/<tenant>/<driveFileId>.lock            single-run lock (pid + start time; stolen only if the pid is dead/stale)
// `dir` defaults to <repo>/data/reingest-snapshots (gitignored) and is overridable with REINGEST_SNAPSHOT_DIR.
//
// Never connects to anything: pure filesystem + bson. `mongodb` is resolved from packages/db (the only
// workspace package that depends on it; pnpm does not hoist it to the repo root).
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { BSON } = createRequire(join(here, "../../../packages/db/package.json"))("mongodb");
export const { EJSON } = BSON;
export { BSON };

export const FORMAT = "reingest-snapshot/1";
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

export function defaultSnapshotDir(root, env = process.env) {
  return env.REINGEST_SNAPSHOT_DIR ? env.REINGEST_SNAPSHOT_DIR : join(root, "data", "reingest-snapshots");
}

/** Map plain JS numbers to the BSON type the driver would write; leave every BSON class / Date / Buffer alone. */
export function typed(v) {
  if (typeof v === "number") return Number.isInteger(v) && !Object.is(v, -0) && v >= INT32_MIN && v <= INT32_MAX ? new BSON.Int32(v) : new BSON.Double(v);
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date || v instanceof RegExp || typeof v._bsontype === "string" || ArrayBuffer.isView(v)) return v;
  if (Array.isArray(v)) return v.map(typed);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typed(x)]));
}

const sortKeys = (x) => (Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys(x[k])])) : x);
/** Order-insensitive canonical string of one document (key order and the driver's tenantId append do not matter). */
export const docKey = (d) => JSON.stringify(sortKeys(JSON.parse(EJSON.stringify(typed(d), { relaxed: false }))));

/** sha256 over every row of every collection, independent of row order and key order. */
export function contentHash(rows) {
  const canon = {};
  for (const coll of Object.keys(rows).sort()) canon[coll] = rows[coll].map(docKey).sort();
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

export function snapshotPaths(dir, tenant, driveFileId) {
  for (const [what, v] of [["tenant", tenant], ["driveFileId", driveFileId]]) {
    if (typeof v !== "string" || !SAFE_NAME.test(v)) throw new Error(`snapshot ${what} "${v}" is not a safe file name`);
  }
  const base = join(dir, tenant, driveFileId);
  return { tenantDir: join(dir, tenant), file: `${base}.snapshot.json`, committed: `${base}.committed`, lock: `${base}.lock` };
}
const committedPathOf = (file) => file.replace(/\.snapshot\.json$/, ".committed");

/** temp file + fsync + rename. A crash leaves either the old state or the complete new file, never half. */
export function atomicWrite(path, text, hook = () => {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  let fd;
  try {
    fd = openSync(tmp, "wx", 0o600);
    const buf = Buffer.from(text, "utf8");
    for (let off = 0; off < buf.length; ) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    hook("before-rename");
    renameSync(tmp, path);
    hook("after-rename", path); // fault-injection point: lets a test corrupt the stored file before the read-back
  } catch (err) {
    if (fd !== undefined) try { closeSync(fd); } catch { /* already closing on error */ }
    rmSync(tmp, { force: true });
    throw err;
  }
  try { const d = openSync(dirname(path), "r"); try { fsyncSync(d); } finally { closeSync(d); } } catch { /* directory fsync unsupported (Windows) */ }
}

/** Read + fully verify a snapshot file (format, counts, content hash). Throws naming the path. */
export function readSnapshotFile(path) {
  let doc;
  try {
    doc = EJSON.parse(readFileSync(path, "utf8"), { relaxed: false });
  } catch (err) {
    throw new Error(`snapshot ${path} is unreadable: ${err instanceof Error ? err.message : err}`);
  }
  const m = doc?.manifest ? JSON.parse(EJSON.stringify(doc.manifest)) : undefined; // relaxed: counts/pid back to plain numbers
  if (m?.format !== FORMAT || !doc.rows) throw new Error(`snapshot ${path} has an unknown format`);
  for (const coll of m.collections) {
    if ((doc.rows[coll]?.length ?? -1) !== m.counts[coll]) throw new Error(`snapshot ${path} is corrupt: ${coll} has ${doc.rows[coll]?.length} rows, manifest says ${m.counts[coll]}`);
  }
  if (contentHash(doc.rows) !== m.sha256) throw new Error(`snapshot ${path} is corrupt: content hash mismatch`);
  return { manifest: m, rows: doc.rows, treeRoot: doc.treeRoot ?? null };
}

/** Write the snapshot (atomic), then read it back and verify it BEFORE returning, so the caller may delete. */
export function writeSnapshotFile({ dir, tenant, driveFileId, oldSessionId, correctSessionId, preexistingSessionIds, plannedNewSessionIds = [], rows, treeRoot, now = () => new Date(), hook }) {
  const p = snapshotPaths(dir, tenant, driveFileId);
  if (existsSync(p.file)) throw new Error(`an unrecovered snapshot already exists at ${p.file}; restore it (start watch-reingest) before reingesting this file`);
  rmSync(p.committed, { force: true }); // orphan marker of an earlier, fully cleaned run: must not mark THIS snapshot committed
  const collections = Object.keys(rows);
  const counts = Object.fromEntries(collections.map((c) => [c, rows[c].length]));
  const manifest = { format: FORMAT, tenant, driveFileId, oldSessionId, correctSessionId, preexistingSessionIds, plannedNewSessionIds, collections, counts, sha256: contentHash(rows), createdAt: now().toISOString(), pid: process.pid };
  atomicWrite(p.file, EJSON.stringify({ manifest, treeRoot: typed(treeRoot ?? null), rows: Object.fromEntries(collections.map((c) => [c, rows[c].map(typed)])) }, { relaxed: false }), hook);
  try {
    readSnapshotFile(p.file);
  } catch (err) {
    rmSync(p.file, { force: true });
    throw err;
  }
  return p.file;
}

export const markCommitted = (file) => atomicWrite(committedPathOf(file), JSON.stringify({ at: new Date().toISOString(), pid: process.pid }));
export const isCommitted = (file) => existsSync(committedPathOf(file));
/** Snapshot first, marker last: a crash between leaves an orphan marker (harmless, cleared on the next write), never a bare snapshot. */
export function removeSnapshot(file) {
  rmSync(file, { force: true });
  rmSync(committedPathOf(file), { force: true });
}

/** Snapshot files left for a tenant. Orphan .committed markers and abandoned .tmp files are swept. */
export function listSnapshots(dir, tenant) {
  const tenantDir = join(dir, tenant);
  if (!existsSync(tenantDir)) return [];
  const names = readdirSync(tenantDir);
  const out = [];
  for (const n of names) {
    const full = join(tenantDir, n);
    if (n.endsWith(".snapshot.json")) out.push({ driveFileId: n.slice(0, -".snapshot.json".length), path: full });
    else if (n.endsWith(".committed") && !names.includes(n.replace(/\.committed$/, ".snapshot.json"))) rmSync(full, { force: true });
    else if (/\.snapshot\.json\.tmp-/.test(n)) rmSync(full, { force: true }); // never renamed -> no delete had started
  }
  return out;
}

const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === "EPERM"; }
};

/** Exclusive single-run lock for ONE tenant + Drive file. A lock whose pid is dead (a killed run) or older
 * than staleMs is taken over; a live holder makes this return { acquired: false, holder }. */
export function acquireReingestLock(lockPath, { isAlive = pidAlive, staleMs = 6 * 3600 * 1000, now = Date.now } = {}) {
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date(now()).toISOString() }));
      closeSync(fd);
      return { acquired: true, release: () => rmSync(lockPath, { force: true }) };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    let holder = null;
    try { holder = JSON.parse(readFileSync(lockPath, "utf8")); } catch { /* unreadable lock: treat as stale below */ }
    let ageMs = 0;
    try { ageMs = now() - statSync(lockPath).mtimeMs; } catch { continue; } // vanished: retry
    if (holder && Number.isInteger(holder.pid) && isAlive(holder.pid) && ageMs <= staleMs) return { acquired: false, holder };
    try { renameSync(lockPath, `${lockPath}.stale-${randomBytes(4).toString("hex")}`); } catch { continue; } // lost the steal race: retry the create
    for (const n of readdirSync(dirname(lockPath))) if (n.startsWith(`${lockPath.split(/[\\/]/).pop()}.stale-`)) rmSync(join(dirname(lockPath), n), { force: true });
  }
  return { acquired: false, holder: null };
}

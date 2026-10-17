import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync, type Stats } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LastRun } from "../retention-last-run.js";
import { readRetentionBytes, requirePhysicalDirectories, validRetentionSummary, validRetentionTenant } from "./private-summary-read.js";
export { readRetentionBytes, requirePhysicalDirectories, validRetentionTenant } from "./private-summary-read.js";

export type PrivateWriteResult = { ok: true; path: string } | { ok: false; reason: string };
function sameFile(a: Stats, b: Stats): boolean {
  return a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.nlink === 1 && b.nlink === 1 &&
    a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs;
}
function statIfPresent(path: string): Stats | undefined {
  try { return lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
/** One writer, exclusive temporary file, durable bytes before atomic publication; no stale-lock takeover. */
export function writeRetentionAtomic(path: string, text: string, guard = () => {}): void {
  path = resolve(path); requirePhysicalDirectories(dirname(path));
  const lockPath = `${path}.lock`, temp = `${path}.${randomUUID()}.tmp`;
  let lock: number | undefined, fd: number | undefined, ownedLock: Stats | undefined, ownedTemp: Stats | undefined, publishedTemp: Stats | undefined;
  const before = statIfPresent(path);
  if (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)) throw new Error("unsafe-target");
  try {
    lock = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    ownedLock = fstatSync(lock);
    guard();
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    ownedTemp = fstatSync(fd);
    writeFileSync(fd, text, "utf8"); fsyncSync(fd); publishedTemp = fstatSync(fd); closeSync(fd); fd = undefined;
    requirePhysicalDirectories(dirname(path)); guard();
    if (before ? !sameFile(before, lstatSync(path)) : statIfPresent(path) !== undefined) throw new Error("changed-target");
    const tempStat = lstatSync(temp);
    if (!publishedTemp || !sameFile(publishedTemp, tempStat) || !readRetentionBytes(temp, Buffer.byteLength(text)).equals(Buffer.from(text))) throw new Error("unsafe-temporary");
    renameSync(temp, path);
    // Directory fsync is available on Unix. Windows publication uses the already-fsynced file + atomic rename.
    if (process.platform !== "win32") {
      const directory = openSync(dirname(path), constants.O_RDONLY);
      try { fsyncSync(directory); } finally { closeSync(directory); }
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (lock !== undefined) closeSync(lock);
    try {
      requirePhysicalDirectories(dirname(path)); const current = statIfPresent(temp);
      if (ownedTemp && current?.isFile() && !current.isSymbolicLink() && current.nlink === 1 && ownedTemp.dev === current.dev && ownedTemp.ino === current.ino) unlinkSync(temp);
    } catch { /* preserve replaced or redirected entries */ }
    try {
      requirePhysicalDirectories(dirname(path));
      if (ownedLock && sameFile(ownedLock, lstatSync(lockPath))) unlinkSync(lockPath);
    } catch { /* preserve a replaced lock; no stale-lock takeover */ }
  }
}
export function writeTenantRetentionSummary(dataRoot: string, tenantId: string, summary: LastRun): PrivateWriteResult {
  if (!validRetentionTenant(tenantId) || typeof dataRoot !== "string" || !dataRoot.trim() || !validRetentionSummary(summary)) return { ok: false, reason: "invalid-summary-binding" };
  const root = resolve(dataRoot), path = tenantRetentionSummaryPath(dataRoot, tenantId), dir = dirname(path), tenant = dirname(dir);
  try {
    requirePhysicalDirectories(root);
    for (const next of [tenant, dir]) {
      try { mkdirSync(next, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      requirePhysicalDirectories(next);
    }
    const payload = { tenantId, version: 1, mode: summary.mode, dryRun: summary.dryRun, startedAt: summary.startedAt,
      finishedAt: summary.finishedAt, exitCode: summary.exitCode, ok: summary.ok,
      candidates: summary.candidates, deleted: summary.deleted, bytes: summary.bytes,
      vetoed: summary.vetoed, failed: summary.failed, clipsRetained: summary.clipsRetained, reportFile: summary.reportFile };
    writeRetentionAtomic(path, `${JSON.stringify(payload, null, 2)}\n`);
    return { ok: true, path };
  } catch (error) { return { ok: false, reason: (error as NodeJS.ErrnoException).code === "EEXIST" ? "summary-writer-busy" : "private-summary-write-refused" }; }
}
export function tenantRetentionSummaryPath(dataRoot: string, tenantId: string): string {
  if (!validRetentionTenant(tenantId) || typeof dataRoot !== "string" || !dataRoot.trim()) throw new Error("invalid-summary-binding");
  return join(resolve(dataRoot), createHash("sha256").update(tenantId, "utf8").digest("hex"), "retention", "last-run.json");
}

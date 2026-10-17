import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import type { LastRun } from "../retention-last-run.js";
import { isPlain, parseIsoInstant } from "../../strict-record.js";
type ReadStat = ReturnType<typeof lstatSync>;
const normalized = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
export function validRetentionTenant(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);
}
export function requirePhysicalDirectories(path: string): void {
  const check = (directory: string) => {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || normalized(realpathSync(directory)) !== normalized(directory)) throw new Error("unsafe-directory");
  };
  let cursor = parse(resolve(path)).root; check(cursor);
  for (const part of relative(cursor, resolve(path)).split(sep).filter(Boolean)) { cursor = join(cursor, part); check(cursor); }
}
function sameReadFile(a: ReadStat, b: ReadStat): boolean {
  if (!a || !b) return false;
  return a.isFile() && b.isFile() && !a.isSymbolicLink() && !b.isSymbolicLink() && a.nlink === 1 && b.nlink === 1 &&
    a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs;
}
/** This report dependency has only literal read-only opens and no writable dependency graph. */
export function readRetentionBytes(path: string, maxBytes: number): Buffer {
  requirePhysicalDirectories(dirname(path)); const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxBytes) throw new Error("unsafe-file");
  const fd = openSync(path, "r");
  try {
    if (!sameReadFile(before, fstatSync(fd))) throw new Error("changed-file");
    const bytes = readFileSync(fd); requirePhysicalDirectories(dirname(path));
    if (!sameReadFile(before, fstatSync(fd)) || !sameReadFile(before, lstatSync(path))) throw new Error("changed-file");
    return bytes;
  } finally { closeSync(fd); }
}
const COUNT_KEYS = ["candidates", "deleted", "bytes", "vetoed", "failed", "clipsRetained"] as const;
export function validRetentionSummary(summary: LastRun): boolean {
  if (!isPlain(summary) || [...COUNT_KEYS, "version", "mode", "dryRun", "exitCode", "ok", "startedAt", "finishedAt", "reportFile"].some(key => {
    const field = Object.getOwnPropertyDescriptor(summary, key); return !field || !("value" in field) || !field.enumerable;
  })) return false;
  if (summary.version !== 1 || !["dry-run", "execute"].includes(summary.mode) || summary.dryRun !== (summary.mode === "dry-run")) return false;
  if (!Number.isInteger(summary.exitCode) || summary.exitCode < 0 || summary.exitCode > 5 || typeof summary.ok !== "boolean") return false;
  const start = parseIsoInstant(summary.startedAt), finish = parseIsoInstant(summary.finishedAt);
  if (start === null || finish === null || start < 0 || finish < start) return false;
  if (!COUNT_KEYS.every(key => summary[key] === null || Number.isSafeInteger(summary[key]) && (summary[key] as number) >= 0)) return false;
  const known = COUNT_KEYS.slice(0, 5).every(key => summary[key] !== null);
  if (!known && !COUNT_KEYS.slice(0, 5).every(key => summary[key] === null)) return false;
  if (summary.ok !== (summary.exitCode === 0 && known) || summary.ok && summary.failed !== 0) return false;
  if (known && (summary.deleted as number) > (summary.candidates as number)) return false;
  if (summary.dryRun && (summary.deleted !== null && summary.deleted !== 0 || summary.bytes !== null && summary.bytes !== 0 || summary.clipsRetained !== null)) return false;
  return typeof summary.reportFile === "string" && summary.reportFile.length <= 4096 && !/[\p{Cc}]/u.test(summary.reportFile);
}
export function isTenantRetentionSummary(value: unknown, tenantId: string): boolean {
  if (!isPlain(value)) return false;
  const identity = Object.getOwnPropertyDescriptor(value, "tenantId");
  return Boolean(identity && "value" in identity && identity.enumerable && identity.value === tenantId && validRetentionSummary(value as LastRun));
}

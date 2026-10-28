import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, type Stats } from "node:fs";
import { join, parse, relative, resolve, sep } from "node:path";
import { isValidTenantId } from "../auth.js";
import { projectSummary, type RetentionSummary } from "./summary.js";

export type RetentionStatus = { status: "never-run" } | { status: "unavailable" } |
  { status: "available"; summary: RetentionSummary };
const normalized = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
function regularDirectory(path: string): boolean {
  const stat = lstatSync(path);
  return stat.isDirectory() && !stat.isSymbolicLink() && normalized(realpathSync(path)) === normalized(path);
}
function ancestorsSafe(root: string): boolean {
  let cursor = parse(root).root;
  if (!regularDirectory(cursor)) return false;
  for (const part of relative(cursor, root).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    if (!regularDirectory(cursor)) return false;
  }
  return true;
}
const sameFile = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs;
/** Only the explicit data root and SHA256 tenant directory are used. No global fallback. */
export function createRetentionStatusReader(dataRoot: string, now = () => Date.now()): (tenant: string) => RetentionStatus {
  return tenant => {
    if (!isValidTenantId(tenant) || typeof dataRoot !== "string" || !dataRoot.trim()) return { status: "unavailable" };
    const root = resolve(dataRoot), tenantDir = join(root, createHash("sha256").update(tenant, "utf8").digest("hex"));
    let fd: number | undefined;
    try {
      if (!ancestorsSafe(root)) return { status: "unavailable" };
      for (const dir of [tenantDir, join(tenantDir, "retention")]) {
        try { if (!regularDirectory(dir)) return { status: "unavailable" }; }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "never-run" }; throw error; }
      }
      const file = join(tenantDir, "retention", "last-run.json");
      let before: Stats;
      try { before = lstatSync(file); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "never-run" }; throw error; }
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 16_384) return { status: "unavailable" };
      fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      if (!sameFile(before, fstatSync(fd))) return { status: "unavailable" };
      const value: unknown = JSON.parse(readFileSync(fd, "utf8"));
      if (!sameFile(before, fstatSync(fd)) || !sameFile(before, lstatSync(file)) || !ancestorsSafe(join(tenantDir, "retention"))) return { status: "unavailable" };
      const summary = projectSummary(value, tenant, now());
      return summary ? { status: "available", summary } : { status: "unavailable" };
    } catch { return { status: "unavailable" }; }
    finally { if (fd !== undefined) closeSync(fd); }
  };
}

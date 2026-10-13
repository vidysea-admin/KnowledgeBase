/** T-034 receiver hardening, behind LKB_TAB_RECEIVER_GUARD=1 (OFF by default; unset = the receiver is unchanged).
 * Pure helpers: id/filename validation (no path traversal) and chunk/total size caps. */
import path from "node:path";

export interface TabReceiverGuard { maxChunkBytes: number; maxTotalBytes: number }

const MB = 1024 * 1024;
export const GUARD_DEFAULT_CHUNK_BYTES = 8 * MB;
export const GUARD_DEFAULT_TOTAL_BYTES = 8 * 1024 * MB;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function megabytes(raw: string | undefined, fallback: number, ceiling: number): number {
  if (raw === undefined || raw === "") return fallback;
  if (!/^[1-9]\d{0,7}$/.test(raw)) throw new Error("tab receiver size limit must be a positive integer number of MB");
  return Math.min(Number(raw) * MB, ceiling);
}

/** undefined (flag off) means no behaviour change. Invalid limit values fail closed with an error. */
export function tabReceiverGuardFromEnv(env: NodeJS.ProcessEnv = process.env): TabReceiverGuard | undefined {
  if (env.LKB_TAB_RECEIVER_GUARD !== "1") return undefined;
  return {
    maxChunkBytes: megabytes(env.LKB_TAB_MAX_CHUNK_MB, GUARD_DEFAULT_CHUNK_BYTES, GUARD_DEFAULT_CHUNK_BYTES),
    maxTotalBytes: megabytes(env.LKB_TAB_MAX_TOTAL_MB, GUARD_DEFAULT_TOTAL_BYTES, Number.MAX_SAFE_INTEGER),
  };
}

/** Tenant and session ids become part of status identity and paths: allow-list only, no separators or dot-dot. */
export function assertSafeCaptureId(label: string, value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || value.includes("..")) throw new Error(`Unsafe ${label} refused`);
  return value;
}

/** A single path component only: no separators, drive letters, ADS colons, dot-dot, or control characters. */
export function assertSafeCaptureFileName(name: unknown): string {
  if (typeof name !== "string" || name.length === 0 || name.length > 200 || name !== path.basename(name) ||
      /[\/:*?"<>|\u0000-\u001f]/.test(name) || name.includes("..") || /^\.+$/.test(name)) throw new Error("Unsafe capture file name refused");
  return name;
}

/** The resolved output must stay inside the record directory. */
export function assertInsideDir(dir: string, file: string): string {
  const root = path.resolve(dir), target = path.resolve(file);
  if (!target.startsWith(root + path.sep)) throw new Error("Capture output escapes the record directory");
  return target;
}

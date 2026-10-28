/** Tenant identity is validated before projecting the compact operational summary. */
export interface RetentionSummary {
  version: 1; mode: "dry-run" | "execute"; dryRun: boolean; ok: boolean; exitCode: number;
  startedAt: string; finishedAt: string;
  candidates: number | null; deleted: number | null; bytes: number | null;
  vetoed: number | null; failed: number | null; clipsRetained: number | null;
}
const COUNTS = ["candidates", "deleted", "bytes", "vetoed", "failed"] as const;
function instant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= 0 && new Date(time).toISOString() === value;
}
function count(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}
export function projectSummary(value: unknown, tenant: string, now = Date.now()): RetentionSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.tenantId !== tenant || row.version !== 1 || !["dry-run", "execute"].includes(row.mode as string)) return null;
  if (row.dryRun !== (row.mode === "dry-run") || typeof row.ok !== "boolean") return null;
  if (!Number.isInteger(row.exitCode) || (row.exitCode as number) < 0 || (row.exitCode as number) > 5) return null;
  if (!instant(row.startedAt) || !instant(row.finishedAt) || !Number.isFinite(now)) return null;
  if (Date.parse(row.finishedAt) < Date.parse(row.startedAt) || Date.parse(row.finishedAt) > now + 300_000) return null;
  if (!COUNTS.every(key => count(row[key])) || !count(row.clipsRetained)) return null;
  const complete = COUNTS.every(key => row[key] !== null);
  if (!complete && !COUNTS.every(key => row[key] === null)) return null;
  if (row.ok !== (row.exitCode === 0 && complete) || (row.ok && row.failed !== 0)) return null;
  if (complete && (row.deleted as number) > (row.candidates as number)) return null;
  if (row.dryRun && (row.deleted !== null && row.deleted !== 0 || row.bytes !== null && row.bytes !== 0 || row.clipsRetained !== null)) return null;
  return {
    version: 1, mode: row.mode as RetentionSummary["mode"], dryRun: row.dryRun as boolean,
    ok: row.ok, exitCode: row.exitCode as number, startedAt: row.startedAt, finishedAt: row.finishedAt,
    candidates: row.candidates as number | null, deleted: row.deleted as number | null,
    bytes: row.bytes as number | null, vetoed: row.vetoed as number | null,
    failed: row.failed as number | null, clipsRetained: row.clipsRetained as number | null,
  };
}

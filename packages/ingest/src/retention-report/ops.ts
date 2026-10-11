/**
 * packages/ingest/src/retention-report/ops.ts - T-046 dry-run report. The pipeline's own
 * IN-PROGRESS signal: the webinar poller's operations.json (data/webinar-release/operations.json,
 * written by scripts/webinar/run-pipeline.mjs, rows keyed by session id with a `status` and, once
 * capture starts, the `artifact` path). Read-only, bounded, and DOWNGRADE-ONLY.
 *
 * Status vocabulary found in that code: queued, recording, processing, ready, failed, action_required,
 * cancelled (and skip reasons). Only `ready` (finished and indexed) and `cancelled` (nothing was
 * recorded) are TERMINAL. `failed` and `action_required` are NOT terminal: the poller's recovery
 * loop re-finalises `recording|processing|failed` rows from their artifact, and an
 * `action_required` row can be reconsidered. Every other string, including an unknown one or a
 * missing/mistyped status, means in progress: unknown means keep.
 *
 * --operations-state is REQUIRED (usage error without it). If the file is missing, unreadable,
 * oversized or malformed, in-progress state is UNKNOWN and NOTHING is ELIGIBLE: every otherwise
 * eligible recording is KEEP `operation-state-unavailable` (not assessable), whatever its age, and the
 * header says why. A stuck row on very old media is exactly what the command could not see.
 */
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPlain } from "../strict-record.js";
import type { GuardHit } from "../retention-report-guards.js";
import { fileKeys, REAL_IO, type MediaIo } from "../retention-report-media.js";
import { cleanText } from "../retention-report-text.js";

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["ready", "cancelled"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;

export interface OpRow { id: string; status: unknown; keys: string[] }
export type OpsState = { kind: "available"; rows: OpRow[]; file: string } | { kind: "unavailable"; why: string };

export function loadOps(file: string | undefined, io: MediaIo = REAL_IO): OpsState {
  if (!file) return { kind: "unavailable", why: "no --operations-state file was given" };
  let text: string;
  try {
    const st = lstatSync(file);
    if (!st.isFile()) return { kind: "unavailable", why: "not a regular file" };
    if (st.size > MAX_BYTES) return { kind: "unavailable", why: "larger than the read cap" };
    text = readFileSync(file, "utf8");
  } catch (e) { return { kind: "unavailable", why: (e as NodeJS.ErrnoException).code === "ENOENT" ? "file does not exist" : "unreadable" }; }
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { return { kind: "unavailable", why: "not valid JSON" }; }
  const ops = isPlain(parsed) && Object.hasOwn(parsed, "operations") ? (parsed as Record<string, unknown>).operations : undefined;
  if (!isPlain(ops)) return { kind: "unavailable", why: "no operations object" };
  const entries = Object.entries(ops);
  if (entries.length > MAX_ROWS) return { kind: "unavailable", why: "too many operation rows" };
  const rows: OpRow[] = entries.map(([id, row]) => {
    const r = isPlain(row) ? (row as Record<string, unknown>) : {};
    const art = typeof r.artifact === "string" && r.artifact ? r.artifact : undefined;
    let keys: string[] = [];
    if (art) {
      let real = resolve(art);
      try { real = io.realpathSync(real); } catch { /* artifact gone: the spelled path still groups */ }
      keys = fileKeys(io, real);
    }
    return { id, status: isPlain(row) ? r.status : undefined, keys };
  });
  return { kind: "available", rows, file: "operations-state" };
}

export interface OpsSubject { names: string[]; keys: string[] }

/** Null = no objection. Downgrade-only: callers only consult it for a row that is otherwise eligible. */
export function opsGuard(ops: OpsState, s: OpsSubject): GuardHit | null {
  if (ops.kind === "unavailable") return { code: "operation-state-unavailable", detail: `pipeline operations state unavailable (${ops.why}); in-progress recordings cannot be ruled out` };
  const names = new Set(s.names.map((n) => n.toLowerCase()));
  for (const row of ops.rows) {
    if (typeof row.status === "string" && TERMINAL_STATUSES.has(row.status)) continue;
    if (names.has(row.id.toLowerCase()) || row.keys.some((k) => s.keys.includes(k))) {
      return { code: "operation-in-progress", detail: `pipeline operation ${cleanText(row.id, 60)} has status ${cleanText(typeof row.status === "string" ? row.status : "(missing)", 40)}, which is not a terminal status` };
    }
  }
  return null;
}

/**
 * packages/ingest/src/retention/retention-processed.ts - T-046. The ONE writer of `processedAt`, which the retention
 * planner requires (without it every recording is "not processed" and nothing is ever eligible on real data).
 *
 * A session counts as processed when its on-disk session.json says status.transcribe === "done" AND
 * status.index === "done" (the same pair the report gatherer requires). Validation/finalize must already have passed
 * for the caller to reach this point: the helper refuses to stamp anything else.
 *
 * `markSessionProcessed(sessionDir, now)` stamps `processedAt` (ISO-8601) into <sessionDir>/session.json atomically
 * (temp file + rename), changes no other field, and is idempotent: an existing valid processedAt is never moved, so
 * the retention clock cannot be reset by a re-run.
 *
 * INTEGRATION HOOK (outside packages/ingest, not edited here): scripts/webinar/sync-session.mjs, immediately after the
 * index-proof.json rename succeeds (end of the `if (INDEX)` block), add one line:
 *   (await import("../../packages/ingest/src/retention/retention-processed.ts")).markSessionProcessed(dir, Date.now());
 * `dir` is that script's session directory <data-root>/<sha256(tenant)>/<sessionId>. Or run the CLI
 * `retention-processed-cli.ts <sessionDir>` from the pipeline's final step.
 */
import { lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPlain, parseIsoInstant } from "../strict-record.js";

export type MarkResult =
  | { ok: true; changed: boolean; processedAt: string }
  | { ok: false; reason: string };

export interface MarkIo {
  read: (path: string) => string;
  writeAtomic: (path: string, text: string) => void;
}
export interface FsOps { writeFileSync: (p: string, t: string, enc: "utf8") => void; renameSync: (a: string, b: string) => void }
export const makeMarkIo = (fs: FsOps = { writeFileSync, renameSync }): MarkIo => ({
  read: (p) => {
    if (!lstatSync(p).isFile()) throw new Error("not a regular file");
    return readFileSync(p, "utf8");
  },
  writeAtomic: (p, text) => {
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text, "utf8");
    fs.renameSync(tmp, p);
  },
});
export const REAL_MARK_IO: MarkIo = makeMarkIo();

export function markSessionProcessed(sessionDir: string, now: number, io: MarkIo = REAL_MARK_IO): MarkResult {
  if (!Number.isFinite(now)) return { ok: false, reason: "invalid-clock" };
  const file = join(sessionDir, "session.json");
  let doc: unknown;
  try { doc = JSON.parse(io.read(file)); } catch { return { ok: false, reason: "session.json unreadable or not valid JSON" }; }
  if (!isPlain(doc)) return { ok: false, reason: "session.json is not an object" };
  const rec = doc as Record<string, unknown>;
  const status = isPlain(rec.status) ? (rec.status as Record<string, unknown>) : undefined;
  if (status?.transcribe !== "done" || status?.index !== "done") return { ok: false, reason: "not-processed: status.transcribe and status.index must both be done" };
  if (typeof rec.processedAt === "string" && parseIsoInstant(rec.processedAt) !== null) return { ok: true, changed: false, processedAt: rec.processedAt };
  const processedAt = new Date(now).toISOString();
  try { io.writeAtomic(file, `${JSON.stringify({ ...rec, processedAt }, null, 2)}\n`); } catch (e) {
    return { ok: false, reason: `write failed (${(e as NodeJS.ErrnoException).code ?? "error"})` };
  }
  return { ok: true, changed: true, processedAt };
}

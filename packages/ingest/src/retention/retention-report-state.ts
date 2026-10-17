/**
 * packages/ingest/src/retention/retention-report-state.ts - T-046 dry-run report. READ-ONLY gatherer: turns
 * one tenant's session directories into the raw inputs of `planRetentionSweep`. It imports only
 * read APIs (lstatSync, readdirSync, readFileSync) and never writes, renames or deletes.
 *
 * Layout read (what scripts/upload/submit.mjs writes): <data-root>/<sha256(tenantId)>/<sessionId>/
 *   source.json  (recording source: _id, tenantId, kind, path|audioPath)   - the media identity
 *   session.json (tenantId, title, status.transcribe, status.index, optional processedAt, retention.purgedAt)
 *   claims.json  (claim records, status verified | needs-review | ...)      - optional, absent = no claims
 *   turns.json   (turn records)                                             - optional
 * There is NO media-collection file on disk and no `processedAt` in any shipped writer: a real
 * state therefore reports every recording as "not processed" (KEEP) until the owner decides what
 * proves processing (Q6). A media record is derived from source.json; processedAt is passed on
 * ONLY when session.status says transcribe AND index are "done". Media size/mtime come from the
 * read-only probe in ./retention-report-media.ts.
 */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlain } from "../strict-record.js";
import { isTenantRetentionSummary, readRetentionBytes, requirePhysicalDirectories } from "./production/private-summary-read.js";
import type { ReportOptions } from "./retention-report-args.js";
import { NO_MEDIA, REAL_IO, probeMedia, type MediaEvidence, type MediaIo } from "./retention-report-media.js";

export const CAPS = { maxSessions: 500, maxFileBytes: 5 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 };
const SESSION_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/;
const RECORDING_KINDS = new Set(["recording", "audio", "video"]);

export interface SessionInfo {
  dir: string;
  mediaId?: string;
  mediaTenant?: string;
  title?: string;
  /** media file evidence from the read-only probe (size and mtime are the stat'd values) */
  media: MediaEvidence;
  /** size recorded in source.json (`sizeBytes`), if the state carries one */
  recordedBytes: number | null;
  transcribed: boolean;
  indexed: boolean;
  processedAt?: unknown;
  /** source.json `createdAt` (the upload/capture instant written by scripts/upload/submit.mjs); raw, validated by the purge executor */
  capturedAt?: unknown;
  turnIds: Set<string>;
  unreadable?: string;
}

export interface Gathered {
  tenantId: string;
  media: unknown[];
  claims: unknown[];
  turns: unknown[];
  infos: SessionInfo[];
  /** infos index for each entry of `media` (same order). */
  mediaInfo: number[];
  nonRecording: number;
  notes: string[];
  /** every directory entry the scan saw but could not turn into a parsed record (path relative to the data root, and why) */
  notUnderstood: Array<{ path: string; why: string }>;
}

export type GatherResult = { ok: true; value: Gathered } | { ok: false; message: string };

export const tenantSegment = (tenantId: string): string => createHash("sha256").update(tenantId).digest("hex");

type Read = { ok: true; value: unknown } | { ok: false; why: string };

function readJson(file: string, budget: { used: number }): Read {
  let st;
  try { st = lstatSync(file); } catch (e) {
    return { ok: false, why: (e as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable" };
  }
  if (!st.isFile()) return { ok: false, why: "not a regular file" };
  if (st.size > CAPS.maxFileBytes) return { ok: false, why: "larger than the per-file cap" };
  if (budget.used + st.size > CAPS.maxTotalBytes) return { ok: false, why: "total read budget exhausted" };
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return { ok: false, why: "unreadable" }; }
  if (Buffer.byteLength(text) > CAPS.maxFileBytes) return { ok: false, why: "larger than the per-file cap" };
  budget.used += st.size;
  try { return { ok: true, value: JSON.parse(text) as unknown }; } catch { return { ok: false, why: "not valid JSON" }; }
}

const own = (o: object, k: string): unknown => (Object.hasOwn(o, k) ? (o as Record<string, unknown>)[k] : undefined);
const ownPlain = (o: object, k: string): object | undefined => { const v = own(o, k); return isPlain(v) ? v : undefined; };
const ownStr = (o: object, k: string): string | undefined => { const v = own(o, k); return typeof v === "string" && v ? v : undefined; };

function describe(r: Read): string {
  return r.ok ? (isPlain(r.value) ? "ok" : "not an object") : r.why;
}

export function gatherState(opts: ReportOptions, io: MediaIo = REAL_IO): GatherResult {
  const tenantDir = join(opts.dataRoot, tenantSegment(opts.tenant));
  let names: string[];
  const skipped: Array<{ path: string; why: string }> = [];
  try {
    if (!lstatSync(opts.dataRoot).isDirectory() || !lstatSync(tenantDir).isDirectory()) throw new Error("not a directory");
    const entries = readdirSync(tenantDir, { withFileTypes: true });
    const operational = (name: string): boolean => {
      if (name !== "retention") return false;
      try {
        const dir = join(tenantDir, name); requirePhysicalDirectories(dir);
        const files = readdirSync(dir, { withFileTypes: true });
        if (files.some(file => !file.isFile() || !/^last-run\.json(?:\.lock|\.[0-9a-f-]{36}\.tmp)?$/.test(file.name))) return false;
        return isTenantRetentionSummary(JSON.parse(readRetentionBytes(join(dir, "last-run.json"), 16_384).toString("utf8")), opts.tenant);
      } catch { return false; }
    };
    const operationalNames = new Set(entries.filter(d => d.isDirectory() && operational(d.name)).map(d => d.name));
    names = entries.filter((d) => d.isDirectory() && SESSION_NAME.test(d.name) && !operationalNames.has(d.name)).map((d) => d.name).sort();
    for (const d of entries) {
      if (operationalNames.has(d.name)) continue;
      if (d.isDirectory() && SESSION_NAME.test(d.name)) continue;
      skipped.push({ path: `${tenantSegment(opts.tenant)}/${d.name}`, why: d.isDirectory() ? "directory name not accepted as a session" : "not a plain session directory (file, link or junction)" });
    }
  } catch {
    return { ok: false, message: "cannot read this tenant's state: the data root must contain a directory named by the sha-256 of the tenant id" };
  }
  if (names.length > CAPS.maxSessions) return { ok: false, message: `too many session directories (${names.length} > ${CAPS.maxSessions}); refusing to guess` };

  const g: Gathered = { tenantId: opts.tenant, media: [], claims: [], turns: [], infos: [], mediaInfo: [], nonRecording: 0, notes: [], notUnderstood: skipped };
  const budget = { used: 0 };
  for (const name of names) {
    const dir = join(tenantDir, name);
    const info: SessionInfo = { dir: name, media: NO_MEDIA, recordedBytes: null, transcribed: false, indexed: false, turnIds: new Set() };
    const src = readJson(join(dir, "source.json"), budget);
    const ses = readJson(join(dir, "session.json"), budget);
    if (!src.ok || !ses.ok || !isPlain(src.value) || !isPlain(ses.value)) {
      info.unreadable = `source.json: ${describe(src)}; session.json: ${describe(ses)}`;
      g.infos.push(info);
      continue;
    }
    const kind = own(src.value, "kind");
    if (typeof kind !== "string") { info.unreadable = "source.json: kind missing or not text"; g.infos.push(info); continue; }
    if (!RECORDING_KINDS.has(kind)) { g.nonRecording++; continue; }

    const status = ownPlain(ses.value, "status");
    info.transcribed = status !== undefined && own(status, "transcribe") === "done";
    info.indexed = status !== undefined && own(status, "index") === "done";
    info.title = ownStr(ses.value, "title");
    info.mediaId = ownStr(src.value, "_id");
    info.mediaTenant = ownStr(src.value, "tenantId");
    info.capturedAt = own(src.value, "createdAt");
    info.media = probeMedia(opts.mediaRoot, ownStr(src.value, "path") ?? ownStr(src.value, "audioPath"), io);
    const rec = own(src.value, "sizeBytes");
    info.recordedBytes = typeof rec === "number" && Number.isSafeInteger(rec) && rec >= 0 ? rec : null;

    const turnsRead = readJson(join(dir, "turns.json"), budget);
    if (turnsRead.ok && Array.isArray(turnsRead.value)) {
      for (const t of turnsRead.value) {
        g.turns.push(t);
        const id = isPlain(t) ? ownStr(t, "_id") : undefined;
        if (id) info.turnIds.add(id);
      }
    } else if (!turnsRead.ok && turnsRead.why !== "missing") g.notes.push(`session ${name}: turns.json ${turnsRead.why}`);
    const claimsRead = readJson(join(dir, "claims.json"), budget);
    if (claimsRead.ok && Array.isArray(claimsRead.value)) g.claims.push(...claimsRead.value);
    else if (claimsRead.ok || claimsRead.why !== "missing") {
      g.claims.push(null); // unreadable claims could cite anything: the planner's fail-closed sentinel blocks every media
      g.notes.push(`session ${name}: claims.json ${claimsRead.ok ? "is not an array" : claimsRead.why}; all recordings are kept`);
    }

    const retention = ownPlain(ses.value, "retention");
    const purgedAt = retention ? own(retention, "purgedAt") : undefined;
    const processedAt = own(ses.value, "processedAt");
    const done = info.transcribed && info.indexed;
    if (done && processedAt !== undefined) info.processedAt = processedAt;
    g.media.push({
      _id: info.mediaId, tenantId: info.mediaTenant, sourceRef: info.mediaId, kind,
      turnRefs: [...info.turnIds],
      retention: { purgeAfterVerified: false, ...(purgedAt !== undefined ? { purgedAt } : {}) },
      ...(done && processedAt !== undefined ? { processedAt } : {}),
    });
    g.mediaInfo.push(g.infos.length);
    g.infos.push(info);
  }
  for (const i of g.infos) if (i.unreadable) g.notUnderstood.push({ path: `${tenantSegment(opts.tenant)}/${i.dir}`, why: `unreadable record (${i.unreadable})` });
  return { ok: true, value: g };
}

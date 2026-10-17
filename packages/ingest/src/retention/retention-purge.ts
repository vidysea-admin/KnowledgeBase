/**
 * packages/ingest/src/retention/retention-purge.ts - T-046 / D-145 (pending append). The raw-media purge
 * EXECUTOR. D-145: raw media (recordings, audio, video) is purged 90 days after capture; transcripts,
 * notes, claims and citations are kept forever.
 *
 * What it deletes: ONLY the one media file a session's source.json names, located and proven inside
 * --media-root by the read-only probe, for a record that is ALL of:
 *   - purge-eligible by the existing planner (`planRetentionSweep`), AND
 *   - not vetoed by any dry-run guard (the same `assess` the report uses: quiet period, pipeline
 *     in-progress state, shared file, cross-tenant file, incomplete scope, unconfirmed clock, ...), AND
 *   - captured (source.json `createdAt`) strictly more than 90 days before `now`, AND
 *   - a media file by extension. Anything else (json, txt, md, vtt, srt ...) is never deleted.
 * Nothing under the data root (session.json, source.json, claims.json, turns.json) is ever modified. The one write is
 * additive: when `deps.clips` is set, execute mode first writes the D-008 evidence clips to <session>/evidence-clips/
 * and keeps the media if any clip is missing.
 *
 * DRY RUN BY DEFAULT. Deleting needs the explicit `--execute --confirm-deletion` flag pair. In execute mode the whole
 * evaluation (gather, plan, guards) is RE-RUN from disk immediately before EACH item, so a
 * recording that became active, or got a new reference, after planning is vetoed at execution time.
 * One `unlink` per item is atomic; a failure on one item is reported and the others continue.
 * Log lines carry the media path, age and size only: never transcript or title text.
 *
 * Not scheduled, not wired into the lkb dispatcher. Exit codes: 0 done, 2 usage / invalid planner
 * input, 3 unreadable state or media root, 4 one or more items failed to delete.
 */
import { unlinkSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { EvidenceClipWindow } from "@lkb/core";
import { planRetentionSweep } from "./retention-sweep.js";
import type { ClipResult } from "./retention-clips.js";
import { parseIsoInstant } from "../strict-record.js";
import { parseArgs, USAGE, type ReportOptions } from "./retention-report-args.js";
import { gatherState, tenantSegment, type SessionInfo } from "./retention-report-state.js";
import { cleanText } from "./retention-report-text.js";
import { assess, type AssessRow } from "./retention-report/assess.js";
import { scanOtherTenants } from "./retention-report/crosstenant.js";
import { checkClock } from "./retention-report/clock.js";
import { loadOps } from "./retention-report/ops.js";
import { REAL_IO, mediaRootUsable, type MediaIo } from "./retention-report-media.js";

export const PURGE_AFTER_DAYS = 90;
const DAY_MS = 86_400_000;
export const MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  ".webm", ".mp4", ".mkv", ".mov", ".avi", ".m4v", ".m4a", ".mp3", ".wav", ".ogg", ".opus", ".aac", ".flac",
]);

export interface PurgeIo { unlink: (absPath: string) => void }
export const REAL_PURGE_IO: PurgeIo = { unlink: (p) => unlinkSync(p) };

export interface PurgeDeps {
  now: () => number;
  write: (line: string) => void;
  error: (line: string) => void;
  io?: MediaIo;
  purgeIo?: PurgeIo;
  /** test seam: called once after the first (planning) evaluation and before any deletion */
  afterPlan?: () => void;
  /**
   * D-008 evidence clips. When set, EXECUTE mode extracts every retained window into `outDir` BEFORE the unlink and
   * keeps the media (VETOED clip-extraction-failed) unless all clips exist. Execute refuses a missing extractor.
   */
  clips?: { extract: (mediaAbs: string, windows: readonly EvidenceClipWindow[], outDir: string) => ClipResult };
}

export interface PurgeCandidate { key: string; relPath: string; absPath: string; sizeBytes: number; ageDays: number; windows: EvidenceClipWindow[]; clipsDir: string }
type Evaluation =
  | { ok: true; candidates: PurgeCandidate[]; vetoes: Map<string, string>; inScope: number }
  | { ok: false; code: 2 | 3; message: string };

/** Capture-age and file-type veto; null = no objection. */
function mediaVeto(info: SessionInfo, now: number): string | null {
  const cap = parseIsoInstant(info.capturedAt);
  if (cap === null) return "capture-time-unknown: source.json createdAt missing or malformed";
  if (cap > now) return "capture-time-in-future";
  if (now - cap <= PURGE_AFTER_DAYS * DAY_MS) return `younger-than-${PURGE_AFTER_DAYS}-days`;
  const rel = info.media.relPath ?? "";
  if (!MEDIA_EXTENSIONS.has(extname(rel).toLowerCase())) return "not-a-media-file: extension is not an allowed media type";
  return null;
}

/** One complete, fresh, read-only evaluation: gather, plan, guards, then the D-145 age and type rules. */
export function evaluatePurge(opts: ReportOptions, io: MediaIo, now: number): Evaluation {
  if (!mediaRootUsable(opts.mediaRoot)) return { ok: false, code: 3, message: "cannot read --media-root: it must be an existing directory" };
  const gathered = gatherState(opts, io);
  if (!gathered.ok) return { ok: false, code: 3, message: gathered.message };
  const g = gathered.value;
  const planned = planRetentionSweep({
    tenantId: opts.tenant, media: g.media, claims: g.claims, turns: g.turns, now,
    params: { minAgeAfterProcessedMs: opts.minAgeDays * DAY_MS, clipPaddingSeconds: opts.clipPaddingSeconds },
  });
  if (!planned.ok) return { ok: false, code: 2, message: `planner refused the input: ${planned.errors.map((e) => cleanText(e, 160)).join("; ")}` };
  const ops = loadOps(opts.operationsState, io);
  const clock = checkClock(now, g.infos.flatMap((i) => [parseIsoInstant(i.processedAt), i.media.mtimeMs]), opts.asOf);
  const foreign = scanOtherTenants(opts.dataRoot, tenantSegment(opts.tenant), opts.mediaRoot, io);
  const incomplete = g.notUnderstood.length > 0 || foreign.incomplete;

  // Same row construction as the report: planner items follow media order; an index:N id names a media slot.
  const byId = new Map<string, SessionInfo[]>();
  g.media.forEach((m, i) => {
    const info = g.infos[g.mediaInfo[i] ?? -1];
    if (info?.mediaId !== undefined && (info.mediaTenant === undefined || info.mediaTenant === g.tenantId)) byId.set(info.mediaId, [...(byId.get(info.mediaId) ?? []), info]);
  });
  const rows: AssessRow[] = g.infos.filter((i) => i.unreadable).map((info) => ({ info, item: undefined }));
  for (const item of planned.plan.items) {
    const info = item.mediaId.startsWith("index:") ? g.infos[g.mediaInfo[Number(item.mediaId.slice(6))] ?? -1] : byId.get(item.mediaId)?.shift();
    rows.push({ info, item });
  }
  const printed = new Set(rows.map((r) => r.info));
  const a = assess(rows, g.infos.filter((i) => !printed.has(i)), now, clock, ops, { incomplete, foreignKeys: foreign.keys });

  const candidates: PurgeCandidate[] = [];
  const vetoes = new Map<string, string>();
  for (const row of rows) {
    const { info, item } = row;
    if (info === undefined || item === undefined) continue;
    const v = a.verdicts.get(row);
    if (v === undefined || !v.eligible) { vetoes.set(info.dir, v?.hit ? v.hit.code : item.reason); continue; }
    const veto = mediaVeto(info, now);
    if (veto !== null) { vetoes.set(info.dir, veto); continue; }
    const rel = info.media.relPath as string;
    candidates.push({
      key: info.dir, relPath: rel, absPath: resolve(opts.mediaRoot, rel),
      sizeBytes: info.media.sizeBytes as number, ageDays: (now - (parseIsoInstant(info.capturedAt) as number)) / DAY_MS,
      windows: item.retainWindows, clipsDir: join(opts.dataRoot, tenantSegment(opts.tenant), info.dir, "evidence-clips"),
    });
  }
  return { ok: true, candidates, vetoes, inScope: rows.length };
}

export interface PurgeSummary { candidates: number; deleted: number; bytes: number; vetoed: number; failed: number }

export function executePurge(opts: ReportOptions, execute: boolean, deps: PurgeDeps): { code: number; summary: PurgeSummary | null } {
  if (execute && (!deps.clips || typeof deps.clips.extract !== "function")) {
    deps.error("retention-purge: execute requires evidence-clip extraction before any deletion");
    return { code: 2, summary: null };
  }
  const io = deps.io ?? REAL_IO;
  const purgeIo = deps.purgeIo ?? REAL_PURGE_IO;
  const first = evaluatePurge(opts, io, deps.now());
  if (!first.ok) { deps.error(`retention-purge: ${first.message}`); return { code: first.code, summary: null }; }
  deps.write(execute
    ? `RETENTION PURGE - EXECUTE mode (D-145 pending append: raw media older than ${PURGE_AFTER_DAYS} days). Each item is re-checked from disk immediately before deletion.`
    : `RETENTION PURGE - DRY RUN (default). Nothing is deleted. Pass --execute to delete. Raw media older than ${PURGE_AFTER_DAYS} days (D-145 pending append).`);
  deps.write(`tenant: ${cleanText(opts.tenant, 80)}  recordings in scope: ${first.inScope}  eligible to purge: ${first.candidates.length}  kept: ${first.inScope - first.candidates.length}`);
  for (const [key, why] of first.vetoes) deps.write(`KEPT session=${cleanText(key, 80)} reason=${cleanText(why, 160)}`);
  deps.afterPlan?.();

  const s: PurgeSummary = { candidates: first.candidates.length, deleted: 0, bytes: 0, vetoed: 0, failed: 0 };
  let clipsKept = 0;
  for (const planned of first.candidates) {
    const where = `path=${cleanText(planned.relPath, 200)}`;
    if (!execute) {
      deps.write(`WOULD-PURGE ${where} age_days=${planned.ageDays.toFixed(1)} size_bytes=${planned.sizeBytes}`);
      if (deps.clips) deps.write(`WOULD-EXTRACT-CLIPS ${where} windows=${planned.windows.length}`);
      continue;
    }
    try {
      const fresh = evaluatePurge(opts, io, deps.now());
      if (!fresh.ok) throw new Error(`re-check failed: ${fresh.message}`);
      const c = fresh.candidates.find((x) => x.key === planned.key && x.relPath === planned.relPath);
      if (c === undefined) {
        s.vetoed++;
        deps.write(`VETOED ${where} reason=${cleanText(fresh.vetoes.get(planned.key) ?? "no longer eligible at execution time", 160)}`);
        continue;
      }
      if (deps.clips) {
        const cr = deps.clips.extract(c.absPath, c.windows, c.clipsDir);
        if (!cr.ok) {
          s.vetoed++;
          deps.write(`VETOED ${where} reason=clip-extraction-failed: ${cleanText(cr.outcomes.filter((o) => o.status === "failed").map((o) => o.why).join(","), 160)}`);
          continue;
        }
        clipsKept += cr.outcomes.length;
      }
      // Narrow the re-check/unlink window: clip extraction can take seconds, so evaluate again from disk
      // immediately before the unlink and delete only if the same item is still eligible.
      const last = evaluatePurge(opts, io, deps.now());
      if (!last.ok) throw new Error(`final re-check failed: ${last.message}`);
      const lc = last.candidates.find((x) => x.key === planned.key && x.relPath === planned.relPath);
      if (lc === undefined) {
        s.vetoed++;
        deps.write(`VETOED ${where} reason=${cleanText(last.vetoes.get(planned.key) ?? "no longer eligible at final check", 160)}`);
        continue;
      }
      purgeIo.unlink(lc.absPath);
      s.deleted++;
      s.bytes += lc.sizeBytes;
      deps.write(`PURGED ${where} age_days=${lc.ageDays.toFixed(1)} size_bytes=${lc.sizeBytes}`);
    } catch (e) {
      s.failed++;
      const why = (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : "error");
      deps.write(`FAILED ${where} error=${cleanText(why, 120)}`);
    }
  }
  if (execute && deps.clips) deps.write(`CLIPS retained=${clipsKept}`);
  deps.write(`SUMMARY mode=${execute ? "execute" : "dry-run"} candidates=${s.candidates} deleted=${s.deleted} bytes=${s.bytes} vetoed=${s.vetoed} failed=${s.failed}`);
  return { code: s.failed > 0 ? 4 : 0, summary: s };
}

export const PURGE_USAGE = [
  ...USAGE.map((l) => l.replace(/retention-report/g, "retention-purge")),
  "  --execute: actually delete. Without it this is a dry run. Raw media captured more than 90 days ago only (D-145 pending append).",
  "  --confirm-deletion: REQUIRED together with --execute; --execute alone refuses and deletes nothing. Refused without --execute.",
  "  --min-age-days defaults to 90 and values below 90 are refused; --clip-padding-seconds defaults to 15 and values below 15 are refused (ruling 5).",
];

export const CONFIRM_FLAG = "--confirm-deletion";

/** Shared by the purge CLI and the scheduled job: strips --execute/--confirm-deletion, enforces the double flag. */
export function parsePurgeArgs(argv: readonly string[]): { ok: true; opts: ReportOptions; execute: boolean } | { ok: false; message: string } {
  const execCount = argv.filter((a) => a === "--execute").length;
  const confirmCount = argv.filter((a) => a === CONFIRM_FLAG).length;
  const parsed = parseArgs(argv.filter((a) => a !== "--execute" && a !== CONFIRM_FLAG), "purge");
  if (!parsed.ok) return parsed;
  if (execCount > 1) return { ok: false, message: "--execute given more than once" };
  if (confirmCount > 1) return { ok: false, message: `${CONFIRM_FLAG} given more than once` };
  if (execCount === 1 && confirmCount === 0) return { ok: false, message: `--execute requires ${CONFIRM_FLAG}; nothing was deleted` };
  if (execCount === 0 && confirmCount === 1) return { ok: false, message: `${CONFIRM_FLAG} is only valid together with --execute` };
  return { ok: true, opts: parsed.opts, execute: execCount === 1 };
}

export function runRetentionPurge(argv: readonly string[], deps: PurgeDeps): number {
  const parsed = parsePurgeArgs(argv);
  if (!parsed.ok) {
    deps.error(`retention-purge: ${parsed.message}`);
    for (const l of PURGE_USAGE) deps.error(l);
    return 2;
  }
  return executePurge(parsed.opts, parsed.execute, deps).code;
}

/**
 * packages/ingest/src/retention/retention-report.ts - T-046. REPORT-ONLY operator command: "what would the
 * retention sweep purge, and why". A dry run by construction: it gathers one tenant's state
 * read-only (./retention-report-state.ts), calls the existing pure planner (`planRetentionSweep`;
 * eligibility is not re-implemented here) and prints. It imports no write, delete, rename or
 * process-spawning API and has no apply option; the destructive executor is a separate future
 * unit that needs the owner's thresholds (Q6) and approval.
 *
 * Verdicts come from the planner. The precondition columns are an informational view of the same
 * gathered data. The only thing that can change a planner verdict is a DOWNGRADE-ONLY media guard
 * (./retention-report-guards.ts): eligible -> KEEP with a named reason, never the other way.
 * --media-root is required; without located, stat'd media evidence nothing is reported eligible.
 *
 * Exit codes: 0 report produced, 2 usage error or invalid planner input, 3 unreadable state or media root.
 */
import { planRetentionSweep, type PlanItem, type RetentionPlan } from "./retention-sweep.js";
import { parseIsoInstant } from "../strict-record.js";
import type { ClockCheck } from "./retention-report/clock.js";
import { parseArgs, USAGE, type ReportOptions } from "./retention-report-args.js";
import { gatherState, tenantSegment, type Gathered, type SessionInfo } from "./retention-report-state.js";
import { cleanText } from "./retention-report-text.js";
import { NOT_ASSESSABLE, QUIET_PERIOD_MS } from "./retention-report-guards.js";
import { assess, type Row, type Scope, type RowVerdict } from "./retention-report/assess.js";
import { scanOtherTenants } from "./retention-report/crosstenant.js";
import { checkClock, CLOCK_HORIZON_MS } from "./retention-report/clock.js";
import { TERMINAL_STATUSES, loadOps, type OpsState } from "./retention-report/ops.js";
import { REAL_IO, mediaRootUsable, type MediaIo } from "./retention-report-media.js";

export interface RunDeps {
  now: () => number;
  write: (line: string) => void;
  error: (line: string) => void;
  /** file-system seam for tests; the default is the real read-only calls */
  io?: MediaIo;
}

const DAY_MS = 86_400_000;
const ok = (b: boolean, detail = ""): string => `${b ? "PASS" : "FAIL"}${detail ? `(${detail})` : ""}`;
const days = (ms: number): string => (ms / DAY_MS).toFixed(1);
const fmtBytes = (n: number | null): string => (n === null ? "unknown" : `${n} B`);

function preconditions(info: SessionInfo, g: Gathered, minAgeMs: number, now: number): string {
  const parts = [`transcribed=${ok(info.transcribed)}`, `indexed=${ok(info.indexed)}`];
  const at = info.processedAt;
  const ms = parseIsoInstant(at);
  if (at === undefined) parts.push("processedAt=FAIL(missing)", "age=n/a");
  else if (ms === null) parts.push("processedAt=FAIL(malformed)", "age=n/a");
  else parts.push("processedAt=PASS", `age=${ok(now - ms >= minAgeMs, `${days(now - ms)}d vs ${days(minAgeMs)}d`)}`);
  let citing = 0;
  let unverified = 0;
  for (const c of g.claims) {
    if (c === null || typeof c !== "object" || Array.isArray(c)) continue;
    const rec = c as Record<string, unknown>;
    if (rec.tenantId !== g.tenantId || !Array.isArray(rec.evidence)) continue;
    const cites = (rec.evidence as unknown[]).some((e) => typeof e === "object" && e !== null && info.turnIds.has(String((e as Record<string, unknown>).turnId)));
    if (!cites) continue;
    citing++;
    if (rec.status !== "verified") unverified++;
  }
  parts.push(`claims-verified=${citing === 0 ? "FAIL(no claim cites it)" : ok(unverified === 0, `${citing - unverified}/${citing} verified`)}`);
  parts.push(`file=${info.media.state === "present" ? "PASS(present)" : `FAIL(${info.media.state})`}`);
  return parts.join(" ");
}

function section(g: Gathered, plan: RetentionPlan | null, opts: ReportOptions, minAgeMs: number, now: number, clock: ClockCheck, ops: OpsState, scope: Scope) {
  const lines: string[] = [];
  // Planner items follow media order; an index:N id names the media array slot. Own-tenant copies only.
  const byId = new Map<string, SessionInfo[]>();
  g.media.forEach((m, i) => {
    const info = g.infos[g.mediaInfo[i] ?? -1];
    if (info?.mediaId !== undefined && (info.mediaTenant === undefined || info.mediaTenant === g.tenantId)) byId.set(info.mediaId, [...(byId.get(info.mediaId) ?? []), info]);
  });
  const rows: Row[] = g.infos.filter((i) => i.unreadable).map((info) => ({ info, item: undefined }));
  for (const item of plan?.items ?? []) {
    let info: SessionInfo | undefined;
    if (item.mediaId.startsWith("index:")) info = g.infos[g.mediaInfo[Number(item.mediaId.slice(6))] ?? -1];
    else info = byId.get(item.mediaId)?.shift();
    rows.push({ info, item });
  }
  const printed = new Set(rows.map((r) => r.info));
  const a = assess(rows, g.infos.filter((i) => !printed.has(i)), now, clock, ops, scope);
  for (const row of rows) {
    const { info, item } = row;
    const v = a.verdicts.get(row) as RowVerdict;
    const reason = row.item === undefined ? `unreadable state, kept: ${info?.unreadable ?? "?"}` : row.item.reason;
    const size = info?.media.sizeBytes ?? null;
    lines.push(`RECORDING ${cleanText(item?.mediaId.startsWith("index:") ? info?.mediaId ?? item.mediaId : item?.mediaId ?? info?.dir ?? "?", 80)} => ${v.eligible ? "ELIGIBLE" : "KEEP"}`);
    if (info) {
      lines.push(`  session: ${cleanText(info.dir, 80)}${info.title ? `  title: ${cleanText(info.title, 100)}` : ""}`);
      lines.push(`  file: ${info.media.relPath ? cleanText(info.media.relPath, 120) : "(not located)"}  size: ${fmtBytes(size)}  age: ${parseIsoInstant(info.processedAt) === null ? "n/a" : `${days(now - (parseIsoInstant(info.processedAt) ?? now))} d since processedAt`}${info.media.mtimeMs === null ? "" : `  media-mtime-age: ${((now - info.media.mtimeMs) / 3_600_000).toFixed(2)} h`}`);
      if (!info.unreadable) lines.push(`  preconditions: ${preconditions(info, g, minAgeMs, now)}`);
      if (v.shared > 1) lines.push(`  shared-media: ${v.shared} session record(s) reference this one physical file`);
    }
    if (v.hit) lines.push(`  guard: ${v.hit.code}${NOT_ASSESSABLE.has(v.hit.code) ? " (not assessable)" : ""} - ${cleanText(v.hit.detail, 240)}${item?.decision === "purge-eligible" ? "; the planner alone said purge-eligible" : ""}`);
    lines.push(`  ${v.hit ? "planner " : ""}reason: ${cleanText(reason, 200)}`);
    if (v.eligible && item) lines.push(`  would retain ${item.retainWindows.length} evidence-clip window(s) (+/-${opts.clipPaddingSeconds}s)`);
  }
  return { lines, a };
}

export function runRetentionReport(argv: readonly string[], deps: RunDeps): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    deps.error(`retention-report: ${parsed.message}`);
    for (const l of USAGE) deps.error(l);
    return 2;
  }
  const opts = parsed.opts;
  if (!mediaRootUsable(opts.mediaRoot)) { deps.error("retention-report: cannot read --media-root: it must be an existing directory"); return 3; }
  const io = deps.io ?? REAL_IO;
  const gathered = gatherState(opts, io);
  if (!gathered.ok) { deps.error(`retention-report: ${gathered.message}`); return 3; }
  const g = gathered.value;
  const minAgeMs = opts.minAgeDays * DAY_MS;
  const now = deps.now();
  const planned = planRetentionSweep({
    tenantId: opts.tenant, media: g.media, claims: g.claims, turns: g.turns, now,
    params: { minAgeAfterProcessedMs: minAgeMs, clipPaddingSeconds: opts.clipPaddingSeconds },
  });
  if (!planned.ok) {
    deps.error(`retention-report: planner refused the input: ${planned.errors.map((e) => cleanText(e, 160)).join("; ")}`);
    return 2;
  }
  const ops = loadOps(opts.operationsState, io);
  const clock = checkClock(now, g.infos.flatMap((i) => [parseIsoInstant(i.processedAt), i.media.mtimeMs]), opts.asOf);
  const foreign = scanOtherTenants(opts.dataRoot, tenantSegment(opts.tenant), opts.mediaRoot, io);
  const incomplete = g.notUnderstood.length > 0 || foreign.incomplete;
  const { lines, a } = section(g, planned.plan, opts, minAgeMs, now, clock, ops, { incomplete, foreignKeys: foreign.keys });
  const t = a.totals;
  const tot = (label: string, b: { records: number; files: number; bytes: number }): string => `TOTALS ${label}: ${b.records} recording(s) = ${b.files} file(s), ${b.bytes} B`;
  const out = [
    "RETENTION DRY RUN - report only. Nothing is deleted, moved or written; this command cannot delete.",
    clock.asOfLine,
    ...clock.banner,
    ...(ops.kind === "unavailable" ? [`!! PIPELINE STATE UNAVAILABLE (${cleanText(ops.why, 60)}): in-progress recordings cannot be seen. No recording is reported ELIGIBLE (operation-state-unavailable).`] : []),
    ...(incomplete ? [`!! SCOPE INCOMPLETE: ${g.notUnderstood.length} entr${g.notUnderstood.length === 1 ? "y" : "ies"} in this tenant's directory could not be read or understood${foreign.incomplete ? "; a sibling tenant directory could not be scanned" : ""}. No recording is reported ELIGIBLE (scope-incomplete).`,
      ...g.notUnderstood.slice(0, 20).map((n) => `  not understood: ${cleanText(n.path, 120)} - ${cleanText(n.why, 120)}`),
      ...(g.notUnderstood.length > 20 ? [`  ... and ${g.notUnderstood.length - 20} more`] : [])] : []),
    `tenant: ${cleanText(opts.tenant, 80)}  state: <data-root>/${tenantSegment(opts.tenant)}/ (tenant-segmented by sha-256 of the tenant id; each file also carries its own tenantId)`,
    `thresholds used (owner decision, ARCHITECTURE Q6, no default): min-age-days=${opts.minAgeDays} (${minAgeMs} ms)  clip-padding-seconds=${opts.clipPaddingSeconds}`,
    "tenant scoping: records are read only from this tenant's directory (sibling tenants: see below); legacy flat dirs (e.g. data/toc-migrated) are not tenant-scoped by directory and are never read.",
    `media guards (downgrade-only, planner untouched): media file found inside --media-root, opened read-only and read; quiet period ${QUIET_PERIOD_MS / 3_600_000} h (modified strictly longer ago than this); pipeline status must be terminal (${[...TERMINAL_STATUSES].join("/")}), unknown or non-terminal status keeps; clock check horizon ${CLOCK_HORIZON_MS / 86_400_000} d`,
    "ELIGIBLE means only: the existing planner said purge-eligible for these thresholds, AND every guard above passed, AND every session record that references the same physical file is also ELIGIBLE, AND nothing in scope was unreadable or skipped.",
    "ELIGIBLE does not mean: safe to delete. No shipped writer records processedAt or sizeBytes, a writer holding a file open can be invisible to the OS, and no executor exists. It is a shortlist for human review.",
    "note: no shipped writer records processedAt, so real state reports recordings as not processed unless session.json carries processedAt.",
    `recordings: ${g.infos.length}  non-recording sessions skipped: ${g.nonRecording}  other-tenant records excluded: ${planned.plan.tenancyViolations.length}  entries not understood: ${g.notUnderstood.length}`,
    "other tenants: sibling tenant directories under the data root are scanned for media file identity ONLY (nothing else of those records is read or printed); a file used by another tenant is KEEP shared-across-tenants. Directories that are not 64-hex tenant segments (legacy flat dirs) are not scanned.",
    "",
    ...lines,
    "",
    tot("eligible", t.eligible) + " (each physical file's bytes counted once)",
    tot("kept by policy", t.policy),
    tot("kept by guard", t.guard),
    tot("not assessable", t.notAssessable) + " (policy says eligible or the file/clock/pipeline state could not be trusted; NOT counted as eligible)",
    `files referenced by more than one session record: ${a.sharedFiles}; recordings with no located file (size unknown, bytes not counted): ${a.unlocated}`,
    ...g.notes.map((n) => `warning: ${cleanText(n, 200)}`),
  ];
  deps.write(out.join("\n"));
  return 0;
}

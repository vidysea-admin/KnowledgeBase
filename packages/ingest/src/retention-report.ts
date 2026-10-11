/**
 * packages/ingest/src/retention-report.ts - T-046. REPORT-ONLY operator command: "what would the
 * retention sweep purge, and why". A dry run by construction: it gathers one tenant's state
 * read-only (./retention-report-state.ts), calls the existing pure planner (`planRetentionSweep`;
 * eligibility is not re-implemented here) and prints. It imports no write, delete, rename or
 * process-spawning API and has no apply option; the destructive executor is a separate future
 * unit that needs the owner's thresholds (Q6) and approval.
 *
 * Verdicts come ONLY from the planner. The precondition columns are an informational view of the
 * same gathered data; they cannot change a verdict.
 *
 * Exit codes: 0 report produced, 2 usage error or invalid planner input, 3 unreadable state.
 */
import { planRetentionSweep, type PlanItem, type RetentionPlan } from "./retention-sweep.js";
import { parseIsoInstant } from "./strict-record.js";
import { parseArgs, USAGE, type ReportOptions } from "./retention-report-args.js";
import { gatherState, tenantSegment, type Gathered, type SessionInfo } from "./retention-report-state.js";
import { cleanText } from "./retention-report-text.js";

export interface RunDeps {
  now: () => number;
  write: (line: string) => void;
  error: (line: string) => void;
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
  parts.push(`file=${info.fileState === "present" ? "PASS(present)" : info.fileState === "missing" ? "FAIL(missing)" : "unknown"}`);
  return parts.join(" ");
}

function section(g: Gathered, plan: RetentionPlan | null, opts: ReportOptions, minAgeMs: number, now: number) {
  const lines: string[] = [];
  let eligible = 0, kept = 0, eligibleBytes = 0, keptBytes = 0, unknownSize = 0;
  const tally = (verdict: "keep" | "eligible", size: number | null): void => {
    if (size === null) unknownSize++;
    if (verdict === "eligible") { eligible++; eligibleBytes += size ?? 0; } else { kept++; keptBytes += size ?? 0; }
  };
  // Planner items follow media order; an index:N id names the media array slot. Own-tenant copies only.
  const byId = new Map<string, SessionInfo[]>();
  g.media.forEach((m, i) => {
    const info = g.infos[g.mediaInfo[i] ?? -1];
    if (info?.mediaId !== undefined && (info.mediaTenant === undefined || info.mediaTenant === g.tenantId)) byId.set(info.mediaId, [...(byId.get(info.mediaId) ?? []), info]);
  });
  const entry = (info: SessionInfo | undefined, item: PlanItem | undefined, reason: string): void => {
    const verdict = item?.decision === "purge-eligible" ? "ELIGIBLE" : "KEEP";
    tally(verdict === "ELIGIBLE" ? "eligible" : "keep", info?.sizeBytes ?? null);
    lines.push(`RECORDING ${cleanText(item?.mediaId.startsWith("index:") ? info?.mediaId ?? item.mediaId : item?.mediaId ?? info?.dir ?? "?", 80)} => ${verdict}`);
    if (info) {
      lines.push(`  session: ${cleanText(info.dir, 80)}${info.title ? `  title: ${cleanText(info.title, 100)}` : ""}`);
      lines.push(`  file: ${info.relPath ? cleanText(info.relPath, 120) : "(not located)"}  size: ${fmtBytes(info.sizeBytes)}  age: ${parseIsoInstant(info.processedAt) === null ? "n/a" : `${days(now - (parseIsoInstant(info.processedAt) ?? now))} d since processedAt`}`);
      if (!info.unreadable) lines.push(`  preconditions: ${preconditions(info, g, minAgeMs, now)}`);
    }
    lines.push(`  reason: ${cleanText(reason, 200)}`);
    if (item?.decision === "purge-eligible") lines.push(`  would retain ${item.retainWindows.length} evidence-clip window(s) (+/-${opts.clipPaddingSeconds}s)`);
  };
  for (const info of g.infos.filter((i) => i.unreadable)) entry(info, undefined, `unreadable state, kept: ${info.unreadable}`);
  for (const item of plan?.items ?? []) {
    let info: SessionInfo | undefined;
    if (item.mediaId.startsWith("index:")) info = g.infos[g.mediaInfo[Number(item.mediaId.slice(6))] ?? -1];
    else info = byId.get(item.mediaId)?.shift();
    entry(info, item, item.reason);
  }
  return { lines, eligible, kept, eligibleBytes, keptBytes, unknownSize };
}

export function runRetentionReport(argv: readonly string[], deps: RunDeps): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    deps.error(`retention-report: ${parsed.message}`);
    for (const l of USAGE) deps.error(l);
    return 2;
  }
  const opts = parsed.opts;
  const gathered = gatherState(opts);
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
  const s = section(g, planned.plan, opts, minAgeMs, now);
  const out = [
    "RETENTION DRY RUN - report only. Nothing is deleted, moved or written; this command cannot delete.",
    `tenant: ${cleanText(opts.tenant, 80)}  state: <data-root>/${tenantSegment(opts.tenant)}/ (tenant-segmented by sha-256 of the tenant id; each file also carries its own tenantId)`,
    `thresholds used (owner decision, ARCHITECTURE Q6, no default): min-age-days=${opts.minAgeDays} (${minAgeMs} ms)  clip-padding-seconds=${opts.clipPaddingSeconds}`,
    "tenant scoping: only this tenant's directory is read; legacy flat dirs (e.g. data/toc-migrated) are not tenant-scoped by directory and are never read.",
    "note: no shipped writer records processedAt, so real state reports recordings as not processed unless session.json carries processedAt.",
    `recordings: ${g.infos.length}  non-recording sessions skipped: ${g.nonRecording}  other-tenant records excluded: ${planned.plan.tenancyViolations.length}`,
    "",
    ...s.lines,
    "",
    `TOTALS eligible: ${s.eligible} recording(s), ${s.eligibleBytes} B | kept: ${s.kept} recording(s), ${s.keptBytes} B | size unknown for ${s.unknownSize} (not counted in bytes)`,
    ...g.notes.map((n) => `warning: ${cleanText(n, 200)}`),
  ];
  deps.write(out.join("\n"));
  return 0;
}

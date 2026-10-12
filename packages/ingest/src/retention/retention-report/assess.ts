/**
 * packages/ingest/src/retention/retention-report/assess.ts - T-046 dry-run report. Turns the planner's
 * per-record verdicts into the reported verdicts. Everything here is DOWNGRADE-ONLY:
 *   1. per record: media guards (finalEligible), then the unconfirmed-clock refusal, then the
 *      pipeline in-progress signal. Each can turn eligible into KEEP; none can do the reverse.
 *   2. per PHYSICAL FILE: records are grouped by file identity (device + file index, plus the
 *      case-folded real path; a shared key merges groups). A file is ELIGIBLE only if EVERY record
 *      that references it is eligible after step 1. Session records that the planner did not
 *      report as their own (other-tenant copies, duplicate ids) still count as members and are
 *      never eligible. Otherwise every record of the group is KEEP `shared-media-not-all-eligible`.
 * Records whose file could not be located have no identity; they are not assessable and never
 * make a group eligible. Totals count each physical file's bytes once.
 */
import type { PlanItem } from "../retention-sweep.js";
import { parseIsoInstant } from "../../strict-record.js";
import { NOT_ASSESSABLE, finalEligible, type GuardHit } from "../retention-report-guards.js";
import type { SessionInfo } from "../retention-report-state.js";
import type { ClockCheck } from "./clock.js";
import { opsGuard, type OpsState } from "./ops.js";

/** What the scan could not see: any unreadable/skipped entry makes the whole report refuse; foreign keys are other tenants' file identities (nothing else of theirs is held). */
export interface Scope { incomplete: boolean; foreignKeys: ReadonlySet<string> }

export interface Row { info: SessionInfo | undefined; item: PlanItem | undefined }
export interface RowVerdict { eligible: boolean; hit: GuardHit | null; shared: number }
export type Bucket = "eligible" | "policy" | "guard" | "notAssessable";
export interface BucketTotal { records: number; files: number; bytes: number }
export interface Assessment { verdicts: Map<Row, RowVerdict>; totals: Record<Bucket, BucketTotal>; unlocated: number; sharedFiles: number }

export function bucketOf(v: RowVerdict): Bucket {
  if (v.eligible) return "eligible";
  if (!v.hit) return "policy";
  return NOT_ASSESSABLE.has(v.hit.code) ? "notAssessable" : "guard";
}

function perRow(r: Row, now: number, clock: ClockCheck, ops: OpsState, scope: Scope): RowVerdict {
  const planned = r.item?.decision ?? "keep";
  const { info } = r;
  if (info === undefined) {
    return { eligible: false, shared: 1, hit: planned === "purge-eligible" ? { code: "media-not-found", detail: "no session state matched this planner item" } : null };
  }
  const fin = finalEligible(planned, { media: info.media, recordedBytes: info.recordedBytes, processedAtMs: parseIsoInstant(info.processedAt) }, now);
  if (!fin.eligible) return { eligible: false, hit: fin.hit, shared: 1 };
  if (clock.refused) return { eligible: false, shared: 1, hit: { code: "clock-unconfirmed", detail: "the as-of clock is not confirmed (see the banner at the top of this report)" } };
  if (scope.incomplete) return { eligible: false, shared: 1, hit: { code: "scope-incomplete", detail: "some record or directory in scope could not be read or understood, so no file can be proven unreferenced (see the list at the top of this report)" } };
  if ((info.media.keys ?? []).some((k) => scope.foreignKeys.has(k))) return { eligible: false, shared: 1, hit: { code: "shared-across-tenants", detail: "shared" } };
  const o = opsGuard(ops, { names: [info.dir, info.mediaId ?? ""].filter(Boolean), keys: info.media.keys ?? [] });
  return { eligible: o === null, hit: o, shared: 1 };
}

export function assess(rows: Row[], unmatched: SessionInfo[], now: number, clock: ClockCheck, ops: OpsState, scope: Scope): Assessment {
  const verdicts = new Map<Row, RowVerdict>(rows.map((r) => [r, perRow(r, now, clock, ops, scope)]));
  // union-find over identity keys; members = printed rows plus unmatched session records (never eligible)
  const members = [...rows.map((r) => ({ info: r.info, row: r as Row | null })), ...unmatched.map((info) => ({ info: info as SessionInfo | undefined, row: null as Row | null }))];
  const parent = new Map<string, string>();
  const find = (k: string): string => { let x = k; while (parent.get(x) !== x) x = parent.get(x) as string; return x; };
  for (const m of members) {
    const keys = m.info?.media.state === "present" ? m.info.media.keys ?? [] : [];
    for (const k of keys) if (!parent.has(k)) parent.set(k, k);
    for (const k of keys.slice(1)) parent.set(find(k), find(keys[0] as string));
  }
  const groups = new Map<string, typeof members>();
  const unlocatedRows = members.filter((m) => m.row !== null && (m.info?.media.state !== "present" || !(m.info.media.keys?.length)));
  for (const m of members) {
    const k = m.info?.media.state === "present" ? m.info.media.keys?.[0] : undefined;
    if (k !== undefined) groups.set(find(k), [...(groups.get(find(k)) ?? []), m]);
  }
  let sharedFiles = 0;
  const totals: Record<Bucket, BucketTotal> = { eligible: { records: 0, files: 0, bytes: 0 }, policy: { records: 0, files: 0, bytes: 0 }, guard: { records: 0, files: 0, bytes: 0 }, notAssessable: { records: 0, files: 0, bytes: 0 } };
  const order: Bucket[] = ["notAssessable", "guard", "policy"];
  for (const group of groups.values()) {
    if (group.length > 1) sharedFiles++;
    const allEligible = group.every((m) => m.row !== null && verdicts.get(m.row)?.eligible === true);
    if (!allEligible) {
      for (const m of group) {
        const v = m.row ? verdicts.get(m.row) : undefined;
        if (m.row && v?.eligible) verdicts.set(m.row, { eligible: false, shared: group.length, hit: { code: "shared-media-not-all-eligible", detail: `${group.length} session record(s) reference this one physical file and not every one of them is eligible (a file is purge-eligible only if ALL of its records are)` } });
        else if (v) v.shared = group.length;
      }
    } else for (const m of group) (verdicts.get(m.row as Row) as RowVerdict).shared = group.length;
    const printed = group.filter((m) => m.row !== null);
    const buckets = printed.map((m) => bucketOf(verdicts.get(m.row as Row) as RowVerdict));
    for (const b of buckets) totals[b].records++;
    if (printed.length === 0) continue;
    const fileBucket = allEligible ? "eligible" : order.find((b) => buckets.includes(b)) ?? "policy";
    totals[fileBucket].files++;
    totals[fileBucket].bytes += group.find((m) => m.info?.media.sizeBytes != null)?.info?.media.sizeBytes ?? 0;
  }
  for (const m of unlocatedRows) totals[bucketOf(verdicts.get(m.row as Row) as RowVerdict)].records++;
  return { verdicts, totals, unlocated: unlocatedRows.length, sharedFiles };
}

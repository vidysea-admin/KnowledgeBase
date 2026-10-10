/**
 * packages/ingest/src/retention-sweep.ts — T-046. A PURE, READ-ONLY dry-run planner for D-008's
 * gated media purge. It returns data and nothing else: no fs, no DB, no network, no clock read
 * (`now` is a parameter), no deletion. A caller that wanted to delete would have to take the plan
 * and do it elsewhere; nothing here can.
 *
 * The eligibility decision is `isPurgeEligible` from @lkb/core (no second copy of that rule). This
 * planner only adds what that function lacks: tenant scoping, input validation, a processed-age
 * threshold, and resolution of the evidence-clip windows that must be kept.
 *
 * FAIL CLOSED: anything unknown, malformed, unprocessed, cross-tenant, or citing a claim whose
 * evidence turn cannot be resolved is KEEP with a reason. Retention values are an open question
 * (ARCHITECTURE Q6), so every threshold is a required parameter with no default.
 */
import { deriveEvidenceClipWindows, isPurgeEligible } from "@lkb/core";
import type { Claims, EvidenceClipWindow, Media, Turns } from "@lkb/core";

export interface RetentionParams {
  /** Minimum age (ms) since `processedAt` before a media item may be purge-eligible. Required, > 0. */
  minAgeAfterProcessedMs: number;
  /** Padding (seconds) around each cited turn for retained evidence clips (D-008 says 15). Required, > 0. */
  clipPaddingSeconds: number;
}

export interface RetentionSweepInput {
  tenantId: string;
  /** Raw records; each must also carry `processedAt` (ISO-8601 string) once processed. */
  media: readonly unknown[];
  claims: readonly unknown[];
  turns: readonly unknown[];
  /** Current time, epoch ms. Passed in so the planner never reads a clock. */
  now: number;
  params: Partial<RetentionParams> | undefined;
}

export interface PlanItem {
  mediaId: string;
  decision: "keep" | "purge-eligible";
  reason: string;
  /** Evidence-clip windows that must be retained permanently for this media's cited turns. */
  retainWindows: EvidenceClipWindow[];
}

export interface TenancyViolation {
  mediaId: string;
  foundTenantId: string;
  requestedTenantId: string;
}

export interface RetentionPlan {
  tenantId: string;
  items: PlanItem[];
  /** Ids of items with decision "purge-eligible". Never contains a tenancy violation. */
  purgeEligibleIds: string[];
  /** Other-tenant media found in the input: reported, excluded from `items` and every purge list. */
  tenancyViolations: TenancyViolation[];
}

export type RetentionPlanResult =
  | { ok: true; plan: RetentionPlan }
  | { ok: false; errors: string[] };

const KINDS = new Set(["recording", "audio", "video", "evidence-clip"]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const posNum = (v: unknown): v is number => isNum(v) && v > 0;

function validateInput(input: RetentionSweepInput): string[] {
  if (!isObj(input)) return ["input must be an object"];
  const errors: string[] = [];
  if (!isStr(input.tenantId)) errors.push("tenantId is required (non-empty string)");
  if (!Array.isArray(input.media)) errors.push("media must be an array");
  if (!Array.isArray(input.claims)) errors.push("claims must be an array");
  if (!Array.isArray(input.turns)) errors.push("turns must be an array");
  if (!isNum(input.now)) errors.push("now is required (finite epoch ms)");
  const p = input.params;
  if (!isObj(p)) {
    errors.push("params is required: minAgeAfterProcessedMs and clipPaddingSeconds have no default");
  } else {
    if (!posNum(p.minAgeAfterProcessedMs)) errors.push("params.minAgeAfterProcessedMs is required and must be a positive finite number");
    if (!posNum(p.clipPaddingSeconds)) errors.push("params.clipPaddingSeconds is required and must be a positive finite number");
  }
  return errors;
}

interface CleanClaim { claim: Claims; evidence: { turnId: string; sessionId: string }[] }

/** Splits claims into usable tenant claims and malformed ones that must block purges. */
function classifyClaims(tenantId: string, raw: readonly unknown[]) {
  const clean: CleanClaim[] = [];
  let blockAll = false; // a claim whose evidence is unreadable could cite anything
  const blockTurnIds = new Set<string>(); // malformed claim with a readable evidence list
  for (const c of raw) {
    if (!isObj(c)) { blockAll = true; continue; }
    const ev = c.evidence;
    if (!Array.isArray(ev) || ev.length === 0) {
      if (c.tenantId === tenantId || !isStr(c.tenantId)) blockAll = true;
      continue;
    }
    if (isStr(c.tenantId) && c.tenantId !== tenantId) continue; // another tenant's claim: not ours
    const goodEv = ev.filter((e): e is { turnId: string; sessionId: string } =>
      isObj(e) && isStr(e.turnId) && isStr(e.sessionId));
    const wellFormed = isStr(c.tenantId) && isStr(c._id) && isStr(c.status) && goodEv.length === ev.length;
    if (!wellFormed) {
      if (goodEv.length !== ev.length) blockAll = true;
      for (const e of goodEv) blockTurnIds.add(e.turnId);
      continue;
    }
    clean.push({ claim: c as unknown as Claims, evidence: goodEv });
  }
  return { clean, blockAll, blockTurnIds };
}

function cleanTurns(tenantId: string, raw: readonly unknown[]): Turns[] {
  return raw.filter((t): t is Turns =>
    isObj(t) && isStr(t._id) && isStr(t.sessionId) && t.tenantId === tenantId &&
    isNum(t.tStart) && isNum(t.tEnd) && t.tStart <= t.tEnd && t.tStart >= 0);
}

export function planRetentionSweep(input: RetentionSweepInput): RetentionPlanResult {
  const errors = validateInput(input);
  if (errors.length > 0) return { ok: false, errors };
  const { tenantId, now } = input;
  const params = input.params as RetentionParams;

  const { clean, blockAll, blockTurnIds } = classifyClaims(tenantId, input.claims);
  const tenantClaims = clean.map((c) => c.claim);
  const turns = cleanTurns(tenantId, input.turns);
  const resolvable = new Set(turns.map((t) => `${t.sessionId}::${t._id}`));

  // Duplicate ids are ambiguous: every copy is kept.
  const idCounts = new Map<string, number>();
  for (const m of input.media) {
    if (isObj(m) && isStr(m._id)) idCounts.set(m._id, (idCounts.get(m._id) ?? 0) + 1);
  }

  const items: PlanItem[] = [];
  const tenancyViolations: TenancyViolation[] = [];

  input.media.forEach((raw, index) => {
    const keep = (mediaId: string, reason: string, retainWindows: EvidenceClipWindow[] = []): void => {
      items.push({ mediaId, decision: "keep", reason, retainWindows });
    };

    if (!isObj(raw)) return keep(`index:${index}`, "malformed record (not an object)");
    if (!isStr(raw._id)) return keep(`index:${index}`, "malformed record: missing _id");
    const id = raw._id;
    if (!isStr(raw.tenantId)) return keep(id, "malformed record: missing tenantId");
    if (raw.tenantId !== tenantId) {
      tenancyViolations.push({ mediaId: id, foundTenantId: raw.tenantId, requestedTenantId: tenantId });
      return;
    }
    if ((idCounts.get(id) ?? 0) > 1) return keep(id, "duplicate media _id in input: ambiguous");
    if (!isStr(raw.kind) || !KINDS.has(raw.kind)) return keep(id, "malformed record: unknown or missing kind");
    if (raw.kind === "evidence-clip") return keep(id, "evidence clips are retained permanently (D-008)");
    if (!isStr(raw.sourceRef)) return keep(id, "malformed record: missing sourceRef");
    const retention = raw.retention;
    if (!isObj(retention) || typeof retention.purgeAfterVerified !== "boolean") {
      return keep(id, "malformed record: missing or invalid retention");
    }
    if (retention.purgedAt !== undefined && retention.purgedAt !== null) {
      return keep(id, "already purged or purgedAt set: nothing to plan");
    }
    if (!Array.isArray(raw.turnRefs) || !raw.turnRefs.every(isStr)) {
      return keep(id, "malformed record: turnRefs missing or not a string list");
    }
    const turnRefs = raw.turnRefs as string[];

    if (blockAll) return keep(id, "an unreadable claim record exists in the input: cannot rule out a citation");
    if (turnRefs.some((t) => blockTurnIds.has(t))) return keep(id, "a malformed claim cites this media's turns");

    // Processed-to-a-defined-level gate: a parseable processedAt, not in the future, old enough.
    if (!isStr(raw.processedAt)) return keep(id, "not processed: processedAt missing");
    const processedMs = Date.parse(raw.processedAt);
    if (!Number.isFinite(processedMs)) return keep(id, "malformed processedAt");
    if (processedMs > now) return keep(id, "processedAt is in the future");
    const age = now - processedMs;
    if (age < params.minAgeAfterProcessedMs) {
      return keep(id, `processed ${age} ms ago, under the ${params.minAgeAfterProcessedMs} ms minimum`);
    }

    // Evidence-window resolution for every claim citing this media.
    const wanted = new Set(turnRefs);
    const citing = clean.filter((c) => c.evidence.some((e) => wanted.has(e.turnId)));
    for (const c of citing) {
      for (const e of c.evidence) {
        if (!resolvable.has(`${e.sessionId}::${e.turnId}`)) {
          return keep(id, `evidence turn ${e.sessionId}::${e.turnId} of claim ${c.claim._id} cannot be resolved`);
        }
      }
    }
    const windows = deriveEvidenceClipWindows(citing.map((c) => c.claim), turns, params.clipPaddingSeconds)
      .filter((w) => wanted.has(w.turnId));

    let verdict: { eligible: boolean; reason: string };
    try {
      verdict = isPurgeEligible(raw as unknown as Media, tenantClaims);
    } catch (err) {
      return keep(id, `policy check threw: ${err instanceof Error ? err.message : String(err)}`, windows);
    }
    if (verdict.eligible !== true) return keep(id, verdict.reason, windows);
    if (windows.length === 0) return keep(id, "eligible by policy but no evidence-clip window to retain: refusing", windows);
    items.push({ mediaId: id, decision: "purge-eligible", reason: verdict.reason, retainWindows: windows });
  });

  const purgeEligibleIds = items.filter((i) => i.decision === "purge-eligible").map((i) => i.mediaId);
  return { ok: true, plan: { tenantId, items, purgeEligibleIds, tenancyViolations } };
}

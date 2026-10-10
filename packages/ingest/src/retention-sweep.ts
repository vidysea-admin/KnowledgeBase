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
 * FAIL CLOSED, and NEVER TRUST INPUT SHAPE (fix cycle 1): every media, claim and turn record, and
 * the input envelope itself, goes through the strict reader in ./strict-record.ts first. Only the
 * resulting plain copies are used afterwards; a record that is not a plain object with OWN,
 * correctly typed fields is malformed and KEPT. Timestamps must be strict ISO UTC instants.
 * Retention values are an open question (ARCHITECTURE Q6), so every threshold is required.
 */
import { deriveEvidenceClipWindows, isPurgeEligible } from "@lkb/core";
import type { Claims, EvidenceClipWindow, Media, Turns } from "@lkb/core";
import {
  arrayOf, bool, isoInstant, num, oneOf, parseIsoInstant, posNum, readArray, readFields,
  record, str, strList, type Spec,
} from "./strict-record.js";

export interface RetentionParams {
  /** Minimum age (ms) since `processedAt` before a media item may be purge-eligible. Required, > 0. */
  minAgeAfterProcessedMs: number;
  /** Padding (seconds) around each cited turn for retained evidence clips (D-008 says 15). Required, > 0. */
  clipPaddingSeconds: number;
}

export interface RetentionSweepInput {
  tenantId: string;
  /** Raw records; each must also carry `processedAt` (strict ISO-8601 UTC instant) once processed. */
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

const req = (read: Spec[string]["read"]) => ({ read, required: true });
const opt = (read: Spec[string]["read"]) => ({ read, required: false });
const KINDS = new Set(["recording", "audio", "video", "evidence-clip"]);
const purgedAtReader = (v: unknown): unknown => (v === null ? null : isoInstant(v));

const ENVELOPE: Spec = {
  tenantId: req(str), media: req((v) => readArray(v)), claims: req((v) => readArray(v)),
  turns: req((v) => readArray(v)), now: req(posNum),
  params: req(record({ minAgeAfterProcessedMs: req(posNum), clipPaddingSeconds: req(posNum) })),
};
const MEDIA: Spec = {
  _id: req(str), tenantId: req(str), sourceRef: req(str), kind: req(oneOf(KINDS)), turnRefs: req(strList),
  retention: req(record({ purgeAfterVerified: req(bool), purgedAt: opt(purgedAtReader) })),
  processedAt: opt(isoInstant), // absent = not processed (KEEP); present but invalid = malformed (KEEP)
  path: opt(str), tStart: opt(num), tEnd: opt(num),
};
const EVIDENCE: Spec = { turnId: req(str), sessionId: req(str) };
const CLAIM: Spec = { _id: req(str), tenantId: req(str), status: req(str), evidence: req(arrayOf(record(EVIDENCE), true)) };
const TURN: Spec = {
  _id: req(str), tenantId: req(str), sessionId: req(str), tStart: req(num), tEnd: req(num),
};

function validateInput(input: unknown): { errors: string[]; vals?: Record<string, unknown> } {
  const r = readFields(input, ENVELOPE);
  if (r === null) return { errors: ["input must be a plain object"] };
  const msg: Record<string, string> = {
    tenantId: "tenantId is required (non-empty string)",
    media: "media must be an array", claims: "claims must be an array", turns: "turns must be an array",
    now: "now is required (finite positive epoch ms)",
    params: "params is required: minAgeAfterProcessedMs and clipPaddingSeconds have no default, " +
      "and each must be a positive finite number",
  };
  return r.bad.length > 0 ? { errors: r.bad.map((k) => msg[k] ?? k) } : { errors: [], vals: r.vals };
}

interface CleanClaim { claim: Claims; evidence: { turnId: string; sessionId: string }[] }

/** Splits claims into usable tenant claims and malformed ones that must block purges. */
function classifyClaims(tenantId: string, raw: readonly unknown[]) {
  const clean: CleanClaim[] = [];
  let blockAll = false; // a claim whose evidence or tenant is unreadable could cite anything of ours
  const blockTurnIds = new Set<string>(); // malformed claim with a readable evidence list
  for (const c of raw) {
    const r = readFields(c, CLAIM);
    if (r === null) { blockAll = true; continue; }
    if (!r.bad.includes("tenantId") && r.vals.tenantId !== tenantId) continue; // another tenant's: not ours
    if (r.bad.includes("tenantId") || r.bad.includes("evidence")) { blockAll = true; continue; }
    const evidence = (r.vals.evidence as { turnId: string; sessionId: string }[])
      .map((e) => ({ turnId: e.turnId, sessionId: e.sessionId }));
    if (r.bad.length > 0) { for (const e of evidence) blockTurnIds.add(e.turnId); continue; }
    const claim = { _id: r.vals._id, tenantId, status: r.vals.status, evidence } as unknown as Claims;
    clean.push({ claim, evidence });
  }
  return { clean, blockAll, blockTurnIds };
}

/** Own-tenant, well-typed, unambiguous turns only. Duplicate session::id pairs are dropped (fail closed). */
function cleanTurns(tenantId: string, raw: readonly unknown[]): Turns[] {
  const seen = new Map<string, Turns | null>();
  for (const t of raw) {
    const r = readFields(t, TURN);
    if (r === null || r.bad.length > 0 || r.vals.tenantId !== tenantId) continue;
    const s = r.vals.tStart as number;
    const e = r.vals.tEnd as number;
    if (s < 0 || s > e) continue;
    const key = `${String(r.vals.sessionId)}::${String(r.vals._id)}`;
    seen.set(key, seen.has(key) ? null : ({ _id: r.vals._id, tenantId, sessionId: r.vals.sessionId, tStart: s, tEnd: e } as unknown as Turns));
  }
  return [...seen.values()].filter((t): t is Turns => t !== null);
}

export function planRetentionSweep(input: RetentionSweepInput): RetentionPlanResult {
  const checked = validateInput(input);
  if (checked.vals === undefined) return { ok: false, errors: checked.errors };
  const v = checked.vals;
  const tenantId = v.tenantId as string;
  const now = v.now as number;
  const params = v.params as unknown as RetentionParams;
  const rawMedia = v.media as unknown[];

  const { clean, blockAll, blockTurnIds } = classifyClaims(tenantId, v.claims as unknown[]);
  const tenantClaims = clean.map((c) => c.claim);
  const turns = cleanTurns(tenantId, v.turns as unknown[]);
  const resolvable = new Set(turns.map((t) => `${t.sessionId}::${t._id}`));

  // One strict read per media record; everything below uses only these copies.
  const reads = rawMedia.map((m) => readFields(m, MEDIA));
  const idCounts = new Map<string, number>(); // duplicate ids are ambiguous: every copy is kept
  for (const r of reads) {
    if (r && !r.bad.includes("_id")) idCounts.set(r.vals._id as string, (idCounts.get(r.vals._id as string) ?? 0) + 1);
  }

  const items: PlanItem[] = [];
  const tenancyViolations: TenancyViolation[] = [];

  reads.forEach((r, index) => {
    const keep = (mediaId: string, reason: string, retainWindows: EvidenceClipWindow[] = []): void => {
      items.push({ mediaId, decision: "keep", reason, retainWindows });
    };
    if (r === null) return keep(`index:${index}`, "malformed record (not a plain object)");
    if (r.bad.includes("_id")) return keep(`index:${index}`, "malformed record: missing or invalid _id");
    const id = r.vals._id as string;
    if (r.bad.includes("tenantId")) return keep(id, "malformed record: missing or invalid own tenantId");
    if (r.vals.tenantId !== tenantId) {
      tenancyViolations.push({ mediaId: id, foundTenantId: r.vals.tenantId as string, requestedTenantId: tenantId });
      return;
    }
    if ((idCounts.get(id) ?? 0) > 1) return keep(id, "duplicate media _id in input: ambiguous");
    if (r.bad.length > 0) {
      return keep(id, r.bad.includes("processedAt") && r.bad.length === 1
        ? "malformed processedAt" : `malformed record: invalid or missing ${r.bad.join(", ")}`);
    }
    if (r.vals.kind === "evidence-clip") return keep(id, "evidence clips are retained permanently (D-008)");
    const retention = r.vals.retention as { purgeAfterVerified: boolean; purgedAt?: string | null };
    if (retention.purgedAt !== undefined && retention.purgedAt !== null) {
      return keep(id, "already purged or purgedAt set: nothing to plan");
    }
    const turnRefs = [...(r.vals.turnRefs as string[])];

    if (blockAll) return keep(id, "an unreadable claim record exists in the input: cannot rule out a citation");
    if (turnRefs.some((t) => blockTurnIds.has(t))) return keep(id, "a malformed claim cites this media's turns");

    // Processed-to-a-defined-level gate: a strict ISO processedAt, not in the future, old enough.
    if (r.vals.processedAt === undefined) return keep(id, "not processed: processedAt missing");
    const processedMs = parseIsoInstant(r.vals.processedAt);
    if (processedMs === null) return keep(id, "malformed processedAt");
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

    // The policy sees a fresh plain Media built only from validated copies.
    const cleanMedia = {
      _id: id, tenantId, sourceRef: r.vals.sourceRef, kind: r.vals.kind, turnRefs,
      retention: { purgeAfterVerified: retention.purgeAfterVerified },
    } as unknown as Media;
    let verdict: { eligible: boolean; reason: string };
    try {
      verdict = isPurgeEligible(cleanMedia, tenantClaims);
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

/** Policy service: versioned saves, conflict reconciliation and the review queue. Tenant always comes from the caller's verified auth. */
import { randomUUID } from "node:crypto";
import { detectConflicts } from "./conflicts.js";
import { isValidTenantId } from "../auth.js";
import { parseNote, parseSave, validPolicyId } from "./rules.js";
import type { AnswerPolicyStore } from "./store.js";
import type { Actor, ConflictFinding, PolicyBody, PolicyRevision, ReviewItem, ReviewStatus } from "./types.js";

export class PolicyServiceError extends Error {
  constructor(readonly code: "not_found" | "version_conflict" | "invalid_state" | "invalid_policy", message: string) { super(message); }
}
export interface AnswerPolicyService {
  save(tenantId: string, policyId: string, input: unknown, actor: Actor): Promise<{ revision: PolicyRevision; conflicts: ConflictFinding[] }>;
  retire(tenantId: string, policyId: string, input: unknown, actor: Actor): Promise<{ revision: PolicyRevision }>;
  list(tenantId: string): Promise<PolicyRevision[]>;
  history(tenantId: string, policyId: string): Promise<PolicyRevision[]>;
  conflicts(tenantId: string): Promise<ConflictFinding[]>;
  queue(tenantId: string, status?: ReviewStatus): Promise<ReviewItem[]>;
  resolve(tenantId: string, itemId: string, input: unknown, actor: Actor): Promise<ReviewItem>;
}
const FIELDS: (keyof PolicyBody)[] = ["questionClass", "mode", "style", "onInsufficient"];
const DECISIONS: Record<ReviewItem["kind"], ReviewStatus[]> = { conflict: ["acknowledged", "dismissed"], change: ["approved", "rejected"] };

/** Deterministic from the revision pair, so a repair after a crash produces exactly what the original write would have. */
function changeItem(rev: PolicyRevision, prev: PolicyRevision | null): ReviewItem {
  const changedFields = rev.retired ? ["retired"] : prev ? FIELDS.filter((f) => prev[f] !== rev[f]) : ["created"];
  const by = rev.changedBy;
  return { id: randomUUID(), tenantId: rev.tenantId, kind: "change", status: "open", createdAt: rev.changedAt, key: `${rev.policyId}@${rev.version}`,
    summary: `${rev.policyId} v${rev.version} ${rev.retired ? "retired" : prev ? "changed" : "created"} by ${by.actor}${by.claimedBy ? ` (claimed: ${by.claimedBy})` : ""}: ${changedFields.join(", ") || "no field change"}. ${rev.note}`,
    change: { policyId: rev.policyId, version: rev.version, previousVersion: rev.previousVersion, changedFields } };
}
function checkIds(tenantId: string, policyId?: string): void {
  if (!isValidTenantId(tenantId)) throw new PolicyServiceError("invalid_policy", "Invalid tenant.");
  if (policyId !== undefined && !validPolicyId(policyId)) throw new PolicyServiceError("invalid_policy", "Invalid policy id.");
}

export function createAnswerPolicyService(store: AnswerPolicyStore, clock: () => Date = () => new Date()): AnswerPolicyService {
  const actorOf = (a: Actor, claimedBy?: string): Actor => ({ actor: a.actor, ...((claimedBy ?? a.claimedBy) ? { claimedBy: claimedBy ?? a.claimedBy } : {}) });

  /** Opens an item per live conflict not already queued; closes open conflict items whose conflict no longer exists. */
  async function reconcile(tenantId: string): Promise<ConflictFinding[]> {
    await repairChangeItems(tenantId);
    const findings = detectConflicts(await store.latest(tenantId));
    const live = new Set(findings.map((f) => f.key));
    for (const f of findings) {
      await store.addItemIfAbsent(tenantId, { id: randomUUID(), tenantId, kind: "conflict", status: "open", createdAt: clock().toISOString(), key: f.key, summary: f.explanation, conflict: f });
    }
    for (const item of await store.items(tenantId)) {
      if (item.kind === "conflict" && item.status === "open" && !live.has(item.key)) {
        await store.closeItem(tenantId, item.id, { ...item, status: "superseded",
          resolution: { decision: "superseded", note: "Conflict no longer present after a later policy change.", by: { actor: "system" }, at: clock().toISOString() } });
      }
    }
    return findings;
  }

  /** Idempotent repair: the history is the source of truth, so any revision whose change item is missing (crash between the two writes) gets it back. */
  async function repairChangeItems(tenantId: string): Promise<void> {
    for (const latest of await store.latest(tenantId)) {
      const hist = await store.history(tenantId, latest.policyId);
      for (let i = 0; i < hist.length; i++) await store.addItemIfAbsent(tenantId, changeItem(hist[i]!, i > 0 ? hist[i - 1]! : null));
    }
  }

  async function append(tenantId: string, policyId: string, body: PolicyBody, note: string, expected: number | null, by: Actor, retire: boolean): Promise<PolicyRevision> {
    const hist = await store.history(tenantId, policyId);
    const prev = hist.at(-1) ?? null;
    if (retire && !prev) throw new PolicyServiceError("not_found", "No such policy.");
    if (retire && prev!.retired) throw new PolicyServiceError("invalid_state", "Policy is already retired.");
    if (prev && expected !== prev.version) throw new PolicyServiceError("version_conflict", `Current version is ${prev.version}; send expectedVersion ${prev.version}.`);
    if (!prev && expected !== null) throw new PolicyServiceError("version_conflict", "Policy does not exist yet; omit expectedVersion to create it.");
    const rev: PolicyRevision = { questionClass: body.questionClass, mode: body.mode, style: body.style, onInsufficient: body.onInsufficient, citations: "required", tenantId, policyId, version: (prev?.version ?? 0) + 1, action: retire ? "retire" : "save",
      retired: retire, changedBy: by, changedAt: clock().toISOString(), note, previousVersion: prev?.version ?? null };
    if (!(await store.appendRevision(tenantId, rev, prev?.version ?? 0))) throw new PolicyServiceError("version_conflict", "Policy changed concurrently; reload and retry.");
    await store.addItemIfAbsent(tenantId, changeItem(rev, prev));
    return rev;
  }

  return {
    async save(tenantId, policyId, input, actor) {
      checkIds(tenantId, policyId);
      const p = parseSave(input);
      const revision = await append(tenantId, policyId, p.body, p.note, p.expectedVersion, actorOf(actor, p.claimedBy), false);
      const conflicts = (await reconcile(tenantId)).filter((c) => c.a.policyId === policyId || c.b.policyId === policyId);
      return { revision, conflicts };
    },
    async retire(tenantId, policyId, input, actor) {
      checkIds(tenantId, policyId);
      const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      const note = parseNote(o.note);
      const expected = Number.isSafeInteger(o.expectedVersion) ? (o.expectedVersion as number) : null;
      if (expected === null) throw new PolicyServiceError("invalid_policy", "expectedVersion is required to retire a policy.");
      const claimed = typeof o.claimedBy === "string" && o.claimedBy.trim() && o.claimedBy.length <= 80 ? o.claimedBy.trim() : undefined;
      const hist = await store.history(tenantId, policyId);
      const prev = hist.at(-1);
      if (!prev) throw new PolicyServiceError("not_found", "No such policy.");
      const revision = await append(tenantId, policyId, prev, note, expected, actorOf(actor, claimed), true);
      await reconcile(tenantId);
      return { revision };
    },
    async list(tenantId) { checkIds(tenantId); return store.latest(tenantId); },
    async history(tenantId, policyId) { checkIds(tenantId, policyId); return store.history(tenantId, policyId); },
    async conflicts(tenantId) {
      checkIds(tenantId); return detectConflicts(await store.latest(tenantId)); },
    async queue(tenantId, status) {
      checkIds(tenantId);
      await repairChangeItems(tenantId);
      return (await store.items(tenantId)).filter((i) => !status || i.status === status).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    },
    async resolve(tenantId, itemId, input, actor) {
      checkIds(tenantId);
      const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      const note = parseNote(o.note);
      const item = await store.getItem(tenantId, itemId);
      if (!item) throw new PolicyServiceError("not_found", "No such review item.");
      const decision = o.decision;
      if (typeof decision !== "string" || !DECISIONS[item.kind].includes(decision as ReviewStatus))
        throw new PolicyServiceError("invalid_policy", `decision for a ${item.kind} item must be one of ${DECISIONS[item.kind].join(", ")}.`);
      const claimed = typeof o.claimedBy === "string" && o.claimedBy.trim() && o.claimedBy.length <= 80 ? o.claimedBy.trim() : undefined;
      const closed: ReviewItem = { ...item, status: decision as ReviewStatus, resolution: { decision: decision as ReviewStatus, note, by: actorOf(actor, claimed), at: clock().toISOString() } };
      if (!(await store.closeItem(tenantId, itemId, closed))) throw new PolicyServiceError("invalid_state", "Review item is already closed.");
      return closed;
    },
  };
}

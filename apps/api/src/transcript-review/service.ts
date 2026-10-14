/**
 * T-054 review service: effective transcript = immutable original turns + the head's correction overlay; commit = plan
 * (planner.ts, pure) then one compare-and-set on the head; refresh execution is a separate, injected, per-target step.
 * A plan, a commit and a refresh are three distinct facts and this file never reports one as another.
 */
import { createHash } from "node:crypto";
import { parseReviewRequest, planTranscriptReview, ReviewPlanningError, type ReviewSnapshot, type ReviewTurn } from "./planner.js";
import {
  headId, revisionRowId, type OverlayTurn, type RefreshState, type ReviewHead, type ReviewStore, type RevisionRow,
} from "./store.js";

export type ReviewFailure = "not_found" | "conflict" | "invalid" | "unreviewable" | "no_changes" | "unavailable";
export class ReviewServiceError extends Error {
  constructor(public readonly code: ReviewFailure, message: string) { super(message); }
}
export interface LoadedReview { snapshot: ReviewSnapshot; refresh: RefreshState | null }
export interface CommitReceipt { sessionId: string; revision: string; commit: "committed"; refresh: RefreshState["status"] }
/** Re-derives ONE refresh target for a session at a revision. Must be idempotent: a crashed run is retried from the start. */
export type RefreshExecutor = (job: { tenantId: string; sessionId: string; revision: string; target: string }) => Promise<void>;

/** Revision of a never-reviewed transcript: a hash of the original turns, so any change to the source changes it. */
export function baseRevision(tenantId: string, sessionId: string, turns: readonly ReviewTurn[]): string {
  const material = turns.map((t) => [t._id, t.tStart, t.tEnd, t.text, t.speakerRef, t.speakerLabel ?? null]);
  return `base-${createHash("sha256").update(JSON.stringify([tenantId, sessionId, material])).digest("hex").slice(0, 48)}`;
}

/** Applies the overlay over the originals by turn id; overlay entries whose turn no longer exists are ignored. */
export function effectiveTurns(originals: readonly ReviewTurn[], head: ReviewHead | null): ReviewTurn[] {
  const overlay = new Map((head?.overlay ?? []).map((o) => [o.turnId, o]));
  return originals.map((t) => {
    const o = overlay.get(t._id);
    if (!o) return { ...t };
    const { speakerLabel: _drop, ...rest } = t;
    return { ...rest, text: o.text, speakerRef: o.speakerRef, ...(o.speakerLabel !== undefined ? { speakerLabel: o.speakerLabel } : {}) };
  });
}

const toRow = (head: ReviewHead): RevisionRow => ({
  _id: revisionRowId(head.tenantId, head.sessionId, head.revision), tenantId: head.tenantId, sessionId: head.sessionId,
  revision: head.revision, parentRevision: head.parentRevision, ...head.audit, refreshTargets: [...head.refresh.targets],
});

export async function loadReview(store: ReviewStore, tenantId: string, sessionId: string): Promise<LoadedReview> {
  const originals = await store.originalTurns(tenantId, sessionId);
  if (!originals.length) throw new ReviewServiceError("not_found", "no such transcript");
  const head = await store.head(tenantId, sessionId);
  const revision = head?.revision ?? baseRevision(tenantId, sessionId, originals);
  return { snapshot: { tenantId, sessionId, revision, turns: effectiveTurns(originals, head) }, refresh: head?.refresh ?? null };
}

export async function commitReview(store: ReviewStore, input: { tenantId: string; sessionId: string; actorRef: string; now: string; request: unknown }): Promise<CommitReceipt> {
  const { tenantId, sessionId } = input;
  try { parseReviewRequest(input.request); } catch { throw new ReviewServiceError("invalid", "Invalid transcript review request"); }
  const { snapshot } = await loadReview(store, tenantId, sessionId);
  const head = await store.head(tenantId, sessionId);
  // Heal first: the head carries its own audit entry, so a crash between "head swapped" and "history row written" can
  // never leave a revision without history once a later commit has happened.
  if (head) await store.recordRevision(tenantId, toRow(head));
  let plan;
  try { plan = planTranscriptReview(snapshot, input.request, { tenantId, sessionId, actorRef: input.actorRef, reviewedAt: input.now }); }
  catch (e) {
    if (e instanceof ReviewPlanningError) {
      throw new ReviewServiceError(e.code === "conflict" ? "conflict" : e.code === "no_changes" ? "no_changes" : e.code === "invalid" ? "unreviewable" : "unavailable", e.message);
    }
    throw e;
  }
  const overlay = new Map<string, OverlayTurn>((head?.overlay ?? []).map((o) => [o.turnId, o]));
  const byId = new Map(plan.nextTurns.map((t) => [t._id, t]));
  for (const c of plan.audit.changes) {
    const t = byId.get(c.turnId)!;
    overlay.set(c.turnId, { turnId: t._id, text: t.text, speakerRef: t.speakerRef, ...(t.speakerLabel !== undefined ? { speakerLabel: t.speakerLabel } : {}) });
  }
  const next: ReviewHead = {
    _id: headId(tenantId, sessionId), tenantId, sessionId, revision: plan.nextRevision, parentRevision: plan.expectedRevision,
    overlay: [...overlay.values()],
    audit: { actorRef: plan.audit.actorRef, reviewedAt: plan.audit.reviewedAt, reason: plan.audit.reason, changes: plan.audit.changes },
    refresh: { status: "pending", revision: plan.nextRevision, targets: [...plan.refresh.targets], completed: [] },
    committedAt: input.now,
  };
  const won = head ? await store.replaceHead(tenantId, head.revision, next) : await store.insertHead(tenantId, next);
  if (!won) throw new ReviewServiceError("conflict", "Transcript changed; reload before saving");
  // The commit is durable here. A failure to write the history row is healed by the next commit and must not turn a
  // confirmed commit into an error response.
  try { await store.recordRevision(tenantId, toRow(next)); } catch { /* healed from the head's audit entry */ }
  return { sessionId, revision: next.revision, commit: "committed", refresh: "pending" };
}

const running = new Map<string, Promise<RefreshState | null>>();

/** Runs the head's pending refresh targets in order. Progress is persisted per target, only while the head is still at that
 * revision, so a newer correction supersedes (never overwrites) an older run. Failure is recorded, never swallowed. */
export function runRefresh(store: ReviewStore, execute: RefreshExecutor, tenantId: string, sessionId: string): Promise<RefreshState | null> {
  const key = headId(tenantId, sessionId);
  const prior = running.get(key);
  if (prior) return prior;
  const run = (async (): Promise<RefreshState | null> => {
    const head = await store.head(tenantId, sessionId);
    if (!head || head.refresh.status === "complete") return head?.refresh ?? null;
    let state: RefreshState = { ...head.refresh, status: "pending", completed: [...head.refresh.completed] };
    delete state.failedTarget;
    for (const target of state.targets) {
      if (state.completed.includes(target)) continue;
      try { await execute({ tenantId, sessionId, revision: state.revision, target }); }
      catch {
        state = { ...state, status: "failed", failedTarget: target };
        await store.setRefresh(tenantId, sessionId, state.revision, state);
        return state;
      }
      state = { ...state, completed: [...state.completed, target] };
      if (!(await store.setRefresh(tenantId, sessionId, state.revision, state))) return null; // superseded by a newer revision
    }
    state = { ...state, status: "complete" };
    await store.setRefresh(tenantId, sessionId, state.revision, state);
    return state;
  })().finally(() => running.delete(key));
  running.set(key, run);
  return run;
}

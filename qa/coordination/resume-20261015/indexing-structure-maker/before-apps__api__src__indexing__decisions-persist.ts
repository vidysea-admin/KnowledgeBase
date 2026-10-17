/**
 * U2.5: persist extracted decisions for one session. Called by indexSession ONLY when the
 * LKB_EXTRACT_DECISIONS flag (or deps.extractDecisions) is on; flag-off never imports a collection
 * handle from here. Mirrors the claims write: a degraded extraction leaves existing decisions
 * untouched (ISS-056 shape), a clean one replaces the session's decisions. Tenant-scoped through
 * scopedCollection on the same injected db handle. Proposed writes land before pruning;
 * reviewed rows survive, and deterministic IDs make reruns idempotent. This is not a transaction:
 * a partial write may add proposals but never removes prior rows before every write succeeds.
 */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { scopedCollection } from "@lkb/db";
import type { Decisions, Turns } from "@lkb/core";
import { extractDecisions, type DecisionsCompleteFn } from "@lkb/index";
import { decisionSourceDigest } from "../session-decisions/provenance.js";

export async function extractAndPersistDecisions(
  tenantId: string, sessionId: string, turns: Turns[], complete: DecisionsCompleteFn, db: Pick<Db, "collection">,
): Promise<{ count: number; degraded: string | null }> {
  if (typeof sessionId !== "string" || !sessionId || sessionId !== sessionId.trim() || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(sessionId)
    || typeof tenantId !== "string" || !tenantId || tenantId !== tenantId.trim() || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(tenantId)
    || turns.some((t) => !t || t.tenantId !== tenantId || t.sessionId !== sessionId)) {
    return { count: 0, degraded: "decisions input scope does not match the target tenant/session" };
  }
  const { decisions, degraded } = await extractDecisions(turns, complete);
  if (degraded) {
    console.warn(`indexSession(${tenantId}/${sessionId}): decisions left unchanged — ${degraded.reason}`);
    return { count: 0, degraded: degraded.reason };
  }
  const generationEvidenceDigest = decisions.length ? decisionSourceDigest(tenantId, sessionId, turns, turns.map((t) => t._id)) : null;
  if (decisions.length && !generationEvidenceDigest) return { count: 0, degraded: "decisions generation inventory cannot be bound" };
  const coll = scopedCollection<Decisions>(db as never, "decisions")(tenantId);
  const old = await coll.find({ "evidence.sessionId": sessionId } as never).toArray();
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  const reviewedText = new Set(old.filter((d) => d.status !== "proposed").map((d) => normalize(d.text)));
  const docs = new Map<string, Decisions>();
  for (const d of decisions) {
    if (reviewedText.has(normalize(d.text))) continue;
    const evidenceIds = [...new Set(d.evidenceTurnIds)].sort();
    const sourceEvidenceDigest = decisionSourceDigest(tenantId, sessionId, turns, evidenceIds);
    if (!sourceEvidenceDigest || !generationEvidenceDigest) return { count: 0, degraded: "decisions generation source cannot be bound" };
    const id = createHash("sha256").update(JSON.stringify(["decision", tenantId, sessionId, normalize(d.text), evidenceIds, d.tStart, d.tEnd, d.owner ?? null, sourceEvidenceDigest, generationEvidenceDigest])).digest("hex");
    docs.set(id, {
      _id: id,
      tenantId,
      text: d.text,
      status: "proposed",
      ...(d.owner ? { owner: d.owner } : {}),
      tStart: d.tStart,
      tEnd: d.tEnd,
      sourceEvidenceDigest,
      generationEvidenceDigest,
      evidence: evidenceIds.map((turnId) => ({ turnId, sessionId })) as Decisions["evidence"],
    });
  }
  // Status in the write predicate protects a concurrent review. A duplicate-key failure after
  // review is explicit and skips pruning; extraction cannot turn a reviewed row into proposed.
  for (const doc of docs.values()) await coll.updateOne(
    { _id: doc._id, "evidence.sessionId": sessionId, status: "proposed" } as never,
    { $setOnInsert: doc } as never, { upsert: true },
  );
  const stale = old.filter((d) => d.status === "proposed" && d.evidence.every((e) => e.sessionId === sessionId) && !docs.has(d._id)).map((d) => d._id);
  if (stale.length) await coll.deleteMany({ _id: { $in: stale }, "evidence.sessionId": sessionId,
    evidence: { $not: { $elemMatch: { sessionId: { $ne: sessionId } } } }, status: "proposed" } as never);
  return { count: decisions.length, degraded: null };
}

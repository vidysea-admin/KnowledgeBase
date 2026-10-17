import type { Db } from "mongodb";
import type { Decisions, Turns } from "@lkb/core";
import { assertValidTenantId, scopedCollection, withTenant } from "@lkb/db";
import type { BrainReadDeps } from "../routes/brain.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import { withKnowledgeReadSnapshot } from "../visibility/read-snapshot.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { decisionSourceDigest, isDecisionIdentity } from "./provenance.js";

export interface DecisionEvidenceView {
  turnId: string; sessionId: string; text: string; speaker: string;
  tStart: number; tEnd: number; unit: "seconds" | "characters";
}
export interface SessionDecisionView {
  _id: string; text: string; status: Decisions["status"]; owner?: string;
  tStart: number; tEnd: number; evidence: DecisionEvidenceView[];
}
export interface SessionDecisionsView { sessionId: string; decisions: SessionDecisionView[] }
export interface SessionDecisionsDeps {
  getSessionDecisions(tenantId: string, sessionId: string): Promise<SessionDecisionsView | null>;
}

const validRow = (d: Decisions, tenantId: string, sessionId: string): boolean => Boolean(d && d.tenantId === tenantId
  && isDecisionIdentity(d._id) && typeof d.text === "string" && d.text.trim()
  && ["proposed", "verified", "needs-review"].includes(d.status)
  && Array.isArray(d.evidence) && d.evidence.length > 0 && d.evidence.every((e) => e && e.sessionId === sessionId && isDecisionIdentity(e.turnId))
  && new Set(d.evidence.map((e) => e.turnId)).size === d.evidence.length
  && typeof d.sourceEvidenceDigest === "string" && /^[a-f0-9]{64}$/.test(d.sourceEvidenceDigest)
  && typeof d.generationEvidenceDigest === "string" && /^[a-f0-9]{64}$/.test(d.generationEvidenceDigest));
const fingerprint = (d: Decisions) => JSON.stringify([d._id, d.tenantId, d.text, d.status, d.owner ?? null,
  d.evidence, d.tStart ?? null, d.tEnd ?? null, d.sourceEvidenceDigest, d.generationEvidenceDigest]);

/** Read-only current-source projection. Root supplies trustedBrainReads; the same privacy and
 * effective-transcript perimeter is also applied here, so a permissive injected base cannot bypass it. */
export function createSessionDecisionsDeps(read: Pick<BrainReadDeps, "getSessionDetail">, db: Pick<Db, "collection" | "client">): SessionDecisionsDeps {
  const visibility = createKnowledgeVisibility(db), decisions = scopedCollection<Decisions>(db as Db, "decisions");
  const sourceTurns = scopedCollection<Turns>(db as Db, "turns");
  const current = async (tenantId: string, sessionId: string) => {
    if (!await visibility.sessionVisible(tenantId, sessionId)) return null;
    const detail = await read.getSessionDetail(tenantId, sessionId);
    if (!detail || detail.session.tenantId !== tenantId || detail.session._id !== sessionId) return null;
    const permitted = new Set(detail.turns.filter((t) => t.tenantId === tenantId && t.sessionId === sessionId).map((t) => t._id));
    // Fetch current source metadata rather than retaining timestamps from an earlier Brain snapshot.
    const fresh = await sourceTurns(tenantId).find({ sessionId }).toArray();
    const scoped = fresh.filter((t) => t.tenantId === tenantId && t.sessionId === sessionId && permitted.has(t._id));
    const effective = await readEffectiveTurns(db, tenantId, scoped, sessionId);
    const visible = await visibility.filterTurns(tenantId, effective);
    return await visibility.sessionVisible(tenantId, sessionId) ? visible : null;
  };
  return { async getSessionDecisions(tenantId, sessionId) {
    assertValidTenantId(tenantId, "sessionDecisions.read");
    if (!isDecisionIdentity(sessionId)) throw new Error("Invalid session identity");
    if (!await current(tenantId, sessionId)) return null;
    const rows = await decisions(tenantId).find({ "evidence.sessionId": sessionId } as never).toArray();
    const valid = rows.filter((d) => validRow(d, tenantId, sessionId) && rows.filter((r) => r._id === d._id).length === 1);
    const visible = await current(tenantId, sessionId);
    if (!visible) return null;
    // Re-read stored rows after awaited source resolution: withdrawn or changed candidates cannot
    // survive as an earlier snapshot. No hidden-row counts or raw record metadata are projected.
    const latest = await decisions(tenantId).find({ "evidence.sessionId": sessionId } as never).toArray();
    // The final awaited row lookup can coincide with withdrawal/redaction. Re-resolve source
    // eligibility after it rather than projecting the earlier visible-turn snapshot.
    const finalPermitted = await current(tenantId, sessionId);
    if (!finalPermitted) return null;
    // The live Brain dependency supplies a restrictive preflight only. Final publication,
    // source eligibility and effective heads share ONE Mongo transaction snapshot; nothing
    // closing over the live/global db is called inside this authority phase.
    const final = await withKnowledgeReadSnapshot(db, async (snapshotDb) => {
      const guard = createKnowledgeVisibility(snapshotDb);
      if (!await guard.sessionVisible(tenantId, sessionId)) return null;
      const allowed = new Set(finalPermitted.map((t) => t._id));
      const raw = await snapshotDb.collection<Turns>("turns").find(withTenant<Turns>(tenantId, { sessionId })).toArray();
      const effective = await readEffectiveTurns(snapshotDb, tenantId,
        raw.filter((t) => t.tenantId === tenantId && t.sessionId === sessionId && allowed.has(t._id)), sessionId);
      const turns = await guard.filterTurns(tenantId, effective);
      const rows = await snapshotDb.collection<Decisions>("decisions")
        .find(withTenant<Decisions>(tenantId, { "evidence.sessionId": sessionId })).toArray();
      return await guard.sessionVisible(tenantId, sessionId) ? { turns, rows } : null;
    });
    if (!final) return null;
    const finalVisible = final.turns;
    const out: SessionDecisionView[] = [];
    for (const d of valid) {
      const same = latest.filter((r) => r._id === d._id);
      if (same.length !== 1 || fingerprint(same[0]!) !== fingerprint(d)) continue;
      const published = final.rows.filter((r) => r._id === d._id);
      if (published.length !== 1 || fingerprint(published[0]!) !== fingerprint(d)) continue;
      const refs = d.evidence.map((e) => e.turnId);
      // The model saw the whole generation inventory, not just its returned citations. Any
      // hidden, redacted or changed sibling invalidates that old generation too.
      if (decisionSourceDigest(tenantId, sessionId, visible, visible.map((t) => t._id)) !== d.generationEvidenceDigest
        || decisionSourceDigest(tenantId, sessionId, finalVisible, finalVisible.map((t) => t._id)) !== d.generationEvidenceDigest) continue;
      if (decisionSourceDigest(tenantId, sessionId, visible, refs) !== d.sourceEvidenceDigest
        || decisionSourceDigest(tenantId, sessionId, finalVisible, refs) !== d.sourceEvidenceDigest) continue;
      const cited = refs.map((id) => finalVisible.find((t) => t._id === id)!);
      const tStart = Math.min(...cited.map((t) => t.tStart)), tEnd = Math.max(...cited.map((t) => t.tEnd));
      if (d.tStart !== tStart || d.tEnd !== tEnd) continue;
      if (d.owner !== undefined && (typeof d.owner !== "string" || !cited.some((t) => t.speakerRef === d.owner))) continue;
      out.push({ _id: d._id, text: d.text, status: d.status, ...(d.owner ? { owner: d.owner } : {}), tStart, tEnd,
        evidence: cited.map((t): DecisionEvidenceView => ({ turnId: t._id, sessionId, text: t.text,
          speaker: typeof t.speakerLabel === "string" && t.speakerLabel.trim() ? t.speakerLabel : t.speakerRef,
          tStart: t.tStart, tEnd: t.tEnd, unit: t.speakerRef === "document" || t.speakerRef === "url" ? "characters" : "seconds" })),
      });
    }
    return { sessionId, decisions: out };
  } };
}

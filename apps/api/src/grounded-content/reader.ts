import type { Claims, CitedItem, QaEntry, SessionPages, Sessions, Turns } from "@lkb/core";
import { assertValidTenantId, getDb, scopedCollection } from "@lkb/db";
import type { Db } from "mongodb";

export interface GroundedEvidence {
  turnId: string;
  sessionId: string;
  quote: string | null;
  available: boolean;
  tStart: number | null;
  tEnd: number | null;
  speaker: string | null;
}
export interface GroundedContent {
  sessionId: string;
  notes: Array<Pick<CitedItem, "id" | "kind" | "text" | "origin" | "verification"> & { evidence: GroundedEvidence[] }>;
  qa: Array<Pick<QaEntry, "id" | "question" | "answer" | "status"> & { questionEvidence: GroundedEvidence[]; answerEvidence: GroundedEvidence[] }>;
  claims: Array<Pick<Claims, "_id" | "text" | "status"> & { evidence: GroundedEvidence[] }>;
}
export interface GroundedContentDeps {
  getGroundedContent(tenantId: string, sessionId: string): Promise<GroundedContent | null>;
}
export interface GroundedReadDeps {
  getSessionDetail(tenantId: string, sessionId: string): Promise<{
    session: Sessions; page: SessionPages | null; claims: Claims[]; turns: Turns[];
  } | null>;
}

/** Read-only projection. Resolve within both tenant and session; never copy raw document extras. */
export function createGroundedContentDeps(read: GroundedReadDeps): GroundedContentDeps {
  return { async getGroundedContent(tenantId, sessionId) {
    assertValidTenantId(tenantId, "groundedContent.read");
    const detail = await read.getSessionDetail(tenantId, sessionId);
    if (!detail || detail.session.tenantId !== tenantId || detail.session._id !== sessionId) return null;
    const turns = new Map(detail.turns.filter((t) => t.tenantId === tenantId && t.sessionId === sessionId).map((t) => [t._id, t]));
    const evidence = (refs: Array<{ turnId: string; sessionId: string; quote?: unknown }>): GroundedEvidence[] => refs.map((ref) => {
      const turn = ref.sessionId === sessionId ? turns.get(ref.turnId) : undefined;
      const quote = typeof ref.quote === "string" && ref.quote.length ? ref.quote : null;
      const available = Boolean(turn && quote && turn.text.includes(quote) && Number.isFinite(turn.tStart) && Number.isFinite(turn.tEnd));
      return { turnId: ref.turnId, sessionId: ref.sessionId, quote, available,
        tStart: available ? turn!.tStart : null, tEnd: available ? turn!.tEnd : null,
        speaker: available ? (typeof turn!.speakerLabel === "string" ? turn!.speakerLabel : turn!.speakerRef) : null };
    });
    const page = detail.page?.tenantId === tenantId && detail.page.sessionId === sessionId ? detail.page : null;
    return { sessionId,
      notes: (page?.citedItems ?? []).map(({ id, kind, text, origin, verification, evidence: refs }) => ({ id, kind, text, origin, verification, evidence: evidence(refs) })),
      qa: (page?.qa ?? []).map(({ id, question, answer, status, questionEvidence, answerEvidence }) => ({
        id, question, answer: status === "unanswered" ? null : answer, status,
        questionEvidence: evidence(questionEvidence), answerEvidence: status === "unanswered" ? [] : evidence(answerEvidence),
      })),
      claims: detail.claims.filter((c) => c.tenantId === tenantId && c.evidence.some((e) => e.sessionId === sessionId)).map((c) => ({
        _id: c._id, text: c.text, status: c.status, evidence: evidence(c.evidence.filter((e) => e.sessionId === sessionId)),
      })),
    };
  } };
}

export function createMongoGroundedContentDeps(db: Db = getDb()): GroundedContentDeps {
  const sessions = scopedCollection<Sessions>(db, "sessions"), pages = scopedCollection<SessionPages>(db, "session_pages");
  const claims = scopedCollection<Claims>(db, "claims"), turns = scopedCollection<Turns>(db, "turns");
  return createGroundedContentDeps({ async getSessionDetail(tenantId, sessionId) {
    const session = await sessions(tenantId).findOne({ _id: sessionId });
    if (!session) return null;
    const [page, sessionClaims, sessionTurns] = await Promise.all([
      pages(tenantId).findOne({ sessionId }), claims(tenantId).find({ "evidence.sessionId": sessionId }).toArray(), turns(tenantId).find({ sessionId }).toArray(),
    ]);
    return { session, page, claims: sessionClaims, turns: sessionTurns };
  } });
}

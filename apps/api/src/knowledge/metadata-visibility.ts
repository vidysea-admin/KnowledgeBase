import type { Db } from "mongodb";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";

/** Cached entity names are safe only when every contributing source session is safe for raw metadata. */
export function createKnowledgeMetadataVisibility(db: Pick<Db, "collection">) {
  const visibility = createKnowledgeVisibility(db);
  const allSessions = async (tenant: string, refs: unknown): Promise<boolean> => {
    if (!Array.isArray(refs) || refs.length === 0 || refs.length > 500
      || !refs.every(ref => typeof ref === "string" && ref.length > 0)) return false;
    for (const ref of refs) if (!await visibility.sessionVisible(tenant, ref)) return false;
    return true;
  };
  const evidenceSessions = (refs: unknown, required: boolean): string[] | undefined => {
    if (refs === undefined && !required) return [];
    if (!Array.isArray(refs) || refs.length > 500 || (required && refs.length === 0)) return undefined;
    const sessions: string[] = [];
    for (const ref of refs) {
      if (ref === null || typeof ref !== "object" || !("sessionId" in ref)
        || typeof ref.sessionId !== "string" || ref.sessionId.length === 0) return undefined;
      sessions.push(ref.sessionId);
    }
    return sessions;
  };
  const memberVisible = async (tenant: string, kind: string, row: {
    _id: string; tenantId: string; sessionRefs?: unknown; evidence?: unknown;
    orgEvidence?: unknown; roleEvidence?: unknown;
  }): Promise<boolean> => {
    if (row.tenantId !== tenant) return false;
    if (kind === "document") return true; // Separate immutable page-document producer; never a raw message aggregate.
    if (kind === "session") return visibility.sessionVisible(tenant, row._id);
    if (kind === "topic") return allSessions(tenant, row.sessionRefs);
    if (kind === "speaker") {
      const identity = evidenceSessions(row.evidence, true);
      const organisation = evidenceSessions(row.orgEvidence, false);
      const role = evidenceSessions(row.roleEvidence, false);
      if (!identity || !organisation || !role) return false;
      return allSessions(tenant, [...identity, ...organisation, ...role]);
    }
    return false;
  };
  return { visibility, allSessions, memberVisible };
}

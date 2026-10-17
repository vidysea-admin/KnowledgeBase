import type { Db } from "mongodb";
import type { Chunks, Sessions, Turns } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";

/** Semantic citations expose display metadata, never persisted generation/capture capabilities. */
export function publicSemanticSession(session: Sessions | null): Sessions | null {
  if (!session) return null;
  return { _id: session._id, tenantId: session.tenantId, sourceId: session.sourceId, title: session.title, date: session.date,
    ...(session.org !== undefined ? { org: session.org } : {}),
    ...(session.participants !== undefined ? { participants: session.participants } : {}),
    status: { transcribe: session.status.transcribe, index: session.status.index,
      ...(session.status?.diarize !== undefined ? { diarize: session.status.diarize } : {}),
      ...(session.status?.summarize !== undefined ? { summarize: session.status.summarize } : {}) } };
}

/** The actual review overlay and knowledge publication boundary, before ranking or public counters. */
export async function readCurrentSemanticCorpus(tenantId: string, db: Pick<Db, "collection">) {
  const visibility = createKnowledgeVisibility(db);
  const raw = await scopedCollection<Turns>(db as never, "turns")(tenantId).find({}).toArray();
  const turns = await visibility.filterTurns(tenantId, await readEffectiveTurns(db, tenantId, raw));
  const sessions = new Map<string, Sessions>();
  for (const id of new Set(turns.map(turn => turn.sessionId))) {
    const session = await visibility.safeCitationSession(tenantId, id);
    if (session) sessions.set(id, session);
  }
  const currentTurns = turns.filter(turn => sessions.has(turn.sessionId));
  const byId = new Map(currentTurns.map(turn => [turn._id, turn]));
  const rawChunks = await scopedCollection<Chunks>(db as never, "chunks")(tenantId).find({}).toArray();
  if (rawChunks.some(chunk => chunk.tenantId !== tenantId)) throw new Error("chunk tenant mismatch");
  const chunks = rawChunks.filter(chunk => sessions.has(chunk.sourceRef) && Array.isArray(chunk.turnRefs)
    && chunk.turnRefs.length > 0 && chunk.turnRefs.every(id => byId.get(id)?.sessionId === chunk.sourceRef));
  return { turns: currentTurns, byId, sessions, chunks, visibility };
}

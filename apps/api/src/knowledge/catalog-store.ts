import type { Db } from "mongodb";
import type { Claims, Programs, Sessions, Sources, Topics, Turns, KnowledgeCollections, DocumentDocuments } from "@lkb/core";
import { getDb, scopedCollection } from "@lkb/db";
import { createKnowledgeMetadataVisibility } from "./metadata-visibility.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";

export interface TopicEvidence { sessionId: string; turnId: string; title: string; quote: string; speaker: string; tStart: number; origin: string; coordinate: "seconds" | "character-offset" }
export interface TopicCatalogDetail {
  id: string; name: string; classification: "unclassified"; sessions: Array<{ id: string; title: string }>;
  documents: Array<{ id: string; title: string; sourceId: string; version: string; pageCount: number; collectionId: string; association: "co-curated-unverified" }>;
  claims: Array<{ id: string; text: string; status: Claims["status"]; confidence?: number; evidence: TopicEvidence[] }>;
  withheldClaims: number; truncated: boolean;
}
export interface KnowledgeCatalog {
  topics(tenantId: string): Promise<Array<{ id: string; name: string }>>;
  topic(tenantId: string, id: string): Promise<TopicCatalogDetail | null>;
  resources(tenantId: string): Promise<{
    resources: Array<{ id: string; kind: string; createdAt: string; url: string | null }>;
    programs: Array<{ id: string; name: string; classification: "unclassified"; organization: "unverified"; sessions: Array<{ id: string; title: string }> }>;
    truncated: boolean;
  }>;
}
export function publicResourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value || /[\x00-\x20\x7f-\x9f]/.test(value)) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function createMongoKnowledgeCatalog(db: Db = getDb()): KnowledgeCatalog {
  const { visibility, allSessions } = createKnowledgeMetadataVisibility(db);
  const topics = (t: string) => scopedCollection<Topics>(db, "topics")(t);
  const sessions = (t: string) => scopedCollection<Sessions>(db, "sessions")(t);
  const ownSession = async (t: string, id: string) => { const r = await sessions(t).findOne({ _id: id }); return r?.tenantId === t && await visibility.sessionVisible(t, id) ? r : null; };
  return {
    async topics(t) { const rows = (await topics(t).find({}).toArray()).filter(r => r.tenantId === t); const safe = await Promise.all(rows.map(r => allSessions(t, r.sessionRefs))); return rows.filter((_, i) => safe[i]).slice(0, 101).map(r => ({ id: r._id, name: r.name })); },
    async topic(t, id) {
      const topic = await topics(t).findOne({ _id: id }); if (!topic || topic.tenantId !== t || !await allSessions(t, topic.sessionRefs)) return null;
      // Exact persisted topic ID. Neither graph slug suffixes nor foreign tenant prefixes can match.
      const rows = await scopedCollection<Claims>(db, "claims")(t).find({ topicRefs: id }).toArray();
      const eligibility = await Promise.all(rows.map(r => r.tenantId === t && r.topicRefs?.includes(id) && visibility.claimVisible(t, r)));
      const visibleRows = rows.filter((_, i) => eligibility[i]);
      const claims: TopicCatalogDetail["claims"] = []; let withheldClaims = 0;
      for (const claim of visibleRows.slice(0, 100)) {
        const evidence: TopicEvidence[] = [];
        for (const ref of claim.evidence.slice(0, 20)) {
          const session = await ownSession(t, ref.sessionId); if (!session) continue;
          const raw = await scopedCollection<Turns>(db, "turns")(t).findOne({ _id: ref.turnId, sessionId: ref.sessionId });
          const [turn] = raw ? await readEffectiveTurns(db, t, [raw], ref.sessionId) : [];
          if (!turn || turn.tenantId !== t || turn.sessionId !== session._id || !Number.isFinite(turn.tStart)) continue;
          const quote = typeof ref.quote === "string" && ref.quote.length > 0 ? ref.quote : turn.text;
          if (!quote || !turn.text.includes(quote) || !await visibility.eligibleTurn(t, ref.sessionId, ref.turnId, quote)) continue;
          evidence.push({ sessionId: session._id, turnId: turn._id, title: session.title, quote, speaker: turn.speakerLabel ?? turn.speakerRef, tStart: turn.tStart,
            origin: claim.origin ?? "unclassified", coordinate: ["document", "url"].includes(turn.speakerRef) ? "character-offset" : "seconds" });
        }
        if (!evidence.length) { withheldClaims++; continue; }
        claims.push({ id: claim._id, text: claim.text, status: claim.status, ...(typeof claim.confidence === "number" ? { confidence: claim.confidence } : {}), evidence });
      }
      const linked = await Promise.all((topic.sessionRefs ?? []).slice(0, 100).map(id => ownSession(t, id)));
      const collections = await scopedCollection<KnowledgeCollections>(db, "knowledge_collections")(t).find({ members: { $elemMatch: { kind: "topic", id } } }).toArray();
      const documents: TopicCatalogDetail["documents"] = []; const seen = new Set<string>();
      // A curated co-membership is a user grouping, explicitly not verified topical extraction.
      for (const collection of collections.filter(c => c.tenantId === t && c.members.some(m => m.kind === "topic" && m.id === id)).slice(0, 100)) {
        for (const member of collection.members.filter(m => m.kind === "document").slice(0, 100)) {
          if (seen.has(member.id)) continue; seen.add(member.id);
          const document = await scopedCollection<DocumentDocuments>(db, "document_documents")(t).findOne({ _id: member.id });
          if (document?.tenantId !== t) continue;
          documents.push({ id: document._id, title: document.title, sourceId: document.sourceId, version: document.version, pageCount: document.pages.length, collectionId: collection._id, association: "co-curated-unverified" });
          if (documents.length >= 100) break;
        }
        if (documents.length >= 100) break;
      }
      return { id: topic._id, name: topic.name, classification: "unclassified", sessions: linked.filter((r): r is Sessions => r !== null).map(r => ({ id: r._id, title: r.title })),
        documents, claims, withheldClaims, truncated: visibleRows.length > 100 || collections.length > 100 || documents.length >= 100 || (topic.sessionRefs?.length ?? 0) > 100 || visibleRows.some(r => r.evidence.length > 20) };
    },
    async resources(t) {
      const sources = await scopedCollection<Sources>(db, "sources")(t).find({}).toArray();
      const programs = await scopedCollection<Programs>(db, "programs")(t).find({}).toArray();
      const sourceSafe = await Promise.all(sources.map(r => r.tenantId === t && visibility.sourceVisible(t, r._id)));
      const programSafe = await Promise.all(programs.map(p => p.tenantId === t && allSessions(t, p.sessionRefs)));
      const visibleSources = sources.filter((_, i) => sourceSafe[i]), visiblePrograms = programs.filter((_, i) => programSafe[i]);
      const entries = await Promise.all(visiblePrograms.slice(0, 100).map(async p => {
        const linked = await Promise.all((p.sessionRefs ?? []).slice(0, 100).map(id => ownSession(t, id)));
        return { id: p._id, name: p.name, classification: "unclassified" as const, organization: "unverified" as const,
          sessions: linked.filter((r): r is Sessions => r !== null).map(r => ({ id: r._id, title: r.title })) };
      }));
      return { resources: visibleSources.slice(0, 100).map(r => ({ id: r._id, kind: r.kind, createdAt: r.createdAt, url: publicResourceUrl(r.url) })), programs: entries,
        truncated: visibleSources.length > 100 || visiblePrograms.length > 100 || visiblePrograms.some(p => (p.sessionRefs?.length ?? 0) > 100) };
    },
  };
}

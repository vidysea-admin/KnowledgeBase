import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { DocumentDocuments, KnowledgeCollections } from "@lkb/core";
import { getDb, scopedCollection, assertValidTenantId } from "@lkb/db";
import { assertCanonicalKnowledgeRow } from "./schema-validation.js";
import { createKnowledgeMetadataVisibility } from "./metadata-visibility.js";

export type CollectionMember = KnowledgeCollections["members"][number];
export type DocumentRow = DocumentDocuments;
export interface KnowledgeStore {
  listDocuments(tenantId: string): Promise<DocumentRow[]>;
  getDocument(tenantId: string, id: string): Promise<DocumentRow | null>;
  saveDocument(tenantId: string, row: DocumentRow): Promise<DocumentRow>;
  saveHighlight(tenantId: string, id: string, highlight: DocumentRow["highlights"][number]): Promise<boolean>;
  listCollections(tenantId: string): Promise<KnowledgeCollections[]>;
  getCollection(tenantId: string, id: string): Promise<KnowledgeCollections | null>;
  writeCollection(tenantId: string, row: KnowledgeCollections, expectedRevision: number): Promise<boolean>;
  deleteCollection(tenantId: string, id: string, expectedRevision: number): Promise<boolean>;
  memberExists(tenantId: string, member: CollectionMember): Promise<boolean>;
  listMembers(tenantId: string): Promise<Array<CollectionMember & { title: string; personId?: string }>>;
  speakerPersonId(tenantId: string, member: CollectionMember): Promise<string | null>;
}
export const collectionId = (tenantId: string, id: string): string => createHash("sha256").update(JSON.stringify([tenantId, id])).digest("hex");
const own = <T extends { tenantId: string }>(tenantId: string, row: T | null): T | null => row?.tenantId === tenantId ? row : null;

/** All reads/writes and member checks use concrete auth-tenant predicates. Source/page arrays are atomic. */
export function createMongoKnowledgeStore(db: Db = getDb()): KnowledgeStore {
  const { memberVisible } = createKnowledgeMetadataVisibility(db);
  const docs = (t: string) => scopedCollection<DocumentRow>(db, "document_documents")(t);
  const collections = (t: string) => scopedCollection<KnowledgeCollections>(db, "knowledge_collections")(t);
  const canWrite = () => {
    if (db.databaseName === "lkb" && process.env.LKB_I_KNOW_THIS_IS_PRODUCTION !== "1") throw new Error("Knowledge production writes unavailable");
  };
  return {
    async listDocuments(t) { return (await docs(t).find({}).toArray()).filter(r => r.tenantId === t).slice(0, 101); },
    async getDocument(t, id) { return own(t, await docs(t).findOne({ _id: id })); },
    async saveDocument(t, row) {
      assertValidTenantId(t, "knowledge.write"); canWrite();
      if (row.tenantId !== t) throw new Error("Foreign document");
      assertCanonicalKnowledgeRow("document_documents", row);
      const { _id, ...fields } = row;
      await docs(t).updateOne({ _id, version: row.version }, { $setOnInsert: fields }, { upsert: true });
      const saved = own(t, await docs(t).findOne({ _id, version: row.version }));
      if (!saved) throw new Error("Document persistence unavailable"); return saved;
    },
    async saveHighlight(t, id, highlight) {
      canWrite(); const row = own(t, await docs(t).findOne({ _id: id }));
      const page = row?.pages.find(p => p.pageNumber === highlight.pageNumber);
      if (!row || !page || !highlight.quote || highlight.text !== highlight.quote || !page.text.includes(highlight.quote)) return false;
      const existing = row.highlights.find(h => h.id === highlight.id);
      if (existing) return JSON.stringify(existing) === JSON.stringify(highlight);
      assertCanonicalKnowledgeRow("document_documents", { ...row, highlights: [...row.highlights, highlight] });
      const result = await docs(t).updateOne({ _id: id, version: row.version, "highlights.id": { $ne: highlight.id } }, { $push: { highlights: highlight } });
      if (result.matchedCount === 1) return true;
      return Boolean(own(t, await docs(t).findOne({ _id: id, version: row.version, "highlights.id": highlight.id })));
    },
    async listCollections(t) { return (await collections(t).find({}).toArray()).filter(r => r.tenantId === t).slice(0, 101); },
    async getCollection(t, id) { return own(t, await collections(t).findOne({ _id: id })); },
    async writeCollection(t, row, expectedRevision) {
      canWrite(); if (row.tenantId !== t || row.revision !== expectedRevision + 1) throw new Error("Invalid collection revision");
      assertCanonicalKnowledgeRow("knowledge_collections", row);
      if (!(await Promise.all(row.members.map(m => this.memberExists(t, m)))).every(Boolean)) return false;
      if (expectedRevision === 0) {
        try { await collections(t).insertOne(row); return true; } catch (e) { if ((e as { code?: number }).code === 11000) return false; throw e; }
      }
      // A trusted read deliberately omits private/unavailable members. Replacing that projection would erase curation.
      const current = own(t, await collections(t).findOne({ _id: row._id, revision: expectedRevision }));
      if (!current || !(await Promise.all(current.members.map(m => this.memberExists(t, m)))).every(Boolean)) return false;
      const { _id, ...fields } = row;
      return (await collections(t).updateOne({ _id, revision: expectedRevision }, { $set: fields })).matchedCount === 1;
    },
    async deleteCollection(t, id, expectedRevision) { canWrite(); return (await collections(t).deleteMany({ _id: id, revision: expectedRevision })).deletedCount === 1; },
    async memberExists(t, member) {
      const names = { session: "sessions", document: "document_documents", topic: "topics", speaker: "speakers" };
      const name = names[member.kind]; if (!name) return false;
      const row = await scopedCollection<{ _id: string; tenantId: string }>(db, name)(t).findOne({ _id: member.id });
      return Boolean(row && await memberVisible(t, member.kind, row));
    },
    async listMembers(t) {
      const names = { session: "sessions", document: "document_documents", topic: "topics", speaker: "speakers" } as const;
      const result: Array<CollectionMember & { title: string; personId?: string }> = [];
      for (const kind of Object.keys(names) as Array<CollectionMember["kind"]>) {
        const rows = await scopedCollection<{ _id: string; tenantId: string; title?: string; name?: string; label?: string; aliases?: string[]; personId?: string; sessionRefs?: unknown; evidence?: unknown }>(db, names[kind])(t).find({}).toArray();
        const safe = await Promise.all(rows.map(row => memberVisible(t, kind, row)));
        for (const row of rows.filter((_, i) => safe[i]).slice(0, 101)) result.push({ kind, id: row._id, title: row.title ?? row.name ?? row.label ?? row.aliases?.[0] ?? row._id,
          ...(kind === "speaker" && typeof row.personId === "string" && row.personId ? { personId: row.personId } : {}) });
      }
      return result;
    },
    async speakerPersonId(t, member) {
      if (member.kind !== "speaker") return null;
      const row = await scopedCollection<{ _id: string; tenantId: string; personId: string; evidence?: unknown }>(db, "speakers")(t).findOne({ _id: member.id });
      return row && await memberVisible(t, "speaker", row) && typeof row.personId === "string" && row.personId.length > 0 ? row.personId : null;
    },
  };
}

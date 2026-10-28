/** Pure construction of native publication, current-head authority and Ask/navigation consumers. */
import type { Db } from "mongodb";
import type { NativeSourceLocator } from "@lkb/core";
import type { KnowledgeStore } from "../../knowledge/collections-store.js";
import { createNativeDocumentHeadStore } from "../../native-evidence/head-store.js";
import { createNativePassageIndex } from "../../native-evidence/publication.js";
import { createNativeEvidenceResolver, type NativeEvidenceResolverDeps } from "../../native-evidence/resolver.js";
import { createNativeSourceHydrator, type ListNativeLocators } from "../../ask/native-source-context.js";
import { createNativeSourceRevalidator } from "../../answer-policy/native-evidence.js";
import { isValidTenantId } from "../../auth.js";

/** Trusted source-owner capability, never an immutable-message lookup or caller-supplied proof. */
export interface NativeMessageAuthority {
  loadCurrent: NativeEvidenceResolverDeps["loadCurrent"];
  listLocators: ListNativeLocators;
}
export function buildNativeIntegrations(input: {
  db: Pick<Db, "collection">;
  knowledgeStore: Pick<KnowledgeStore, "getDocument">;
  messageAuthority?: NativeMessageAuthority;
}) {
  const publication = createNativePassageIndex(input.db);
  const headStore = createNativeDocumentHeadStore({
    db: input.db,
    loadDocument: (tenantId, documentId) => input.knowledgeStore.getDocument(tenantId, documentId),
    indexCandidate: candidate => publication.indexCandidate(candidate),
  });
  const resolver = createNativeEvidenceResolver({
    async loadCurrent(tenantId, locator) {
      if (locator.kind === "message") return input.messageAuthority?.loadCurrent(tenantId, locator) ?? null;
      const current = await headStore.loadPublished(tenantId, locator.sourceId);
      if (!current || current.sourceId !== locator.sourceId || current.head.documentId !== locator.documentId ||
          current.document._id !== locator.documentId || current.document.tenantId !== tenantId ||
          current.document.sourceId !== locator.documentSourceId || current.head.headRevision !== locator.headRevision ||
          current.head.currentRevisionHash !== locator.revisionHash || current.document.version !== locator.revisionHash) return null;
      const page = current.document.pages.find(page => page.pageNumber === locator.pageNumber);
      if (!page) return null;
      return { kind: "document-page", tenantId, sourceId: current.sourceId, documentId: current.document._id,
        documentSourceId: current.document.sourceId, headRevision: current.head.headRevision,
        revisionHash: current.document.version, currentRevisionHash: current.head.currentRevisionHash,
        eligible: true, pageNumber: page.pageNumber, text: page.text, title: current.document.title };
    },
  });
  const listLocators: ListNativeLocators = async (tenantId, identity) => {
    if (!isValidTenantId(tenantId) || typeof identity.sourceId !== "string" || !identity.sourceId.trim() ||
        typeof identity.revisionHash !== "string" || !/^[a-f0-9]{64}$/.test(identity.revisionHash)) return [];
    const current = await headStore.loadPublished(tenantId, identity.sourceId);
    let candidates: readonly NativeSourceLocator[];
    if (current) {
      if (current.head.currentRevisionHash !== identity.revisionHash) return [];
      candidates = await publication.listLocators(tenantId, identity);
    } else candidates = await input.messageAuthority?.listLocators(tenantId, identity) ?? [];
    const accepted: NativeSourceLocator[] = [], seen = new Set<string>();
    if (!Array.isArray(candidates) || candidates.length > 10_000) throw new Error("native_passage_inventory_invalid");
    for (const locator of candidates) {
      if (!locator || locator.sourceId !== identity.sourceId || locator.revisionHash !== identity.revisionHash ||
          (current ? locator.kind !== "document-page" : locator.kind !== "message")) continue;
      const resolved = await resolver.resolve(tenantId, locator);
      if (!resolved) continue;
      const key = JSON.stringify(resolved.sourceLocator);
      if (!seen.has(key)) { seen.add(key); accepted.push(resolved.sourceLocator); }
    }
    return accepted;
  };
  return { headStore, resolver, listLocators,
    nativeSources: (tenantId: string) => ({
      hydrate: createNativeSourceHydrator(tenantId, { resolver, listLocators }),
      revalidate: createNativeSourceRevalidator(tenantId, resolver),
    }),
  };
}

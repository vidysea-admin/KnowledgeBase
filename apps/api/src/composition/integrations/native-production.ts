import type { Db } from 'mongodb';
import { createMongoKnowledgeStore, type DocumentRow } from '../../knowledge/collections-store.js';
import { scopedCollection } from '@lkb/db';
import { createWhatsAppNativeAuthority } from '../../native-evidence/whatsapp-authority.js';
import { createMongoGraphSnapshotReader } from '../../ask/graph-context.js';
import { buildNativeIntegrations } from './native.js';

/** Pure binding of real trusted readers; no acquisition, publication or provider calls. */
export function buildNativeProductionIntegrations(db: Db) {
  const messages = createWhatsAppNativeAuthority(db);
  const native = buildNativeIntegrations({ db, knowledgeStore: createMongoKnowledgeStore(db), messageAuthority: {
    loadCurrent: (tenant, locator) => locator.kind === 'message' ? messages.loadCurrent(tenant, locator) : Promise.resolve(null),
    listLocators: (tenant, identity) => messages.listCurrent(tenant, identity),
  } });
  // Only tree admission binds to its existing read snapshot. Ordinary resolve/revalidate and
  // every later hydration/release stage retain the original fresh-authority resolver.
  const resolver = Object.assign(native.resolver, {
    forReadView(view: Pick<Db, 'collection'>) {
      if (!view || typeof view.collection !== 'function') throw new Error('native_read_view_unavailable');
      const boundMessages = createWhatsAppNativeAuthority(db, { readView: view });
      return buildNativeIntegrations({ db: view, knowledgeStore: { async getDocument(tenant, id) {
        const document = await scopedCollection<DocumentRow>(view, 'document_documents')(tenant).findOne({ _id: id });
        return document?.tenantId === tenant && document._id === id ? document : null;
      } }, messageAuthority: {
        loadCurrent: (tenant, locator) => locator.kind === 'message' ? boundMessages.loadCurrent(tenant, locator) : Promise.resolve(null),
        listLocators: (tenant, identity) => boundMessages.listCurrent(tenant, identity),
      } }).resolver;
    },
  });
  return { ...native, resolver, graph: { readSnapshot: createMongoGraphSnapshotReader(db) } };
}

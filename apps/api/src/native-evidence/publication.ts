import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import type { NativeSourceLocator } from "@lkb/core";
import { scopedCollection, assertValidTenantId } from "../../../../packages/db/src/lib/tenantScope.js";
import { treeIndexRootFilter } from "../../../../packages/index/src/tree/build.js";
import { documentPagePassages } from "../../../../packages/ingest/src/sources/native-document-passages.js";
import { parseNativeSourceLocator } from "./resolver.js";
import type { NativeDocumentCandidate, NativeDocumentBinding } from "./head-store.js";

type Node = { node_id: string; level: string; title: string; summary: string; children: Node[];
  evidence?: Record<string, unknown>; [key: string]: unknown };
type Root = Node & { _id: string; tenantId: string; indexRevision?: number };
type Manifest = NativeDocumentBinding & { version: 1; pages: { pageNumber: number; length: number; sha256: string }[] };
const MAX_BYTES = 8_000_000, MAX_NODES = 10_000, MAX_RETRIES = 4;
const fail = (reason: string): never => { throw new Error("native_publication_" + reason); };
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const json = (value: unknown) => JSON.stringify(value);
const validId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 400 && v.trim() === v && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
const validHash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function binding(value: NativeDocumentBinding): NativeDocumentBinding {
  if (!value || ![value.sourceId, value.documentId, value.documentSourceId].every(validId)
    || value.sourceId === value.documentId || value.sourceId === value.documentSourceId
    || !validHash(value.revisionHash) || !Number.isSafeInteger(value.headRevision) || value.headRevision < 1) fail("invalid_binding");
  return { sourceId: value.sourceId, documentId: value.documentId, documentSourceId: value.documentSourceId,
    revisionHash: value.revisionHash, headRevision: value.headRevision };
}
const branchId = (tenant: string, b: NativeDocumentBinding) => `${tenant}/native-source:${sha(json(binding(b)))}`;
function assertRoot(root: Root, tenant: string): void {
  const f = treeIndexRootFilter(tenant);
  if (!root || root.tenantId !== tenant || root.node_id !== f.node_id || root.level !== f.level || !validId(root._id)
    || (root.indexRevision !== undefined && (!Number.isSafeInteger(root.indexRevision) || root.indexRevision < 0 || root.indexRevision >= Number.MAX_SAFE_INTEGER))
    || Buffer.byteLength(json(root), "utf8") > MAX_BYTES) fail("invalid_root");
  const ids = new Set<string>(), stack = [{ node: root as Node, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (!node || typeof node.node_id !== "string" || ids.has(node.node_id) || ids.size >= MAX_NODES || depth > 64
      || typeof node.title !== "string" || typeof node.summary !== "string" || !Array.isArray(node.children)
      || (node.tenantId !== undefined && node.tenantId !== tenant)) fail("invalid_tree");
    ids.add(node.node_id);
    for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
  }
}
function build(candidate: Readonly<NativeDocumentCandidate>): Node {
  const b = binding(candidate), doc = candidate.document;
  if (!doc || doc.tenantId !== candidate.tenantId || doc._id !== b.documentId || doc.sourceId !== b.documentSourceId
    || doc.version !== b.revisionHash || typeof doc.title !== "string" || !doc.title.trim() || doc.title.length > 200
    || !Array.isArray(doc.pages) || doc.pages.length < 1 || doc.pages.length > 500) fail("invalid_document");
  let length = 0;
  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i]!;
    if (page.pageNumber !== i + 1 || typeof page.text !== "string" || (length += page.text.length) > 2_000_000) fail("invalid_pages");
  }
  const passages = documentPagePassages(doc, b), node_id = branchId(candidate.tenantId, b);
  if (passages.length === 0 || passages.length >= MAX_NODES) fail("passage_limit");
  const manifest: Manifest = { version: 1, ...b, pages: doc.pages.map(page => ({ pageNumber: page.pageNumber,
    length: page.text.length, sha256: sha(page.text) })) };
  return { node_id, level: "native-source", title: doc.title, summary: doc.title, evidence: { ...b }, nativePublication: manifest,
    children: passages.map(({ text, locator }) => ({ node_id: `${node_id}/passage:${locator.pageNumber}:${locator.passage.start}`,
      level: "native-passage", title: `${doc.title} — page ${locator.pageNumber}`, summary: text,
      evidence: { ...b, sourceLocator: locator }, children: [] })) };
}
/** Validate complete persisted page coverage, hashes and binding before returning any locator. */
function readBranch(node: Node, tenant: string): NativeSourceLocator[] {
  const m = node.nativePublication as Manifest | undefined;
  if (!m || m.version !== 1 || node.level !== "native-source" || node.node_id !== branchId(tenant, m)
    || !isDeepStrictEqual(node.evidence, binding(m)) || !Array.isArray(m.pages) || !m.pages.length || m.pages.length > 500) return fail("invalid_manifest");
  const output: NativeSourceLocator[] = []; let child = 0, total = 0;
  for (let i = 0; i < m.pages.length; i++) {
    const page = m.pages[i]!;
    if (page.pageNumber !== i + 1 || !Number.isSafeInteger(page.length) || page.length < 0 || !validHash(page.sha256)
      || (total += page.length) > 2_000_000) fail("invalid_coverage");
    let text = "";
    while (text.length < page.length) {
      const leaf = node.children[child++], locator = parseNativeSourceLocator(leaf?.evidence?.sourceLocator);
      if (!leaf || leaf.level !== "native-passage" || leaf.children.length || !locator || locator.kind !== "document-page"
        || !isDeepStrictEqual(binding(locator), binding(m)) || locator.pageNumber !== page.pageNumber
        || locator.passage.start !== text.length || locator.passage.end !== text.length + leaf.summary.length
        || locator.passage.end > page.length || Buffer.byteLength(leaf.summary, "utf8") > 1024
        || sha(leaf.summary) !== locator.passage.sha256
        || leaf.node_id !== `${node.node_id}/passage:${page.pageNumber}:${locator.passage.start}`
        || !isDeepStrictEqual(leaf.evidence, { ...binding(m), sourceLocator: locator })) return fail("invalid_passage");
      text += leaf.summary; output.push(locator);
    }
    if (sha(text) !== page.sha256) fail("invalid_coverage");
  }
  if (child !== node.children.length || !output.length) fail("invalid_coverage");
  return output;
}

/** Only quarantined candidates are stored here. Every reader MUST independently check current head authority.
 * No embeddings, vector collections or model ports participate in this bounded keyword/tree publication. */
export function createNativePassageIndex(db: Pick<Db, "collection">) {
  const collection = scopedCollection<Root>(db, "tree_index");
  async function read(tenant: string): Promise<Root | null> {
    assertValidTenantId(tenant, "native.publication");
    const rows = await collection(tenant).find(treeIndexRootFilter(tenant)).limit(2).toArray();
    if (rows.length > 1) fail("ambiguous_root");
    const root = rows[0] ?? null; if (root) assertRoot(root, tenant);
    return root;
  }
  return {
    async indexCandidate(input: Readonly<NativeDocumentCandidate>): Promise<void> {
      assertValidTenantId(input?.tenantId, "native.indexCandidate");
      const candidate = structuredClone(input), branch = build(candidate);
      readBranch(branch, candidate.tenantId);
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const previous = await read(candidate.tenantId);
        const existing = previous?.children.find(node => node.node_id === branch.node_id);
        if (existing) {
          if (!isDeepStrictEqual(existing, branch)) fail("candidate_authority_conflict");
          readBranch(existing, candidate.tenantId); return;
        }
        const root: Root = { ...(previous ?? { _id: `tenant-root:${encodeURIComponent(candidate.tenantId)}`,
          ...treeIndexRootFilter(candidate.tenantId), title: "Knowledge", summary: "", children: [] }),
          indexRevision: (previous?.indexRevision ?? 0) + 1, children: [...(previous?.children ?? []), branch] };
        assertRoot(root, candidate.tenantId);
        if (previous) {
          const expected = previous.indexRevision === undefined ? { indexRevision: { $exists: false } } : { indexRevision: previous.indexRevision };
          const result = await collection(candidate.tenantId).replaceOne({ ...treeIndexRootFilter(candidate.tenantId), _id: previous._id, ...expected }, root, { upsert: false });
          if (!result.acknowledged) fail("write_unconfirmed");
          if (result.matchedCount !== 1) continue;
        } else {
          try {
            const result = await collection(candidate.tenantId).insertOne(root);
            if (!result.acknowledged) fail("write_unconfirmed");
          } catch (error) { if ((error as { code?: number })?.code === 11000) continue; throw error; }
        }
        const persisted = await read(candidate.tenantId), found = persisted?.children.find(node => node.node_id === branch.node_id);
        if (!found || !isDeepStrictEqual(found, branch)) return fail("readback_mismatch");
        readBranch(found, candidate.tenantId); return;
      }
      fail("cas_exhausted");
    },
    async listLocators(tenant: string, query: { sourceId: string; revisionHash: string }): Promise<NativeSourceLocator[]> {
      assertValidTenantId(tenant, "native.listLocators");
      if (!query || !validId(query.sourceId) || !validHash(query.revisionHash)) fail("invalid_query");
      const root = await read(tenant); if (!root) return [];
      return root.children.filter(node => node.level === "native-source" && node.evidence?.sourceId === query.sourceId
        && node.evidence?.revisionHash === query.revisionHash).sort((a, b) => a.node_id.localeCompare(b.node_id))
        .flatMap(node => readBranch(node, tenant));
    },
  };
}

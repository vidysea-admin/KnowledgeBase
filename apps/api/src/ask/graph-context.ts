import type { Db } from "mongodb";
import type { Claims, Topics, Turns, SessionPages, Sessions, Sources, TreeIndexNode, TreeIndexRootDocument } from "@lkb/core";
import { scopedCollection } from "@lkb/db";
import { BoundedAskError } from "@lkb/ask";
import { expandAuthorizedGraph, GRAPH_ROUTING_LIMITS, type AcceptedGraphEdge, type CurrentGraphSource,
  type GraphRetrievalSelection } from "../../../../packages/index/src/graph/authorized-expansion.js";
import { readSpeakerKnowledgeAuthority } from "../speaker-profiles/store.js";
import { isValidTenantId } from "../auth.js";
import { isStandaloneMongo } from "../visibility/topology.js";
import { createKnowledgeVisibility } from "../visibility/knowledge.js";
import { readEffectiveTurns } from "../transcript-review/effective-reader.js";
import { speakerTranscriptHash } from "../../../../packages/index/src/pipeline/speaker-profiles/profile.js";
import { verifyIndexGeneration, indexArtifactDigest } from "../indexing/generation.js";
import { treeIndexRootFilter, validateRuntimePage } from "@lkb/index";

export type GraphContextSelection = GraphRetrievalSelection;
export interface GraphContextSnapshot {
  edges: AcceptedGraphEdge[];
  visibleSources: CurrentGraphSource[];
  /** Exact verified claim-evidence turns after selected-dimension intersection. */
  turns: { sessionId: string; turnId: string; quote: string }[];
}
export interface GraphContextDeps {
  readSnapshot(tenantId: string, selection: GraphContextSelection): Promise<GraphContextSnapshot>;
}
export const graphTurnKey = (sessionId: string, turnId: string) => JSON.stringify([sessionId, turnId]);
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export function hasGraphSelection(selection?: GraphContextSelection): boolean {
  return !!selection && ((selection.speakerRefs?.length ?? 0) > 0 || (selection.topicRefs?.length ?? 0) > 0);
}
function validate(selection: GraphContextSelection): void {
  if (!selection || Object.keys(selection).some(k => k !== "speakerRefs" && k !== "topicRefs")) throw new BoundedAskError("invalid graph selection");
  const speakers = selection.speakerRefs ?? [], topics = selection.topicRefs ?? [];
  if (!Array.isArray(speakers) || !Array.isArray(topics) || ![...speakers, ...topics].every(id) ||
    speakers.some(s => !s.startsWith("person:")) || speakers.length + topics.length > GRAPH_ROUTING_LIMITS.selectionIds ||
    new Set(speakers).size !== speakers.length || new Set(topics).size !== topics.length) throw new BoundedAskError("invalid graph selection");
}

/** A request-local authority cache, not a visibility cache across requests. */
export function createGraphContextFor(deps: GraphContextDeps) {
  return (tenantId: string, selected: GraphContextSelection) => {
    validate(selected); if (!isValidTenantId(tenantId)) throw new BoundedAskError("invalid graph tenant");
    const selection = structuredClone(selected);
    let pending: Promise<GraphContextSnapshot> | undefined;
    const snapshot = () => pending ??= deps.readSnapshot(tenantId, selection).then(s => structuredClone(s));
    return {
      scope: snapshot,
      async allowedTurns(): Promise<ReadonlySet<string>> {
        const s = await snapshot();
        if (!Array.isArray(s.turns) || s.turns.length > 2560 || s.turns.some(t => !id(t.sessionId) || !id(t.turnId))) throw new BoundedAskError("invalid graph source scope");
        return new Set(s.turns.map(t => graphTurnKey(t.sessionId, t.turnId)));
      },
      async arm(_query: string, tree: TreeIndexNode) {
        try {
          const s = await snapshot();
          const groups: GraphContextSelection[] = [];
          if (selection.speakerRefs?.length) groups.push({ speakerRefs: selection.speakerRefs });
          if (selection.topicRefs?.length) groups.push({ topicRefs: selection.topicRefs });
          const expanded = groups.map(group => expandAuthorizedGraph({ tenantId, selection: group, edges: s.edges, visibleSources: s.visibleSources, tree }));
          const common = (expanded[0]?.nodes ?? []).filter(n => expanded.every(group => group.nodes.some(other => other.node_id === n.node_id)));
          return { arms: [common], degraded: expanded.map(e => e.degraded).filter(Boolean).join("; ") || null };
        } catch { return { arms: [[]] as TreeIndexNode[][], degraded: "graph: current selected source authority unavailable" }; }
      },
    };
  };
}

/** Topic IDs resolve through canonical current tree paths and published grounded claim manifests.
 * The session-level topic relation is the existing producer's authority, never label similarity. */
async function selectedTopicSnapshot(db: Pick<Db, "collection">, tenant: string, refs: readonly string[]) {
  const result: GraphContextSnapshot = { edges: [], visibleSources: [], turns: [] }, claimIds = new Set<string>();
  if (!refs.length) return { ...result, claimIds };
  const topics = await scopedCollection<Topics>(db, "topics")(tenant).find({ _id: { $in: [...refs] } }).limit(129).toArray();
  if (topics.length > 128 || topics.some(t => t.tenantId !== tenant || !refs.includes(t._id))) throw new BoundedAskError("invalid topic authority");
  const validTopics = topics.filter(t => Array.isArray(t.sessionRefs) && t.sessionRefs.length > 0 && t.sessionRefs.length <= 128 && t.sessionRefs.every(id));
  const claims = validTopics.length ? await scopedCollection<Claims>(db, "claims")(tenant).find({ topicRefs: { $in: validTopics.map(t => t._id) }, status: { $in: ["verified", "needs-review"] } }).limit(129).toArray() : [];
  if (claims.length > 128 || claims.some(c => c.tenantId !== tenant)) throw new BoundedAskError("topic claim inventory exceeds scope");
  if (!claims.length) return { ...result, claimIds };
  const root = await scopedCollection<TreeIndexRootDocument & { _id: string }>(db, "tree_index")(tenant).findOne(treeIndexRootFilter(tenant));
  if (!root || root.tenantId !== tenant || root.node_id !== `tenant:${tenant}`) return { ...result, claimIds };
  const visibility = createKnowledgeVisibility(db);
  const sessions = new Map<string, { source: CurrentGraphSource; rows: Turns[]; topics: Set<string>; claimRefs: { id: string; digest: string }[] } | null>();
  const load = async (sessionId: string) => {
    if (sessions.has(sessionId)) return sessions.get(sessionId)!;
    sessions.set(sessionId, null);
    if (sessions.size > 128 || !await visibility.sessionVisible(tenant, sessionId)) return null;
    const published = await verifyIndexGeneration(db, tenant, sessionId);
    if (!published?.strict) return null;
    const record = await scopedCollection<Sessions>(db, "sessions")(tenant).findOne({ _id: sessionId });
    const raw = await scopedCollection<Turns>(db, "turns")(tenant).find({ sessionId }).limit(10001).toArray();
    if (!record || record.tenantId !== tenant || record.sourceId !== published.sourceId || raw.length > 10000 || raw.some(t => t.tenantId !== tenant || t.sessionId !== sessionId)) return null;
    const rows = await visibility.filterTurns(tenant, await readEffectiveTurns(db, tenant, raw, sessionId));
    const page = await scopedCollection<SessionPages>(db, "session_pages")(tenant).findOne({ sessionId });
    if (!page || page.tenantId !== tenant || page.sessionId !== sessionId || page.indexArtifact?.generation !== published.generation) return null;
    try { validateRuntimePage(rows, page); } catch { return null; }
    const supported = [page.summary, ...(page.keyInsights ?? []), ...(page.decisions ?? []), ...(page.actionItems ?? [])].join("\n").toLowerCase().replace(/\s+/g, " ");
    const topicIds = new Set<string>(), stack = [root as TreeIndexNode], seen = new Set<string>(); let sessionNodes = 0;
    while (stack.length) {
      const node = stack.pop()!;
      if (!node || seen.has(node.node_id) || seen.size >= GRAPH_ROUTING_LIMITS.treeNodes || !Array.isArray(node.children)) throw new BoundedAskError("invalid topic tree");
      seen.add(node.node_id);
      if (node.level === "session" && node.evidence?.sessionRef === sessionId) {
        sessionNodes++;
        for (const child of node.children) {
          const at = child.node_id.lastIndexOf("/topic:");
          const canonical = at < 0 ? "" : `${tenant}:${child.node_id.slice(at + 7)}`;
          if (child.level === "topic" && refs.includes(canonical) && validTopics.some(t => t._id === canonical && t.sessionRefs!.includes(sessionId)) &&
            child.title.trim() && supported.includes(child.title.toLowerCase().replace(/\s+/g, " ").trim())) topicIds.add(canonical);
        }
      }
      stack.push(...node.children);
    }
    if (sessionNodes !== 1) return null;
    const manifest = record.indexAttempt?.manifest;
    if (!manifest || record.indexAttempt?.generation !== published.generation) return null;
    const value = { source: { tenantId: tenant, sessionId, sourceId: published.sourceId, revisionHash: speakerTranscriptHash(rows.sort((a, b) => a.tStart - b.tStart || a._id.localeCompare(b._id))) },
      rows, topics: topicIds, claimRefs: [...manifest.claims, ...manifest.preservedClaims] };
    sessions.set(sessionId, value); return value;
  };
  for (const claim of claims) {
    if (!id(claim._id) || !Array.isArray(claim.evidence) || !claim.evidence.length || claim.evidence.length > 20 || !await visibility.claimVisible(tenant, claim)) continue;
    const proofs: CurrentGraphSource[] = [], turns: GraphContextSnapshot["turns"] = [], topics = new Set<string>(); let valid = true;
    for (const e of claim.evidence) {
      const current = id(e.sessionId) && id(e.turnId) ? await load(e.sessionId) : null;
      const turn = current?.rows.find(t => t._id === e.turnId);
      if (!current || !turn || typeof e.quote !== "string" || !e.quote.trim() || !turn.text.includes(e.quote) ||
        !current.claimRefs.some(ref => ref.id === claim._id && ref.digest === indexArtifactDigest(claim))) { valid = false; break; }
      const supportedTopics = (claim.topicRefs ?? []).filter(t => current.topics.has(t));
      if (!supportedTopics.length) { valid = false; break; }
      supportedTopics.forEach(t => topics.add(t)); proofs.push(current.source); turns.push({ sessionId: e.sessionId, turnId: e.turnId, quote: e.quote });
    }
    if (!valid) continue;
    claimIds.add(claim._id); result.turns.push(...turns);
    for (const source of proofs) if (!result.visibleSources.some(s => s.sessionId === source.sessionId)) result.visibleSources.push(source);
    for (const topic of topics) result.edges.push({ id: JSON.stringify([topic, claim._id]), tenantId: tenant, status: "accepted", from: { kind: "topic", ref: topic }, to: { kind: "statement", ref: claim._id }, provenance: proofs });
    if (result.edges.length > 128 || result.visibleSources.length > 128) throw new BoundedAskError("topic projection exceeds budget");
  }
  return { ...result, claimIds };
}

/** Only selected speakers are loaded. Identity, verified claims, source mapping and effective
 * transcript revisions share a read-only Mongo snapshot; no unselected graph collection scan. */
export function createMongoGraphSnapshotReader(db: Db): GraphContextDeps["readSnapshot"] {
  return async (tenantId, selection) => {
    validate(selection); if (!isValidTenantId(tenantId)) throw new BoundedAskError("invalid graph tenant");
    // Standalone mongod (w27-standalone): no transactions exist, so read without a session at readConcern "local".
    // Tenant scope checks below are unchanged; only cross-collection point-in-time consistency is weaker.
    const standalone = await isStandaloneMongo(db);
    if (!standalone && !db.client?.startSession) throw new BoundedAskError("graph snapshot unavailable");
    const session = standalone ? undefined : db.client.startSession({ causalConsistency: false });
    const readOptions = session ? { session } : { readConcern: { level: "local" as const } };
    let tail = Promise.resolve();
    const serial = <T>(run: () => Promise<T>) => { const next = tail.then(run); tail = next.then(() => {}, () => {}); return next; };
    const snapshotDb = { collection(name: string) {
      const collection = db.collection(name);
      const scope = (filter: Record<string, unknown>) => { if (filter.tenantId !== tenantId) throw new BoundedAskError("invalid graph scope"); };
      return { find(filter: Record<string, unknown>) { scope(filter); const cursor = collection.find(filter, readOptions);
        const safe = { limit(n: number) { cursor.limit(n); return safe; }, sort(order: Record<string, 1 | -1>) { cursor.sort(order); return safe; }, toArray: () => serial(() => cursor.toArray()) }; return safe; },
        findOne(filter: Record<string, unknown>) { scope(filter); return serial(() => collection.findOne(filter, readOptions)); } };
    } } as unknown as Pick<Db, "collection">;
    try {
      const body = async () => {
        const topicSnapshot = await selectedTopicSnapshot(snapshotDb, tenantId, selection.topicRefs ?? []);
        if (!selection.speakerRefs?.length) return { edges: topicSnapshot.edges, visibleSources: topicSnapshot.visibleSources, turns: topicSnapshot.turns };
        const edges: AcceptedGraphEdge[] = [], visibleSources = new Map<string, CurrentGraphSource>();
        const turns = new Map<string, { sessionId: string; turnId: string; quote: string }>();
        for (const personId of selection.speakerRefs ?? []) {
          const authority = await readSpeakerKnowledgeAuthority(snapshotDb, tenantId, personId);
          if (!authority || authority.view.tenantId !== tenantId || authority.view.personId !== personId || authority.view.identityStatus !== "human-confirmed" || !digest(authority.view.revision)) continue;
          const claims = authority.view.statements.filter(c => !selection.topicRefs?.length || topicSnapshot.claimIds.has(c.id));
          for (const claim of claims) {
            if (!id(claim.id) || !claim.evidence.length || claim.evidence.length > 20) throw new BoundedAskError("invalid graph claim evidence");
            const provenance: CurrentGraphSource[] = [];
            for (const evidence of claim.evidence) {
              if (!id(evidence.sessionId) || !id(evidence.turnId) || !evidence.quote?.trim() || !Object.prototype.hasOwnProperty.call(authority.transcriptHashes, evidence.sessionId)) throw new BoundedAskError("invalid graph claim evidence");
              const revisionHash = authority.transcriptHashes[evidence.sessionId];
              if (!digest(revisionHash)) throw new BoundedAskError("invalid graph transcript revision");
              const record = await scopedCollection<Sessions>(snapshotDb, "sessions")(tenantId).findOne({ _id: evidence.sessionId });
              if (!record || record.tenantId !== tenantId || record._id !== evidence.sessionId || !id(record.sourceId)) throw new BoundedAskError("invalid graph session source");
              const source = await scopedCollection<Sources>(snapshotDb, "sources")(tenantId).findOne({ _id: record.sourceId });
              if (!source || source.tenantId !== tenantId || source._id !== record.sourceId) throw new BoundedAskError("invalid graph source");
              const proof = { tenantId, sessionId: record._id, sourceId: record.sourceId, revisionHash };
              const prior = visibleSources.get(record._id);
              if (prior && JSON.stringify(prior) !== JSON.stringify(proof)) throw new BoundedAskError("inconsistent graph source revision");
              visibleSources.set(record._id, proof);
              if (!provenance.some(p => p.sessionId === record._id)) provenance.push(proof);
              turns.set(JSON.stringify([evidence.sessionId, evidence.turnId, evidence.quote]), { sessionId: evidence.sessionId, turnId: evidence.turnId, quote: evidence.quote });
            }
            const push = (kind: "speaker" | "topic", ref: string) => edges.push({ id: JSON.stringify([personId, claim.id, kind, ref]), tenantId, status: "accepted",
              from: { kind, ref }, to: { kind: "statement", ref: `${personId}:${claim.id}` }, provenance });
            push("speaker", personId);
            for (const topic of claim.topicIds.filter(t => selection.topicRefs?.includes(t))) push("topic", topic);
            if (edges.length > GRAPH_ROUTING_LIMITS.edges || visibleSources.size > GRAPH_ROUTING_LIMITS.sources) throw new BoundedAskError("graph projection exceeds budget");
          }
        }
        return { edges, visibleSources: [...visibleSources.values()], turns: [...turns.values()] };
      };
      const result = session ? await session.withTransaction(body, { readConcern: { level: "snapshot" }, maxCommitTimeMS: 10000 }) : await body();
      if (!result) throw new BoundedAskError("graph snapshot unavailable");
      return result;
    } finally { await session?.endSession(); }
  };
}

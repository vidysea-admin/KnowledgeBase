/** Production read perimeter: immutable originals stay stored; consumers see current eligible evidence. */
import type { Db } from 'mongodb';
import type { Claims, SessionPages, Sessions, Turns, TreeIndexRootDocument, GraphEdges } from '@lkb/core';
import { assertValidTenantId, scopedCollection } from '@lkb/db';
import { buildKnowledgeGraph, treeIndexRootFilter } from '@lkb/index';
import type { BrainReadDeps } from '../../routes/brain.js';
import type { CitationsDeps, CitationEvidence } from '../../routes/citations.js';
import type { GraphReadDeps } from '../../routes/graph.js';
import type { TreeStore } from '../../routes/ask/ask.js';
import { createKnowledgeVisibility } from '../../visibility/knowledge.js';
import { readEffectiveTurns } from '../../transcript-review/effective-reader.js';
import { withKnowledgeReadSnapshot } from '../../visibility/read-snapshot.js';
import { eligibleTreeInput } from '../../indexing/eligible-tree.js';
import type { NativeEvidenceResolver } from '../../native-evidence/resolver.js';

function publicSession(session: Sessions): Sessions {
  const { indexAttempt, indexArtifact, indexRevision, captureConsent, operationalApproval, organizerConsent,
    privateWindows, guardedPrivateWindows, mediaStartedAt, captureGeneration, controlToken, controller, token, requestId, ...metadata } = session;
  return metadata;
}

function publicClaim(claim: Claims): Claims {
  const { indexArtifact, ...metadata } = claim;
  return metadata;
}

function publicPage(page: SessionPages | null): SessionPages | null {
  if (!page) return null;
  const { indexArtifact, ...metadata } = page;
  return metadata;
}

export function trustedBrainReads(base: BrainReadDeps, database: () => Db): BrainReadDeps {
  return {
    ...base,
    async listSessions(tenant) {
      const visibility = createKnowledgeVisibility(database());
      const rows = await base.listSessions(tenant);
      const safe = await Promise.all(rows.map(row => visibility.safeCitationSession(tenant, row._id)));
      return safe.filter((row): row is Sessions => row !== null).map(publicSession);
    },
    async listSources(tenant) {
      const visibility = createKnowledgeVisibility(database());
      const rows = await base.listSources(tenant);
      const allowed = await Promise.all(rows.map(row => visibility.sourceVisible(tenant, row._id)));
      return rows.filter((_, i) => allowed[i]).map(row => {
        const { captureConsent, operationalApproval, organizerConsent, privateWindows, guardedPrivateWindows,
          mediaStartedAt, captureGeneration, controlToken, controller, token, requestId, indexAttempt, indexArtifact, ...publicSource } = row;
        // The consent projection carries a boolean and recording attribution, never the private capability/proof.
        return { ...publicSource, consent: { given: row.consent.given, recordedBy: row.consent.recordedBy } };
      });
    },
    async getSessionDetail(tenant, sessionId) {
      const db = database(), visibility = createKnowledgeVisibility(db);
      // Aggregate pages, participants and media contain unreviewed siblings in chat sessions.
      const aggregateVisible = await visibility.sessionVisible(tenant, sessionId);
      const safeSession = await visibility.safeCitationSession(tenant, sessionId);
      if (!safeSession) return null;
      const detail = await base.getSessionDetail(tenant, sessionId);
      if (!detail || detail.session.tenantId !== tenant) return null;
      const claims = await Promise.all(detail.claims.map(row => visibility.claimVisible(tenant, row)));
      return { ...(aggregateVisible ? detail : { session: safeSession, page: null }), session: publicSession(safeSession), page: aggregateVisible ? publicPage(detail.page) : null,
        claims: detail.claims.filter((_, i) => claims[i]).map(publicClaim),
        turns: await visibility.filterTurns(tenant, await readEffectiveTurns(db, tenant, detail.turns, sessionId)) };
    },
  };
}

export function trustedCitationReads(database: () => Db): CitationsDeps {
  return { async getCitation(tenant, claimId) {
    const db = database(), visibility = createKnowledgeVisibility(db);
    const claim = await scopedCollection<Claims>(db, 'claims')(tenant).findOne({ _id: claimId });
    if (!claim || !await visibility.claimVisible(tenant, claim)) return null;
    const evidence: CitationEvidence[] = await Promise.all(claim.evidence.map(async item => {
      const raw = await scopedCollection<Turns>(db, 'turns')(tenant).findOne({ _id: item.turnId, sessionId: item.sessionId });
      const effective = raw ? (await readEffectiveTurns(db, tenant, [raw], item.sessionId))[0] : undefined;
      const permitted = effective && typeof item.quote === 'string' && await visibility.eligibleTurn(tenant, item.sessionId, item.turnId, item.quote);
      // An approved message excerpt cannot disclose unreviewed sibling text in the original turn.
      const turn = permitted ? claim.source === 'whatsapp' ? { ...effective, text: item.quote!, citationExcerpt: true } : effective : null;
      const session = turn ? await visibility.safeCitationSession(tenant, item.sessionId) : null;
      return { turnId: item.turnId, sessionId: item.sessionId, turn, session: session ? publicSession(session) : null };
    }));
    return { claim: publicClaim(claim), evidence };
  } };
}

export function trustedTreeReads(database: () => Db, nativeEvidence?: NativeEvidenceResolver): TreeStore {
  return { async load(tenant) {
    try {
      return await withKnowledgeReadSnapshot(database(), async db => {
        const readNative = nativeEvidence?.forReadView ? nativeEvidence.forReadView(db) : nativeEvidence;
        const eligible = await currentTreeInput(db, tenant);
        const raw = await scopedCollection<TreeIndexRootDocument & { _id: string }>(db, 'tree_index')(tenant).findOne(treeIndexRootFilter(tenant));
        // Only native branches bypass transcript page filtering, and only into the resolver gate.
        const nativeBranches = raw?.tenantId === tenant && raw.node_id === `tenant:${tenant}` && raw.level === 'tenant'
          ? raw.children.filter(child => child.level === 'native-source') : [];
        const transcript = eligible.existingRoot;
        const root = transcript ? { ...transcript, children: [...transcript.children.filter(child => child.level !== 'native-source'), ...nativeBranches] }
          : nativeBranches.length ? { node_id: `tenant:${tenant}`, tenantId: tenant, title: 'Current knowledge', level: 'tenant' as const, summary: '', children: nativeBranches } : null;
        return createKnowledgeVisibility(db, readNative).trustedTree(tenant, root);
      });
    } catch {
      throw Object.assign(new Error('Current knowledge tree unavailable'), { status: 503 });
    }
  } };
}

async function currentTreeInput(db: Pick<Db, 'collection'>, tenant: string) {
  const scopedDb = db as Db;
  const [root, sessions, pages] = await Promise.all([
    scopedCollection<TreeIndexRootDocument & { _id: string }>(scopedDb, 'tree_index')(tenant).findOne(treeIndexRootFilter(tenant)),
    scopedCollection<Sessions>(scopedDb, 'sessions')(tenant).find({}).toArray(),
    scopedCollection<SessionPages>(scopedDb, 'session_pages')(tenant).find({}).toArray(),
  ]);
  return eligibleTreeInput(db, tenant, sessions, pages, root);
}

export function trustedGraphReads(database: () => Db): GraphReadDeps {
  return { async loadGraph(tenant) {
    // Refuse an invalid tenant with the typed guard error before any session or read, not as a masked 503.
    assertValidTenantId(tenant, 'graph.load');
    try {
      return await withKnowledgeReadSnapshot(database(), async db => {
        const [eligible, edges] = await Promise.all([
          currentTreeInput(db, tenant),
          scopedCollection<GraphEdges>(db as Db, 'graph_edges')(tenant).find({}).toArray(),
        ]);
        const allowed = new Set(eligible.sessions.map(session => session._id));
        const safeEdges = edges.filter(edge => {
          const refs = [edge.sessionRef, ...(Array.isArray(edge.evidence) ? edge.evidence.map(item =>
            item && typeof item === 'object' && 'sessionId' in item ? item.sessionId : undefined) : [])];
          return refs.length > 0 && refs.every(ref => typeof ref === 'string' && allowed.has(ref));
        });
        const treeRoot = await createKnowledgeVisibility(db).trustedTree(tenant, eligible.existingRoot ?? null);
        if (!treeRoot && !safeEdges.length) return null;
        return buildKnowledgeGraph({ treeRoot, entityEdges: safeEdges, sessions: eligible.sessions.map(publicSession) });
      });
    } catch {
      throw Object.assign(new Error('Current knowledge graph unavailable'), { status: 503 });
    }
  } };
}

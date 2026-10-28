import type { Db } from 'mongodb';
import type { SessionPages, Sessions, TreeIndexNode, TreeIndexRootDocument, Turns } from '@lkb/core';
import { scopedCollection } from '@lkb/db';
import { createKnowledgeVisibility } from '../visibility/knowledge.js';
import { readEffectiveTurns } from '../transcript-review/effective-reader.js';
import { validateRuntimePage } from '@lkb/index';
import { indexTurnDigest } from './generation.js';

/** Legacy free text must be copied from the exact current cited passages, not just their IDs. */
function legacyTextSupported(page: SessionPages, rows: Turns[]): boolean {
  const cited = page.evidence.map(item => rows.find(row => row._id === item.turnId)!.text);
  const supported = (value: string): boolean => value.trim().length > 0 &&
    value.split(/\r?\n/).filter(line => line.trim().length > 0).every(line => cited.some(text => text.includes(line)));
  return [page.summary, ...(page.keyInsights ?? []), ...(page.decisions ?? []), ...(page.actionItems ?? [])].every(supported);
}

/** An unchanged year is reusable only while every cached contributor still has a safe page. */
function cachedContributorsSafe(node: TreeIndexNode, safePages: Map<string, SessionPages>, orgs: Map<string, string>): boolean {
  const ref = node.evidence?.sessionRef;
  if (node.level === 'session' && ref === undefined) return false;
  if (ref !== undefined && !safePages.has(ref)) return false;
  const refs = node.evidence?.sessionRefs;
  if (refs !== undefined && (!Array.isArray(refs) || refs.some(id => typeof id !== 'string' || !safePages.has(id)))) return false;
  const page = ref !== undefined ? safePages.get(ref) : undefined;
  if (node.level === 'session') {
    if (!page || node.summary !== page.summary || Boolean(node.indexArtifact) !== Boolean(page.indexArtifact)) return false;
    if (page.indexArtifact) {
      const cached = node.indexArtifact, current = page.indexArtifact;
      if (!cached || cached.version !== current.version || cached.generation !== current.generation ||
        cached.sessionId !== current.sessionId || cached.sourceId !== current.sourceId || cached.turnDigest !== current.turnDigest) return false;
    }
  }
  if (node.level === 'topic' || node.level === 'org') {
    const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    const supported = (current: SessionPages) => {
      const text = normalized([current.summary, ...(current.keyInsights ?? []), ...(current.decisions ?? []), ...(current.actionItems ?? [])].join('\n'));
      // buildTree titles an org node from the session's own `org` field (not page text); an exact match to it is current support.
      if (node.level === 'org' && !node.summary.trim() && normalized(node.title).length > 0 &&
        normalized(orgs.get(current.sessionId) ?? '') === normalized(node.title)) return true;
      return normalized(node.title).length > 0 && text.includes(normalized(node.title)) &&
        (!node.summary.trim() || text.includes(normalized(node.summary)));
    };
    if (!page || !supported(page)) return false;
    if (Array.isArray(refs) && refs.some(id => !supported(safePages.get(id)!))) return false;
  }
  return node.children.every(child => cachedContributorsSafe(child, safePages, orgs));
}

/** Counts only: never a session id or any tenant detail beyond the number of sessions left out of answers. */
export type ExclusionReason = 'not-visible' | 'no-page' | 'transcript-mismatch' | 'page-invalid' | 'identity-invalid' | 'unsupported-text';
export interface TreeExclusions { total: number; reasons: Partial<Record<ExclusionReason, number>> }

/** Every session id (any level) a cached transcript branch cites as a contributor. */
function cachedSessionRefs(node: TreeIndexNode, out = new Set<string>()): Set<string> {
  if (node.level === 'session' && node.evidence?.sessionRef !== undefined) out.add(node.evidence.sessionRef);
  node.children.forEach(child => cachedSessionRefs(child, out));
  return out;
}

/**
 * Partial-tree policy (D-190, Umesh 2026-10-22): the tree is built from ELIGIBLE sessions only and
 * ineligible ones are left out and counted. Each page keeps its own fail-closed gate below; only the
 * old tenant-level all-or-nothing retention rule is gone. A cached root is still served only while
 * EVERY contributor it cites is currently eligible, so a removed or newly ineligible session
 * can never be served from cache. `opts.rebuildOnNewEligible` (the index-write path) additionally
 * drops a cached root that lacks an eligible session, so a session that became eligible is rebuilt in.
 */
export async function eligibleTreeInput(db: Pick<Db, 'collection'>, tenant: string, sessions: Sessions[], pages: SessionPages[], root: TreeIndexRootDocument | null,
  opts?: { rebuildOnNewEligible?: readonly string[] }) {
  const visibility = createKnowledgeVisibility(db), allowed = new Set<string>();
  const tenantSessions = sessions.filter(row => row.tenantId === tenant);
  for (const session of sessions) if (await visibility.sessionVisible(tenant, session._id)) allowed.add(session._id);
  const safePages: SessionPages[] = [];
  const rejected = new Map<string, ExclusionReason>();
  for (const page of pages) {
    if (page.tenantId !== tenant || !allowed.has(page.sessionId)) continue;
    const rows = await readEffectiveTurns(db, tenant, await scopedCollection<Turns>(db as never, 'turns')(tenant).find({ sessionId: page.sessionId }).toArray(), page.sessionId);
    const ids = new Set(rows.map(row => row._id));
    if (!page.evidence.length || page.evidence.some(item => item.sessionId !== page.sessionId || !ids.has(item.turnId))) { rejected.set(page.sessionId, 'transcript-mismatch'); continue; }
    if (page.citedItems || page.qa) { try { validateRuntimePage(rows, page); } catch { rejected.set(page.sessionId, 'page-invalid'); continue; } }
    const binding = page.indexArtifact, session = sessions.find(row => row.tenantId === tenant && row._id === page.sessionId);
    if (binding) {
      if (binding.version !== 1 || typeof binding.generation !== 'string' || !binding.generation.trim() ||
        binding.sessionId !== page.sessionId || binding.sourceId !== session?.sourceId || binding.turnDigest !== indexTurnDigest(rows)) { rejected.set(page.sessionId, 'identity-invalid'); continue; }
    } else if (!legacyTextSupported(page, rows)) { rejected.set(page.sessionId, 'unsupported-text'); continue; }
    safePages.push(page);
  }
  const safeSessions = new Set(safePages.map(page => page.sessionId));
  const contributors = tenantSessions.filter(row => allowed.has(row._id) && safeSessions.has(row._id));
  const reasons: TreeExclusions['reasons'] = {};
  for (const row of tenantSessions) {
    if (safeSessions.has(row._id) && allowed.has(row._id)) continue;
    const reason: ExclusionReason = !allowed.has(row._id) ? 'not-visible' : rejected.get(row._id) ?? 'no-page';
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const excluded: TreeExclusions = { total: tenantSessions.length - contributors.length, reasons };
  // Dropping a rejected page or a disappeared cached contributor must rebuild the whole root,
  // including mixed ancestor summaries, rather than preserving an unsafe untouched year.
  // Zero eligible sessions out of a non-empty tenant has nothing safe to serve (404); a tenant with no sessions keeps today's behaviour.
  let retainRoot = (contributors.length > 0 || tenantSessions.length === 0) && root?.tenantId === tenant &&
    cachedContributorsSafe(root, new Map(safePages.map(page => [page.sessionId, page])),
      new Map(contributors.map(row => [row._id, typeof row.org === 'string' ? row.org : ''])));
  if (retainRoot && root && opts?.rebuildOnNewEligible) {
    const cached = cachedSessionRefs(root), changed = new Set(opts.rebuildOnNewEligible);
    retainRoot = contributors.every(row => changed.has(row._id) || cached.has(row._id));
  }
  return { sessions: contributors, pages: safePages, excluded, existingRoot: retainRoot ? root ?? undefined : undefined };
}

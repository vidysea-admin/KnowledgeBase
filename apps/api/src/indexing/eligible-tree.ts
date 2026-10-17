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
function cachedContributorsSafe(node: TreeIndexNode, safePages: Map<string, SessionPages>): boolean {
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
      return normalized(node.title).length > 0 && text.includes(normalized(node.title)) &&
        (!node.summary.trim() || text.includes(normalized(node.summary)));
    };
    if (!page || !supported(page)) return false;
    if (Array.isArray(refs) && refs.some(id => !supported(safePages.get(id)!))) return false;
  }
  return node.children.every(child => cachedContributorsSafe(child, safePages));
}

/** Remove unsafe contributing sessions before topics are sent to a provider or cached in a tree. */
export async function eligibleTreeInput(db: Pick<Db, 'collection'>, tenant: string, sessions: Sessions[], pages: SessionPages[], root: TreeIndexRootDocument | null) {
  const visibility = createKnowledgeVisibility(db), allowed = new Set<string>();
  for (const session of sessions) if (await visibility.sessionVisible(tenant, session._id)) allowed.add(session._id);
  const safePages: SessionPages[] = [];
  for (const page of pages) {
    if (page.tenantId !== tenant || !allowed.has(page.sessionId)) continue;
    const rows = await readEffectiveTurns(db, tenant, await scopedCollection<Turns>(db as never, 'turns')(tenant).find({ sessionId: page.sessionId }).toArray(), page.sessionId);
    const ids = new Set(rows.map(row => row._id));
    if (!page.evidence.length || page.evidence.some(item => item.sessionId !== page.sessionId || !ids.has(item.turnId))) continue;
    if (page.citedItems || page.qa) { try { validateRuntimePage(rows, page); } catch { continue; } }
    const binding = page.indexArtifact, session = sessions.find(row => row.tenantId === tenant && row._id === page.sessionId);
    if (binding) {
      if (binding.version !== 1 || typeof binding.generation !== 'string' || !binding.generation.trim() ||
        binding.sessionId !== page.sessionId || binding.sourceId !== session?.sourceId || binding.turnDigest !== indexTurnDigest(rows)) continue;
    } else if (!legacyTextSupported(page, rows)) continue;
    safePages.push(page);
  }
  const safeSessions = new Set(safePages.map(page => page.sessionId));
  const contributors = sessions.filter(row => row.tenantId === tenant && allowed.has(row._id) && safeSessions.has(row._id));
  // Dropping a rejected page or a disappeared cached contributor must rebuild the whole root,
  // including mixed ancestor summaries, rather than preserving an unsafe untouched year.
  const retainRoot = allowed.size === sessions.length && safePages.length === pages.length &&
    root?.tenantId === tenant && cachedContributorsSafe(root, new Map(safePages.map(page => [page.sessionId, page])));
  return { sessions: contributors, pages: safePages, existingRoot: retainRoot ? root ?? undefined : undefined };
}

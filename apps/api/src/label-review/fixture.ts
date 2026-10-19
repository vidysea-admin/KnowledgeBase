import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SOURCE_FILES } from './source.js';
import type { RelationshipContext } from '../speaker-relations/types.js';

/** Test fixture only: synthetic sidecars and packets shaped like data/eval, with every confidence band represented. */
export const human = (tenantId = 'toc', actorId = 'fixture-human'): RelationshipContext => ({ tenantId, actorId, canPropose: false, canReview: true, reviewerKind: 'human' });
const draft = (agreement: string, flags: string[], extra: Record<string, unknown>) => ({ agreement, flags, validVotes: 2, perModel: [], ...extra });

async function put(root: string, rel: string, value: unknown): Promise<void> {
  const path = join(root, rel); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value));
}
export async function makeProject(): Promise<{ base: string; project: string; reviews: string }> {
  const base = await mkdtemp(join(tmpdir(), 'label-review-')), project = join(base, 'project');
  const t = (id: string, score: number | null, agreement: string, flags: string[]) => ({ id, inputSha256: `h-${id}`, humanGold: false,
    aiDraft: draft(agreement, flags, { score, rationale: `rationale ${id}`, perModel: [{ model: 'm1', score, rationale: 'r1' }, { model: 'm2', score, rationale: 'r2' }] }) });
  await put(project, SOURCE_FILES.t022Sidecar, { humanGold: false, items: [t('review-001', 0.9, 'agree', []), t('review-002', 0.5, 'disagree', ['models-disagree', 'look-closely'])] });
  await put(project, SOURCE_FILES.t022Packet, { tenantId: 'toc', items: ['review-001', 'review-002'].map(id => ({ id, query: `Question ${id}?`, inputSha256: `h-${id}`, node: { title: `Title ${id}`, summary: `Summary ${id}` } })) });
  const c = (claimId: string, label: string | null, agreement: string, flags: string[], tenantId = 'toc') => ({ claimId, tenantId, claimRecordSha256: `r-${claimId}`, sourceBindingSha256: `s-${claimId}`, humanGold: false,
    aiDraft: draft(agreement, flags, { literalCitationSupport: label, tally: label ? { [label]: 2 } : {}, literalRationale: `why ${claimId}`, citations: [{ turnId: `${claimId}-t1`, textSha256: `x-${claimId}` }] }) });
  const specs: [string, string | null, string, string[], string?][] = [['c-high', 'supported', 'agree', []], ['c-medium', 'partially_supported', 'majority', ['models-disagree', 'look-closely']],
    ['c-failed', 'supported', 'agree', ['invalid-or-failed-vote']], ['c-null', null, 'disagree', ['invalid-or-failed-vote', 'models-disagree', 'look-closely', 'no-majority']], ['c-foreign', 'supported', 'agree', [], 'other']];
  await put(project, SOURCE_FILES.u22Sidecar, { humanGold: false, items: specs.map(([id, l, a, f, tn]) => c(id, l, a, f, tn)) });
  await put(project, SOURCE_FILES.u22Packet, { claims: specs.map(([id, , , , tn]) => ({ claimId: id, tenantId: tn ?? 'toc', claimRecordSha256: `r-${id}`, sourceBindingSha256: `s-${id}`,
    persistedClaim: { text: `Claim text ${id}` }, literalCitationContexts: [{ turnId: `${id}-t1`, originalMigration: { matches: [{ record: { text: `Cited passage ${id}` }, textSha256: `x-${id}` }] } }] })) });
  return { base, project, reviews: join(base, 'reviews') };
}

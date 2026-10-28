import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { insist, U22_LABELS, type Confidence, type Label, type LabelItem, type ModelVote, type U22Label } from './types.js';

export const SOURCE_FILES = {
  t022Sidecar: 'data/eval/derived-drafts/t022-derived-drafts-2026-10-17.json',
  t022Packet: 'data/eval/calibration-human-review.json',
  u22Sidecar: 'data/eval/derived-drafts/u22-derived-drafts-anchored-2026-10-17.json',
  u22Packet: 'data/eval/extraction-adjudication-packet.json',
} as const;
const MAX_BYTES = 16 * 1024 * 1024;
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const obj = (v: unknown): Record<string, unknown> => { insist(v && typeof v === 'object' && !Array.isArray(v)); return v as Record<string, unknown>; };
const arr = (v: unknown): unknown[] => { insist(Array.isArray(v)); return v; };
const str = (v: unknown): string => { insist(typeof v === 'string'); return v; };

/** Agreement to confidence. agree with no flags is high; majority is medium; anything else (disagree, no majority, a failed vote, no label) is low. */
export function confidenceOf(agreement: string, flags: readonly string[], label: Label | null): Confidence {
  if (label === null) return 'low';
  if (agreement === 'agree' && flags.length === 0) return 'high';
  if (agreement === 'majority' && flags.every(f => f === 'models-disagree' || f === 'look-closely')) return 'medium';
  return 'low';
}

const cache = new Map<string, { key: string; value: Record<string, unknown> }>();
async function readJson(root: string, rel: string): Promise<Record<string, unknown>> {
  const path = join(root, rel), info = await stat(path); insist(info.size <= MAX_BYTES, 503, 'unavailable');
  const key = `${info.size}:${info.mtimeMs}`, hit = cache.get(path);
  if (hit?.key === key) return hit.value;
  const value = obj(JSON.parse(await readFile(path, 'utf8')));
  cache.set(path, { key, value }); return value;
}
function votes(draft: Record<string, unknown>, pick: (v: Record<string, unknown>) => Label | null): ModelVote[] {
  return arr(draft.perModel).map(raw => { const v = obj(raw); return { model: str(v.model), label: pick(v), rationale: typeof v.rationale === 'string' ? v.rationale : '' }; });
}
const flagsOf = (draft: Record<string, unknown>): string[] => arr(draft.flags).map(str);

function t022Items(sidecar: Record<string, unknown>, packet: Record<string, unknown>): LabelItem[] {
  const tenantId = str(packet.tenantId), source = new Map(arr(packet.items).map(raw => [str(obj(raw).id), obj(raw)]));
  return arr(sidecar.items).map(raw => {
    const s = obj(raw), p = source.get(str(s.id)); insist(p && s.inputSha256 === p.inputSha256);
    const draft = obj(s.aiDraft), node = obj(p.node), label = typeof draft.score === 'number' && Number.isFinite(draft.score) ? draft.score : null;
    const flags = flagsOf(draft), agreement = str(draft.agreement);
    return { id: `t022:${str(s.id)}`, set: 't022' as const, tenantId, inputSha256: str(s.inputSha256), prompt: str(p.query),
      passage: [node.title, node.summary].filter((x): x is string => typeof x === 'string').join('\n'), aiLabel: label,
      confidence: confidenceOf(agreement, flags, label), agreement, flags, validVotes: Number(draft.validVotes) || 0, tally: null,
      rationale: str(draft.rationale), perModel: votes(draft, v => typeof v.score === 'number' ? v.score : null) };
  });
}

const u22Label = (v: unknown): U22Label | null => typeof v === 'string' && (U22_LABELS as readonly string[]).includes(v) ? v as U22Label : null;
function passageOf(claim: Record<string, unknown>, citations: unknown[]): string {
  const contexts = arr(claim.literalCitationContexts).map(obj);
  return citations.map(raw => {
    const c = obj(raw), ctx = contexts.find(x => x.turnId === c.turnId); insist(ctx);
    const matches = [ctx.originalMigration, ctx.current].flatMap(side => side && typeof side === 'object' && Array.isArray((side as { matches?: unknown }).matches) ? (side as { matches: unknown[] }).matches : []).map(obj);
    const hit = matches.find(m => m.textSha256 === c.textSha256); insist(hit);
    return str(obj(hit.record).text);
  }).join('\n---\n');
}
function u22Items(sidecar: Record<string, unknown>, packet: Record<string, unknown>): LabelItem[] {
  const claims = new Map(arr(packet.claims).map(raw => [str(obj(raw).claimId), obj(raw)]));
  return arr(sidecar.items).map(raw => {
    const s = obj(raw), claim = claims.get(str(s.claimId)); insist(claim && s.claimRecordSha256 === claim.claimRecordSha256 && s.sourceBindingSha256 === claim.sourceBindingSha256);
    const draft = obj(s.aiDraft), citations = arr(draft.citations), label = u22Label(draft.literalCitationSupport);
    const flags = flagsOf(draft), agreement = str(draft.agreement);
    return { id: `u22:${str(s.claimId)}`, set: 'u22' as const, tenantId: str(claim.tenantId),
      inputSha256: sha(JSON.stringify([s.claimRecordSha256, s.sourceBindingSha256, citations.map(c => obj(c).textSha256)])),
      prompt: str(obj(claim.persistedClaim).text), passage: passageOf(claim, citations), aiLabel: label,
      confidence: confidenceOf(agreement, flags, label), agreement, flags, validVotes: Number(draft.validVotes) || 0,
      tally: draft.tally && typeof draft.tally === 'object' ? draft.tally as Record<string, number> : null,
      rationale: typeof draft.literalRationale === 'string' ? draft.literalRationale : '', perModel: votes(draft, v => u22Label(v.label)) };
  });
}

/** Read-only: the sidecars and packets are never written, and nothing here touches humanGold. */
export async function loadLabelItems(projectRoot: string, files: typeof SOURCE_FILES = SOURCE_FILES): Promise<LabelItem[]> {
  const [ts, tp, us, up] = await Promise.all([files.t022Sidecar, files.t022Packet, files.u22Sidecar, files.u22Packet].map(f => readJson(projectRoot, f)));
  const items = [...t022Items(ts!, tp!), ...u22Items(us!, up!)];
  insist(new Set(items.map(i => i.id)).size === items.length);
  return items;
}

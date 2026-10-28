import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, lstat, realpath } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { publishCalibrationReviewState } from '../calibration-review/persistence.js';
import { loadLabelItems, SOURCE_FILES } from './source.js';
import {
  insist, LabelReviewError, METRIC_LABEL, U22_LABELS,
  type AcceptInput, type Confidence, type Label, type LabelItem, type LabelReviewState, type LabelReviewStore, type LabelReviewView,
  type LabelReviewViewItem, type LabelSet, type OverrideInput, type ReviewRecord,
} from './types.js';
import type { RelationshipContext } from '../speaker-relations/types.js';

const hash = (v: string): string => createHash('sha256').update(v).digest('hex');
const idOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
const utc = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const NOTE_MAX = 2000;
const reviewAt = (state: LabelReviewState, key: string) => Object.hasOwn(state.reviews, key) ? state.reviews[key] : undefined;
function authority(context: RelationshipContext): void {
  insist(context && idOk(context.tenantId) && idOk(context.actorId) && context.canReview === true && context.reviewerKind === 'human', 403, 'forbidden');
}
/** A final label must be valid for its set. T-022 is a score in [0,1]; U2.2 is one of the three support classes. */
export function validLabel(set: LabelSet, label: unknown): label is Label {
  return set === 't022' ? typeof label === 'number' && Number.isFinite(label) && label >= 0 && label <= 1 : typeof label === 'string' && (U22_LABELS as readonly string[]).includes(label);
}

/**
 * The only constructor of review records. Accept keeps the AI label and its source; only an override produces
 * labelSource "human". Neither produces humanGold: that flag does not exist in this store.
 */
export function buildRecord(item: LabelItem, action: 'accept' | 'override', revision: number, label: Label | null, note: string | null, context: RelationshipContext, at: string): ReviewRecord {
  if (action === 'accept') {
    insist(item.aiLabel !== null, 400, 'no_ai_label');
    return { revision, itemId: item.id, set: item.set, inputSha256: item.inputSha256, action, labelSource: 'ai-consensus', label: item.aiLabel,
      aiLabel: item.aiLabel, confidence: item.confidence, note, reviewedBy: context.actorId, reviewedAt: at };
  }
  insist(label !== null && validLabel(item.set, label), 400, 'invalid');
  return { revision, itemId: item.id, set: item.set, inputSha256: item.inputSha256, action, labelSource: 'human', label,
    aiLabel: item.aiLabel, confidence: item.confidence, note, reviewedBy: context.actorId, reviewedAt: at };
}

const KEYS = ['revision', 'itemId', 'set', 'inputSha256', 'action', 'labelSource', 'label', 'aiLabel', 'confidence', 'note', 'reviewedBy', 'reviewedAt'];
function validate(state: LabelReviewState, tenantId: string, items: Map<string, LabelItem>): void {
  insist(state && state.format === 'label-review-state-v1' && state.tenantId === tenantId && state.reviews && typeof state.reviews === 'object' && !Array.isArray(state.reviews), 503, 'unavailable');
  for (const [key, review] of Object.entries(state.reviews)) {
    insist(items.has(key) && Array.isArray(review.audit) && Number.isSafeInteger(review.revision) && review.revision > 0 && review.audit.length === review.revision, 503, 'unavailable');
    review.audit.forEach((a, n) => {
      const keys = Object.keys(a);
      insist(keys.length === KEYS.length && KEYS.every(k => keys.includes(k)) && a.revision === n + 1 && a.itemId === key && idOk(a.reviewedBy) && utc(a.reviewedAt), 503, 'unavailable');
      // A record whose source disagrees with its action is corrupt, never repaired: accept is ai-consensus, override is human.
      insist((a.action === 'accept' && a.labelSource === 'ai-consensus') || (a.action === 'override' && a.labelSource === 'human'), 503, 'unavailable');
      insist(a.note === null || (typeof a.note === 'string' && a.note.length <= NOTE_MAX), 503, 'unavailable');
      insist(a.set === items.get(key)!.set && validLabel(a.set, a.label), 503, 'unavailable');
    });
  }
}
function view(tenantId: string, items: LabelItem[], state: LabelReviewState): LabelReviewView {
  const byConfidence: Record<Confidence, number> = { high: 0, medium: 0, low: 0 };
  let reviewed = 0, humanOverrides = 0;
  const rows: LabelReviewViewItem[] = items.map(item => {
    byConfidence[item.confidence]++;
    const r = reviewAt(state, item.id), last = r?.audit.at(-1);
    // A review bound to an older input hash is kept in the audit but no longer counts: the displayed input changed.
    const a = last && last.inputSha256 === item.inputSha256 ? last : undefined;
    if (a) { reviewed++; if (a.labelSource === 'human') humanOverrides++; }
    return { ...structuredClone(item), revision: r?.revision ?? 0, audit: structuredClone(r?.audit ?? []),
      effective: a ? { label: a.label, labelSource: a.labelSource, reviewedBy: a.reviewedBy, reviewedAt: a.reviewedAt, note: a.note }
        : { label: item.aiLabel, labelSource: 'ai-consensus', reviewedBy: null, reviewedAt: null, note: null } };
  });
  return { format: 'label-review-view-v1', tenantId, humanGold: false, metricLabel: METRIC_LABEL, counts: { total: rows.length, reviewed, humanOverrides, byConfidence }, items: rows };
}

export interface FileLabelReviewOptions { root: string; projectRoot: string; now?: () => string; files?: typeof SOURCE_FILES }
export function createFileLabelReviewStore(options: FileLabelReviewOptions): LabelReviewStore {
  insist([options.root, options.projectRoot].every(p => typeof p === 'string' && isAbsolute(p)), 503, 'unavailable');
  const root = resolve(options.root), project = resolve(options.projectRoot), now = options.now ?? (() => new Date().toISOString());
  const paths = (tenant: string) => ({ file: join(root, `${hash(tenant)}.json`), lock: join(root, `${hash(tenant)}.lock`) });
  async function current(context: RelationshipContext) {
    authority(context);
    const items = (await loadLabelItems(project, options.files)).filter(i => i.tenantId === context.tenantId);
    insist(items.length > 0, 404, 'not_found');
    return { items, map: new Map(items.map(i => [i.id, i])) };
  }
  async function safeRoot(): Promise<void> { insist(!(await lstat(root)).isSymbolicLink() && resolve(await realpath(root)) === root, 503, 'unavailable'); }
  async function load(tenantId: string, map: Map<string, LabelItem>): Promise<LabelReviewState> {
    let state: LabelReviewState; const file = paths(tenantId).file;
    try { await safeRoot(); insist(!(await lstat(file)).isSymbolicLink(), 503, 'unavailable'); state = JSON.parse(await readFile(file, 'utf8')) as LabelReviewState; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = { format: 'label-review-state-v1', tenantId, reviews: {} }; }
    validate(state, tenantId, map); return state;
  }
  async function locked<T>(tenant: string, work: () => Promise<T>): Promise<T> {
    await mkdir(root, { recursive: true, mode: 0o700 }); await safeRoot();
    const lock = paths(tenant).lock;
    try { await mkdir(lock); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new LabelReviewError(409, 'conflict'); throw error; }
    try { return await work(); } finally { await rm(lock, { recursive: true }).catch(() => undefined); }
  }
  const persist = (tenant: string, state: LabelReviewState) =>
    (publishCalibrationReviewState as unknown as (target: string, s: LabelReviewState) => Promise<void>)(paths(tenant).file, state);
  function append(state: LabelReviewState, item: LabelItem, action: 'accept' | 'override', label: Label | null, note: string | null, context: RelationshipContext, expected: number): void {
    const previous = reviewAt(state, item.id);
    insist((previous?.revision ?? 0) === expected, 409, 'conflict');
    const record = buildRecord(item, action, expected + 1, label, note, context, now()); insist(utc(record.reviewedAt), 503, 'unavailable');
    state.reviews[item.id] = { revision: record.revision, audit: [...(previous?.audit ?? []), record] };
  }
  async function write(context: RelationshipContext, itemId: string, input: AcceptInput, action: 'accept' | 'override', label: Label | null, note: string | null) {
    authority(context);
    insist(idOk(itemId) && input && typeof input === 'object' && Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0 && typeof input.inputSha256 === 'string', 400, 'invalid');
    return locked(context.tenantId, async () => {
      const { items, map } = await current(context), item = map.get(itemId); insist(item, 404, 'not_found');
      insist(input.inputSha256 === item.inputSha256, 409, 'conflict');
      const state = await load(context.tenantId, map); append(state, item, action, label, note, context, input.expectedRevision);
      validate(state, context.tenantId, map); await persist(context.tenantId, state); return view(context.tenantId, items, state);
    });
  }
  return {
    async read(context) { const { items, map } = await current(context); return view(context.tenantId, items, await load(context.tenantId, map)); },
    accept: (context, itemId, input) => write(context, itemId, input, 'accept', null, null),
    async override(context, itemId, input: OverrideInput) {
      const note = input?.note === undefined || input.note === null || input.note === '' ? null : input.note;
      insist(note === null || (typeof note === 'string' && note.length <= NOTE_MAX), 400, 'invalid');
      return write(context, itemId, input, 'override', input?.label as Label, note);
    },
    async acceptHighConfidence(context, set) {
      authority(context); insist(set === undefined || set === 't022' || set === 'u22', 400, 'invalid');
      return locked(context.tenantId, async () => {
        const { items, map } = await current(context), state = await load(context.tenantId, map); let acceptedCount = 0;
        // Only never-reviewed, high-confidence items: an existing review (especially a human override) is never overwritten.
        for (const item of items) if (item.confidence === 'high' && item.aiLabel !== null && (set === undefined || item.set === set) && !reviewAt(state, item.id)) { append(state, item, 'accept', null, null, context, 0); acceptedCount++; }
        if (acceptedCount > 0) { validate(state, context.tenantId, map); await persist(context.tenantId, state); }
        return { ...view(context.tenantId, items, state), acceptedCount };
      });
    },
  };
}

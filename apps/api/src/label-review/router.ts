import { Router, type Request, type Response } from 'express';
import type { SpeakerRelationsRouterDeps } from '../speaker-relations/router.js';
import { insist, LabelReviewError, type LabelReviewStore, type LabelSet } from './types.js';

export interface LabelReviewDeps { store: LabelReviewStore; contextFor: SpeakerRelationsRouterDeps['contextFor'] }
type Context = NonNullable<Awaited<ReturnType<LabelReviewDeps['contextFor']>>>;
const idOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);

/** Mount after requireAuth. Same gate as every human review: the 'compete' scope plus a trusted human review identity. */
export function createLabelReviewRouter(deps?: LabelReviewDeps): Router {
  const router = Router();
  const execute = (work: (context: Context, req: Request) => Promise<unknown>) => async (req: Request, res: Response): Promise<void> => {
    res.set('Cache-Control', 'private, no-store');
    try {
      if (!deps) throw new LabelReviewError(503, 'unavailable');
      const auth = req.auth;
      if (!auth || !idOk(auth.tenantId) || !idOk(auth.keyId) || !Array.isArray(auth.scopes) || !auth.scopes.every(s => typeof s === 'string')) { res.status(401).json({ error: 'unauthorized' }); return; }
      insist(auth.scopes.includes('compete'), 403, 'forbidden');
      const context = await deps.contextFor(Object.freeze({ tenantId: auth.tenantId, keyId: auth.keyId, scopes: Object.freeze([...auth.scopes]) }));
      insist(context && context.tenantId === auth.tenantId && idOk(context.actorId) && context.canReview === true && context.reviewerKind === 'human', 403, 'forbidden');
      insist(Object.keys(req.query).length === 0, 400, 'invalid');
      res.json(await work(context, req));
    } catch (error) { res.status(error instanceof LabelReviewError ? error.status : 503).json({ error: error instanceof LabelReviewError ? error.message : 'label_review_unavailable' }); }
  };
  // The body carries only the revision, the input hash and (override) a label and note. Tenant, actor, time and
  // labelSource are server-bound; a client field named labelSource, reviewedBy or humanGold is ignored.
  router.get('/label-review', execute(context => deps!.store.read(context)));
  router.post('/label-review/items/:id/accept', execute((context, req) => { insist(idOk(req.params.id), 400, 'invalid'); return deps!.store.accept(context, req.params.id, pick(req.body)); }));
  router.post('/label-review/items/:id/override', execute((context, req) => { insist(idOk(req.params.id), 400, 'invalid'); return deps!.store.override(context, req.params.id, { ...pick(req.body), label: (req.body as { label?: unknown })?.label, note: (req.body as { note?: unknown })?.note }); }));
  router.post('/label-review/accept-high-confidence', execute((context, req) => deps!.store.acceptHighConfidence(context, ((req.body ?? {}) as { set?: LabelSet }).set)));
  return router;
}
const pick = (body: unknown): { expectedRevision: number; inputSha256: string } => {
  const b = (body ?? {}) as Record<string, unknown>; return { expectedRevision: b.expectedRevision as number, inputSha256: b.inputSha256 as string };
};

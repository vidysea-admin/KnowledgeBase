import { Router, type Request } from 'express';
import type { SpeakerRelationsRouterDeps } from '../speaker-relations/router.js';
import { ExtractionReviewError, type ExtractionReviewStore, type ExtractionSubmission } from './types.js';
import { id, insist } from './seed.js';
export interface ExtractionReviewDeps { store:ExtractionReviewStore; contextFor:SpeakerRelationsRouterDeps['contextFor'] }
/** Mount after existing requireAuth. The same central trusted-human adapter controls every route. */
export function createExtractionReviewRouter(deps?:ExtractionReviewDeps):Router {
  const router=Router();
  const execute=(work:(context:NonNullable<Awaited<ReturnType<ExtractionReviewDeps['contextFor']>>>,req:Request)=>Promise<unknown>)=>async(req:Request,res:import('express').Response):Promise<void>=>{
    res.set('Cache-Control','private, no-store');
    try {
      if(!deps)throw new ExtractionReviewError(503,'unavailable');
      const auth=req.auth;
      if(!auth||!id(auth.tenantId)||!id(auth.keyId)||!Array.isArray(auth.scopes)||!auth.scopes.every(s=>typeof s==='string')) {res.status(401).json({error:'unauthorized'});return;}
      insist(auth.scopes.includes('compete'),403,'forbidden');
      const context=await deps.contextFor(Object.freeze({tenantId:auth.tenantId,keyId:auth.keyId,scopes:Object.freeze([...auth.scopes])}));
      insist(context&&context.tenantId===auth.tenantId&&id(context.actorId)&&context.canReview===true&&context.reviewerKind==='human',403,'forbidden');
      insist(Object.keys(req.query).length===0,400,'invalid'); res.json(await work(context,req));
    }catch(error){res.status(error instanceof ExtractionReviewError?error.status:503).json({error:error instanceof ExtractionReviewError?error.message:'extraction_review_unavailable'});}
  };
  router.get('/extraction-review',execute(context=>deps!.store.read(context)));
  router.post('/extraction-review/items/:id',execute((context,req)=>{insist(id(req.params.id),400,'invalid');return deps!.store.approve(context,req.params.id,req.body as ExtractionSubmission);}));
  router.get('/extraction-review/export',execute(context=>deps!.store.export(context)));
  return router;
}

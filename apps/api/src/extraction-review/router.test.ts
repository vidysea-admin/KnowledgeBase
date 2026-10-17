import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { requireAuth } from '../auth.js';
import { createReviewAdapters, createReviewPolicyResolver } from '../review-authority/policy.js';
import { createExtractionReviewRouter } from './router.js';
import type { ExtractionReviewStore } from './types.js';

test('actual auth and shared human policy gate authoritative review/export',async()=>{
  const seen:string[]=[];
  const store={read:async(c:{actorId:string})=>{seen.push(c.actorId);return {pending:true};},approve:async(c:{actorId:string})=>{seen.push(c.actorId);return {saved:true};},export:async(c:{actorId:string})=>{seen.push(c.actorId);return {consumed:true};}} as unknown as ExtractionReviewStore;
  const policy=createReviewAdapters(createReviewPolicyResolver(JSON.stringify({version:1,tenants:[{tenantId:'fixture',keys:[{keyId:'human',subject:'trusted-human',reviewerKind:'human',canPropose:false,canReview:true,answerActions:[]},{keyId:'robot',subject:'robot',reviewerKind:'automation',canPropose:true,canReview:false,answerActions:[]}]}]})));
  const app=express();app.use(express.json());app.use(requireAuth({verify:async key=>['human','robot','unconfigured','noscope'].includes(key)?{tenantId:'fixture',keyId:key,scopes:key==='noscope'?[]:['compete']}:null}));app.use(createExtractionReviewRouter({store,contextFor:policy.relationshipContextFor}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as import('node:net').AddressInfo).port;
  try{
    for(const route of ['/extraction-review','/extraction-review/export']){
      for(const key of ['robot','unconfigured','noscope']){const r=await fetch(`http://127.0.0.1:${port}${route}`,{headers:{Authorization:`Bearer ${key}`}});assert.equal(r.status,403);}
      const missing=await fetch(`http://127.0.0.1:${port}${route}`);assert.equal(missing.status,401);
      const r=await fetch(`http://127.0.0.1:${port}${route}`,{headers:{Authorization:'Bearer human'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
    }
    assert.deepEqual(seen,['trusted-human','trusted-human']);
    const injected=await fetch(`http://127.0.0.1:${port}/extraction-review/items/item`,{method:'POST',headers:{Authorization:'Bearer robot','Content-Type':'application/json'},body:JSON.stringify({actorId:'trusted-human',reviewerKind:'human'})});assert.equal(injected.status,403);assert.equal(seen.length,2);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

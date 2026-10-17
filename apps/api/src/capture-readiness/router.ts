import { Router } from "express";
import { isValidTenantId, requireScope } from "../auth.js";
import type { CaptureReadinessDeps, CaptureReadinessView } from "./types.js";
const SLOT=/^[a-z0-9][a-z0-9_-]{0,63}$/, PLATFORM=/^[a-z][a-z0-9-]{0,39}$/, HASH=/^[a-f0-9]{64}$/, GENERATION=/^[a-f0-9-]{36}$/;
function project(row:CaptureReadinessView,tenant:string):Omit<CaptureReadinessView,"tenantId"> {
  if(!row||row.tenantId!==tenant||row.evidenceKind!=="browser"||!SLOT.test(row.slot)||!PLATFORM.test(row.platform)||!HASH.test(row.evidenceHash)||!HASH.test(row.hostId)||!GENERATION.test(row.generation)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(row.sessionId??"")||
    !Number.isFinite(row.mediaStartedAt)||!Number.isFinite(row.admittedAt)||!Number.isFinite(Date.parse(row.observedAt)))throw new Error("Invalid capture observation");
  return {slot:row.slot,sessionId:row.sessionId,generation:row.generation,platform:row.platform,hostId:row.hostId,observedAt:row.observedAt,
    mediaStartedAt:row.mediaStartedAt,admittedAt:row.admittedAt,evidenceKind:row.evidenceKind,evidenceHash:row.evidenceHash};
}
/** Mount after requireAuth. Review is an explicit operator action, never a recorder/scheduler callback. */
export function createCaptureReadinessRouter(deps?:CaptureReadinessDeps):Router {
  const router=Router();
  router.use("/meeting-bot/capture-readiness",(req,res,next)=>{if(!req.auth||!isValidTenantId(req.auth.tenantId)||!req.auth.keyId){res.status(401).json({error:"unauthorized"});return;}next();});
  router.use("/meeting-bot/capture-readiness",requireScope("hosting"),requireScope("send-now"));
  router.get("/meeting-bot/capture-readiness",async(req,res)=>{
    if(Object.keys(req.query).length){res.status(400).json({error:"bad_request"});return;}
    if(!deps){res.status(503).json({error:"capture_readiness_unavailable"});return;}
    try{await deps.withPermission(req.auth!,"roles:manage",async()=>{
      const rows=await deps.list(req.auth!.tenantId);if(!Array.isArray(rows)||rows.length>256)throw new Error("Invalid observations");
      res.setHeader("Cache-Control","no-store");res.json({observations:rows.map(row=>project(row,req.auth!.tenantId))});
    });}catch(error){res.status((error as {status?:number}).status===403?403:503).json({error:"capture_readiness_unavailable"});}
  });
  router.post("/meeting-bot/capture-readiness/review",async(req,res)=>{
    const body=req.body as Record<string,unknown>;
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==4||Object.keys(body).some(k=>!["slot","platform","generation","evidenceHash"].includes(k))||
      typeof body.slot!=="string"||!SLOT.test(body.slot)||typeof body.platform!=="string"||!PLATFORM.test(body.platform)||typeof body.generation!=="string"||!GENERATION.test(body.generation)||typeof body.evidenceHash!=="string"||!HASH.test(body.evidenceHash)){
      res.status(400).json({error:"bad_request"});return;
    }
    if(!deps){res.status(503).json({error:"capture_readiness_unavailable"});return;}
    try{const accepted=await deps.withPermission(req.auth!,"roles:manage",()=>deps.accept({...req.auth!,keyId:req.auth!.keyId!},{slot:body.slot as string,platform:body.platform as string,generation:body.generation as string,evidenceHash:body.evidenceHash as string}));
      if(accepted.operatorKeyId!==req.auth!.keyId||accepted.evidenceHash!==body.evidenceHash||accepted.generation!==body.generation)throw new Error("Invalid review result");
      res.setHeader("Cache-Control","no-store");res.json({acceptance:{id:accepted.id,acceptedAt:accepted.acceptedAt,operatorKeyId:accepted.operatorKeyId,evidenceHash:accepted.evidenceHash,generation:accepted.generation}});
    }catch(error){res.status((error as {status?:number}).status===403?403:409).json({error:"capture_readiness_review_refused"});}
  });
  router.post("/meeting-bot/capture-readiness/revoke",async(req,res)=>{
    const body=req.body as Record<string,unknown>;
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==4||Object.keys(body).some(k=>!["slot","platform","generation","evidenceHash"].includes(k))||typeof body.slot!=="string"||!SLOT.test(body.slot)||typeof body.platform!=="string"||!PLATFORM.test(body.platform)||typeof body.generation!=="string"||!GENERATION.test(body.generation)||typeof body.evidenceHash!=="string"||!HASH.test(body.evidenceHash)){
      res.status(400).json({error:"bad_request"});return;
    }
    if(!deps){res.status(503).json({error:"capture_readiness_unavailable"});return;}
    try{await deps.withPermission(req.auth!,"roles:manage",()=>deps.revoke({...req.auth!,keyId:req.auth!.keyId!},{slot:body.slot as string,platform:body.platform as string,generation:body.generation as string,evidenceHash:body.evidenceHash as string}));res.setHeader("Cache-Control","no-store");res.json({status:"revoked"});}
    catch(error){res.status((error as {status?:number}).status===403?403:503).json({error:"capture_readiness_revoke_refused"});}
  });
  return router;
}

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { captureSlotHostId, readCaptureSlotObservation, type CaptureSlotReadiness } from "./capture-slot-readiness.js";
import type { CaptureWorkspace } from "./tab-session-workspace.js";
import { verifyCaptureAuthorityArtifact } from "./capture-authority-acl.js";
import { readRecordConsent } from "../record-consent/receipt-store.js";

interface AcceptedCapability {
  version:1; id:string; sample:CaptureSlotReadiness; operatorKeyId:string; acceptedAt:string;
  failureMarker:string|null; signature:string;
}
export interface CaptureEvidenceAuthorityOptions {root:string;env:NodeJS.ProcessEnv;verifiedTenant:()=>string|undefined}
/** Private authority stays under the ignored bot-profile tree, independent of configurable slot roots. */
export function captureAcceptanceRegistryPath(root:string):string {return path.resolve(root,"data","bot-profile",".capture-readiness-authority");}
function physical(directory:string):void {
  for(let current=path.resolve(directory);;current=path.dirname(current)){
    const stat=lstatSync(current),canonical=(s:string)=>process.platform==="win32"?s.toLowerCase():s;
    if(!stat.isDirectory()||stat.isSymbolicLink()||canonical(realpathSync(current))!==canonical(current))throw new Error("Unsafe readiness authority directory");
    if(path.dirname(current)===current)break;
  }
}
function bytes(file:string):Buffer {
  physical(path.dirname(file));verifyCaptureAuthorityArtifact(file);const stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>16384)throw new Error("Unsafe readiness authority file");
  if(process.platform!=="win32"&&(stat.mode&0o077)!==0)throw new Error("Readiness authority must be private");
  return readFileSync(file);
}
function keyFor(receipt:CaptureSlotReadiness):string {
  return createHash("sha256").update(JSON.stringify([receipt.tenantId,receipt.slot,receipt.platform,receipt.hostId,receipt.profileDir,receipt.recordDir])).digest("hex");
}
function ownedMediaOrigin(receipt:CaptureSlotReadiness):void {
  const consent=readRecordConsent(receipt.recordDir,{tenantId:receipt.tenantId,sessionId:receipt.sessionId});
  if(!consent.generation||consent.generation!==receipt.generation||consent.mediaStartedAt!==receipt.mediaStartedAt)throw new Error("Browser observation has no matching durable attempt/media origin");
  verifyCaptureAuthorityArtifact(path.join(receipt.recordDir,"record-consent",receipt.tenantId,`${receipt.sessionId}.json`));
}
function marker(receipt:CaptureSlotReadiness):string|null {
  const file=path.join(receipt.profileDir,`.lkb-readiness-failure-${receipt.platform}.json`);
  if(!existsSync(file))return null;
  const contents=bytes(file),failure=JSON.parse(contents.toString());
  if(!failure||Object.keys(failure).length!==2||!/^[a-f0-9-]{36}$/.test(failure.generation??"")||typeof failure.at!=="string"||!Number.isFinite(Date.parse(failure.at))||new Date(failure.at).toISOString()!==failure.at)throw new Error("Invalid capture failure evidence");
  if(Date.parse(receipt.observedAt)<=Date.parse(failure.at))throw new Error("A fresh browser observation after the failure is required");
  return createHash("sha256").update(contents).digest("hex");
}
function publish(file:string,body:Buffer|string):void {
  const temporary=file+"."+randomUUID()+".tmp";let fd:number|undefined;
  try{fd=openSync(temporary,"wx",0o600);writeFileSync(fd,body);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,file);}
  finally{if(fd!==undefined)closeSync(fd);rmSync(temporary,{force:true});}
}
function sign(body:Omit<AcceptedCapability,"signature">,secret:Buffer):string {
  return createHmac("sha256",secret).update(JSON.stringify(body)).digest("hex");
}
function secret(registry:string,create=false):Buffer {
  const file=path.join(registry,".issuer-key");
  if(create&&!existsSync(file)){
    let fd:number|undefined;
    try{fd=openSync(file,"wx",0o600);writeFileSync(fd,randomBytes(32));fsyncSync(fd);}
    catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
    finally{if(fd!==undefined)closeSync(fd);}
  }
  const result=bytes(file);if(result.length!==32)throw new Error("Invalid readiness issuer key");return result;
}
/** Called only inside the authenticated host's roles:manage transaction, never by the scheduler or recorder. */
export function publishCaptureSlotAcceptance(root:string,workspace:CaptureWorkspace,review:{tenantId:string;keyId:string;platform:string;generation:string;evidenceHash:string}) {
  if(review.tenantId!==workspace.tenantId||!review.keyId||review.keyId.length>256||/[\u0000-\u001f\u007f]/.test(review.keyId))throw new Error("Invalid readiness reviewer");
  const receipt=readCaptureSlotObservation(workspace,review.platform);
  verifyCaptureAuthorityArtifact(path.join(receipt.profileDir,`.lkb-capture-readiness-${receipt.platform}.json`));
  if(receipt.evidenceKind!=="browser"||receipt.hostId!==captureSlotHostId()||receipt.generation!==review.generation||receipt.evidenceHash!==review.evidenceHash||Date.parse(receipt.observedAt)>Date.now())throw new Error("Readiness evidence is stale, foreign or synthetic");
  ownedMediaOrigin(receipt);
  const registry=captureAcceptanceRegistryPath(root);
  // Validate existing ancestors before creation; symlinks never become a registry.
  let ancestor=registry;while(!existsSync(ancestor))ancestor=path.dirname(ancestor);physical(ancestor);
  mkdirSync(registry,{recursive:true,mode:0o700});physical(registry);
  verifyCaptureAuthorityArtifact(registry);
  const key=keyFor(receipt),lock=path.join(registry,key+".lock"),fd=openSync(lock,"wx",0o600);
  try{
    const body:Omit<AcceptedCapability,"signature">={version:1,id:randomUUID(),sample:receipt,operatorKeyId:review.keyId,acceptedAt:new Date().toISOString(),failureMarker:marker(receipt)};
    const record={...body,signature:sign(body,secret(registry,true))};
    const immutable=path.join(registry,`${key}.${record.id}.json`),immutableFd=openSync(immutable,"wx",0o600);
    try{writeFileSync(immutableFd,JSON.stringify(record)+"\n");fsyncSync(immutableFd);}finally{closeSync(immutableFd);}
    if(readCaptureSlotObservation(workspace,review.platform).evidenceHash!==receipt.evidenceHash||marker(receipt)!==body.failureMarker)throw new Error("Observation changed during operator review");
    publish(path.join(registry,key+".current"),record.id);
    return {id:record.id,acceptedAt:record.acceptedAt,operatorKeyId:record.operatorKeyId,evidenceHash:receipt.evidenceHash,generation:receipt.generation};
  }finally{closeSync(fd);rmSync(lock);}
}
export function revokeCaptureSlotAcceptance(root:string,workspace:CaptureWorkspace,platform:string,actor:{tenantId:string;keyId:string;generation:string;evidenceHash:string}):void {
  if(!workspace.slot||!/^[a-z][a-z0-9-]{0,39}$/.test(platform))throw new Error("Invalid capture capability");
  if(actor.tenantId!==workspace.tenantId||!actor.keyId||actor.keyId.length>256||/[\u0000-\u001f\u007f]/.test(actor.keyId))throw new Error("Invalid readiness reviewer");
  const receipt={...workspace,profileDir:path.resolve(workspace.profileDir),recordDir:path.resolve(workspace.recordDir),platform,hostId:captureSlotHostId()} as CaptureSlotReadiness;
  const registry=captureAcceptanceRegistryPath(root),file=path.join(registry,keyFor(receipt)+".current");
  if(!existsSync(file))return;
  verifyCaptureAuthorityArtifact(registry);const key=keyFor(receipt),lock=path.join(registry,key+".lock"),fd=openSync(lock,"wx",0o600);
  try{
    if(!existsSync(file))return;
    const current=readCaptureSlotObservation(workspace,platform);
    if(current.generation!==actor.generation||current.evidenceHash!==actor.evidenceHash)throw new Error("Capture observation changed before revocation");
    const acceptedId=bytes(file).toString();if(!/^[a-f0-9-]{36}$/.test(acceptedId))throw new Error("Invalid acceptance pointer");
    const revoked={version:1,id:randomUUID(),acceptedId,tenantId:actor.tenantId,operatorKeyId:actor.keyId,at:new Date().toISOString(),capabilityKey:key};
    const signature=createHmac("sha256",secret(registry)).update("capture-revoke-v1\n"+JSON.stringify(revoked)).digest("hex");
    publish(path.join(registry,`${key}.${revoked.id}.revoked.json`),JSON.stringify({...revoked,signature})+"\n");
    if(bytes(file).toString()!==acceptedId)throw new Error("Acceptance changed during revocation");rmSync(file);
  }finally{closeSync(fd);rmSync(lock);}
}
/** Retains the reviewed sample; future observations never mint their own approvals. Failures invalidate its capability. */
export function createCaptureSlotEvidenceAcceptor(options:CaptureEvidenceAuthorityOptions):(receipt:CaptureSlotReadiness)=>boolean {
  const registry=captureAcceptanceRegistryPath(options.root);
  return receipt=>{
    try{
      if(receipt.tenantId!==options.verifiedTenant()||receipt.tenantId!==options.env.LKB_TENANT_ID||receipt.evidenceKind!=="browser"||receipt.hostId!==captureSlotHostId())return false;
      if(!existsSync(registry))return false;physical(registry);verifyCaptureAuthorityArtifact(registry);
      const workspace={tenantId:receipt.tenantId,slot:receipt.slot,profileDir:receipt.profileDir,recordDir:receipt.recordDir};
      const current=readCaptureSlotObservation(workspace,receipt.platform);
      ownedMediaOrigin(current);
      verifyCaptureAuthorityArtifact(path.join(current.profileDir,`.lkb-capture-readiness-${current.platform}.json`));
      if(current.evidenceHash!==receipt.evidenceHash)return false;
      const key=keyFor(receipt),id=bytes(path.join(registry,key+".current")).toString();
      if(!/^[a-f0-9-]{36}$/.test(id))return false;
      const record=JSON.parse(bytes(path.join(registry,`${key}.${id}.json`)).toString()) as AcceptedCapability;
      const {signature,...body}=record,expected=sign(body,secret(registry));
      if(!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex")))return false;
      return receipt.tenantId===options.verifiedTenant()&&receipt.tenantId===options.env.LKB_TENANT_ID&&record.version===1&&record.id===id&&record.sample.evidenceKind==="browser"&&keyFor(record.sample)===key&&
        Date.parse(record.acceptedAt)<=Date.now()&&Date.parse(receipt.observedAt)>=Date.parse(record.sample.observedAt)&&
        Date.parse(receipt.observedAt)<=Date.now()&&record.failureMarker===marker(receipt);
    }catch{return false;}
  };
}

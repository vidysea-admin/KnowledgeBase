import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import type { CaptureWorkspace } from "./tab-session-workspace.js";

export interface CaptureSlotReadiness {
  version: 1; tenantId: string; slot: string; sessionId: string; generation: string;
  platform: string; hostId: string; profileDir: string; recordDir: string;
  observedAt: string; mediaStartedAt: number; admittedAt: number;
  observation: "admission-and-recorder-start"; evidenceKind: "browser" | "fixture"; evidenceHash: string;
}
export function captureSlotHostId(): string {
  return createHash("sha256").update(JSON.stringify([hostname(),process.platform])).digest("hex");
}
function physical(directory: string): void {
  const canonical=(value:string)=>process.platform==="win32"?value.toLowerCase():value;
  for(let current=path.resolve(directory);;current=path.dirname(current)) {
    const stat=lstatSync(current);
    if(!stat.isDirectory()||stat.isSymbolicLink()||canonical(realpathSync(current))!==canonical(current))throw new Error("Redirected capture readiness workspace");
    if(path.dirname(current)===current)break;
  }
}
export function captureSlotReadinessPath(workspace: CaptureWorkspace, platform?: string): string {
  if(!workspace.slot)throw new Error("Capture readiness requires an explicit slot");
  if(platform!==undefined&&!/^[a-z][a-z0-9-]{0,39}$/.test(platform))throw new Error("Invalid readiness meeting platform");
  return path.join(workspace.profileDir,`.lkb-capture-readiness${platform?"-"+platform:""}.json`);
}
function digest(receipt: Omit<CaptureSlotReadiness,"evidenceHash">): string {
  return createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}
function checked(receipt: CaptureSlotReadiness, workspace: CaptureWorkspace): CaptureSlotReadiness {
  const {evidenceHash,...body}=receipt;
  if(Object.keys(receipt).length!==15||receipt.version!==1||receipt.tenantId!==workspace.tenantId||receipt.slot!==workspace.slot||
    receipt.profileDir!==path.resolve(workspace.profileDir)||receipt.recordDir!==path.resolve(workspace.recordDir)||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(receipt.sessionId??"")||!/^[a-f0-9-]{36}$/.test(receipt.generation??"")||
    !/^[a-z][a-z0-9-]{0,39}$/.test(receipt.platform??"")||!/^[a-f0-9]{64}$/.test(receipt.hostId??"")||
    !Number.isFinite(receipt.mediaStartedAt)||!Number.isFinite(receipt.admittedAt)||receipt.mediaStartedAt<=0||receipt.admittedAt<=0||
    !Number.isFinite(Date.parse(receipt.observedAt))||new Date(receipt.observedAt).toISOString()!==receipt.observedAt||
    Math.max(receipt.mediaStartedAt,receipt.admittedAt)>Date.parse(receipt.observedAt)||
    receipt.observation!=="admission-and-recorder-start"||!["browser","fixture"].includes(receipt.evidenceKind)||digest(body)!==evidenceHash)
    throw new Error("Invalid capture readiness observation");
  return receipt;
}
export function readCaptureSlotObservation(workspace:CaptureWorkspace, platform?:string):CaptureSlotReadiness {
  physical(workspace.profileDir);physical(workspace.recordDir);
  const file=captureSlotReadinessPath(workspace,platform),stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>8192)throw new Error("Unsafe capture readiness observation");
  const receipt=checked(JSON.parse(readFileSync(file,"utf8")),workspace);
  if(platform!==undefined&&receipt.platform!==platform)throw new Error("Capture readiness platform/file mismatch");
  return receipt;
}
/** Consumer must supply actual accepted host evidence; profile existence and a hash alone never establish readiness. */
export function validateCaptureSlotReadiness(workspace:CaptureWorkspace, options:{platform:string;hostId?:string;now?:()=>number;acceptEvidence:(receipt:CaptureSlotReadiness)=>boolean}):CaptureSlotReadiness {
  let receipt:CaptureSlotReadiness;
  try{receipt=readCaptureSlotObservation(workspace,options.platform);}
  catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")throw new Error("Capture slot has no accepted browser admission/readiness evidence");throw error;}
  if(receipt.evidenceKind!=="browser"||receipt.platform!==options.platform||receipt.hostId!==(options.hostId??captureSlotHostId())||Date.parse(receipt.observedAt)>(options.now??Date.now)()||
    !options.acceptEvidence(receipt))throw new Error("Capture slot has no accepted browser admission/readiness evidence");
  return receipt;
}
/** The pool contains only observed meeting-platform capabilities; host OS is not a meeting platform. */
export function listCaptureSlotReadiness(workspace:CaptureWorkspace, options:{hostId?:string;now?:()=>number;acceptEvidence:(receipt:CaptureSlotReadiness)=>boolean}):CaptureSlotReadiness[] {
  physical(workspace.profileDir);physical(workspace.recordDir);
  const names=readdirSync(workspace.profileDir).filter(name=>/^\.lkb-capture-readiness-[a-z][a-z0-9-]{0,39}\.json$/.test(name));
  if(names.length>32)throw new Error("Capture readiness capabilities exceed bounds");
  return names.map(name=>readCaptureSlotObservation(workspace,name.slice(".lkb-capture-readiness-".length,-5))).filter(receipt=>
    receipt.evidenceKind==="browser"&&receipt.hostId===(options.hostId??captureSlotHostId())&&Date.parse(receipt.observedAt)<=(options.now??Date.now)()&&options.acceptEvidence(receipt));
}
/** Observations originate in the owned browser flow. They assert admission/capture, never a guessed signed-in identity. */
export function createCaptureSlotReadinessObserver(workspace:CaptureWorkspace, owner:{sessionId:string;platform:string;startedAt:number;evidenceKind:"browser"|"fixture";generation?:string}, now:()=>number=Date.now) {
  if(!/^[a-z][a-z0-9-]{0,39}$/.test(owner.platform))throw new Error("Invalid readiness meeting platform");
  if(workspace.slot&&!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(owner.generation??""))throw new Error("Capture receipt attempt generation required for slot readiness");
  const generation=owner.generation??"";let admittedAt:number|undefined,mediaStartedAt:number|undefined,failure:string|undefined,closed=false,published=false;
  const publish=()=>{
    if(!workspace.slot||published||admittedAt===undefined||mediaStartedAt===undefined)return;
    physical(workspace.profileDir);physical(workspace.recordDir);
    const body:Omit<CaptureSlotReadiness,"evidenceHash">={version:1,tenantId:workspace.tenantId,slot:workspace.slot,sessionId:owner.sessionId,
      generation,platform:owner.platform,hostId:captureSlotHostId(),profileDir:path.resolve(workspace.profileDir),recordDir:path.resolve(workspace.recordDir),
      observedAt:new Date(now()).toISOString(),mediaStartedAt,admittedAt,observation:"admission-and-recorder-start",evidenceKind:owner.evidenceKind};
    const receipt=checked({...body,evidenceHash:digest(body)},workspace);
    for(const platform of [owner.platform,undefined]) {
      const file=captureSlotReadinessPath(workspace,platform),temporary=file+"."+generation+".tmp";
      if(existsSync(file))readCaptureSlotObservation(workspace,platform);
      let fd:number|undefined;
      try {fd=openSync(temporary,"wx",0o600);writeFileSync(fd,JSON.stringify(receipt)+"\n");fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,file);}
      finally {if(fd!==undefined)closeSync(fd);rmSync(temporary,{force:true});}
    }
    published=true;
  };
  const revoke=()=>{
    if(!workspace.slot)return;
    const marker=path.join(workspace.profileDir,`.lkb-readiness-failure-${owner.platform}.json`);
    physical(workspace.profileDir);
    if(existsSync(marker)){const stat=lstatSync(marker);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new Error("Unsafe readiness failure marker");}
    const temporary=marker+"."+generation+".tmp";let fd:number|undefined;
    try{fd=openSync(temporary,"wx",0o600);writeFileSync(fd,JSON.stringify({generation,at:new Date(now()).toISOString()})+"\n");fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,marker);}
    finally{if(fd!==undefined)closeSync(fd);rmSync(temporary,{force:true});}
    for(const platform of [owner.platform,undefined]) {
      const file=captureSlotReadinessPath(workspace,platform);
      if(existsSync(file)&&readCaptureSlotObservation(workspace,platform).generation===generation)rmSync(file);
    }
  };
  return {generation,failure:()=>failure,onCaptureEvent:(event:{event:string;mediaStartedAt?:unknown;failed?:unknown;assumed?:unknown})=>{
    if(!workspace.slot||failure||closed)return;
    try {
      if(event.event==="admitted"&&admittedAt===undefined&&(event.assumed===false||owner.evidenceKind==="fixture"&&event.assumed===undefined))admittedAt=now();
      if(event.event==="capture-started"&&mediaStartedAt===undefined&&typeof event.mediaStartedAt==="number"&&
        Number.isFinite(event.mediaStartedAt)&&event.mediaStartedAt>=owner.startedAt&&event.mediaStartedAt<=now())mediaStartedAt=event.mediaStartedAt;
      if(event.event==="capture-error"||(event.event==="capture-stopped"&&event.failed!==false)){closed=true;revoke();return;}
      if(event.event==="admitted"||event.event==="capture-started")publish();
    } catch {failure="Capture readiness observation could not be persisted";try{revoke();}catch{}}
  }};
}

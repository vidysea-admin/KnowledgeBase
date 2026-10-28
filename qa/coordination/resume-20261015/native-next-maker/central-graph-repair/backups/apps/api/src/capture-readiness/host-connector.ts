import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync } from "node:fs";
import type { HostingService } from "../hosting/service.js";
import { hostingId } from "../hosting/types.js";
import type { CaptureReadinessDeps } from "./types.js";
/** Constructors perform no filesystem reads, imports, auth approvals or capture actions. */
export function createHostCaptureReadinessDeps(options:{root:string;env:NodeJS.ProcessEnv;hosting:HostingService;verifiedTenant?:()=>string|undefined}):CaptureReadinessDeps {
  const authorityContext=new AsyncLocalStorage<{tenantId:string;keyId:string}>();
  const authorized=(id:string,keyId?:string)=>{const active=authorityContext.getStore();if(!active||active.tenantId!==id||keyId!==undefined&&active.keyId!==keyId)throw new Error("Authenticated readiness review transaction required");};
  const tenant=(id:string)=>{
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)||id!==options.env.LKB_TENANT_ID||id!==authorityContext.getStore()?.tenantId||options.verifiedTenant&&id!==options.verifiedTenant())throw new Error("Capture host tenant is unverified");
    if(!path.isAbsolute(options.root)||/^[/\\]{2}/.test(options.root))throw new Error("Local capture host root required");
    for(const value of [options.env.LKB_BOT_PROFILE_DIR,options.env.LKB_RECORD_DIR])if(value&&(!path.isAbsolute(value)||/^[/\\]{2}/.test(value)))throw new Error("Local absolute capture workspace required");
    return id;
  };
  const load=async()=>{
    const [workspace,readiness,authority]=await Promise.all([
      import("../../../../packages/meeting-bot/src/capture/workspace/tab-session-workspace.js"),
      import("../../../../packages/meeting-bot/src/capture/workspace/capture-slot-readiness.js"),
      import("../../../../packages/meeting-bot/src/capture/workspace/capture-slot-acceptance.js"),
    ]);return {workspace,readiness,authority};
  };
  const slots=()=>{
    const rows=(options.env.LKB_CAPTURE_SLOTS??"").split(",").map(v=>v.trim()).filter(Boolean);
    if(rows.length<1||rows.length>8||new Set(rows).size!==rows.length||rows.some(v=>!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v)))throw new Error("Capture slot pool is unavailable");
    return rows;
  };
  const selected=async(id:string,slot:string)=>{
    tenant(id);if(!slots().includes(slot))throw new Error("Capture slot is outside the configured pool");
    const modules=await load();const actual=modules.workspace.selectTabCaptureWorkspace(["--capture-slot",slot],{
      tenantId:id,profileDir:path.resolve(options.env.LKB_BOT_PROFILE_DIR??path.join(options.root,"data","bot-profile")),recordDir:path.resolve(options.env.LKB_RECORD_DIR??path.join(options.root,"raw","webinars")),
    },"finalize");return {...modules,actual};
  };
  return {
    withPermission:(principal,permission,callback)=>options.hosting.withPermission({tenantId:hostingId(principal.tenantId,"tenant"),keyId:hostingId(principal.keyId,"actor"),scopes:[...principal.scopes]},permission,()=>authorityContext.run({tenantId:principal.tenantId,keyId:principal.keyId!},async()=>{tenant(principal.tenantId);if(!principal.scopes.includes("hosting")||!principal.scopes.includes("send-now"))throw new Error("Capture review scopes required");return callback();})),
    list:async id=>{
      tenant(id);authorized(id);const rows=[];
      for(const slot of slots()){
        const {actual,readiness}=await selected(id,slot);let files:string[];
        try{files=readdirSync(actual.profileDir);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")continue;throw error;}
        const names=files.filter(v=>/^\.lkb-capture-readiness-[a-z][a-z0-9-]{0,39}\.json$/.test(v));if(names.length>32)throw new Error("Capture observation bound exceeded");
        for(const name of names){const receipt=readiness.readCaptureSlotObservation(actual,name.slice(".lkb-capture-readiness-".length,-5));
          if(receipt.evidenceKind==="browser"&&receipt.hostId===readiness.captureSlotHostId()&&Date.parse(receipt.observedAt)<=Date.now()){
            const {profileDir:_profileDir,recordDir:_recordDir,version:_version,observation:_observation,...view}=receipt;rows.push({...view,evidenceKind:"browser" as const});
          }
        }
      }
      tenant(id);return rows;
    },
    accept:async(principal,review)=>{
      authorized(principal.tenantId,principal.keyId);const {actual,authority}=await selected(principal.tenantId,review.slot);tenant(principal.tenantId);
      return authority.publishCaptureSlotAcceptance(options.root,actual,{...review,tenantId:principal.tenantId,keyId:principal.keyId});
    },
    revoke:async(principal,review)=>{authorized(principal.tenantId,principal.keyId);const {actual,authority}=await selected(principal.tenantId,review.slot);tenant(principal.tenantId);authority.revokeCaptureSlotAcceptance(options.root,actual,review.platform,{tenantId:principal.tenantId,keyId:principal.keyId,generation:review.generation,evidenceHash:review.evidenceHash});},
  };
}

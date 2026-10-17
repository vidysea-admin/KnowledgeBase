import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import type { HostingService } from "../hosting/service.js";
import { hostingId } from "../hosting/types.js";
import type { CaptureReadinessDeps, HostCaptureReadinessAdapter } from "./types.js";
/** Constructors perform no filesystem reads, imports, auth approvals or capture actions. */
export function createHostCaptureReadinessDeps(options:{root:string;env:NodeJS.ProcessEnv;hosting:HostingService;verifiedTenant?:()=>string|undefined;host?:HostCaptureReadinessAdapter}):CaptureReadinessDeps {
  const authorityContext=new AsyncLocalStorage<{tenantId:string;keyId:string}>();
  const authorized=(id:string,keyId?:string)=>{const active=authorityContext.getStore();if(!active||active.tenantId!==id||keyId!==undefined&&active.keyId!==keyId)throw new Error("Authenticated readiness review transaction required");};
  const tenant=(id:string)=>{
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)||id!==options.env.LKB_TENANT_ID||id!==authorityContext.getStore()?.tenantId||options.verifiedTenant&&id!==options.verifiedTenant())throw new Error("Capture host tenant is unverified");
    if(!path.isAbsolute(options.root)||/^[/\\]{2}/.test(options.root))throw new Error("Local capture host root required");
    for(const value of [options.env.LKB_BOT_PROFILE_DIR,options.env.LKB_RECORD_DIR])if(value&&(!path.isAbsolute(value)||/^[/\\]{2}/.test(value)))throw new Error("Local absolute capture workspace required");
    return id;
  };
  const slots=()=>{
    const rows=(options.env.LKB_CAPTURE_SLOTS??"").split(",").map(v=>v.trim()).filter(Boolean);
    if(rows.length<1||rows.length>8||new Set(rows).size!==rows.length||rows.some(v=>!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v)))throw new Error("Capture slot pool is unavailable");
    return rows;
  };
  const selected=(id:string,slot:string)=>{
    tenant(id);if(!slots().includes(slot))throw new Error("Capture slot is outside the configured pool");
    if(!options.host)throw new Error("Trusted capture host bridge unavailable");
    return options.host;
  };
  return {
    withPermission:(principal,permission,callback)=>options.hosting.withPermission({tenantId:hostingId(principal.tenantId,"tenant"),keyId:hostingId(principal.keyId,"actor"),scopes:[...principal.scopes]},permission,()=>authorityContext.run({tenantId:principal.tenantId,keyId:principal.keyId!},async()=>{tenant(principal.tenantId);if(!principal.scopes.includes("hosting")||!principal.scopes.includes("send-now"))throw new Error("Capture review scopes required");return callback();})),
    list:async id=>{
      tenant(id);authorized(id);const rows=[];
      for(const slot of slots()){
        const observations=await selected(id,slot).list(id,slot);
        if(observations.some(row=>row.tenantId!==id||row.slot!==slot||row.evidenceKind!=="browser"))throw new Error("Foreign capture host observation");
        rows.push(...observations);
      }
      tenant(id);return rows;
    },
    accept:async(principal,review)=>{
      authorized(principal.tenantId,principal.keyId);const host=selected(principal.tenantId,review.slot);tenant(principal.tenantId);
      return host.accept(principal,review);
    },
    revoke:async(principal,review)=>{authorized(principal.tenantId,principal.keyId);const host=selected(principal.tenantId,review.slot);tenant(principal.tenantId);await host.revoke(principal,review);},
  };
}

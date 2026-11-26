import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { hostname } from "node:os";
import { lstatSync, readFileSync, readdirSync, realpathSync, existsSync } from "node:fs";
import path from "node:path";
import type { BotPrivacyDeps, BotPrivacyCaptureView } from "./types.js";
import { verifyPrivateDirectory,verifyPrivateArtifact } from "./private-acl.js";
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Descriptor = {version:1;tenantId:string;sessionId:string;generation:string;host:string;origin:string;secret:string};
const mac = (secret:string,domain:string,value:unknown) => createHmac("sha256",secret).update(domain+"\n"+JSON.stringify(value)).digest("hex");
/** Same-host API/worker only. Containers need an explicitly configured trusted host bridge. */
export function createHostBotPrivacyDeps(directory: string): BotPrivacyDeps {
  if (!path.isAbsolute(directory) || /^[/\\]{2}/.test(directory)) throw new Error("Local absolute private controller directory required");
  const root = path.resolve(directory);
  const tenantPath = (tenant:string) => {
    if (!ID.test(tenant) || tenant.length>100) throw new Error("Invalid private controller tenant");
    verifyPrivateDirectory(root);
    const target = path.join(root,tenant);
    for (let current=target; ; current=path.dirname(current)) {
      if (existsSync(current) && (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory() || realpathSync(current).toLowerCase()!==current.toLowerCase())) throw new Error("Redirected private controller path");
      if (path.dirname(current)===current) break;
    }
    if(existsSync(target))verifyPrivateDirectory(target);
    return target;
  };
  const read = (tenant:string,session:string,generation:string):Descriptor => {
    if (!ID.test(session)||!UUID.test(generation)) throw new Error("Invalid private controller identity");
    const file=path.join(tenantPath(tenant),`${session}--${generation}.json`),stat=lstatSync(file);
    if (!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>2048||process.platform!=="win32"&&(stat.mode&0o077)!==0) throw new Error("Unsafe private descriptor");
    verifyPrivateArtifact(file);
    const row=JSON.parse(readFileSync(file,"utf8"));
    if (!row||Object.keys(row).length!==7||row.version!==1||row.tenantId!==tenant||row.sessionId!==session||row.generation!==generation||row.host!==hostname()||
      !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(row.origin)||Number(new URL(row.origin).port)>65535||typeof row.secret!=="string"||!/^[a-f0-9]{64}$/.test(row.secret)) throw new Error("Foreign or invalid private descriptor");
    return row;
  };
  const send = async (descriptor:Descriptor,action:string) => {
    const {tenantId,sessionId,generation,secret}=descriptor,requestId=randomUUID(),at=Date.now();
    const body={version:1,tenantId,sessionId,generation,requestId,at,action,mac:mac(secret,"capture-request-v1",[1,tenantId,sessionId,generation,requestId,at,action])};
    const response=await fetch(`${descriptor.origin}/privacy`,{method:"POST",headers:{"Content-Type":"application/json","Connection":"close"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error("Recorder did not acknowledge privacy");
    const text=await response.text(); if(Buffer.byteLength(text)>2048)throw new Error("Invalid recorder response");
    const row=JSON.parse(text), proof={version:row.version,requestId:row.requestId,generation:row.generation,result:row.result,status:row.status,privacy:row.privacy};
    if(Object.keys(row).length!==7||row.version!==1||row.requestId!==requestId||row.generation!==generation||!["status","accepted","unavailable"].includes(row.result)||
      action==="status"&&row.result!=="status"||action!=="status"&&row.result==="status"||!["joining","recording","interrupted"].includes(row.status)||
      !["public","private","conservative","unavailable"].includes(row.privacy)||typeof row.mac!=="string"||!/^[a-f0-9]{64}$/.test(row.mac)||
      !timingSafeEqual(Buffer.from(row.mac),Buffer.from(mac(secret,"capture-response-v1",proof))))throw new Error("Untrusted recorder acknowledgement");
    return row;
  };
  return {
    list: async tenant => {
      let names:string[];try{names=readdirSync(tenantPath(tenant));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error;}
      if(names.length>100)throw new Error("Private controller limit");
      /* Validate every descriptor first (read() errors still throw out of list), then probe all in parallel so list() is bounded by one descriptor's worst case (2 attempts), not N of them. */
      const descriptors:Array<{descriptor:Descriptor;mtime:number;name:string}>=[];
      for(const name of names.sort()){const match=/^(.+)--([a-f0-9-]{36})\.json$/.exec(name);if(!match)continue;
        const descriptor=read(tenant,match[1]!,match[2]!);descriptors.push({descriptor,mtime:lstatSync(path.join(tenantPath(tenant),name)).mtimeMs,name});}
      /* A transient failure gets one retry (fresh requestId). A still-failing descriptor is never live proof, but is kept as interrupted/unavailable so a live private capture never vanishes from the UI; privacy is only ever reported from a verified HMAC reply. */
      const probed=await Promise.all(descriptors.map(async entry=>{let state:Awaited<ReturnType<typeof send>>|undefined;
        try{state=await send(entry.descriptor,"status");}catch{try{state=await send(entry.descriptor,"status");}catch{state=undefined;}}
        return {...entry,state};}));
      /* The router rejects duplicate sessionIds (a crashed generation plus its restart), so collapse to one row per session: verified rows beat dead ones; among several verified, the newest descriptor file (the restarted recorder) supplies generation and status, ties broken by file name. If the verified generations disagree on privacy (an old recorder may still be capturing publicly), the row says "unavailable" rather than claim any state; a session with no verified descriptor keeps one unavailable row (first by name). */
      const best=new Map<string,typeof probed[number]>(),privacies=new Map<string,Set<string>>();
      for(const entry of probed){const id=entry.descriptor.sessionId,held=best.get(id);
        if(entry.state)privacies.set(id,(privacies.get(id)??new Set<string>()).add(entry.state.privacy));
        if(!held||(entry.state?1:0)>(held.state?1:0)||(entry.state&&held.state&&entry.mtime>held.mtime))best.set(id,entry);}
      const rows:BotPrivacyCaptureView[]=[...best.values()].map(({descriptor,state})=>({tenantId:tenant,sessionId:descriptor.sessionId,generation:descriptor.generation,status:state?state.status:"interrupted",privacy:state&&privacies.get(descriptor.sessionId)!.size===1?state.privacy:"unavailable"}));
      return rows;
    },
    set: async (tenant,session,generation,action) => {
      if(!["private-start","private-end"].includes(action))return "unavailable";
      try{const descriptor=read(tenant,session,generation),reply=await send(descriptor,action);return reply.result==="accepted"?"accepted":"unavailable";}catch{return "unavailable";}
    }
  };
}

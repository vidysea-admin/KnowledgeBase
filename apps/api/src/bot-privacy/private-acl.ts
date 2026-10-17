import { spawnSync } from "node:child_process";
import { lstatSync,realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
type AclSnapshot={path:string;currentSid:string;ownerSid:string;rules:Array<{sid:string;type:"Allow"|"Deny";rights:number}>};
const SID=/^S-1-[0-9]+(?:-[0-9]+)+$/;
function nativeUnavailable(result:ReturnType<typeof spawnSync>,elapsedMs:number):Error {
  const candidate=(result.error as NodeJS.ErrnoException|undefined)?.code;
  const code=["ETIMEDOUT","ENOENT","EACCES","EPERM","ENOBUFS"].includes(candidate??"")?candidate:null;
  const stderr=typeof result.stderr==="string"?result.stderr:"";
  const classification=code==="ETIMEDOUT"?"deadline":code==="ENOBUFS"?"buffer-limit":
    /CouldNotAutoloadMatchingModule|module could not be loaded/i.test(stderr)?"module-load":
    /PSSecurityException|running scripts is disabled/i.test(stderr)?"execution-policy":
    /UnauthorizedAccessException|PermissionDenied/i.test(stderr)?"read-denied":
    /PathNotFound|ItemNotFoundException/i.test(stderr)?"path-missing":"native-exit";
  // Internal diagnostics contain no target, SID, ACL rows, module paths, raw output, or environment.
  return Object.assign(new Error("Private Windows directory ACL unavailable"),{cause:{stage:"native-acl-process",
    classification,code,elapsedMs:Math.round(elapsedMs),deadlineMs:5000,
    status:Number.isSafeInteger(result.status)?result.status:null,
    signal:["SIGTERM","SIGKILL"].includes(result.signal??"")?result.signal:null}});
}
export function validatePrivateAclSnapshot(value:unknown,directory:string):void {
  const row=value as AclSnapshot,canonical=(target:string)=>process.platform==="win32"?target.toLowerCase():target;
  if(!row||Object.keys(row).length!==4||typeof row.path!=="string"||canonical(row.path)!==canonical(directory)||!SID.test(row.currentSid??"")||!SID.test(row.ownerSid??"")||
    !Array.isArray(row.rules)||row.rules.length===0||row.rules.length>128)throw new Error("Invalid private Windows directory proof");
  const allowed=new Set([row.currentSid,"S-1-5-18","S-1-5-32-544"]);
  if(!allowed.has(row.ownerSid))throw new Error("Private directory owner is not authorized");
  let full=false;
  for(const rule of row.rules){
    if(!rule||Object.keys(rule).length!==3||!SID.test(rule.sid??"")||!["Allow","Deny"].includes(rule.type)||!Number.isSafeInteger(rule.rights)||rule.rights<0||rule.rights>0x7fffffff)throw new Error("Invalid private directory access rule");
    if(rule.type==="Allow"&&!allowed.has(rule.sid))throw new Error("Private directory permits an unrelated identity");
    if(rule.type==="Deny"&&rule.sid===row.currentSid&&rule.rights)throw new Error("Private directory denies service identity");
    if(rule.type==="Allow"&&rule.sid===row.currentSid&&(rule.rights&2032127)===2032127)full=true;
  }
  if(!full)throw new Error("Private directory lacks explicit service control");
}
/** No ACL mutations. Root must configure an actually private current-identity directory. */
export function verifyPrivateDirectory(directory:string,run:typeof spawnSync=spawnSync):void {
  if(!path.isAbsolute(directory)||/^[/\\]{2}/.test(directory))throw new Error("Local private directory required");
  if(!lstatSync(directory).isDirectory())throw new Error("Private directory required");
  verifyPrivateArtifact(directory,run);
}
export function verifyPrivateArtifact(directory:string,run:typeof spawnSync=spawnSync):void {
  if(!path.isAbsolute(directory)||/^[/\\]{2}/.test(directory))throw new Error("Local private directory required");
  const resolved=path.resolve(directory),before=lstatSync(resolved,{bigint:true});
  if(!before.isDirectory()&&!before.isFile()||before.isSymbolicLink()||before.isFile()&&before.nlink!==1n||realpathSync(resolved).toLowerCase()!==resolved.toLowerCase())throw new Error("Unpinned private directory");
  if(process.platform==="win32"){
    const executable=path.join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
    const script=fileURLToPath(new URL("private-acl.ps1",import.meta.url));
    // pwsh's inherited module path can select PowerShell 7 assemblies in Windows PowerShell 5.1.
    // Restrict this child only to the trusted native executable's modules; never alter host settings.
    const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=="psmodulepath")),PSModulePath:path.join(path.dirname(executable),"Modules")};
    const began=performance.now();
    const result=run(executable,["-NoProfile","-NonInteractive","-File",script,"-TargetPath",resolved],{env,encoding:"utf8",timeout:5000,maxBuffer:65536,windowsHide:true,shell:false});
    if(result.error||result.status!==0||typeof result.stdout!=="string"||Buffer.byteLength(result.stdout)>65536)throw nativeUnavailable(result,performance.now()-began);
    let proof:unknown;try{proof=JSON.parse(result.stdout.replace(/^\uFEFF/,""));}catch{throw new Error("Invalid private directory ACL response");}
    validatePrivateAclSnapshot(proof,resolved);
  }else if((before.mode&0o077n)!==0n||before.uid!==BigInt(process.getuid?.()??-1))throw new Error("Private directory permissions invalid");
  const after=lstatSync(resolved,{bigint:true});
  if(after.isSymbolicLink()||after.dev!==before.dev||after.ino!==before.ino||realpathSync(resolved).toLowerCase()!==resolved.toLowerCase())throw new Error("Private directory changed during verification");
}

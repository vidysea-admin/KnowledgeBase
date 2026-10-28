import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/** Private filesystem authority is current OS identity, SYSTEM and administrators only; never an env flag. */
export function verifyCaptureAuthorityArtifact(file:string):void {
  const before=lstatSync(file);
  if(before.isSymbolicLink()||(!before.isFile()&&!before.isDirectory())||before.isFile()&&before.nlink!==1||!path.isAbsolute(file)||/^[/\\]{2}/.test(file))throw new Error("Unsafe private capture authority");
  if(process.platform==="win32") {
    const executable=path.join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
    const result=spawnSync(executable,["-NoProfile","-NonInteractive","-File",fileURLToPath(new URL("capture-authority-acl.ps1",import.meta.url)),"-TargetPath",file],{encoding:"utf8",windowsHide:true,shell:false,timeout:5000,maxBuffer:65536});
    if(result.error||result.status!==0||typeof result.stdout!=="string")throw new Error("Private capture authority ACL unavailable");
    const row=JSON.parse(result.stdout.replace(/^\uFEFF/,"")),sid=/^S-1-[0-9]+(?:-[0-9]+)+$/;
    if(!row||Object.keys(row).length!==4||typeof row.path!=="string"||row.path.toLowerCase()!==file.toLowerCase()||!sid.test(row.currentSid??"")||!sid.test(row.ownerSid??"")||!Array.isArray(row.rules)||row.rules.length<1||row.rules.length>128)throw new Error("Invalid private capture authority ACL");
    const allowed=new Set([row.currentSid,"S-1-5-18","S-1-5-32-544"]);let full=false;
    if(!allowed.has(row.ownerSid))throw new Error("Foreign capture authority owner");
    for(const rule of row.rules){
      if(!rule||Object.keys(rule).length!==3||!sid.test(rule.sid??"")||!["Allow","Deny"].includes(rule.type)||!Number.isSafeInteger(rule.rights)||rule.rights<0||rule.rights>0x7fffffff||rule.type==="Allow"&&!allowed.has(rule.sid)||rule.type==="Deny"&&rule.sid===row.currentSid&&rule.rights)throw new Error("Capture authority permits unrelated identity");
      if(rule.type==="Allow"&&rule.sid===row.currentSid&&(rule.rights&2032127)===2032127)full=true;
    }
    if(!full)throw new Error("Capture authority lacks service control");
  }else if((before.mode&0o077)!==0||before.uid!==process.getuid?.())throw new Error("Capture authority is not private");
  const after=lstatSync(file),canonical=(s:string)=>process.platform==="win32"?s.toLowerCase():s;
  if(after.isSymbolicLink()||after.dev!==before.dev||after.ino!==before.ino||canonical(realpathSync(file))!==canonical(file))throw new Error("Capture authority changed during verification");
}

import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtempSync,mkdirSync,rmSync } from "node:fs";
import { verifyPrivateDirectory } from "./private-acl.js";
const currentSid="S-1-5-21-111-222-333-444";
const proof={path:"",currentSid,ownerSid:currentSid,rules:[{sid:currentSid,type:"Allow",rights:2032127},{sid:"S-1-5-18",type:"Allow",rights:2032127}]};
// ISS-394: mirrors packages/meeting-bot record-consent/private-acl.test.ts (commit 9d05aaec) for the API host connector verifier.
test("native ACL retries exactly once on ETIMEDOUT only and fails closed otherwise",{skip:process.platform!=="win32"},()=>{
  const root=mkdtempSync(path.join(tmpdir(),"iss394-acl-retry-")),target=path.join(root,"private retry");mkdirSync(target);
  try {
    const good={status:0,stdout:JSON.stringify({...proof,path:target})};
    const timeout={status:null,error:{code:"ETIMEDOUT"},signal:"SIGTERM",stdout:"",stderr:""};
    const script=(results:unknown[])=>{const calls:number[]=[];return {calls,run:((..._args:unknown[])=>{calls.push(1);return results[Math.min(calls.length-1,results.length-1)];}) as never};};
    // timeout then success: accepted after exactly two launches
    const a=script([timeout,good]);verifyPrivateDirectory(target,a.run);assert.equal(a.calls.length,2);
    // timeout then timeout: refused as deadline, no third launch
    const b=script([timeout,timeout,good]);
    assert.throws(()=>verifyPrivateDirectory(target,b.run),(error:unknown)=>{
      const failure=error as Error&{cause:{classification:string}};
      assert.equal(failure.message,"Private Windows directory ACL unavailable");assert.equal(failure.cause.classification,"deadline");return true;
    });
    assert.equal(b.calls.length,2);
    // non-timeout error: no retry
    for(const failing of [{status:1,stdout:"",stderr:"PermissionDenied"},{status:null,error:{code:"EPERM"},stdout:"",stderr:""}]){
      const c=script([failing,good]);assert.throws(()=>verifyPrivateDirectory(target,c.run),/ACL unavailable/);assert.equal(c.calls.length,1);
    }
    // success first time: one launch
    const d=script([good]);verifyPrivateDirectory(target,d.run);assert.equal(d.calls.length,1);
  }finally {rmSync(root,{recursive:true,force:true});}
});

import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtempSync,mkdirSync,rmSync } from "node:fs";
import { validatePrivateAclSnapshot,verifyPrivateDirectory } from "./private-acl.js";
const directory=path.join(tmpdir(),"fixture private $ literal"),currentSid="S-1-5-21-111-222-333-444";
const proof={path:directory,currentSid,ownerSid:currentSid,rules:[{sid:currentSid,type:"Allow",rights:2032127},{sid:"S-1-5-18",type:"Allow",rights:2032127}]};
test("ACL semantics bind actual directory/current identity and reject broad/inherited permissions or foreign owner",()=>{
  assert.doesNotThrow(()=>validatePrivateAclSnapshot(proof,directory));
  for(const mutation of [{path:path.join(directory,"other")},{ownerSid:"S-1-5-21-9-9-9-9"},
    {rules:[...proof.rules,{sid:"S-1-1-0",type:"Allow",rights:1179785}]},
    {rules:[{sid:currentSid,type:"Allow",rights:1179785}]},
    {rules:[...proof.rules,{sid:currentSid,type:"Deny",rights:1}]},
    {rules:[{sid:currentSid,type:"Allow",rights:NaN}]},{currentSid:"not-a-sid"}])assert.throws(()=>validatePrivateAclSnapshot({...proof,...mutation},directory));
});
test("native ACL uses fixed script and literal argument path with bounded output/time, never shell text",{skip:process.platform!=="win32"},()=>{
  const root=mkdtempSync(path.join(tmpdir(),"t011-acl-")),target=path.join(root,"private $ literal");mkdirSync(target);
  try {
    const calls:unknown[][]=[];
    const run=((...args:unknown[])=>{calls.push(args);return {status:0,stdout:JSON.stringify({...proof,path:target})};}) as never;
    verifyPrivateDirectory(target,run);
    assert.equal(calls.length,1);
    const args=calls[0]![1] as string[],options=calls[0]![2] as Record<string,unknown>;
    assert.deepEqual(args.slice(0,3),["-NoProfile","-NonInteractive","-File"]);
    assert.equal(args[args.length-1],target);assert.match(args[3]!,/private-acl\.ps1$/);
    assert.equal(options.shell,false);assert.equal(options.timeout,5000);assert.equal(options.maxBuffer,65536);
    const childEnv=options.env as NodeJS.ProcessEnv;
    assert.equal(childEnv.PSModulePath,path.join(path.dirname(calls[0]![0] as string),"Modules"));
    assert.deepEqual(Object.keys(childEnv).filter(key=>key.toLowerCase()==="psmodulepath"),["PSModulePath"]);
    assert.throws(()=>verifyPrivateDirectory(target,(()=>({status:1,stdout:"operator-secret"})) as never),/ACL unavailable/);
    for(const [result,classification] of [
      [{status:null,error:{code:"ETIMEDOUT"},signal:"SIGTERM",stdout:"operator-secret",stderr:"private-target"},"deadline"],
      [{status:1,stdout:"operator-secret",stderr:"CouldNotAutoloadMatchingModule private-target"},"module-load"]
    ] as const){
      assert.throws(()=>verifyPrivateDirectory(target,(()=>result) as never),(error:unknown)=>{
        const failure=error as Error&{cause:{classification:string;deadlineMs:number}};
        assert.equal(failure.message,"Private Windows directory ACL unavailable");
        assert.equal(failure.cause.classification,classification);assert.equal(failure.cause.deadlineMs,5000);
        assert.doesNotMatch(JSON.stringify(failure.cause),/operator-secret|private-target/);return true;
      });
    }
  }finally {rmSync(root,{recursive:true,force:true});}
});
test("explicit real Windows ACL probe uses existing broker-configured private directory without mutations",{
  skip:process.platform!=="win32"||!process.env.LKB_PRIVATE_ACL_PROBE_DIR
},()=>{verifyPrivateDirectory(process.env.LKB_PRIVATE_ACL_PROBE_DIR!);});
test("native ACL retries exactly once on ETIMEDOUT only and fails closed otherwise",{skip:process.platform!=="win32"},()=>{
  const root=mkdtempSync(path.join(tmpdir(),"t011-acl-retry-")),target=path.join(root,"private retry");mkdirSync(target);
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

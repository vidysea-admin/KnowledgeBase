import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { requireAuth } from "../auth.js";
import { createCaptureReadinessRouter } from "./router.js";
import { createHostCaptureReadinessDeps } from "./host-connector.js";
import type { CaptureReadinessDeps } from "./types.js";
import { HostingService } from "../hosting/service.js";
import type { HostingJournal } from "../hosting/journal.js";
import type { HostingJournalRecord } from "../hosting/types.js";
const generation="11111111-2222-4333-8444-555555555555",evidenceHash="a".repeat(64);
const review={slot:"first",platform:"meet",generation,evidenceHash};
const headers={authorization:"Bearer synthetic-key","content-type":"application/json"};
async function fixture(deps?:CaptureReadinessDeps,scopes=["hosting","send-now"],keyId:string|undefined="operator-key") {
  const app=express();app.use(express.json());app.use(requireAuth({verify:async key=>key==="synthetic-key"?{tenantId:"tenant-a",keyId,scopes}:null}));
  app.use(createCaptureReadinessRouter(deps));app.get("/unrelated",(_req,res)=>res.json({ok:true}));
  const server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address();if(!address||typeof address==="string")throw new Error("No test listener");
  return {url:`http://127.0.0.1:${address.port}`,close:async()=>{server.closeAllConnections();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}};
}
function deps(calls:unknown[][]):CaptureReadinessDeps {
  return {
    withPermission:async(principal,permission,callback)=>{calls.push(["permission",principal.tenantId,principal.keyId,permission]);return callback();},
    list:async tenantId=>[{tenantId,...review,sessionId:"synthetic-session",hostId:"b".repeat(64),observedAt:new Date().toISOString(),mediaStartedAt:Date.now()-10,admittedAt:Date.now()-20,evidenceKind:"browser",profileDir:"private-path",secret:"never-output"} as never],
    accept:async(principal,value)=>{calls.push(["accept",principal.tenantId,principal.keyId,value]);return {id:generation,acceptedAt:new Date().toISOString(),operatorKeyId:principal.keyId,evidenceHash:value.evidenceHash,generation:value.generation};},
    revoke:async(principal,value)=>{calls.push(["revoke",principal.tenantId,principal.keyId,value]);},
  };
}
test("authenticated review uses verified actor/current roles transaction; observed metadata excludes paths and credentials",async()=>{
  const calls:unknown[][]=[],f=await fixture(deps(calls));try{
    const list=await fetch(f.url+"/meeting-bot/capture-readiness",{headers});assert.equal(list.status,200);const text=await list.text();assert.equal(text.includes("private-path"),false);assert.equal(text.includes("never-output"),false);
    const accepted=await fetch(f.url+"/meeting-bot/capture-readiness/review",{method:"POST",headers,body:JSON.stringify(review)});assert.equal(accepted.status,200);
    assert.deepEqual(calls.slice(-2),[["permission","tenant-a","operator-key","roles:manage"],["accept","tenant-a","operator-key",review]]);
    const revoke=await fetch(f.url+"/meeting-bot/capture-readiness/revoke",{method:"POST",headers,body:JSON.stringify(review)});assert.equal(revoke.status,200);
  }finally{await f.close();}
});
test("missing scopes/auth/actor and body tenant/actor injection never issue acceptance; unrelated paths stay reachable",async()=>{
  const calls:unknown[][]=[];
  for(const scopes of [[],["hosting"],["send-now"]]){
    const f=await fixture(deps(calls),scopes);try{
      assert.equal((await fetch(f.url+"/meeting-bot/capture-readiness/review",{method:"POST",headers,body:JSON.stringify(review)})).status,403);
      assert.equal((await fetch(f.url+"/unrelated",{headers})).status,200);
    }finally{await f.close();}
  }
  const f=await fixture(deps(calls));try{
    assert.equal((await fetch(f.url+"/meeting-bot/capture-readiness")).status,401);
    for(const field of ["tenantId","actorId","operatorKeyId"]){assert.equal((await fetch(f.url+"/meeting-bot/capture-readiness/review",{method:"POST",headers,body:JSON.stringify({...review,[field]:"other"})})).status,400);}
    assert.equal(calls.length,0);
  }finally{await f.close();}
  const noActor=await fixture(deps(calls),["hosting","send-now"],"");try{assert.equal((await fetch(noActor.url+"/meeting-bot/capture-readiness",{headers})).status,401);}finally{await noActor.close();}
});
test("authoritative role refusal and stale reviewer result cannot report acceptance or leak exceptions",async()=>{
  const calls:unknown[][]=[],blocked=deps(calls);blocked.withPermission=async()=>{throw Object.assign(new Error("private role details"),{status:403});};
  const denied=await fixture(blocked);try{const response=await fetch(denied.url+"/meeting-bot/capture-readiness/review",{method:"POST",headers,body:JSON.stringify(review)});assert.equal(response.status,403);assert.equal((await response.text()).includes("private"),false);assert.equal(calls.length,0);}finally{await denied.close();}
  const wrong=deps(calls);wrong.accept=async()=>({id:generation,acceptedAt:new Date().toISOString(),operatorKeyId:"other",evidenceHash,generation});
  const f=await fixture(wrong);try{assert.equal((await fetch(f.url+"/meeting-bot/capture-readiness/review",{method:"POST",headers,body:JSON.stringify(review)})).status,409);}finally{await f.close();}
});
test("host bridge is constructor-lazy and requires its authoritative transaction for mutations",async()=>{
  let transactions=0,active=true;
  const journal={transaction:async(_tenant:string,_actor:string,_at:string,callback:(rows:HostingJournalRecord[])=>Promise<{value:unknown}>)=>{transactions++;return (await callback([])).value;}} as unknown as HostingJournal;
  const hosting=new HostingService({journal,encryptionKey:Buffer.alloc(32),origins:new Set(["https://example.invalid"]),bootstrap:new Map([["tenant-a",new Set(["operator-key"])]]),keyExists:async()=>active});
  const bridge=createHostCaptureReadinessDeps({root:"relative-invalid",env:{LKB_TENANT_ID:"tenant-a"},hosting});
  const principal={tenantId:"tenant-a",keyId:"operator-key",scopes:["hosting","send-now"]};
  assert.equal(transactions,0);await assert.rejects(bridge.accept(principal,review),/transaction required/);assert.equal(transactions,0);
  await assert.rejects(bridge.withPermission(principal,"roles:manage",()=>bridge.accept(principal,review)),/Local capture host root/);assert.equal(transactions,1);
  let callback=false;
  await assert.rejects(bridge.withPermission({...principal,keyId:"viewer-key"},"roles:manage",async()=>{callback=true;}),error=>(error as {status?:number}).status===403);
  active=false;await assert.rejects(bridge.withPermission(principal,"roles:manage",async()=>{callback=true;}),error=>(error as {status?:number}).status===403);
  assert.equal(callback,false,"real current HostingService role/key guards must refuse before host mutation");
});

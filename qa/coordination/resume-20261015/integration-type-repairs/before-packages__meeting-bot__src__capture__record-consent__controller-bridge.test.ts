import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes,randomUUID } from "node:crypto";
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createRecordingPrivacyControl } from "./controller-client.js";
import { publishCapturePrivacyController } from "./controller-bridge.js";
import { readRecordConsent } from "./receipt-store.js";
type BotPrivacyDeps={list(tenant:string):Promise<Array<{privacy:string;status:string}>>;set(tenant:string,session:string,generation:string,action:"private-start"|"private-end"):Promise<string>};
// Harness-only dynamic cross-package import exercises the actual API transport without a production dependency.
const apiModule=new URL("../../../../../apps/api/src/bot-privacy/host-connector.ts",import.meta.url).href;
function deadline<T>(operation:Promise<T>,milliseconds:number,label:string):Promise<T>{
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Fixture deadline: ${label}`)),milliseconds);
    operation.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}
for(const scenario of ["known-clock","write-failure","unknown-clock"])test(`actual Node child + private API host bridge ${scenario}`,{timeout:60000},async(t)=>{
  const began=Date.now();let stage="spawn";
  const step=async<T>(name:string,operation:()=>Promise<T>)=>{stage=name;console.info(`[T011 ${scenario}] ${name} begin +${Date.now()-began}ms`);
    const result=await operation();console.info(`[T011 ${scenario}] ${name} complete +${Date.now()-began}ms`);return result;};
  const failed=scenario==="write-failure",unknown=scenario==="unknown-clock";
  const protectedRoot=process.env.LKB_PRIVATE_ACL_PROBE_DIR;
  if(protectedRoot)assert.ok(path.isAbsolute(protectedRoot)&&!/^[/\\]{2}/.test(protectedRoot),"Fixture protected root must be an explicit local absolute directory");
  const directory=mkdtempSync(path.join(protectedRoot??tmpdir(),"t011-bridge-")),recordDir=path.join(directory,"receipt"),controlDir=path.join(directory,"private");
  mkdirSync(controlDir,{mode:0o700}); // actual configured private root exists before publisher capability is exposed
  const generation=randomUUID(),token=randomBytes(32).toString("hex");
  const child=spawn(process.execPath,["--import","tsx",fileURLToPath(new URL("controller-worker.fixture.ts",import.meta.url))],{
    windowsHide:true,shell:false,stdio:["ignore","pipe","pipe","ipc"],env:{...process.env,T011_FIXTURE_DIR:recordDir,T011_FIXTURE_FAIL_WRITE:failed?"1":"0",T011_FIXTURE_NO_MEDIA_CLOCK:unknown?"1":"0",LKB_CAPTURE_CONTROL_TOKEN:token,LKB_CAPTURE_CONTROL_GENERATION:generation}});
  let stderr="";child.stderr?.on("data",bytes=>{stderr+=bytes.toString();});child.stdout?.resume();
  const exited=once(child,"exit"),client=createRecordingPrivacyControl(child,{tenantId:"owned",sessionId:"capture",generation,token});
  child.once("exit",(code,signal)=>console.info(`[T011 ${scenario}] child exit code=${code} signal=${signal} +${Date.now()-began}ms`));
  child.once("close",(code,signal)=>console.info(`[T011 ${scenario}] child close code=${code} signal=${signal} +${Date.now()-began}ms`));
  // node:test cancellation does not cancel arbitrary child/HTTP promises. Own only this fixture child.
  const abort=()=>{client.dispose();if(child.exitCode===null&&child.signalCode===null)child.kill();};
  t.signal.addEventListener("abort",abort,{once:true});
  let dispose:(()=>Promise<void>)|undefined;
  let primaryFailure:unknown;
  try{
    dispose=await step("publish native ACL and sealed readiness",()=>publishCapturePrivacyController({directory:controlDir,tenantId:"owned",sessionId:"capture",control:{generation,...client}}));
    const {createHostBotPrivacyDeps}=await import(apiModule) as {createHostBotPrivacyDeps(directory:string):BotPrivacyDeps};
    const first=createHostBotPrivacyDeps(controlDir); // fresh API connector, no inherited in-memory worker handle
    const captures=await step("list actual owner",()=>first.list("owned"));assert.equal(captures.length,1);assert.equal(captures[0]!.privacy,"public");assert.equal(captures[0]!.status,unknown?"joining":"recording");
    assert.deepEqual(await step("list foreign owner",()=>first.list("foreign")),[]);
    assert.equal(await step("reject foreign generation",()=>first.set("owned","capture",randomUUID(),"private-start")),"unavailable");
    const result=await step("persist private-start ACK",()=>first.set("owned","capture",generation,"private-start"));
    assert.equal(result,failed?"unavailable":"accepted");
    const receipt=readRecordConsent(recordDir,{tenantId:"owned",sessionId:"capture"});
    if(failed){assert.deepEqual(receipt.privateWindows,[]);assert.equal(await step("refuse retry after failed persistence",()=>first.set("owned","capture",generation,"private-start")),"unavailable");}
    else{
      assert.equal(receipt.privateWindows.length,1);assert.equal(receipt.privateWindows[0]!.tEnd,Number.MAX_SAFE_INTEGER);
      const restarted=createHostBotPrivacyDeps(controlDir);assert.equal((await step("restarted API durable private state",()=>restarted.list("owned")))[0]!.privacy,unknown?"conservative":"private");
      assert.equal(await step("persist private-end ACK",()=>restarted.set("owned","capture",generation,"private-end")),"accepted");
      const closedWindow=readRecordConsent(recordDir,{tenantId:"owned",sessionId:"capture"}).privateWindows[0]!;
      if(unknown){assert.equal(closedWindow.tEnd,Number.MAX_SAFE_INTEGER);assert.equal((await step("sticky conservative durable state",()=>restarted.list("owned")))[0]!.privacy,"conservative");}
      else assert.ok(closedWindow.tEnd<Number.MAX_SAFE_INTEGER);
    }
    const file=path.join(controlDir,"owned",readdirSync(path.join(controlDir,"owned"))[0]),descriptor=JSON.parse(readFileSync(file,"utf8"));
    const response=await step("reject forged HMAC",()=>fetch(`${descriptor.origin}/privacy`,{method:"POST",signal:AbortSignal.timeout(12000),body:JSON.stringify({version:1,tenantId:"owned",sessionId:"capture",generation,requestId:randomUUID(),at:Date.now(),action:"private-start",mac:"0".repeat(64)})}));
    assert.equal(response.status,503);
    writeFileSync(file,JSON.stringify({...descriptor,host:"foreign-host"}));await step("reject foreign descriptor host",()=>assert.rejects(first.list("owned"),/Foreign/));
    writeFileSync(file,JSON.stringify(descriptor));
    await step("revoke owned bridge",()=>deadline(dispose!(),5000,"bridge revoke"));dispose=undefined;assert.deepEqual(await step("revoked descriptor unavailable",()=>first.list("owned")),[]);
  }catch(error){primaryFailure=error;console.info(`[T011 ${scenario}] failed at ${stage} +${Date.now()-began}ms`);throw error;
  }finally{
    try{if(dispose)await step("cleanup bridge",()=>deadline(dispose!(),5000,"cleanup bridge"));}
    finally{
      client.dispose();if(child.connected)child.disconnect();
      try{await step("cleanup child graceful exit",()=>deadline(exited,2500,"child disconnect"));}
      catch(error){
        console.info(`[T011 ${scenario}] graceful close missed deadline; connected=${child.connected} exitCode=${child.exitCode} signalCode=${child.signalCode}`);
        abort();
        try{await step("cleanup owned child termination",()=>deadline(exited,2500,"owned child termination"));}
        catch(cleanupError){throw new AggregateError([...(primaryFailure===undefined?[]:[primaryFailure]),error,cleanupError],"Fixture failed and child cleanup did not settle");}
        throw primaryFailure===undefined?error:new AggregateError([primaryFailure,error],"Fixture failed and required forced child cleanup");
      }
      finally{
        t.signal.removeEventListener("abort",abort);
        // Windows emitted exit0 without ChildProcess.close in the genuine fixture.
        // Verify process termination separately and explicitly close only our own pipe streams.
        try{for(const [name,stream] of [["stdout",child.stdout],["stderr",child.stderr]] as const){
          if(stream&&!stream.closed){const pipeClosed=once(stream,"close");stream.destroy();await step(`cleanup owned ${name} pipe`,()=>deadline(pipeClosed,2500,`${name} pipe close`));}
          if(stream)assert.equal(stream.closed,true,`${name} pipe must be closed`);
        }}finally{if(child.exitCode!==null||child.signalCode!==null)rmSync(directory,{recursive:true,force:true});}
      }
    }
    assert.equal(child.exitCode,0,stderr);
    assert.equal(child.connected,false,"Fixture IPC must be disconnected");
  }
});

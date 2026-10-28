import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {mkdtempSync,mkdirSync,existsSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {decodeQueue,QUEUE_FILE} from "../job-queue/queue-store.js";

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const fixture=fileURLToPath(new URL("./session-restart.fixture.ts",import.meta.url));
const start=(root:string,mode:string)=>spawn(process.execPath,["--import","tsx",fixture,root,mode],{stdio:"ignore",windowsHide:true});
async function stop(child:ChildProcess) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("fixture termination timeout")),5000);
    child.once("exit",()=>{clearTimeout(timer);resolve();}); child.kill("SIGKILL");
  });
}
async function until(file:string,child:ChildProcess) {
  const limit=Date.now()+60000;
  while(!existsSync(file)&&Date.now()<limit) {
    if(child.exitCode!==null)throw new Error(`fixture exited ${child.exitCode}`);
    await wait(50);
  }
  assert.ok(existsSync(file),"fixture never reached checkpoint boundary");
}
for(const mode of ["committed","unacknowledged"])test(`real process restart: ${mode} checkpoint uses at-least-once replay without losing downstream output`,{timeout:150000},async()=>{
  const root=mkdtempSync(join(tmpdir(),"lkb-graph-restart-")); let child:ChildProcess|undefined;
  try{
    mkdirSync(join(root,"runs"));
    child=start(root,mode); await until(join(root,"waiting.txt"),child);
    assert.equal(existsSync(join(root,"complete.json")),false);
    await stop(child); child=undefined;
    const checkpoint=readdirSync(join(root,"runs")).find(name=>name.endsWith(".run-state.json"))!;
    const saved=JSON.parse(readFileSync(join(root,"runs",checkpoint),"utf8"));
    assert.equal(saved.state.stages.first.status,mode==="committed"?"done":"running");
    await wait(2100);
    child=start(root,"resume"); await until(join(root,"complete.json"),child);
    await stop(child); child=undefined;
    assert.equal(Number(readFileSync(join(root,"first-calls.txt"),"utf8")),mode==="committed"?1:2);
    assert.equal(readFileSync(join(root,"derived.txt"),"utf8"),"deterministic sample output");
    assert.equal(readFileSync(join(root,"consumed.txt"),"utf8"),"verified downstream sample");
    const jobs=decodeQueue(readFileSync(join(root,"queue",QUEUE_FILE),"utf8")); assert.ok(jobs.ok);
    assert.equal(jobs.value.jobs[0]!.status,"done"); assert.equal(jobs.value.jobs[0]!.attempt,2);
    assert.equal(JSON.parse(readFileSync(join(root,"complete.json"),"utf8")).generation,0);
  }finally{if(child)await stop(child);rmSync(root,{recursive:true,force:true});}
});

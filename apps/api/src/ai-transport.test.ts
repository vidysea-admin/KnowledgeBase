import {test} from "node:test";
import assert from "node:assert/strict";
import {createCliTransport, cliEnvironment, resolveCliCommand, realTransport} from "./ai-transport.js";
import {createServer} from "node:http";
const call=(source:string, stdin="")=>({kind:"cli" as const,command:process.execPath,args:["-e",source],stdin});
test("Native transport roundtrips literal Unicode stdin without shell",async()=>{
 const t=createCliTransport({timeoutMs:5000});
 const r=await t(call("let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>console.log(JSON.stringify({result:s})))","$() & | नमस्ते"));
 assert.deepEqual(r.body,{result:"$() & | नमस्ते"});
});
test("Byte input cap rejects before spawning",async()=>{
 await assert.rejects(createCliTransport({inputBytes:3})(call("process.exit(0)","éé")),/input exceeds/);
});
for (const stream of ["stdout","stderr"])
 test(stream+" overflow terminates owned process",async()=>{
  const started=Date.now();
  await assert.rejects(createCliTransport({outputBytes:100,timeoutMs:5000})(call(`process.${stream}.write('x'.repeat(1000));setInterval(()=>{},1000)`)),/output exceeds/);
  assert.ok(Date.now()-started<8000);
 });
test("Timeout terminates owned process and closes streams",async()=>{
 await assert.rejects(createCliTransport({timeoutMs:100})(call("setInterval(()=>{},1000)")),/timed out/);
});
test("Nonzero exit remains nonzero without stderr leakage",async()=>{
 const r=await createCliTransport()(call("process.stderr.write('SECRET');process.exit(7)"));
 assert.equal(r.status,7);assert.equal(r.text,"");
});
test("Child cannot inherit app credentials or retry watchdog",()=>{
 const keys=["MONGODB_URL","LKB_API_KEY","ANTHROPIC_API_KEY","CLAUDE_CODE_RETRY_WATCHDOG"];
 const previous=keys.map(k=>process.env[k]);
 try { for(const k of keys)process.env[k]="SECRET"; const env=cliEnvironment(256);
  for(const k of keys)assert.equal(env[k],undefined);
  assert.equal(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,"256");assert.equal(env.CLAUDE_CODE_MAX_TURNS,"1");assert.equal(env.CLAUDE_CODE_MAX_RETRIES,"0");
 }finally { keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i]}); }
});
test("Invalid limits fail closed",()=>{assert.throws(()=>createCliTransport({timeoutMs:0}),/Invalid/)});
test("Windows shell shims fail closed",{skip:process.platform!=="win32"},()=>{assert.throws(()=>resolveCliCommand("claude.cmd"),/shell shims/)});
import {mkdtempSync, readFileSync, rmSync, existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("Deadline kills owned descendant tree",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"lkb-cli-test-"));const marker=join(directory,"child.pid");
 try {
  const script=`const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});writeFileSync(${JSON.stringify(marker)},String(child.pid));setInterval(()=>{},1000)`;
  await assert.rejects(createCliTransport({timeoutMs:1200})(call(script)),/timed out/);
  assert.ok(existsSync(marker));const pid=Number(readFileSync(marker,'utf8'));
  let alive=true;try{process.kill(pid,0)}catch{alive=false}
  // Linux: a killed-but-unreaped orphan stays visible to kill(pid,0) as a zombie (state Z) until its reaper runs; that is dead.
  if(alive&&process.platform==='linux'){try{alive=!/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`,'utf8'))}catch{alive=false}}
  assert.equal(alive,false,"owned descendant must be gone before rejection settles");
 }finally {rmSync(directory,{recursive:true,force:true});}
});
// --- ISS-AITRANSPORT-001: cleanup must never replace the primary outcome ---
const eperm=()=>Object.assign(new Error("EPERM: operation not permitted, rmdir 'SECRET-PATH'"),{code:"EPERM"});
function cleanupProbe(failures:number){
 const dirs:string[]=[];const codes:string[]=[];let calls=0;
 const cleanup={delayMs:1,onFailure:(c:string)=>{codes.push(c)},remove:(d:string)=>{calls++;dirs.push(d);if(calls<=failures)throw eperm();rmSync(d,{recursive:true,force:true})}};
 return {cleanup,dirs,codes,get calls(){return calls}};
}
const sweep=(p:{dirs:string[]})=>{for(const d of p.dirs)rmSync(d,{recursive:true,force:true})};
test("Cleanup EPERM after deadline: caller gets the timeout error, not EPERM",async()=>{
 const p=cleanupProbe(99);
 try{
  await assert.rejects(createCliTransport({timeoutMs:300,cleanup:p.cleanup})(call("setInterval(()=>{},1000)")),(e:Error)=>/timed out/.test(e.message)&&!/EPERM|SECRET-PATH/.test(e.message));
  assert.deepEqual(p.codes,["EPERM"]);
 }finally{sweep(p)}
});
test("Cleanup throw after success: result is still returned",async()=>{
 const p=cleanupProbe(99);
 try{
  const r=await createCliTransport({cleanup:p.cleanup})(call("console.log(JSON.stringify({result:'ok'}))"));
  assert.deepEqual(r.body,{result:"ok"});
 }finally{sweep(p)}
});
test("Cleanup throw after nonzero exit: the exit status is still returned",async()=>{
 const p=cleanupProbe(99);
 try{
  const r=await createCliTransport({cleanup:p.cleanup})(call("process.exit(7)"));
  assert.equal(r.status,7);
 }finally{sweep(p)}
});
test("Cleanup throw after output overflow: overflow error wins",async()=>{
 const p=cleanupProbe(99);
 try{
  await assert.rejects(createCliTransport({outputBytes:50,timeoutMs:5000,cleanup:p.cleanup})(call("process.stdout.write('x'.repeat(1000));setInterval(()=>{},1000)")),(e:Error)=>/output exceeds/.test(e.message)&&!/EPERM/.test(e.message));
 }finally{sweep(p)}
});
test("Cleanup succeeding on the second attempt removes the directory silently",async()=>{
 const p=cleanupProbe(1);
 const r=await createCliTransport({cleanup:p.cleanup})(call("console.log(JSON.stringify({result:'ok'}))"));
 assert.deepEqual(r.body,{result:"ok"});
 assert.equal(p.calls,2);assert.deepEqual(p.codes,[]);assert.equal(existsSync(p.dirs[0]!),false);
});
test("Cleanup is attempted exactly once on success and bounded at 4 on persistent failure",async()=>{
 const ok=cleanupProbe(0);
 await createCliTransport({cleanup:ok.cleanup})(call("process.exit(0)"));
 assert.equal(ok.calls,1);assert.equal(existsSync(ok.dirs[0]!),false);
 const bad=cleanupProbe(99);
 try{
  await createCliTransport({cleanup:bad.cleanup})(call("process.exit(0)"));
  assert.equal(bad.calls,4);assert.equal(new Set(bad.dirs).size,1);
 }finally{sweep(bad)}
});
test("Cleanup reporter that throws cannot alter the outcome",async()=>{
 const p=cleanupProbe(99);
 try{
  const r=await createCliTransport({cleanup:{...p.cleanup,onFailure:()=>{throw new Error("boom")}}})(call("console.log(JSON.stringify({result:'ok'}))"));
  assert.deepEqual(r.body,{result:"ok"});
 }finally{sweep(p)}
});

test("http transport passes the AbortSignal to fetch: abort cancels a never-answered request and the server sees the close",async()=>{
 let closed=false;
 const srv=createServer((req)=>{req.on("close",()=>{closed=true});});
 await new Promise<void>((r)=>srv.listen(0,"127.0.0.1",()=>r()));
 try{
  const port=(srv.address() as {port:number}).port;
  const ctl=new AbortController();setTimeout(()=>ctl.abort(),100);
  const started=Date.now();
  await assert.rejects(realTransport({kind:"http",method:"POST",url:`http://127.0.0.1:${port}/x`,body:{a:1},signal:ctl.signal}),(e:unknown)=>(e as Error).name==="AbortError");
  assert.ok(Date.now()-started<3000);
  for(let i=0;i<50&&!closed;i++)await new Promise((r)=>setTimeout(r,20));
  assert.equal(closed,true);
 }finally{srv.closeAllConnections();srv.close()}
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {createCliTransport, cliEnvironment, resolveCliCommand} from "./ai-transport.js";
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
  let alive=true;try{process.kill(pid,0)}catch{alive=false}assert.equal(alive,false,"owned descendant must be gone before rejection settles");
 }finally {rmSync(directory,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {approvalGate,physicalGate,verifyPlan,main} from './run.mjs';
test('launcher pending approval refuses without credential access or I/O',()=>{
 for(const a of [{approvalState:'awaiting_human'}, {approvalState:'approved',humanApprovalReference:''}, {approvalState:'approved',humanApprovalReference:'synthetic test',approvedAt:'bad',expiresAt:'bad'}])assert.throws(()=>approvalGate(a),/awaiting-human/);
 const now=Date.now();assert.doesNotThrow(()=>approvalGate({approvalState:'approved',humanApprovalReference:'SYNTHETIC UNIT FIXTURE',approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+1000).toISOString()},now));
});
test('launcher physical gate enforces twelve requests and each output input endpoint model cap',()=>{
 const config={limits:{maxAttempts:12,outputLimit:768}},u={calls:0,bytes:0};
 const req=()=>({method:'POST',body:JSON.stringify({model:'glm-5.3-flash',stream:false,messages:[],options:{num_predict:768}})});
 for(let i=0;i<12;i++)physicalGate('https://ollama.com/api/chat',req(),config,u);
 assert.throws(()=>physicalGate('https://ollama.com/api/chat',req(),config,u));assert.equal(u.calls,12);
 for(const url of ['https://other.invalid','https://ollama.com/api/chat/'])assert.throws(()=>physicalGate(url,req(),config,{calls:0,bytes:0}));
 const bad=req();bad.body=JSON.stringify({model:'glm-5.3-flash',stream:false,options:{num_predict:769}});assert.throws(()=>physicalGate('https://ollama.com/api/chat',bad,config,{calls:0,bytes:0}));
 const big=req();big.body=JSON.stringify({model:'glm-5.3-flash',stream:false,messages:[{content:'x'.repeat(65536)}],options:{num_predict:768}});assert.throws(()=>physicalGate('https://ollama.com/api/chat',big,config,{calls:0,bytes:0}));
 assert.throws(()=>physicalGate('https://ollama.com/api/chat',req(),config,{calls:0,bytes:327680}));
});
test('launcher offline preflight authenticates current pins and has zero provider and credential operations',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network-forbidden');};
 try{const x=await main({offline:true});assert.equal(x.status,'OFFLINE_LAUNCH_PREFLIGHT_READY');assert.equal(x.providerCalls,0);assert.equal(x.credentialReads,0);assert.equal(x.awaitingHumanBlocks,true);assert.equal(calls,0);assert.ok((await verifyPlan()).plan.files.length>100);}finally{globalThis.fetch=originalFetch;}
});
test('launcher production invocation pending authority refuses before cold imports or fetch',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network-forbidden');};
 const dir=await mkdtemp(join(tmpdir(),'complete-launcher-synthetic-'));
 try{for(const name of ['launch-pins.json','config.pending.json'])await writeFile(join(dir,name),await readFile(new URL(name,import.meta.url)));await writeFile(join(dir,'authorization.approved.json'),JSON.stringify({approvalState:'awaiting_human',syntheticFixture:true}));await assert.rejects(main({dir}),/awaiting-human/);assert.equal(calls,0);}finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});

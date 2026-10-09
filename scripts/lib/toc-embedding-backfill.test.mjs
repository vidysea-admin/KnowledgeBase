import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {requireEmbeddingTarget,WORK_DB,LOCAL_MODEL,MODEL_DIGEST,PACKET_ID,PREFIX_POLICY,documentHash,preflightChunks,validateStoredRow,openReceipt,executeEmbeddingPlan,withLocalEmbeddingHttp} from './toc-embedding-backfill.mjs';
const planned={_id:'row',sourceRef:'session',chunkIndex:0,baseChunkIndex:0,turnRefs:['turn'],sourceSpans:[],rawTextSha256:'raw',embeddingInputSha256:'input',embeddingModelDigest:MODEL_DIGEST,embeddingPolicy:PREFIX_POLICY,sourcePacketId:PACKET_ID,text:'original'};
const stored={...planned,tenantId:'toc',dims:768,embeddingModel:'nomic-embed-text',vector:Array(768).fill(0.1)};delete stored.text;
const plan={binding:{packetId:PACKET_ID,modelDigest:MODEL_DIGEST},rows:[planned],documents:{}};
function fixture(initial=[],foreign=false){const rows=structuredClone(initial);const own={countDocuments:async()=>rows.length,find:(query={})=>({toArray:async()=>rows.filter(r=>!query._id||query._id.$in.includes(r._id))}),insertMany:async docs=>{rows.push(...docs.map(d=>({...d,tenantId:'toc'})));return{insertedCount:docs.length};}};
 return {rows,scoped:()=>tenant=>{assert.equal(tenant,'toc');return own;},db:{databaseName:WORK_DB,collection:()=>({countDocuments:async()=>rows.length+(foreign?1:0)})}};}
test('exact isolated bindings only; localhost defaults and shared Ollama refuse',()=>{
 const env={MONGODB_URL:'mongodb://127.0.0.1:27019',MONGODB_DB:WORK_DB,MONGO_WORK_DB:WORK_DB,OLLAMA_BASE_URL:LOCAL_MODEL};assert.ok(requireEmbeddingTarget(env));
 for(const delta of [{OLLAMA_BASE_URL:'http://127.0.0.1:11434'},{MONGODB_DB:'lkb'},{MONGODB_URL:'mongodb://localhost:27017'}])assert.throws(()=>requireEmbeddingTarget({...env,...delta}));
});
test('initial existing or foreign presence refuse before reading foreign content',async()=>{
 for(const f of [fixture([stored]),fixture([],true)])await assert.rejects(preflightChunks(plan,{...f,receipt:null,loadSpool:()=>[]}));
});
test('resume requires exact stored row and immutable spool/source/model/vector hashes',async()=>{
 const receipt={binding:plan.binding,intents:[{rows:[{id:'row',sha256:documentHash(stored)}]}]};
 assert.equal((await preflightChunks(plan,{...fixture([stored]),receipt,loadSpool:()=>[stored]})).size,1);
 for(const bad of [{...stored,vector:Array(768).fill(0.2)},{...stored,embeddingModelDigest:'wrong'},{...stored,turnRefs:['foreign']}])await assert.rejects(preflightChunks(plan,{...fixture([bad]),receipt,loadSpool:()=>[stored]}));
 assert.throws(()=>validateStoredRow({...stored,vector:Array(768).fill(0)},planned));
 assert.throws(()=>validateStoredRow({...stored,vector:Array(3072).fill(1)},planned));
 assert.throws(()=>validateStoredRow({...stored,tenantId:'other'},planned));
});
test('durable intent precedes insert and confirmed partial can resume without re-embedding',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lkb-embedding-test-')),path=join(dir,'receipt.json');const f=fixture();let embeds=0;
 const journal=openReceipt(path,plan);const options={...f,journal,embed:async job=>{embeds++;assert.equal(job.purpose,'document');return{provider:'ollama',model:'nomic-embed-text',dims:768,vectors:[stored.vector]};},prepareChunkDocuments:()=>[{tenantId:'toc',dims:768,embeddingModel:'nomic-embed-text',vector:stored.vector}],assertModelBinding:async()=>{},assertSources:async()=>{},assertBatch:async()=>{},availableBytes:()=>100*1024*1024};
 try{const result=await executeEmbeddingPlan(plan,options);assert.equal(result.status,'complete-source-embeddings');assert.equal(result.intents.length,1);assert.equal(f.rows.length,1);journal.close();
  const sha=(await import('node:crypto')).createHash('sha256').update(readFileSync(path)).digest('hex');const resumed=openReceipt(path,plan,sha);
  await executeEmbeddingPlan(plan,{...options,journal:resumed});assert.equal(embeds,1);resumed.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('disk reserve refuses before provider or insert; foreign network refuses locally',async()=>{
 const f=fixture();let called=false;await assert.rejects(executeEmbeddingPlan(plan,{...f,journal:{storagePath:'.'},availableBytes:()=>1,embed:async()=>{called=true;}}));assert.equal(called,false);
 await assert.rejects(withLocalEmbeddingHttp(()=>fetch('https://example.com'))); // guarded before network
});
test('receipt authority and tampered spool refuse; source/model binding cannot change',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lkb-embedding-test-')),path=join(dir,'r.json');
 try{const j=openReceipt(path,plan);const intent=j.stage([stored]);writeFileSync(join(path+'.spool',intent.file),'[]');assert.throws(()=>j.loadSpool(intent));j.close();assert.throws(()=>openReceipt(path,plan,'0'.repeat(64)));}finally{rmSync(dir,{recursive:true,force:true});}
});

test('local-only transport overrides caller redirects and never follows a local307 body',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),LOCAL_MODEL+'/api/embed');assert.equal(init.redirect,'error');throw new TypeError('redirect refused');};
 try{await assert.rejects(withLocalEmbeddingHttp(()=>fetch(LOCAL_MODEL+'/api/embed',{method:'POST',body:'public synthetic payload',redirect:'follow'})));assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

test('native fetch rejects307 without forwarding the synthetic payload to redirected listener',async()=>{
 const {createServer}=await import('node:http');const nativeFetch=globalThis.fetch;let forwarded=0;
 const sink=createServer((_req,res)=>{forwarded++;res.end('unexpected');});
 const origin=createServer((_req,res)=>{res.writeHead(307,{location:`http://127.0.0.1:${sink.address().port}/sink`});res.end();});
 const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await listen(sink);await listen(origin);
 // Map the approved endpoint to our disposable local redirect fixture; use native fetch semantics.
 globalThis.fetch=(_input,init)=>nativeFetch(`http://127.0.0.1:${origin.address().port}/embed`,init);
 try{await assert.rejects(withLocalEmbeddingHttp(()=>fetch(LOCAL_MODEL+'/api/embed',{method:'POST',body:'public synthetic redirect test',redirect:'follow'})));assert.equal(forwarded,0);}
 finally{globalThis.fetch=nativeFetch;await Promise.all([new Promise(resolve=>origin.close(resolve)),new Promise(resolve=>sink.close(resolve))]);}
});

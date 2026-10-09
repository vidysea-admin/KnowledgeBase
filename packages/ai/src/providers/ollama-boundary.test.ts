import {test} from "node:test";
import assert from "node:assert/strict";
import {OllamaProvider} from "./ollama.js";
import {fakeTransport} from "../testUtils.js";
test("Embedding uses actual CPU option and refuses silent truncation",async()=>{
 const t=fakeTransport({status:200,body:{embeddings:[[1,2],[2,1]]}});
 const p=new OllamaProvider(t,{baseUrl:"http://127.0.0.1:11435"});
 const result=await p.embed({kind:"embedding",texts:["public a","public b"],purpose:"document"});
 assert.equal(result.dims,2); assert.deepEqual(t.calls[0]!.body,{model:"nomic-embed-text",input:["public a","public b"],truncate:false,options:{num_thread:1}});
});
for (const embeddings of [[[NaN],[1]],[[Infinity],[1]],[[1],[1,2]],[[1]]])
 test("Embedding refuses corrupt batch "+JSON.stringify(embeddings),async()=>{
  await assert.rejects(new OllamaProvider(fakeTransport({status:200,body:{embeddings}})).embed({kind:"embedding",texts:["a","b"]}));
 });


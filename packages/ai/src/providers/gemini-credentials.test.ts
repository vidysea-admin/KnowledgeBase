import {test} from "node:test";
import assert from "node:assert/strict";
import {GeminiProvider} from "./gemini.js";
import {fakeTransport} from "../testUtils.js";
const job={kind:"summary",messages:[{role:"user" as const,content:"PRIVATE_SENTINEL"}]};
for(const key of [undefined,null,""," \t\n"]){
 for(const kind of ["complete","embed"])
  test("Missing Gemini key fails locally "+kind+" "+JSON.stringify(key),async()=>{
   const transport=fakeTransport();const provider=new GeminiProvider(transport,{apiKey:key as unknown as string});
   await assert.rejects(kind==="complete"?provider.complete(job):provider.embed({kind:"embedding",texts:["PRIVATE_SENTINEL"]}),e=> e instanceof Error&&e.message==="gemini credentials unavailable");
   assert.equal(transport.calls.length,0);
  });
}
test("Missing key permits genuinely zero-network empty embedding and model manifest",async()=>{
 const transport=fakeTransport();const provider=new GeminiProvider(transport,{apiKey:""});
 assert.deepEqual((await provider.embed({kind:"embedding",texts:[]})).vectors,[]);
 assert.ok((await provider.listModels()).length);assert.equal(transport.calls.length,0);
});
test("Configured key preserves complete and embedding request behavior",async()=>{
 const complete=fakeTransport({status:200,body:{candidates:[{content:{parts:[{text:"OK"}]}}]}});
 assert.equal((await new GeminiProvider(complete,{apiKey:"valid-fixture"}).complete(job)).text,"OK");
 assert.ok(complete.calls[0]!.url!.endsWith("key=valid-fixture"));
 const embed=fakeTransport({status:200,body:{embeddings:[{values:[1,2]}]}});
 assert.equal((await new GeminiProvider(embed,{apiKey:"valid-fixture"}).embed({kind:"embedding",texts:["public"],purpose:"query"})).dims,2);
 assert.ok(embed.calls[0]!.url!.endsWith("key=valid-fixture"));
});
import {embed,complete} from "../router.js";
import {OllamaProvider} from "./ollama.js";
import {ClaudeCodeProvider} from "./claude-code.js";
test("Actual missing-key adapter fallback records failure then success without Gemini HTTP",async()=>{
 const noHttp=fakeTransport();const gemini=new GeminiProvider(noHttp,{apiKey:""});
 const ledger: Array<{provider?:string;status:string;error?:string}>=[];
 const write=async(entry: {provider?:string;status:string;error?:string})=>{ledger.push(entry)};
 const local=new OllamaProvider(fakeTransport({status:200,body:{embeddings:[[1,2]]}}));
 const result=await embed("embedding",{kind:"embedding",texts:["public"]},{chains:{embedding:["gemini","ollama"]},providers:{gemini,ollama:local},tenantId:"toc",write});
 assert.equal(result.provider,"ollama");assert.equal(noHttp.calls.length,0);
 assert.deepEqual(ledger.map(x=>[x.provider,x.status]),[["gemini","failed"],["ollama","done"]]);assert.equal(ledger[0]!.error,"gemini credentials unavailable");
 ledger.length=0;
 const claude=new ClaudeCodeProvider(fakeTransport({status:0,body:{result:"public"}}));
 assert.equal((await complete("ask",job,{chains:{ask:["gemini","claude-code"]},providers:{gemini,"claude-code":claude},tenantId:"toc",write})).provider,"claude-code");
 assert.equal(noHttp.calls.length,0);assert.deepEqual(ledger.map(x=>[x.provider,x.status]),[["gemini","failed"],["claude-code","done"]]);
});

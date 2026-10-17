import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHttpTransport } from '../../apps/api/src/ai-transport.ts';
import { OllamaCloudProvider } from '../../packages/ai/src/providers/ollama-cloud.ts';
import { createOutputVerifier } from '../../apps/api/src/composition/integrations/answers.ts';
test('independent credential redirect and streamed byte boundaries', async () => {
 let count=0,cancelled=false;
 const transport=createHttpTransport({timeoutMs:500,fetch:async (_url,opts)=>{count++;assert.equal(opts?.redirect,'manual');assert.equal((opts?.headers as any).authorization,'Bearer probe-secret');return new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:307,headers:{location:'https://evil.invalid/probe-secret'}});}});
 await assert.rejects(new OllamaCloudProvider(transport,{apiKey:'probe-secret'}).complete({kind:'answer',messages:[]}),e=>!String(e).includes('probe-secret'));
 assert.equal(count,1);assert.equal(cancelled,true);
 const bounded=createHttpTransport({outputBytes:4,timeoutMs:500,fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('ééx'));c.close();}}),{headers:{'content-length':'1'}})});
 await assert.rejects(bounded({kind:'http',url:'https://ollama.com/api/chat'}),/HTTP response exceeds byte limit/);
});
test('independent verifier refuses generator fallback and invalid tenant',async()=>{
 let primary=0,verifier=0;
 const run=createOutputVerifier({chains:{'output-verifier':['ollama-cloud']},providers:{'ollama-cloud':{name:'ollama-cloud',complete:async()=>{primary++;throw Error('generator');},listModels:async()=>[]},'ollama-cloud-verifier':{name:'ollama-cloud-verifier',complete:async()=>{verifier++;throw Error('unavailable');},listModels:async()=>[]}},jobWrite:async()=>{}} as any);
 await assert.rejects(run('tenant-a',{kind:'answer',messages:[]}));assert.equal(primary,0);assert.equal(verifier,1);
 await assert.rejects(async()=>run('',{kind:'answer',messages:[]}));assert.equal(verifier,1);
});

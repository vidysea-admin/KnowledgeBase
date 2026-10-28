import assert from 'node:assert/strict';
import {createServer} from '../../../apps/api/src/server.js';
import {requireAuth} from '../../../apps/api/src/auth.js';
import {buildTestDeps,fakeAskDeps,fakeKeyStore} from '../../../apps/api/src/fixtures.js';
import {createSourceRequestDepsFor} from '../../../apps/api/src/ask/source-context.js';
import {unpackContext} from '../../../packages/ask/src/bounded-refine.js';

const owners=['A','B'];
const nodes=Object.fromEntries(owners.map(o=>[o,{node_id:`tenant:${o}/session:${o}-s`,title:'Aid October',level:'session',summary:'UNTRUSTED_SUMMARY_POISON'.repeat(5000),evidence:{sessionRef:`${o}-s`},children:[]}]));
const texts=Object.fromEntries(owners.map(o=>[o,`Aid opens in October for ${o}.`]));
const queries=Object.fromEntries(owners.map(o=>[o,`Aid October ${o}`]));
const filters:any[]=[],dispatches:any[]=[],jobs:any[]=[],writes:any[]=[],embeds:string[]=[],factories:string[]=[];
const db:any={collection:(name:string)=>({find:(filter:any)=>{
  assert.ok(owners.includes(filter.tenantId));filters.push({name,filter});const o=filter.tenantId;
  const row=name==='turns'?{_id:`${o}-t`,tenantId:o,sessionId:`${o}-s`,speakerRef:'spk:0',tStart:1,tEnd:4,text:texts[o]}:
    {_id:`${o}-c`,tenantId:o,sourceRef:`${o}-s`,turnRefs:[`${o}-t`],chunkIndex:0,vector:[1,0],dims:2,embeddingModel:'offline'};
  return {toArray:async()=>[row]};
}})};
let releaseA!:()=>void,arrivedA!:()=>void;
const gateA=new Promise<void>(resolve=>{releaseA=resolve;});const startedA=new Promise<void>(resolve=>{arrivedA=resolve;});
const complete=(json:any)=>({text:JSON.stringify(json),json,provider:'offline',model:'fixture',costUsd:0,usage:{inputTokens:1,outputTokens:1}});
const factory=createSourceRequestDepsFor({db,write:async j=>{jobs.push(j);},
  treeSearchFn:(tree,ids)=>tree.children.filter(n=>ids.includes(n.node_id)),
  embed:async job=>{embeds.push(job.texts[0]!);return {vectors:[[1,0]],dims:2,provider:'offline',model:'fixture'};},
  dispatch:async(job,tenant)=>{
    dispatches.push({tenant,kind:job.kind});assert.ok(!JSON.stringify(job.messages).includes('UNTRUSTED_SUMMARY_POISON'));
    if(job.kind==='ask.select_nodes'){if(tenant==='A'){arrivedA();await gateA;}return complete({node_ids:[nodes[tenant].node_id]});}
    if(job.kind==='evaluator')return complete({score:0.9,reason:'literal October aid source'});
    if(job.kind==='ask.answer_grounding')return complete({decisions:[{id:'sentence-0',supported:true,answersQuery:true}]});
    const strips=unpackContext(JSON.parse(job.messages[1]!.content).context);
    assert.equal(strips[0]!.text,texts[tenant]);
    return complete({sentences:[{text:texts[tenant],sourceIds:[strips[0]!.sourceId]}]});
  }});
const deps=buildTestDeps({keyStore:fakeKeyStore(Object.fromEntries(owners.map(o=>[o,{tenantId:o,scopes:['compete']}])))});
deps.ask.tree={load:async tenant=>({node_id:`tenant:${tenant}`,title:'Aid',level:'tenant',summary:'UNTRUSTED_SUMMARY_POISON',children:[nodes[tenant]]}) as any};
deps.ask.askDeps={...fakeAskDeps(),complete:async()=>{throw new Error('shared completion rescue');}};
deps.ask.extraCandidateArmsFor=()=>{throw new Error('shared arms rescue');};
deps.ask.requestDepsFor=(async(tenant:string)=>{factories.push(tenant);await Promise.resolve();return {...factory(tenant),tenantId:'OVERRIDE'};}) as never;
deps.evalRuns={create:async(tenant,doc)=>{writes.push({tenant,doc});},recordScore:async()=>false};
const app=createServer(deps);const mount=(app as any).router.stack.find((l:any)=>l.handle?.stack?.some((r:any)=>r.route?.path==='/compete/start'));
assert.ok(mount);const route=mount.handle.stack.find((l:any)=>l.route?.path==='/compete/start').route;
async function run(owner:string){
  const req:any={body:{question:queries[owner],counsellor:{name:'Fixture'},tenantId:'OVERRIDE'},query:{tenantId:'OVERRIDE'},header:(name:string)=>name==='authorization'?`Bearer ${owner}`:'OVERRIDE'};
  let status=200,body:any;const res:any={status(s:number){status=s;return this;},json(x:any){body=x;return this;}};
  await requireAuth(deps.keyStore)(req,res,()=>{});
  for(const l of route.stack){await l.handle(req,res,()=>{});if(body!==undefined)break;}
  assert.equal(status,200);assert.equal(body.aiAnswer.text,texts[owner]);
  assert.equal(body.aiAnswer.sources.internal[0].evidence.sourceQuotes[0].turnId,`${owner}-t`);
  assert.equal(body.aiAnswer.sources.internal[0].evidence.sourceQuotes[0].quote,texts[owner]);
  assert.ok(body.aiAnswer.scored.length);const saved=writes.find(w=>w.tenant===owner);
  assert.deepEqual(saved.doc.aiAnswer,body.aiAnswer);assert.equal(saved.doc.credibility,'internal');return body;
}
const a=run('A');await startedA;await run('B');assert.deepEqual(writes.map(w=>w.tenant),['B']);releaseA();await a;
assert.deepEqual(writes.map(w=>w.tenant),['B','A']);assert.deepEqual(factories,['A','B']);
assert.deepEqual(embeds.sort(),Object.values(queries).sort());
assert.ok(jobs.length&&jobs.every(j=>owners.includes(j.tenantId)));
for(const o of owners){assert.ok(jobs.some(j=>j.tenantId===o));assert.equal(dispatches.filter(d=>d.tenant===o&&d.kind==='ask.answer_grounding').length,1);}
assert.ok(filters.length&&filters.every(f=>owners.includes(f.filter.tenantId)));
console.log(JSON.stringify({actualFactory:'createSourceRequestDepsFor',groundedOwnerPositives:2,completionOrder:writes.map(w=>w.tenant),factoryTenants:factories,perQueryEmbeddings:embeds,verifiedFinalTenantOverride:true,sourceReads:filters.length,auditJobs:jobs.length}));
console.log('Independent literal grounding/concurrent request-local tenant/query isolation 2/2 passed; offline mounted handlers.');

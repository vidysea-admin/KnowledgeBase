import assert from 'node:assert/strict';
import {createServer} from '../../../apps/api/src/server.js';
import {requireAuth} from '../../../apps/api/src/auth.js';
import {buildTestDeps,fakeAskDeps,fakeKeyStore} from '../../../apps/api/src/fixtures.js';

const cases:[string,()=>unknown][]=[
  ['null',()=>null],['undefined',()=>undefined],['empty-object',()=>({})],
  ['array',()=>[]],['promised-null',async()=>null],
  ['throws',()=>{throw new Error('SECRET /private');}],
  ['rejects',()=>Promise.reject(new Error('SECRET /private'))],
  ['missing-source-context',()=>fakeAskDeps()],
  ['nonfunction-hydrate',()=>({...fakeAskDeps(),sourceContext:{hydrate:'SECRET'}})],
  ['nonfunction-arms',()=>({...fakeAskDeps(),sourceContext:{hydrate:async()=>{throw new Error('unexpected');}},extraCandidateArmsFn:{}})],
];
for(const [name,result] of cases){
  let factories=0,completions=0,evalWrites=0;
  const deps=buildTestDeps({keyStore:fakeKeyStore({'owner':{tenantId:'tenant-a',scopes:['compete']}})});
  deps.ask.askDeps={...fakeAskDeps(),complete:async()=>{completions++;throw new Error('legacy rescue forbidden');}};
  deps.ask.requestDepsFor=((tenant:string)=>{assert.equal(tenant,'tenant-a');factories++;return result();}) as never;
  deps.evalRuns={create:async()=>{evalWrites++;},recordScore:async()=>false};
  const app=createServer(deps);
  const mount=(app as any).router.stack.find((l:any)=>l.handle?.stack?.some((x:any)=>x.route?.path==='/compete/start'));
  assert.ok(mount); const route=mount.handle.stack.find((x:any)=>x.route?.path==='/compete/start').route;
  const req:any={body:{question:'topic one',counsellor:{name:'Fixture'},tenantId:'foreign'},query:{tenantId:'foreign'},header:()=> 'Bearer owner'};
  let status=200,body:any;
  const res:any={status(s:number){status=s;return this;},json(x:unknown){body=x;return this;}};
  await requireAuth(deps.keyStore)(req,res,()=>{});
  for(const l of route.stack){await l.handle(req,res,()=>{});if(body!==undefined)break;}
  assert.equal(status,503,name);assert.equal(factories,1,name);assert.equal(completions,0,name);assert.equal(evalWrites,0,name);
  assert.deepEqual(body,{error:'source_context_unavailable',message:'Compete could not validate source evidence'});
  assert.ok(!JSON.stringify(body).includes('SECRET'));
  console.log(JSON.stringify({name,status,factories,legacyCompletions:completions,evalWrites}));
}
console.log('Independent malformed/thrown/rejected factory refusals 10/10; no shared rescue or eval persistence.');

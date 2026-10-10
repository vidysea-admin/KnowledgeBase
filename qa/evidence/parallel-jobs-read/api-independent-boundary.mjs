import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {requireAuth} from '../../../apps/api/src/auth.ts';
import {createJobsRouter, projectJobSummary} from '../../../apps/api/src/jobs/router.ts';
import {listJobs,jobs} from '../../../packages/db/src/collections/jobs.ts';
import {createMongoJobsReadDeps} from '../../../apps/api/src/jobs/store.ts';

const express=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('express');
const row={_id:'boundary',kind:'provider-call',status:'done',createdAt:'2026-10-09T12:00:00Z'};
let calls=0;
const app=express(); app.use(express.json());
app.use(requireAuth({verify:async key=>key==='owner'?{tenantId:'A',scopes:['jobs']}:key==='sessions'?{tenantId:'A',scopes:['sessions']}:null}));
app.use(createJobsRouter({listJobs:async(tenant,limit)=>{
  assert.equal(tenant,'A'); calls++;
  return {jobs:[{...row,tenantId:'B',request:'SECRET',response:'SECRET',error:'SECRET',claimToken:'SECRET',leaseUntilMs:1,credentials:'SECRET',paths:'SECRET',model:'SECRET',costUsd:9,maxCost:99}],limit,truncated:false};
}}));
const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
const url=`http://127.0.0.1:${server.address().port}/jobs`;
try{
  for(const [key,status] of [['revoked',401],['sessions',403]]){
    const response=await fetch(url,{headers:{authorization:`Bearer ${key}`}});
    assert.equal(response.status,status);
  }
  assert.equal(calls,0);
  for(const query of ['limit=%EF%BC%91','limit=%D9%A1','limit=%09%31','limit%5B0%5D=1','tenantId%5Bx%5D=B','limit=100&limit=100']){
    const response=await fetch(`${url}?${query}`,{headers:{authorization:'Bearer owner'}});
    assert.equal(response.status,400,query);
    assert.deepEqual(await response.json(),{error:'invalid_jobs_query',message:'Invalid jobs query'});
  }
  assert.equal(calls,0);
  const response=await fetch(url,{headers:{authorization:'Bearer owner','x-tenant-id':'B'}});
  assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(await response.json(),{jobs:[row],limit:50,truncated:false}); assert.equal(calls,1);
  console.log('Independent auth/query/whitelist/private-cache boundary assertions passed.');
}finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}

const lower={...row,createdAt:'2026-10-09t12:00:00z',updatedAt:'2026-10-09t12:01:00z'};
const observed=[];
const cursor={project:()=>cursor,sort:()=>cursor,limit:()=>cursor,toArray:async()=>[lower]};
const db={collection:name=>({find:filter=>{observed.push({name,filter});return cursor;}})};
const metadata=await listJobs('A',1,db);
assert.deepEqual(observed,[{name:'jobs',filter:{tenantId:'A'}}]);
assert.deepEqual(metadata,{jobs:[lower],limit:1,truncated:false});
try{
  assert.deepEqual(projectJobSummary(metadata.jobs[0]),lower,'API must preserve valid date-time values accepted by actual DB metadata reader');
  console.log('Independent actual DB metadata -> API lowercase date-time preservation passed.');
}catch(error){
  console.error('Independent actual DB metadata -> API lowercase date-time preservation FAILED:',error.message);
  process.exitCode=1;
}
const lowerApp=express();
lowerApp.use(requireAuth({verify:async key=>key==='owner'?{tenantId:'A',scopes:['jobs']}:null}));
lowerApp.use(createJobsRouter(createMongoJobsReadDeps(tenant=>jobs(tenant,db))));
const lowerServer=lowerApp.listen(0,'127.0.0.1'); await once(lowerServer,'listening');
try{
  const lowerResponse=await fetch(`http://127.0.0.1:${lowerServer.address().port}/jobs?limit=1`,{headers:{authorization:'Bearer owner'}});
  assert.equal(lowerResponse.status,200,'Actual accessor -> adapter -> HTTP must accept lowercase timestamp casing');
  assert.deepEqual(await lowerResponse.json(),{jobs:[lower],limit:1,truncated:false});
  assert.deepEqual(observed,[{name:'jobs',filter:{tenantId:'A'}},{name:'jobs',filter:{tenantId:'A'}}]);
  console.log('Independent actual accessor -> adapter -> HTTP lowercase createdAt/updatedAt preservation passed.');
}catch(error){
  console.error('Independent actual accessor -> adapter -> HTTP lowercase date-time preservation FAILED:',error.message);
  process.exitCode=1;
}finally{await new Promise((resolve,reject)=>lowerServer.close(error=>error?reject(error):resolve()));}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classifyStageFailure,runNodeScript} from './stage-process.mjs';
import {createSessionHandlers} from './graph-finalize.mjs';

test('original ISS-W050-001 boundary: transient child/provider failures reach stable retry codes',()=>{
  const cases=[
    [{code:'EBUSY'},'io-error'],[{code:'ETIMEDOUT'},'provider-timeout'],[{status:503},'provider-5xx'],
    [{status:429},'rate-limited'],[{diagnostic:'MongoServerSelectionError'},'db-unavailable'],
    [{diagnostic:'HTTP 503'},'provider-5xx'],[{diagnostic:'HTTP 429'},'rate-limited'],
    [{diagnostic:'GeminiFreeTierQuotaError HTTP 429'},'provider-not-billed'],
    [{diagnostic:'Error: EBUSY: resource busy or locked, open turns.json'},'io-error'],
    [{diagnostic:'EMFILE: too many open files'},'io-error'],
    [{diagnostic:'ENOENT: no such file'},'stage-failed'],
    [new Error('unknown error with private text'),'stage-failed'],
  ];
  for(const [error,expected] of cases)assert.equal(classifyStageFailure(error),expected);
});
test('real child stderr classification refuses safely without returning diagnostic text',async()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-stage-'));
  try{
    writeFileSync(join(root,'failure.mjs'),'process.stderr.write("HTTP 429 synthetic-secret-marker\\n"); process.exit(1);');
    await assert.rejects(runNodeScript(root,'failure.mjs',[],{}),error=>{
      assert.equal(error.code,'rate-limited'); assert.equal(error.message,'Pipeline stage failed');
      assert.equal(error.diagnostic,undefined); assert.equal(JSON.stringify(error).includes('synthetic-secret-marker'),false);return true;
    });
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('real child stderr naming a file lock reaches the io-error retry code with no diagnostic leak',async()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-stage-io-'));
  try{
    writeFileSync(join(root,'lock.mjs'),'process.stderr.write("Error: EBUSY: resource busy private-marker\\n"); process.exit(1);');
    await assert.rejects(runNodeScript(root,'lock.mjs',[],{}),error=>{
      assert.equal(error.code,'io-error'); assert.equal(JSON.stringify(error).includes('private-marker'),false);return true;
    });
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('real child timeout and cancellation terminate the direct owned process and settle',async()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-stage-stop-'));
  try{
    writeFileSync(join(root,'wait.mjs'),'setInterval(()=>undefined,1000);');
    await assert.rejects(runNodeScript(root,'wait.mjs',[],{LKB_PIPELINE_STAGE_TIMEOUT_MS:'100'}),error=>error.code==='provider-timeout');
    const abort=new AbortController(), pending=runNodeScript(root,'wait.mjs',[],{}, {signal:abort.signal});
    setTimeout(()=>abort.abort(),100);
    await assert.rejects(pending,error=>error.code==='cancelled');
    await assert.rejects(runNodeScript(root,'wait.mjs',[],{LKB_PIPELINE_STAGE_TIMEOUT_MS:'0'}),error=>error.code==='stage-failed');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('transcript checkpoint requires sanctioned validation, not just child success or a nonempty filename',async()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-stage-validation-'));
  try {
    const dir=join(root,'data','toc-migrated','session');mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'source.json'),JSON.stringify({tenantId:'tenant-a'}));
    const calls=[];
    const handlers=createSessionHandlers({root,id:'session',env:{},runScript:async(_root,script)=>{
      calls.push(script);if(script.endsWith('validate-session.mjs'))throw new Error('failed transcript validation');
    }});
    const result=await handlers.transcript({tenantId:'tenant-a',runKey:'session'});
    assert.deepEqual(result,{kind:'fail',code:'stage-failed'});
    assert.deepEqual(calls,['scripts/transcribe-long-session.mjs','scripts/webinar/validate/validate-session.mjs']);
    calls.length=0;
    assert.deepEqual(await handlers.index({tenantId:'foreign',runKey:'session'}),{kind:'fail',code:'stage-failed'});
    assert.deepEqual(calls,[],'foreign source refuses before the indexing child can write');
  } finally {rmSync(root,{recursive:true,force:true});}
});

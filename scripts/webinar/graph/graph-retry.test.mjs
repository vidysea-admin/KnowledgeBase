import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runSessionGraph,runFreshSessionGraph} from './graph-finalize.mjs';

test('wired transient failure retries only the failed stage, commits a bound marker, and preserves completed progress',async()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-graph-retry-'));
  try{
    const id='sample',dir=join(root,'data/toc-migrated',id),artifact=join(root,'saved.webm');
    mkdirSync(dir,{recursive:true});writeFileSync(artifact,'synthetic file-stage fixture');
    let media=0,transcript=0,screen=0,index=0;
    const deps={root,launch:async()=>{media++;writeFileSync(join(dir,'source.json'),JSON.stringify({tenantId:'tenant-a'}));}};
    const runScript=async(_root,script)=>{
      if(script.endsWith('transcribe-long-session.mjs')){transcript++;if(transcript===1)throw Object.assign(new Error('temporary'),{status:503});writeFileSync(join(dir,'turns.json'),'[]');}
      if(script.endsWith('process-video.mjs'))screen++;
      if(script.endsWith('sync-session.mjs'))index++;
    };
    await runSessionGraph({deps,tenantId:'tenant-a',id,title:'fixture',artifact,env:{},runScript,
      validateIndexProof:()=>({inputHash:'mechanical-proof',tenantId:'tenant-a',sessionId:id})});
    assert.deepEqual({media,transcript,screen,index},{media:1,transcript:2,screen:1,index:1});
    const proof=JSON.parse(readFileSync(join(dir,'pipeline-state.json'),'utf8'));
    assert.equal(proof.status,'done');assert.equal(proof.tenantId,'tenant-a');assert.equal(proof.pipelineGeneration,0);
    await runSessionGraph({deps,tenantId:'tenant-a',id,title:'fixture',artifact,env:{},runScript,
      validateIndexProof:()=>({inputHash:'mechanical-proof',tenantId:'tenant-a',sessionId:id})});
    assert.deepEqual({media,transcript,screen,index},{media:1,transcript:2,screen:1,index:1},'acknowledged completion repair runs no handlers');
    await assert.rejects(runSessionGraph({deps,tenantId:'tenant-a',id,title:'fixture',artifact,env:{},runScript,
      validateIndexProof:()=>({inputHash:'mismatched-proof',tenantId:'tenant-a',sessionId:id})}),/nothing-to-claim/);
    // This is a mechanical child/queue consumer proof, not real media/provider/KB acceptance.
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('fresh capture executes inside the same graph and invalid identity refuses before creating state',async()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-graph-fresh-'));
  try{
    const id='fresh',dir=join(root,'data/toc-migrated',id),artifact=join(root,'capture.webm');
    mkdirSync(dir,{recursive:true});let captured=0,launched=0,children=0;
    const deps={root,launch:async()=>{launched++;writeFileSync(join(dir,'source.json'),JSON.stringify({tenantId:'tenant-a'}));}};
    const runScript=async(_root,script)=>{children++;if(script.endsWith('transcribe-long-session.mjs'))writeFileSync(join(dir,'turns.json'),'[]');};
    await runFreshSessionGraph({deps,tenantId:'tenant-a',id,title:'fixture',sourceFingerprint:'authorized-request',env:{},runScript,
      capture:async ctx=>{assert.equal(ctx.tenantId,'tenant-a');assert.equal(ctx.runKey,id);captured++;writeFileSync(artifact,'synthetic capture fixture');return artifact;},
      validateIndexProof:()=>({inputHash:'mechanical-proof',sessionId:id})});
    assert.equal(captured,1);assert.equal(JSON.parse(readFileSync(join(dir,'pipeline-state.json'),'utf8')).status,'done');
    const calls={captured,launched,children};
    const queueFile=join(root,'data/webinar-release/pipeline-graph',id,'queue','job-queue.json');
    const committedQueue=readFileSync(queueFile);
    // Recovery must retain both the authorized capture request identity and its durable artifact.
    await runSessionGraph({deps,tenantId:'tenant-a',id,title:'fixture',artifact,sourceFingerprint:'authorized-request',env:{},runScript,
      validateIndexProof:()=>({inputHash:'mechanical-proof',sessionId:id})});
    assert.deepEqual({captured,launched,children},calls,'fresh-to-recovery repair skips all committed stages');
    assert.deepEqual(readFileSync(queueFile),committedQueue,'read-only acknowledged repair preserves the durable queue');
    await assert.rejects(runSessionGraph({deps,tenantId:'tenant-a',id,title:'fixture',artifact,env:{},runScript,
      validateIndexProof:()=>({inputHash:'mechanical-proof',sessionId:id})}),/payload-mismatch|fingerprint/);
    assert.deepEqual({captured,launched,children},calls,'media identity cannot substitute for the original request identity');
    assert.deepEqual(readFileSync(queueFile),committedQueue,'refused mismatched recovery preserves committed queue bytes');
    await assert.rejects(runSessionGraph({deps,tenantId:'../foreign',id:'other',artifact,env:{},validateIndexProof:()=>assert.fail()}),/Invalid graph session identity/);
    assert.equal(existsSync(join(root,'data/webinar-release/pipeline-graph/other')),false);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('foreign and corrupt existing sessions refuse before capture or graph state writes',async()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-graph-foreign-'));
  try{
    const id='foreign',dir=join(root,'data/toc-migrated',id),source=join(dir,'source.json');
    mkdirSync(dir,{recursive:true});
    for(const bytes of [JSON.stringify({tenantId:'tenant-b',private:'foreign'}),'{invalid']) {
      writeFileSync(source,bytes);
      await assert.rejects(runFreshSessionGraph({deps:{root,launch:()=>assert.fail('no launch')},tenantId:'tenant-a',id,
        sourceFingerprint:'authorized-request',env:{},capture:()=>assert.fail('no capture'),validateIndexProof:()=>assert.fail('no proof')}));
      assert.equal(readFileSync(source,'utf8'),bytes);
      assert.equal(existsSync(join(root,'data/webinar-release/pipeline-graph',id)),false);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

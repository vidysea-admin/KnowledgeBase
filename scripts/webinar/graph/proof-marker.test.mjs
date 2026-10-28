import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ownedDirectory,writeProofMarker} from './proof-marker.mjs';
const context={tenantId:'tenant-a',runKey:'session',generation:2};

test('atomic completion marker binds identity/generation and cancellation preserves acknowledged bytes',()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-proof-'));
  try{
    const dir=join(root,'data','session');
    writeProofMarker(root,dir,'session',{inputHash:'validated-hash',turnCount:3},context);
    const before=readFileSync(join(dir,'pipeline-state.json'));
    const parsed=JSON.parse(before); assert.equal(parsed.tenantId,'tenant-a'); assert.equal(parsed.pipelineGeneration,2);
    assert.equal(parsed.status,'done'); assert.equal(parsed.inputHash,'validated-hash');
    const abort=new AbortController(); abort.abort();
    assert.throws(()=>writeProofMarker(root,dir,'session',{inputHash:'different'}, {...context,signal:abort.signal}));
    assert.deepEqual(readFileSync(join(dir,'pipeline-state.json')),before);
    assert.deepEqual(readdirSync(dir),['pipeline-state.json']);
    assert.throws(()=>writeProofMarker(root,dir,'session',{tenantId:'foreign'},context));
    assert.throws(()=>writeProofMarker(root,dir,'session',{sessionId:'foreign'},context));
    assert.deepEqual(readFileSync(join(dir,'pipeline-state.json')),before);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('graph directory traversal and redirected directories preserve outside bytes',()=>{
  const root=mkdtempSync(join(tmpdir(),'lkb-proof-root-')),outside=mkdtempSync(join(tmpdir(),'lkb-proof-outside-'));
  try{
    writeFileSync(join(outside,'sentinel.txt'),'outside unchanged');mkdirSync(join(root,'data'));
    symlinkSync(outside,join(root,'data','redirect'),process.platform==='win32'?'junction':'dir');
    assert.throws(()=>ownedDirectory(root,outside));
    assert.throws(()=>ownedDirectory(root,join(root,'data','redirect','created')));
    assert.throws(()=>writeProofMarker(root,join(root,'data','redirect'),'session',{inputHash:'hash'},context));
    assert.deepEqual(readdirSync(outside),['sentinel.txt']);assert.equal(readFileSync(join(outside,'sentinel.txt'),'utf8'),'outside unchanged');
  }finally{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});

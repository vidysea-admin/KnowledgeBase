import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {runPipelineTick} from './run-pipeline.mjs';
import {withFixture, proof, completed} from './run-pipeline-fixtures.mjs';

test('ledger002 weak or stale strict markers never certify zero-exit child as ready', async () => {
  for (const attack of ['versionless','degraded-summary','embedding-skip','stale-input','foreign-tenant','stale-generation']) {
    await withFixture(async (f) => {
      f.deps.launch=async (args)=>{
        const id=args[args.indexOf('--session-id')+1];completed(f.root,id);
        const dir=join(f.root,'data/toc-migrated',id),path=join(dir,'index-proof.json');
        const value=JSON.parse(readFileSync(path));
        if(attack==='versionless')delete value.version;
        if(attack==='degraded-summary')value.summary='degraded';
        if(attack==='embedding-skip')value.chunks='skipped';
        if(attack==='stale-input')value.inputHash='0'.repeat(64);
        if(attack==='foreign-tenant')value.tenantId='foreign';
        if(attack==='stale-generation')value.generation='other-generation';
        writeFileSync(path,JSON.stringify(value));
      };
      const result=await runPipelineTick(f.deps,true);
      assert.equal(Object.values(result.operations)[0].status,'failed',attack);
    }, true);
  }
});

test('runner refuses missing, mismatched and unowned durable tenant state without captures', () => withFixture(async (f) => {
    proof(f); delete f.deps.env.LKB_TENANT_ID;
    await assert.rejects(runPipelineTick(f.deps, true), /LKB_TENANT_ID/);
    f.deps.env.LKB_TENANT_ID = 'fixture';
    const state = join(f.stateDir, 'operations.json');
    for (const owner of [undefined, 'other-tenant']) {
      const bytes = JSON.stringify({ version: 1, tenantId: owner, operations: {} });
      writeFileSync(state, bytes);
      await assert.rejects(runPipelineTick(f.deps, true), /ownership/);
      assert.equal(readFileSync(state, 'utf8'), bytes);
    }
    assert.equal(f.calls.length, 0);
}));

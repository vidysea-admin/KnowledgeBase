/** Actual completion consumer/strict validator chain; fixture bytes only, no provider or live proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runPipelineTick} from '../run-pipeline.mjs';
import {NOW, withFixture, completed} from '../run-pipeline-fixtures.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function completedV3(f, id, artifact) {
  const dir = join(f.root, 'data/toc-migrated', id); mkdirSync(dir, {recursive: true});
  const source = JSON.stringify({_id: `${id}-src`, tenantId: 'fixture'});
  const turns = JSON.stringify([{_id: `${id}-turn`, tenantId: 'fixture', sessionId: id,
    speakerRef: `${id}-speaker`, text: 'Supported source', tStart: 0, tEnd: 1}]);
  const proof = {version: 3, status: 'done', strict: true, sessionId: id, tenantId: 'fixture', generation: 'generation-a',
    sourceId: `${id}-src`, sourceHash: sha(source), workDb: f.deps.env.MONGO_WORK_DB, inputArtifact: artifact,
    inputHash: sha(turns), turnCount: 1, summary: 'done', claims: 'done', chunks: 'done', tree: 'done', semanticSupport: 'passed'};
  writeFileSync(join(dir, 'source.json'), source); writeFileSync(join(dir, artifact), turns);
  writeFileSync(join(dir, 'session.json'), JSON.stringify({_id: id, tenantId: 'fixture', sourceId: proof.sourceId, status: {transcribe: 'done', index: 'done'}}));
  writeFileSync(join(dir, artifact === 'turns.json' ? 'validation.json' : 'video-stage.json'), JSON.stringify(artifact === 'turns.json'
    ? {status: 'passed', transcriptValidated: true, turnsSha256: proof.inputHash}
    : {status: 'done', outputs: {[artifact]: proof.inputHash}}));
  return {dir, proof, marker: {...proof, stage: 'index'}};
}

test('canonical completion accepts bound legacy/v3 selected-artifact proofs and refuses mismatched marker/source/DB/validation', {timeout: 15000}, async () => {
  const cases = [
    {name: 'legacy', version: 2, accept: true},
    {name: 'turns', artifact: 'turns.json', accept: true},
    {name: 'combined', artifact: 'knowledge-turns.json', accept: true},
    ...['sourceId', 'sourceHash', 'workDb', 'inputArtifact'].map(field => ({name: `marker-${field.toLowerCase()}`, field})),
    {name: 'version', field: 'version'}, {name: 'foreign-db', proofDb: true},
    {name: 'stale-source', staleSource: true}, {name: 'stale-validation', staleValidation: true},
  ];
  for (const item of cases) await withFixture(async f => {
    const id = `proof-${item.name}`; f.deps.loadCalendarEvents = async () => [];
    if (item.version === 2) completed(f.root, id);
    else {
      const {dir, proof, marker} = completedV3(f, id, item.artifact ?? 'turns.json');
      if (item.field) marker[item.field] = item.field === 'version' ? 2 : 'foreign-marker-value';
      if (item.proofDb) {proof.workDb = 'lkb_work_foreign'; marker.workDb = proof.workDb;}
      if (item.staleSource) writeFileSync(join(dir, 'source.json'), JSON.stringify({_id: `${id}-src`, tenantId: 'fixture', changed: true}));
      if (item.staleValidation) writeFileSync(join(dir, 'validation.json'), JSON.stringify({status: 'passed', transcriptValidated: true, turnsSha256: '0'.repeat(64)}));
      writeFileSync(join(dir, 'index-proof.json'), JSON.stringify(proof));
      writeFileSync(join(dir, 'pipeline-state.json'), JSON.stringify(marker));
    }
    writeFileSync(join(f.stateDir, 'operations.json'), JSON.stringify({version: 1, tenantId: 'fixture', operations: {
      [id]: {tenantId: 'fixture', status: 'processing', attempts: 0, artifact: join(f.root, 'proof.webm'), updatedAt: NOW}}}));
    const result = await runPipelineTick(f.deps, true);
    assert.equal(result.operations[id].status === 'ready', item.accept === true, item.name);
    if (item.accept) assert.equal(f.calls.length, 0, `${item.name} must consume the existing actual validated marker`);
  }, true);
});

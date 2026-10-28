import test from 'node:test';
import assert from 'node:assert/strict';
import {stageReceipts, requireStages, main} from './extraction-stage-receipts.mjs';

test('real bound source inventory retains acquisition and stage gaps without source text', () => {
  const receipt = stageReceipts();
  assert.deepEqual(receipt.acquisition, {declaredCases:35, acquiredCases:29, failedCases:6, inventoryMeasured:true, undeclaredDirectories:2, outsideInventory:0});
  assert.deepEqual(receipt.persisted, {claims:72, citations:80, invalidCitations:14});
  assert.equal(receipt.complete, false); assert.equal(receipt.stages.raw.rows, null);
  assert.equal(receipt.stages.raw.availableCases, 0); assert.equal(receipt.stages.raw.unavailableCases, 35);
  assert.equal(receipt.stages.persisted.availableCases, 29); assert.equal(receipt.stages.persisted.unavailableCases, 6);
  assert.equal(receipt.artifacts.length, 29);
  assert.equal(receipt.artifacts.filter(a => a.packetBound).length, 23);
  for (const artifact of receipt.artifacts) {
    assert.match(artifact.caseSha256, /^[a-f0-9]{64}$/); assert.match(artifact.artifactHash, /^[a-f0-9]{64}$/);
    for (const hash of Object.values(artifact.hashes)) assert.match(hash, /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(requireStages(receipt, ['raw']), {accepted:false, unavailableStages:['raw'], reason:'stage-evidence-unavailable', humanGold:false, bindingThresholds:null});
  assert.equal(requireStages(receipt, ['persisted']).accepted, false);
  assert.equal(receipt.humanGold, false); assert.equal(receipt.semanticLabelsImported, 0); assert.equal(receipt.bindingThresholds, null);
  assert.deepEqual(stageReceipts(), receipt);
  const serialized = JSON.stringify(receipt);
  for (const forbidden of ['persistedClaim','literalCitationContexts','coverageNote','tenantId','sessionId','sourceBinding','reasoning','claims.json','turns.json']) assert.equal(serialized.includes(forbidden), false);
});

test('requests reject malformed, duplicate and unknown stage names', () => {
  for (const stages of [[], ['raw','raw'], ['turns'], ['persisted','foreign'], null]) assert.throws(() => requireStages({}, stages), /invalid-stage-request/);
  const stages = {raw:{complete:true}, parsed:{complete:true}, filtered:{complete:true}, persisted:{complete:true}};
  assert.equal(requireStages({stages}).accepted, true);
});

test('alternate measurement and invalid CLI arguments fail closed without diagnostics', () => {
  assert.throws(() => stageReceipts(undefined, 'subset.json'), /alternate-corpus-refused/);
  for (const args of [['--input','subset.json'], ['--require','raw,raw'], ['--require','unknown'], ['--require']]) {
    const emitted = []; assert.equal(main(args, value => emitted.push(value)), 2);
    assert.deepEqual(emitted, [{version:1, complete:false, failure:'stage-receipt-refused', humanGold:false}]);
  }
});

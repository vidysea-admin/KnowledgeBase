import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { canonical, sha256, verifyReceipt } from './capture-operations-evidence.mjs';
import { validateOperations, runCli, REQUIRED_GATES } from './capture-operations-acceptance.mjs';

test('absent evidence and self assertions remain HOLD', () => {
  for (const bundle of [undefined, {}, { version: 1, independent: true, synthetic: false, gates: [] }]) assert.equal(validateOperations(bundle, { version: 1, keys: [] }).operationalPass, false);
  assert.equal(runCli([]).status, 'HOLD');
});
test('all operational gates are explicitly required', () => {
  const result = validateOperations({ version: 1, candidateSha: 'a'.repeat(40), environmentSha256: 'b'.repeat(64), tenantId: 'tenant', gates: [] }, { version: 1, keys: [] });
  assert.equal(result.status, 'HOLD');
  assert.deepEqual(result.gates.map(g => g.id), REQUIRED_GATES);
  assert.ok(result.gates.every(g => g.status === 'HOLD'));
  assert.equal(result.parentTaskStatusChanged, false);
});
test('receipt signature binds role, payload and identity using separately supplied trust', () => {
  const pair = generateKeyPairSync('ed25519'), publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const trust = { keys: [{ id: 'producer', role: 'producer', algorithm: 'ed25519', publicKeyPem, publicKeySha256: sha256(publicKeyPem) }] };
  const binding = { hostId: 'host' }, body = { keyId: 'producer', kind: 'native-observation', binding, payloadHash: 'c'.repeat(64) };
  const receipt = { ...body, signature: sign(null, Buffer.from(canonical(body)), pair.privateKey).toString('base64') };
  assert.equal(verifyReceipt(receipt, 'producer', body.payloadHash, binding, trust), true);
  assert.equal(verifyReceipt(receipt, 'reviewer', body.payloadHash, binding, trust), false);
  assert.equal(verifyReceipt(receipt, 'producer', 'd'.repeat(64), binding, trust), false);
  assert.equal(verifyReceipt(receipt, 'producer', body.payloadHash, { hostId: 'other' }, trust), false);
  assert.equal(verifyReceipt(receipt, 'producer', body.payloadHash, binding, { keys: [] }), false);
});

// Cryptographic fixture keys establish only a local test policy, never native/live acceptance.
function signedFixture(change = () => {}) {
  const start = '2026-01-01T00:00:00.000Z', end = '2026-01-01T00:01:00.000Z';
  const bundle = { version: 1, candidateSha: 'a'.repeat(40), environmentSha256: 'b'.repeat(64), tenantId: 'tenant', gates: [] };
  const trust = { version: 1, keys: [] }, observed = {}, privateKeys = new Map();
  for (const [id, role, hostId, platform] of [['windows-producer', 'producer', 'windows-host', 'win32'], ['ubuntu-producer', 'producer', 'ubuntu-host', 'linux'], ['reviewer', 'reviewer', undefined, undefined]]) {
    const pair = generateKeyPairSync('ed25519'), publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKeys.set(id, pair.privateKey);
    trust.keys.push({ id, role, algorithm: 'ed25519', publicKeyPem, publicKeySha256: sha256(publicKeyPem), principal: id, hostId, platform, allowedHosts: ['windows-host', 'ubuntu-host'] });
  }
  for (const id of REQUIRED_GATES) {
    const linux = id === 'ubuntu-restart';
    const binding = { candidateSha: bundle.candidateSha, environmentSha256: bundle.environmentSha256, tenantId: bundle.tenantId, hostId: linux ? 'ubuntu-host' : 'windows-host', platform: linux ? 'linux' : 'win32', sessionId: id };
    const artifacts = [{ id: 'media-a', path: `${id}-a`, sha256: 'c'.repeat(64), bytes: 12 }];
    const measurement = { synthetic: false, source: 'native-runtime', startedAt: start, endedAt: end, failures: [] };
    if (id === 'sustained-capture') Object.assign(measurement, { endedAt: '2026-01-01T01:00:00.000Z', mediaSeconds: 3600, mediaBytes: 1000000, height: 720, audioDecoded: true, videoDecoded: true, cleanupVerified: true });
    else if (id === 'parallel-tabs') {
      artifacts.push({ id: 'media-b', path: `${id}-b`, sha256: 'd'.repeat(64), bytes: 13 });
      Object.assign(measurement, { isolationVerified: true, cleanupVerified: true, tabs: ['a', 'b'].map(x => ({ sessionId: `tab-${x}`, profileId: `profile-${x}`, artifactId: `media-${x}`, startedAt: start, endedAt: end, audioDecoded: true, videoDecoded: true })) });
    } else if (id === 'unattended-seven-days') Object.assign(measurement, { endedAt: '2026-01-08T00:00:00.000Z', unattended: true, coverageSeconds: 604800, coverageGaps: [], alertReceiptVerified: true });
    else Object.assign(measurement, { actualHostRestart: true, actualControllerRestart: true, recovered: true, playableAfterRecovery: true, ownedCleanupVerified: true });
    bundle.gates.push({ id, binding, measurement, artifacts });
  }
  change(bundle);
  for (const gate of bundle.gates) {
    for (const artifact of gate.artifacts) observed[artifact.path] = { sha256: artifact.sha256, bytes: artifact.bytes };
    const payloadHash = sha256(canonical({ id: gate.id, binding: gate.binding, measurement: gate.measurement, artifacts: gate.artifacts }));
    for (const role of ['producer', 'reviewer']) {
      const keyId = role === 'reviewer' ? 'reviewer' : gate.binding.platform === 'linux' ? 'ubuntu-producer' : 'windows-producer';
      const body = { keyId, kind: role === 'reviewer' ? 'independent-review' : 'native-observation', payloadHash, binding: gate.binding };
      gate[role === 'producer' ? 'producerReceipt' : 'reviewReceipt'] = { ...body, signature: sign(null, Buffer.from(canonical(body)), privateKeys.get(keyId)).toString('base64') };
    }
  }
  return validateOperations(bundle, trust, observed, Date.parse('2026-02-01T00:00:00.000Z'));
}
test('signed local policy fixture exercises every gate without claiming native evidence', () => {
  assert.equal(signedFixture().operationalPass, true);
});
for (const [name, alter] of [
  ['future nested tab intervals', tabs => { for (const tab of tabs) { tab.startedAt = '2099-01-01T00:00:00.000Z'; tab.endedAt = '2099-01-01T00:01:00.000Z'; } }],
  ['tabs before their gate interval', tabs => { for (const tab of tabs) { tab.startedAt = '2025-12-31T23:58:00.000Z'; tab.endedAt = '2025-12-31T23:59:00.000Z'; } }],
  ['tabs ending after their gate interval', tabs => { for (const tab of tabs) tab.endedAt = '2026-01-01T00:02:00.000Z'; }],
  ['reversed nested tab event order', tabs => { for (const tab of tabs) { tab.startedAt = '2026-01-01T00:00:50.000Z'; tab.endedAt = '2026-01-01T00:00:10.000Z'; } }],
]) test(`signed evidence refuses ${name}`, () => {
  const result = signedFixture(bundle => alter(bundle.gates.find(g => g.id === 'parallel-tabs').measurement.tabs));
  assert.equal(result.operationalPass, false, name);
  assert.equal(result.gates.find(g => g.id === 'parallel-tabs').status, 'HOLD');
});

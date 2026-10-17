import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { canonical, sha256, verifyReceipt, hashArtifact } from './capture-operations-evidence.mjs';

const HEX = /^[a-f0-9]{64}$/;
export const REQUIRED_GATES = ['sustained-capture', 'parallel-tabs', 'unattended-seven-days', 'windows-restart', 'ubuntu-restart'];
const seconds = (start, end) => {
  if (typeof start !== 'string' || typeof end !== 'string') return NaN;
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || new Date(a).toISOString() !== start || new Date(b).toISOString() !== end) return NaN;
  return (b - a) / 1000;
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
function gateBehavior(gate, now) {
  const m = gate.measurement;
  if (!m || m.synthetic !== false || m.source !== 'native-runtime') return false;
  const duration = seconds(m.startedAt, m.endedAt);
  if (!(duration > 0) || !(Date.parse(m.endedAt) <= now) || !Array.isArray(m.failures) || m.failures.length) return false;
  if (gate.id === 'sustained-capture') return duration >= 3600 && m.audioDecoded === true && m.videoDecoded === true && m.cleanupVerified === true && finite(m.mediaSeconds) && m.mediaSeconds >= 3600 && m.mediaSeconds <= duration + 2 && finite(m.mediaBytes) && m.mediaBytes > 0 && m.mediaBytes * 3600 / m.mediaSeconds < 400000000 && finite(m.height) && m.height > 0 && m.height <= 720;
  if (gate.id === 'parallel-tabs') {
    if (!Array.isArray(m.tabs) || m.tabs.length !== 2) return false;
    const [a, b] = m.tabs;
    return a.sessionId !== b.sessionId && a.profileId !== b.profileId && a.artifactId !== b.artifactId && m.isolationVerified === true && m.cleanupVerified === true && m.tabs.every(t => typeof t.sessionId === 'string' && !!t.sessionId && typeof t.profileId === 'string' && !!t.profileId && gate.artifacts.some(x => x.id === t.artifactId) && t.audioDecoded === true && t.videoDecoded === true && seconds(t.startedAt, t.endedAt) > 0 && Date.parse(t.startedAt) >= Date.parse(m.startedAt) && Date.parse(t.endedAt) <= Date.parse(m.endedAt) && Date.parse(t.endedAt) <= now) && Math.min(Date.parse(a.endedAt), Date.parse(b.endedAt)) > Math.max(Date.parse(a.startedAt), Date.parse(b.startedAt));
  }
  if (gate.id === 'unattended-seven-days') return duration >= 604800 && m.unattended === true && m.coverageSeconds === duration && Array.isArray(m.coverageGaps) && m.coverageGaps.length === 0 && m.alertReceiptVerified === true;
  return gate.binding.platform === (gate.id === 'windows-restart' ? 'win32' : 'linux') && m.actualHostRestart === true && m.actualControllerRestart === true && m.recovered === true && m.playableAfterRecovery === true && m.ownedCleanupVerified === true;
}

/** Trust is supplied separately by the operator/checker, never taken from the evidence bundle.
 * Signatures prove provenance under those configured keys, not truth of the observations.
 * Issuers must measure native media/runtime and review it independently before signing.
 */
export function validateOperations(bundle, trust, observedArtifacts = {}, now = Date.now()) {
  const result = { status: 'HOLD', operationalPass: false, parentTaskStatusChanged: false, gates: [], reasons: [] };
  try {
    if (bundle?.version !== 1 || !trust || trust.version !== 1 || !Array.isArray(trust.keys) || trust.keys.length > 32 || !Array.isArray(bundle.gates) || bundle.gates.length > 16) throw Error('Invalid bundle or external trust policy');
    if (!/^[a-f0-9]{40}$/.test(bundle.candidateSha ?? '') || !HEX.test(bundle.environmentSha256 ?? '') || typeof bundle.tenantId !== 'string' || !bundle.tenantId) throw Error('Missing candidate/environment/tenant identity');
    for (const id of REQUIRED_GATES) {
      const matches = bundle.gates.filter(g => g.id === id), reasons = [];
      const gate = matches[0];
      if (matches.length !== 1) reasons.push('Exactly one gate required');
      if (gate) {
        const b = gate.binding;
        if (!b || b.candidateSha !== bundle.candidateSha || b.environmentSha256 !== bundle.environmentSha256 || b.tenantId !== bundle.tenantId || typeof b.hostId !== 'string' || !b.hostId || !['win32', 'linux'].includes(b.platform) || typeof b.sessionId !== 'string' || !b.sessionId) reasons.push('Identity binding missing or mismatched');
        if (!Array.isArray(gate.artifacts) || gate.artifacts.length < 1 || gate.artifacts.length > 16) reasons.push('Artifacts missing or excessive');
        else {
          const ids = new Set();
          for (const a of gate.artifacts) {
            const actual = observedArtifacts[a.path];
            if (!a.id || ids.has(a.id) || !HEX.test(a.sha256 ?? '') || !Number.isSafeInteger(a.bytes) || a.bytes <= 0 || !actual || actual.sha256 !== a.sha256 || actual.bytes !== a.bytes) reasons.push('Artifact absent, duplicate or mismatched');
            ids.add(a.id);
          }
        }
        if (!gateBehavior(gate, now)) reasons.push('Native measurement does not satisfy gate');
        if (!(Date.parse(gate.measurement?.endedAt) <= now)) reasons.push('Future or invalid observation');
        const payload = sha256(canonical({ id: gate.id, binding: gate.binding, measurement: gate.measurement, artifacts: gate.artifacts }));
        const producer = gate.producerReceipt, reviewer = gate.reviewReceipt;
        if (!producer || !reviewer || producer.keyId === reviewer.keyId || !verifyReceipt(producer, 'producer', payload, b, trust) || !verifyReceipt(reviewer, 'reviewer', payload, b, trust)) reasons.push('Native producer and independent reviewer signatures required');
        else {
          const pk = trust.keys.find(k => k.id === producer.keyId && k.role === 'producer'), rk = trust.keys.find(k => k.id === reviewer.keyId && k.role === 'reviewer');
          if (pk.publicKeySha256 === rk.publicKeySha256 || !pk.principal || !rk.principal || pk.principal === rk.principal || pk.hostId !== b.hostId || pk.platform !== b.platform || !rk.allowedHosts?.includes(b.hostId)) reasons.push('Issuer separation or trusted host scope missing');
        }
      }
      result.gates.push({ id, status: reasons.length ? 'HOLD' : 'VERIFIED', reasons });
    }
    const windows = bundle.gates.find(g => g.id === 'windows-restart'), ubuntu = bundle.gates.find(g => g.id === 'ubuntu-restart');
    if (windows?.binding?.hostId === ubuntu?.binding?.hostId) result.reasons.push('Windows and Ubuntu require separate host identities');
    if (result.gates.every(g => g.status === 'VERIFIED') && !result.reasons.length) { result.status = 'VERIFIED'; result.operationalPass = true; }
  } catch (error) { result.reasons.push(error.message); }
  return result;
}

export function runCli(args) {
  try {
    const expected = ['--bundle', '--trust', '--evidence-root'];
    if (args.length !== 6 || expected.some((key, i) => args[i * 2] !== key || !args[i * 2 + 1])) throw Error('usage: --bundle file --trust independently-approved-policy.json --evidence-root directory');
    const load = file => { const stat = statSync(file); if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('JSON exceeds 1 MiB or is not a file'); const bytes = readFileSync(file); if (bytes.length > 1024 * 1024) throw Error('JSON exceeds 1 MiB'); return JSON.parse(bytes); };
    const bundle = load(args[1]), trust = load(args[3]), observed = {};
    if (!Array.isArray(bundle.gates) || bundle.gates.length > 16) throw Error('Invalid gate count');
    let total = 0;
    for (const gate of bundle.gates) {
      if (!Array.isArray(gate.artifacts) || gate.artifacts.length > 16) throw Error('Invalid artifact count');
      for (const artifact of gate.artifacts) if (!Object.hasOwn(observed, artifact.path)) { const receipt = hashArtifact(args[5], artifact.path); total += receipt.bytes; if (total > 1024 * 1024 * 1024) throw Error('Artifact bundle exceeds 1 GiB'); Object.defineProperty(observed, artifact.path, { value: receipt, enumerable: true }); }
    }
    return validateOperations(bundle, trust, observed);
  } catch (error) { return { status: 'HOLD', operationalPass: false, parentTaskStatusChanged: false, reasons: [error.message], gates: [] }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const result = runCli(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.operationalPass ? 0 : 2; }

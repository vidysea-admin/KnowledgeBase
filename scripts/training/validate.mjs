/** Source drift and canonical operator approval validation. No exports or provider calls. */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { prepareTrainingPlan, trainingArguments, readTrainingJson, TRAINING_ROOT } from './prepare.mjs';
import { trainingHash } from './plan.mjs';
import { assertPrivateTrainingPath } from './private-path.mjs';
const requireValue = (condition, message) => {if (!condition) throw new Error(message);};
export function validateTrainingPlan(root, packet) {
  requireValue(packet?.format === 'own-model-plan-v1', 'invalid plan format');
  const current = prepareTrainingPlan(root, packet.config);
  requireValue(JSON.stringify(packet) === JSON.stringify(current), 'training plan changed or stale');
  return current;
}
/** The append-only canonical ledger is the trusted operator boundary, not caller approval JSON. */
export function trainingApproval(root, decisionId, kind, expected, now = new Date()) {
  requireValue(/^D-\d{3,}$/.test(decisionId) && ['Training-export', 'Training-run'].includes(kind), 'invalid decision selection');
  const ledger = readFileSync(resolve(root, 'docs/DECISIONS.md'), 'utf8');
  const sections = ledger.split(/(?=^## D-\d+)/m);
  const matches = sections.filter(s => s.startsWith(`## ${decisionId} |`));
  requireValue(matches.length === 1 && /status: ACTIVE\s*$/m.test(matches[0].split(/\r?\n/)[0]), 'active decision required');
  requireValue(!sections.some(s => s.split(/\r?\n/).some(l => l.startsWith('**Supersedes:** ') &&
    new RegExp(`(?:^|[^A-Za-z0-9-])${decisionId}(?![A-Za-z0-9-])`).test(l))), 'decision superseded');
  const entry = matches[0];
  requireValue(/^\*\*Approved-by:\*\* Umesh\s*$/m.test(entry), 'explicit Umesh approval required');
  const lines = entry.split(/\r?\n/).filter(l => l.startsWith(`**${kind}:** `));
  requireValue(lines.length === 1, 'exact structured approval required');
  const grant = JSON.parse(lines[0].slice(`**${kind}:** `.length));
  requireValue(grant.version === 1 && grant.revoked === false && grant.privacy === 'local-only', 'private current approval required');
  for (const [key,value] of Object.entries(expected)) requireValue(JSON.stringify(grant[key]) === JSON.stringify(value), 'approval scope mismatch');
  for (const k of ['approvedAt','expiresAt']) requireValue(typeof grant[k] === 'string' && new Date(grant[k]).toISOString() === grant[k], 'canonical validity dates required');
  requireValue(Date.parse(grant.approvedAt) <= now.getTime() && now.getTime() < Date.parse(grant.expiresAt), 'approval not effective or expired');
  requireValue(typeof grant.purpose === 'string' && grant.purpose.trim() && typeof grant.restrictions === 'string' && grant.restrictions.trim(), 'purpose and restrictions required');
  assertPrivateTrainingPath(grant.destination);
  const binding=grant.storageProof;
  requireValue(typeof binding?.path==='string' && /^qa\/evidence\/[A-Za-z0-9_.-]+\.json$/.test(binding.path) &&
    /^[a-f0-9]{64}$/.test(binding.sha256),'canonical approval must bind host-private-storage proof');
  const proofPath=realpathSync(resolve(root,binding.path)), rel=relative(realpathSync(resolve(root,'qa/evidence')),proofPath);
  requireValue(rel && rel!=='..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel),'storage proof outside trusted evidence');
  const proofBytes=readFileSync(proofPath); requireValue(trainingHash(proofBytes)===binding.sha256,'storage proof changed');
  const proof=JSON.parse(proofBytes);
  requireValue(proof.format==='private-storage-proof-v1' && proof.kind==='fixed-private-local-volume' && proof.status==='verified' &&
    proof.hostId===hostname() && proof.destination===grant.destination && proof.verifiedBy==='Umesh' &&
    typeof proof.evidence==='string' && proof.evidence.trim(),'current host-private-storage verification required');
  for(const k of ['verifiedAt','expiresAt']) requireValue(typeof proof[k]==='string' && new Date(proof[k]).toISOString()===proof[k],'canonical storage proof dates required');
  requireValue(Date.parse(proof.verifiedAt)<=now.getTime() && now.getTime()<Date.parse(proof.expiresAt),'storage proof not effective or expired');
  return grant;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {const o = trainingArguments(process.argv.slice(2), ['--plan']); const p = validateTrainingPlan(TRAINING_ROOT, readTrainingJson(o['--plan']));
    console.log(JSON.stringify({status: p.status, fingerprint: p.fingerprint, splitReady:p.splitReady, counts:p.counts, approvalRequired:true}));
  } catch {console.error('training plan validation refused'); process.exitCode=2;}
}

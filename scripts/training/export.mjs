/** Local-only guarded corpus export. Preparation and D-170 never authorize this action. */
import { readFileSync, realpathSync, existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { resolve, dirname, basename, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadTrainingGenerations, trainingArguments, readTrainingJson, TRAINING_ROOT } from './prepare.mjs';
import { buildTrainingPlan, groundedTrainingRows, trainingHash } from './plan.mjs';
import { validateTrainingPlan, trainingApproval } from './validate.mjs';
import { assertPrivateTrainingPath } from './private-path.mjs';
const requireValue = (condition, message) => {if (!condition) throw new Error(message);};
export function newTrainingDestination(path) {
  assertPrivateTrainingPath(path);
  requireValue(isAbsolute(path), 'absolute local destination required');
  const destination = join(realpathSync(dirname(path)), basename(path));
  requireValue(resolve(path) === destination && !existsSync(destination), 'new canonical local destination required');
  return destination;
}
export function trainingOutputOutsideCorpus(root, destination) {
  for (const scope of ['data/toc-migrated','raw','sources','docs','contracts','qa/contracts','.git','.codex','.Codex','.agents']) {
    const rel = relative(resolve(root,scope), destination);
    requireValue(rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel), 'destination overlaps protected input');
  }
}
export function exportTrainingDataset(root, packet, {decisionId, destination, purpose}) {
  const selected = validateTrainingPlan(root, packet);
  requireValue(selected.splitReady && selected.counts.rows > 0, 'three independent nonempty splits required');
  assertPrivateTrainingPath(destination);
  const proposed=resolve(destination);
  const grant = trainingApproval(root, decisionId, 'Training-export', {fingerprint:selected.fingerprint, tenantId:selected.tenantId,
    destination:proposed, purpose, taskFormat:selected.taskFormat});
  const out = newTrainingDestination(proposed); trainingOutputOutsideCorpus(root,out);
  const {generations, exclusions} = loadTrainingGenerations(root, selected.config);
  requireValue(JSON.stringify(buildTrainingPlan(generations, selected.config, exclusions)) === JSON.stringify(selected), 'source changed before export');
  // All approval checks precede serialization and corpus writes. The same validated snapshots supply rows.
  const rows = generations.flatMap(g => groundedTrainingRows(g, selected.tenantId).rows);
  const tmp = `${out}.${randomUUID()}.partial`, files = {}; let created=false;
  try {
    requireValue(dirname(tmp)===dirname(out),'temporary output escaped approved parent');
    mkdirSync(tmp, {mode:0o700}); created=true;
    for (const [split, ids] of Object.entries(selected.splits)) {
      const members = rows.filter(r => ids.includes(r.sessionId));
      members.sort((a,b) => a.sessionId.localeCompare(b.sessionId) || a.id.localeCompare(b.id));
      const body = members.map(r => JSON.stringify(r)).join('\n')+'\n';
      writeFileSync(join(tmp,`${split}.jsonl`),body,{flag:'wx',mode:0o600});
      files[split] = {file:`${split}.jsonl`,count:members.length,sha256:trainingHash(body)};
    }
    const receipt = {format:'own-model-export-v1',status:'exported',plan:selected,decisionId, destination:out,
      purpose:grant.purpose, privacy:grant.privacy, restrictions:grant.restrictions, files,
      trained:false,evaluated:false,promoted:false};
    receipt.exportFingerprint = trainingHash(JSON.stringify(receipt));
    writeFileSync(join(tmp,'export.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    requireValue(!existsSync(out),'destination appeared during export');
    renameSync(tmp,out); return receipt;
  } finally {if(created)rmSync(tmp,{recursive:true,force:true});}
}
/** Actual training consumer checks exact bytes, membership/counts and a still-current approved snapshot. */
export function validateTrainingExport(root, dir, now = new Date()) {
  assertPrivateTrainingPath(dir);
  const actual = realpathSync(dir), receipt = JSON.parse(readFileSync(join(actual,'export.json'),'utf8'));
  const {exportFingerprint,...bound} = receipt;
  requireValue(receipt.format === 'own-model-export-v1' && receipt.status === 'exported' && receipt.destination === actual &&
    exportFingerprint === trainingHash(JSON.stringify(bound)), 'invalid export receipt');
  const p = validateTrainingPlan(root,receipt.plan);
  trainingApproval(root,receipt.decisionId,'Training-export',{fingerprint:p.fingerprint,tenantId:p.tenantId,destination:actual,
    purpose:receipt.purpose,taskFormat:p.taskFormat},now);
  const seen = new Set();
  for (const split of ['train','validation','evaluation']) {
    const expected = p.membership.filter(s => p.splits[split].includes(s.sessionId)).flatMap(s => s.rows.map(r => ({...r,sessionId:s.sessionId})));
    const f = receipt.files?.[split];
    requireValue(f?.file === `${split}.jsonl` && f.count === expected.length,'export split count invalid');
    const path = realpathSync(join(actual,f.file)); requireValue(dirname(path) === actual,'dataset symlink escaped export');
    const body = readFileSync(path,'utf8'); requireValue(trainingHash(body) === f.sha256,'dataset bytes changed');
    const rows = body.trim().split('\n').map(l => JSON.parse(l)); requireValue(rows.length === expected.length,'dataset row count invalid');
    for (const r of rows) {
      const key = `${r.sessionId}\0${r.id}`, m = expected.find(e => e.id === r.id && e.sessionId === r.sessionId);
      requireValue(r.tenantId === p.tenantId && m && m.sha256 === trainingHash(JSON.stringify(r)) && !seen.has(key),'dataset membership invalid'); seen.add(key);
    }
  }
  return receipt;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {const o=trainingArguments(process.argv.slice(2),['--plan','--decision','--destination','--purpose']);
    const r=exportTrainingDataset(TRAINING_ROOT,readTrainingJson(o['--plan']),{decisionId:o['--decision'],destination:o['--destination'],purpose:o['--purpose']});
    console.log(JSON.stringify({status:r.status,fingerprint:r.plan.fingerprint,exportFingerprint:r.exportFingerprint,trained:false}));
  } catch {console.error('training export refused; exact current Umesh decision and new private local destination required');process.exitCode=2;}
}

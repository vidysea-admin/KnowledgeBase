import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { evaluateExtractionCase, type ExtractionCase } from '../../../../packages/index/src/eval/extraction.js';
import { ExtractionReviewError, type ExtractionSeed, type ReviewItem, type LabelField } from './types.js';

export const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const shape = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,199}$/.test(v);
export const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function insist(ok: unknown, status = 409, code = 'sources_changed'): asserts ok { if (!ok) throw new ExtractionReviewError(status, code); }

/** Only operator-configured packets map review targets. No corpus discovery or draft conversion. */
export async function loadExtractionSeed(projectRoot: string, packetPath: string): Promise<ExtractionSeed> {
  const root = await realpath(projectRoot); let total = 0;
  async function read(path: string): Promise<Buffer> {
    const actual = await realpath(path), rel = relative(root, actual);
    insist(rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..\\`) && !rel.startsWith('../'));
    const size = (await stat(actual)).size; total += size;
    insist(size <= 16 * 1024 * 1024 && total <= 64 * 1024 * 1024);
    const bytes = await readFile(actual); insist(bytes.length === size); return bytes;
  }
  const bytes = await read(packetPath), packet = JSON.parse(bytes.toString('utf8'));
  insist(shape(packet, ['format','tenantId','cases','items']) && packet.format === 'extraction-review-seed-v1' && id(packet.tenantId));
  insist(Array.isArray(packet.cases) && packet.cases.length > 0 && packet.cases.length <= 500 && Array.isArray(packet.items) && packet.items.length > 0 && packet.items.length <= 100000);
  const cases: ExtractionCase[] = [], caseIds = new Set<string>();
  for (const c of packet.cases) {
    insist(c && typeof c === 'object' && Object.keys(c).every(k => ['id','sessionId','artifacts','mediaDuration','expectedFacts','predictedEntities'].includes(k)) && id(c.id) && id(c.sessionId) && !caseIds.has(c.id));
    caseIds.add(c.id); insist(c.artifacts && typeof c.artifacts === 'object' && !Array.isArray(c.artifacts) && Object.hasOwn(c.artifacts, 'turns'));
    const input: ExtractionCase = {id:c.id,tenantId:packet.tenantId,sessionId:c.sessionId,artifactHash:'',turns:[]}, hashes: Record<string,string> = {};
    for (const [kind, value] of Object.entries(c.artifacts).sort(([a],[b]) => a.localeCompare(b,'en'))) {
      insist(['turns','rawText','parsed','filtered','persisted'].includes(kind) && shape(value,['path','sha256','bytes']) && typeof value.path === 'string' && !isAbsolute(value.path) && digest(value.sha256) && Number.isSafeInteger(value.bytes));
      const data = await read(resolve(root,value.path)); insist(data.length === value.bytes && hash(data) === value.sha256);
      hashes[kind] = hash(data); input[kind] = kind === 'rawText' ? data.toString('utf8') : JSON.parse(data.toString('utf8'));
    }
    for (const key of ['mediaDuration','expectedFacts','predictedEntities']) if (c[key] !== undefined) input[key] = structuredClone(c[key]);
    input.artifactHash = hash(JSON.stringify({version:1,id:c.id,tenantId:packet.tenantId,sessionId:c.sessionId,mediaDuration:c.mediaDuration,expectedFacts:c.expectedFacts,predictedEntities:c.predictedEntities,hashes}));
    const report=evaluateExtractionCase(input);
    insist(!report.sourceIssues.includes('foreign-turn-owner') && Object.values(report.stages).every(stage=>stage.issues.every(issue=>!issue.code.startsWith('foreign-'))));
    cases.push(input);
  }
  const items: ReviewItem[] = [], itemIds = new Set<string>(), targets = new Set<string>();
  for (const v of packet.items) {
    insist(shape(v,['id','caseId','inputSha256','context','labelField','options']) && id(v.id) && !itemIds.has(v.id) && id(v.caseId) && digest(v.inputSha256));
    insist(shape(v.context,['candidate','source']) && typeof v.context.candidate === 'string' && typeof v.context.source === 'string' && v.context.candidate.length <= 100000 && v.context.source.length <= 100000);
    insist(['labels','factLabels','entityLabels'].includes(v.labelField as string) && Array.isArray(v.options) && v.options.length > 0 && v.options.length <= 20);
    const c = cases.find(c => c.id === v.caseId); insist(c);
    let target: string | undefined; const options = new Set<string>();
    for (const option of v.options) {
      insist(option && typeof option === 'object' && !Array.isArray(option) && option.caseId === c.id && option.artifactHash === c.artifactHash);
      const field = v.labelField as LabelField;
      const keys = field === 'labels' ? (option.status === 'omitted' ? ['caseId','artifactHash','claimId','status'] : ['caseId','artifactHash','claimId','stage','status']) : field === 'factLabels' ? (option.status === 'covered' ? ['caseId','artifactHash','factId','status','stage','claimId'] : ['caseId','artifactHash','factId','status']) : ['caseId','artifactHash','id','kind','correct'];
      insist(shape(option,keys));
      const key = field === 'labels' ? JSON.stringify([field,option.stage ?? null,option.claimId]) : field === 'factLabels' ? JSON.stringify([field,option.factId]) : JSON.stringify([field,option.kind,option.id]);
      insist(target === undefined || target === key); target = key;
      const encoded = JSON.stringify(option); insist(!options.has(encoded)); options.add(encoded);
      evaluateExtractionCase({...c,[field]:[option]});
    }
    const binding = hash(JSON.stringify({id:v.id,caseId:v.caseId,artifactHash:c.artifactHash,context:v.context,labelField:v.labelField,options:v.options}));
    insist(binding === v.inputSha256 && !targets.has(`${c.id}:${target}`)); targets.add(`${c.id}:${target}`); itemIds.add(v.id);
    items.push(structuredClone(v) as unknown as ReviewItem);
  }
  return {tenantId:packet.tenantId as string,packetSha256:hash(bytes),cases,items};
}

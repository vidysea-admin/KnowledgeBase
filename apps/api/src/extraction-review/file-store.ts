import { mkdir, readFile, rm, lstat, realpath } from 'node:fs/promises';
import { resolve, join, isAbsolute, relative } from 'node:path';
import { publishCalibrationReviewState } from '../calibration-review/persistence.js';
import { evaluateExtractionCase, aggregateExtractionReports } from '../../../../packages/index/src/eval/extraction.js';
// @ts-expect-error Existing JS adapter is bundled with this service; DTO validation happens below.
import { importAuthorizedExtraction } from '../../../../scripts/eval/extraction-authorized-import.mjs';
import { loadExtractionSeed, hash, shape, id, insist } from './seed.js';
import { ExtractionReviewError, type ExtractionReviewStore, type ExtractionSeed, type ExtractionState, type ExtractionReviewView, type ExtractionAudit, type ExtractionExport } from './types.js';
import type { RelationshipContext } from '../speaker-relations/types.js';

const equal = (a: unknown,b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const reviewAt = (state:ExtractionState,key:string) => Object.hasOwn(state.reviews,key) ? state.reviews[key] : undefined;
const utc = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function authority(context: RelationshipContext): void {
  insist(context && id(context.tenantId) && id(context.actorId) && context.canReview === true && context.reviewerKind === 'human',403,'forbidden');
}
function validate(state: ExtractionState, seed: ExtractionSeed): void {
  insist(shape(state,['format','tenantId','packetSha256','reviews']) && state.format === 'extraction-review-state-v1' && state.tenantId === seed.tenantId && state.packetSha256 === seed.packetSha256);
  insist(state.reviews && typeof state.reviews === 'object' && !Array.isArray(state.reviews));
  for (const [key,review] of Object.entries(state.reviews)) {
    const item = seed.items.find(i => i.id === key);
    insist(item && shape(review,['revision','audit']) && Number.isSafeInteger(review.revision) && review.revision > 0 && Array.isArray(review.audit) && review.audit.length === review.revision);
    for (let n=0;n<review.audit.length;n++) {
      const a=review.audit[n]!;
      insist(shape(a,['revision','itemId','inputSha256','actorId','at','label','rationale']) && a.revision === n+1 && a.itemId === key && a.inputSha256 === item.inputSha256 && id(a.actorId) && utc(a.at));
      insist(typeof a.rationale === 'string' && !!a.rationale.trim() && a.rationale.length <= 20000 && item.options.some(option => equal(option,a.label)));
    }
  }
}
function view(seed: ExtractionSeed,state: ExtractionState): ExtractionReviewView {
  return {format:'extraction-review-view-v1',tenantId:seed.tenantId,packetSha256:seed.packetSha256,total:seed.items.length,reviewedCount:Object.keys(state.reviews).length,humanGoldVerified:false,bindingThresholds:null,
    items:seed.items.map(item => {
      const r=reviewAt(state,item.id), a=r?.audit.at(-1);
      return {...structuredClone(item),revision:r?.revision ?? 0,audit:structuredClone(r?.audit ?? []),review:a ? {label:structuredClone(a.label),rationale:a.rationale,actorId:a.actorId,at:a.at} : null};
    })};
}
export interface FileExtractionReviewOptions { root: string; projectRoot: string; packetPath: string; now?:()=>string }
export function createFileExtractionReviewStore(options: FileExtractionReviewOptions): ExtractionReviewStore {
  insist([options.root,options.projectRoot,options.packetPath].every(p=>typeof p==='string'&&isAbsolute(p)),503,'unavailable');
  const root=resolve(options.root), corpus=resolve(options.projectRoot), packet=resolve(options.packetPath), now=options.now ?? (()=>new Date().toISOString());
  const inside=(parent:string,child:string)=>{const rel=relative(parent,child);return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\'));};
  insist(!inside(root,corpus)&&!inside(root,packet)&&!inside(corpus,root),503,'unavailable');
  const paths=(tenant:string)=>({file:join(root,`${hash(tenant)}.json`),lock:join(root,`${hash(tenant)}.lock`)});
  async function current(context:RelationshipContext):Promise<ExtractionSeed> {
    authority(context); const seed=await loadExtractionSeed(corpus,packet); insist(seed.tenantId===context.tenantId,404,'not_found'); return seed;
  }
  async function safeRoot():Promise<void> { insist(!(await lstat(root)).isSymbolicLink() && resolve(await realpath(root))===root,503,'unavailable'); }
  async function load(seed:ExtractionSeed):Promise<ExtractionState> {
    let state:ExtractionState; const file=paths(seed.tenantId).file;
    try { await safeRoot(); insist(!(await lstat(file)).isSymbolicLink(),503,'unavailable'); const size=(await lstat(file)).size; insist(size<=64*1024*1024,503,'unavailable'); state=JSON.parse(await readFile(file,'utf8')) as ExtractionState; }
    catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; state={format:'extraction-review-state-v1',tenantId:seed.tenantId,packetSha256:seed.packetSha256,reviews:{}}; }
    validate(state,seed); return state;
  }
  async function locked<T>(tenant:string,work:()=>Promise<T>):Promise<T> {
    await mkdir(root,{recursive:true,mode:0o700}); await safeRoot(); const lock=paths(tenant).lock;
    try { await mkdir(lock); } catch(error) { if((error as NodeJS.ErrnoException).code==='EEXIST')throw new ExtractionReviewError(409,'conflict'); throw error; }
    try{return await work();}finally{await rm(lock,{recursive:true}).catch(()=>undefined);}
  }
  async function unchanged(context:RelationshipContext,seed:ExtractionSeed):Promise<void> { insist((await current(context)).packetSha256===seed.packetSha256); }
  return {
    async read(context) { const seed=await current(context),state=await load(seed); await unchanged(context,seed); return view(seed,state); },
    async approve(context,itemId,input) {
      authority(context);
      return locked(context.tenantId,async()=>{
        const seed=await current(context),item=seed.items.find(i=>i.id===itemId); insist(item,404,'not_found');
        insist(shape(input,['expectedRevision','inputSha256','label','affirmIndividualReview','rationale']) && input.affirmIndividualReview===true && typeof input.rationale==='string' && !!input.rationale.trim() && input.rationale.length<=20000 && item.options.some(o=>equal(o,input.label)),400,'invalid');
        insist(Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=0&&input.inputSha256===item.inputSha256,409,'conflict');
        const state=await load(seed),previous=reviewAt(state,itemId); insist((previous?.revision??0)===input.expectedRevision,409,'conflict');
        const at=now(); insist(utc(at),503,'unavailable');
        const audit:ExtractionAudit={revision:input.expectedRevision+1,itemId,inputSha256:item.inputSha256,actorId:context.actorId,at,label:structuredClone(input.label),rationale:input.rationale.trim()};
        state.reviews[itemId]={revision:audit.revision,audit:[...(previous?.audit??[]),audit]}; validate(state,seed);
        try { importAuthorizedExtraction(seed,state,evaluateExtractionCase,aggregateExtractionReports); } catch { throw new ExtractionReviewError(409,'conflict'); }
        await unchanged(context,seed);
        const publish=publishCalibrationReviewState as unknown as (target:string,state:ExtractionState)=>Promise<void>;
        await publish(paths(context.tenantId).file,state); return view(seed,state);
      });
    },
    async export(context) {
      authority(context);
      return locked(context.tenantId,async()=>{
        const seed=await current(context),state=await load(seed); validate(state,seed);
        const consumed=importAuthorizedExtraction(seed,state,evaluateExtractionCase,aggregateExtractionReports) as Pick<ExtractionExport,'cases'|'measurement'>;
        await unchanged(context,seed);
        return {format:'extraction-authorized-export-v1',tenantId:seed.tenantId,packetSha256:seed.packetSha256,humanGoldVerified:false,bindingThresholds:null,reviewedCount:Object.keys(state.reviews).length,total:seed.items.length,...consumed,
          remainingGate:'Authenticated individual assertions only. Independent source/fact/entity gold completeness, acquired stages, genuine owner review, approved thresholds and checker acceptance remain separate gates.'};
      });
    },
  };
}

// Factual registry reconciliation only; no TASKS/goal acceptance closure or QA verdict writes.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),path=join(import.meta.dirname,'orchestration.json');
const registry=JSON.parse(readFileSync(path,'utf8'));
const rows=[];
function lane(id,maker,checker,slug,contract=slug,combined=false){rows.push({id,maker,checker,slug,contract,combined});}
const I='/root/implementation_status',D='/root/deploy_environment',G='/root/goal_attachment_reader',Q='/root/qa_status',R='/root/roadmap_status',X='/root/docker_dependency_review';
lane('T-022',R,R+'/checker_t022','goal-t022');
for(const [id,s]of [['T-007','t007'],['T-053','t053'],['T-055','t055'],['U2.3','u23'],['U2.5','u25']])lane(id,I+'/maker_'+s,I+'/checker_'+s,'goal-'+s);
lane('U2.2',I,I+'/checker_u22','goal-u22');
for(const [id,s]of [['T-008','t008'],['T-013','t013'],['T-043','t043'],['T-056','t056'],['T-058','t058'],['U3.2','u32']])lane(id,D+'/maker_'+s,D+'/checker_'+s,'goal-'+s);
for(const [id,s]of [['T-014','t014'],['T-015','t015'],['T-059','t059'],['U0.10','u010']])lane(id,R+'/maker_'+s,R+'/checker_'+s,'goal-'+s);
lane('T-040',G,G+'/checker_t040','goal-t040-acceptance','goal-T040');
for(const [id,s,slug,c]of [['T-041','t041','t041-searchable-time-aligned-ocr','goal-T041'],['T-042','t042','t042-capture-clock-suggestions','goal-T042'],['T-044','t044','t044-qa-generation-binding','goal-T044'],['T-054','t054','t054-review-completion','goal-T054'],['U2.4','u24','u24-speaker-profile','goal-U24']])lane(id,G+'/maker_'+s,G+'/checker_'+s,slug,c);
for(const [id,s]of [['T-028','t028'],['T-057','t057']])lane(id,Q+'/maker_'+s,Q+'/checker_'+s,'goal-'+s);
lane('T-046',Q+'/maker_t046',Q+'/checker_t046','t046-retention-status-api-ui','goal-t046',true);
lane('T-050',D,Q+'/checker_t050','goal-t050');lane('T-051','/root/docker_runtime','/root/docker_checker','goal-t051');lane('T-060',Q,Q+'/checker_t060','goal-t060');lane('T-061','/root/docker_publication',Q+'/checker_t061','goal-t061');
for(const [id,m,slug]of [['T-036','docker_dependency_review','goal-t036'],['T-037','docker_assets_review','all40goal-t037'],['T-038','docker_context_review','goal-t038'],['T-052','docker_migration_review','t052-approved-registration-workflow'],['T-011','docker_frontend_review','t011-live-consent-orchestration'],['T-034','docker_ci_trigger_review','t034-parallel-workspace-20261014'],['T-035','docker_ci_isolation_review','t035-lean-video-measured-encode'],['T-045','docker_governance_review','goal-t045'],['T-048','docker_health_review','t048-single-dispatch-20261014']])lane(id,'/root/'+m,X+'/checker_'+id.replace('T-','t'),slug,'goal-'+id.replace('T-','t'));
lane('T-039','/root/docker_docs_review',X+'/checker_t039',null,'goal-t039');
const byId=new Map(rows.map(row=>[row.id,row]));
function read(p){return p&&existsSync(join(root,p))?readFileSync(join(root,p),'utf8'):null;}
for(const task of registry.tasks){const row=byId.get(task.id);if(!row)continue;
  Object.assign(task,{maker:row.maker,checker:row.checker,roleVerification:'actual coordinator/maker/checker messages reconciled; file status below is freshly read'});
  const manifest=row.slug?(row.combined?'qa/goal-t046/'+row.slug+'.md':'qa/manifests/'+row.slug+'.md'):null;
  const text=read(manifest),verdict=row.slug?'qa/verdicts/'+row.slug+'.md':null;
  task.manifest=text?manifest:null;task.packet=row.combined?task.manifest:(read('qa/packets/'+row.slug+'.md')?'qa/packets/'+row.slug+'.md':null);
  task.contract=read('qa/contracts/'+row.contract+'.md')?'qa/contracts/'+row.contract+'.md':null;
  task.verdict=read(verdict)?verdict:null;
  task.observedHandshake=text?.match(/(?:Handshake status|Status):\*?\*?\s*([^\r\n]+)/i)?.[1]?.trim()??'no current submitted manifest';
  task.observedCycle=text?.match(/Fix cycle:\*?\*?\s*(\d+)/i)?.[1]??null;
  task.sourceStage=task.observedHandshake;task.parentAcceptance='NOT VERIFIED';
}
registry.updatedAt=new Date().toISOString();registry.allocationEvidence='Actual collaboration inventory reported 81 including root: 80 allocated source/checker actors. No new actors spawned.';
registry.cpuQueue={authority:'/root/docker_governance_review',stateFile:'qa/goal-2026-10-14/test-queue.json',centralActive:false,
  supersedesAuthority:'/root/docker_checker',reason:'Root appointed sole ordinary-validation coordinator after platform safety gating; gated work is not retried.'};
registry.centralReceipts={lock:'qa/goal-2026-10-14/lock-receipt.json',frozenInstall:'qa/goal-2026-10-14/install-receipt.json',schemaInitial:'qa/goal-2026-10-14/schema-receipt.json',generationInitial:'qa/goal-2026-10-14/generate-receipt.json',schemaRepair:'qa/goal-2026-10-14/schema-repair-receipt.json',generationRepair:'qa/goal-2026-10-14/generate-repair-receipt.json',contracts:'qa/goal-2026-10-14/contracts-receipt.json',apiCompiler:'qa/goal-2026-10-14/api-types-receipt.json',webCompiler:'qa/goal-2026-10-14/web-types-receipt.json'};
registry.sourceGateFacts=['43 canonical schemas: original Python validator 52 valid / 64 invalid fixtures green; 11 collection migration authored, unapplied','Pinned lifecycle-disabled lock/frozen install green','Initial generation wrote18 files; actual late form audit/output provenance repair wrote2; no hand-edited generated types','API type attempt3 exit0/14239ms and web type attempt2 exit0/14090ms; previous failures retained. API build exit0/1845ms, web build exit0/16647ms. These are immutable pre-finalizer source checkpoints, not whole-task completion','T051 C1 cycle1 independent PASS and maker closeout; actual host/live/seven-day C2-C4 HOLD'];
registry.rootAttributedFocusedEvidence=['Root reports G4 --gate g4 exit0','Root reports T043 7/7 exit0','Root reports T048 27 green','Root reports U2.5 30 green','Root reports U2.3 independent25 green','Root reports T040 corrected10 green'];
Object.assign(registry.fileLeases,{'apps/api/src/composition/integrations/evaluation.ts':R,'apps/api/src/composition/integrations/knowledge.ts':I,'apps/api/src/composition/integrations/answers.ts':D,'apps/api/src/composition/integrations/hosting.ts':Q,'apps/api/src/composition/integrations/transcripts.ts':G,'apps/api/src/composition/integrations/automation.ts':'/root/docker_publication','apps/api/src/visibility/knowledge.ts':I+'/maker_t007','Dockerfile + .github/workflows/docker.yml + scripts/qa/container-workflows/**':'/root/docker_governance_review'});
writeFileSync(path,JSON.stringify(registry,null,2)+'\n');
const matrix=['# All forty task acceptance matrix','',`Updated ${registry.updatedAt}. All forty parents have current authored work and remain in_progress under D170. Source/software evidence never closes actual human, provider, host, production or seven-day gates.`,'','| Task | Parent status | Actual maker | Actual checker | Current file handshake | Parent acceptance |','| --- | --- | --- | --- | --- | --- |',...registry.tasks.map(t=>`| ${t.id} | ${t.parentStatus} | ${t.maker??'await receipt'} | ${t.checker??'await receipt'} | ${t.observedHandshake??'await receipt'} | NOT VERIFIED |`),'','Immutable coherent compiler/build checkpoint is green (API types attempt3, web types attempt2, both builds attempt1); later capture/factory changes remain pending checks. Current Docker CI is not yet proved. Docker baseline ed542fd remains separately published and checked. All post-baseline changes are uncommitted/unpushed at this checkpoint.',''];
writeFileSync(join(import.meta.dirname,'acceptance-matrix.md'),matrix.join('\n'));
console.log(`Reconciled ${rows.length} actual role rows against ${registry.tasks.length} tracked tasks; no parent task closure.`);

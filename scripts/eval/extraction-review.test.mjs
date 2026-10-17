import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {loadBundle,pendingExport,validateExport,editor,renderEditor,bridge,preserveOutput} from './extraction-review.mjs';
const bundle=loadBundle(), pending=pendingExport(bundle);
function declaredReview(count=1) {
  const r=structuredClone(pending);
  for (let i=0;i<count;i++) Object.assign(r.entries[i],{status:'declared',decision:'approve-draft',literalCitationSupport:bundle.entries[i].aiDraft.literalCitationSupport,
    reviewer:'Umesh',reviewedAt:'2026-10-14T12:00:00.000Z',rationale:'Fixture declaration only; never real human gold.'});
  return r;
}
test('unchanged72 draft bundle and all citation contexts survive; initial approval fields blank',()=>{
  assert.equal(bundle.entries.length,72);assert.equal(new Set(bundle.entries.map(e=>e.claimId)).size,72);
  assert.equal(bundle.entries.reduce((n,e)=>n+e.literalCitationContexts.length,0),80);
  assert.equal(bundle.entries.reduce((n,e)=>n+e.literalCitationContexts.filter(c=>!c.current.available).length,0),14);
  assert.equal(bundle.entries.filter(e=>e.replacementProposal).length,7);
  assert.equal(validateExport(bundle,pending).pending,72);assert.equal(bundle.humanGold,false);
});
test('partial and complete declarations never become authenticated human labels',()=>{
  for (const count of [1,72]) {const r=validateExport(bundle,declaredReview(count));assert.equal(r.declared,count);assert.equal(r.pending,72-count);assert.equal(r.humanGold,false);assert.equal(r.semanticLabelsImported,0);}
});
test('strictly rejectmissing duplicate unknown and reordered hash tampering',()=>{
  for (const mutate of [r=>r.entries.pop(),r=>r.entries[1]=r.entries[0],r=>r.entries[0].claimId='foreign',r=>r.entries[0].sourceBindingSha256='0'.repeat(64),r=>r.sourcePacketSha256='0'.repeat(64),r=>r.draftIndexSha256='0'.repeat(64)]) {
    const r=structuredClone(pending);mutate(r);assert.throws(()=>validateExport(bundle,r));
  }
  const reordered=structuredClone(pending);reordered.entries.reverse();assert.equal(validateExport(bundle,reordered).pending,72);
});
test('reject bulk promotion thresholds fabricated truth and extra keys at every boundary',()=>{
  for (const mutate of [r=>r.humanGold=true,r=>r.bindingThresholds={precision:1},r=>r.approvedBy='Umesh',r=>r.entries[0].humanGold=true,r=>r.entries[0].factLabels=[],r=>r.entries[0].status='approved',r=>r.entries[0].reviewer='Umesh']) {
    const r=structuredClone(pending);mutate(r);assert.throws(()=>validateExport(bundle,r));
  }
});
test('reject invalid declared identity date decision rationale label and draft mismatch',()=>{
  for (const mutate of [r=>r.entries[0].reviewer='AI',r=>r.entries[0].reviewedAt='2026-02-30T12:00:00.000Z',r=>r.entries[0].reviewedAt='tomorrow',r=>r.entries[0].decision='approve-all',r=>r.entries[0].literalCitationSupport='true',r=>r.entries[0].literalCitationSupport='supported',r=>r.entries[0].rationale=' ',r=>r.entries[0].rationale='x'.repeat(4001)]) {
    const r=declaredReview();mutate(r);assert.throws(()=>validateExport(bundle,r));
  }
});
test('explicit override is accepted but still unverified',()=>{
  const r=declaredReview();r.entries[0].decision='override-draft';r.entries[0].literalCitationSupport='partially_supported';assert.equal(validateExport(bundle,r).declared,1);
});
test('output is byte-idempotent and refuses reviewed-byte overwrite',()=>{
  const dir=mkdtempSync(resolve(tmpdir(),'u22review-'));
  try {const path=resolve(dir,'review.json');preserveOutput(path,'first');preserveOutput(path,'first');writeFileSync(path,'reviewed');assert.throws(()=>preserveOutput(path,'first'),/existing-output-differs/);assert.equal(readFileSync(path,'utf8'),'reviewed');} finally {rmSync(dir,{recursive:true,force:true});}
});
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.value='';this.textContent='';this.attributes={};}
  append(...items){this.children.push(...items);}setAttribute(k,v){this.attributes[k]=v;}
  click(){this.clicked=true;}remove(){this.removed=true;}
}
test('actual editor handler recordsone explicit item, resets it, exports all72 without autoapproval',()=>{
  const nodes={items:new Element('main'),coverage:new Element('p'),export:new Element('button')},body=new Element('body'),download=[];
  const document={getElementById:id=>nodes[id],createElement:tag=>new Element(tag),body};
  const URL={createObjectURL:blob=>{download.push(blob);return 'blob:local';},revokeObjectURL:()=>{}};
  const r=runInNewContext(`(${editor.toString()})(bundle,initial)`,{bundle,initial:pending,document,structuredClone,Blob,URL,Date,Map});
  assert.equal(nodes.items.children.length,72);assert.equal(r.entries.filter(e=>e.status==='declared').length,0);
  const card=nodes.items.children[0],select=card.children.find(e=>e.tag==='select'),note=card.children.find(e=>e.tag==='textarea'),buttons=card.children.filter(e=>e.tag==='button');
  buttons[0].onclick();assert.equal(r.entries[0].status,'pending');select.value='unsupported';note.value='Literal source does not support claim';buttons[0].onclick();
  assert.equal(validateExport(bundle,JSON.parse(JSON.stringify(r))).declared,1);assert.equal(r.entries[1].status,'pending');
  nodes.export.onclick();assert.equal(download.length,1);assert.equal(body.children[0].clicked,true);assert.equal(body.children[0].removed,true);
  buttons[1].onclick();assert.equal(validateExport(bundle,JSON.parse(JSON.stringify(r))).pending,72);
});
test('source text cannot close script or inject executable markup',()=>{
  const poison=structuredClone(bundle);poison.entries[0].persistedClaim.text='</script><img src=x onerror=alert(1)>';
  const html=renderEditor(poison);assert.equal((html.match(/<script>/g)||[]).length,1);assert.equal((html.match(/<\/script>/g)||[]).length,1);assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('\\u003c/script>'));
});
test('real immediate extraction consumer remains unlabelled with honest stage/acquisition gaps',()=>{
  const report=bridge(bundle,declaredReview(72));assert.equal(report.status,'HUMAN_GATE');assert.equal(report.declarations.declared,72);assert.equal(report.humanGold,false);
  assert.equal(report.measurement.complete,false);assert.equal(report.measurement.summary.stages.persisted.rows,72);assert.equal(report.measurement.summary.stages.persisted.invalidCitationRate.denominator,80);
  assert.equal(report.measurement.summary.stages.persisted.invalidCitationRate.numerator,14);
  assert.ok(report.stageGaps.some(c=>c.unavailableStages.some(s=>s.stage==='raw')));
  assert.ok(report.measurement.cases.every(c=>!c.semantic.measured && !c.semantic.factsMeasured));
  assert.ok(report.measurement.failures.length>0);assert.ok(report.measurement.inventory.undeclared.includes('2026-10-13-zoom-webinar-p1'));
});
test('refuse alternate or changed corpus instead of mixing72 declarations with a subset measurement',()=>{
  assert.throws(()=>bridge(bundle,pending,'subset.json'),/alternate-corpus-refused/);
  const changed=structuredClone(bundle);changed.corpusBinding.sha256='0'.repeat(64);
  assert.throws(()=>bridge(changed,pending),/corpus-drift/);
});

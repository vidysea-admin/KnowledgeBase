import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {editor, pendingExport, validateExport} from './extraction-review.mjs';
import {renderResumedEditor, resumeEditor} from './extraction-review-resume.mjs';

// Synthetic fixtures only: these are not copied source claims or human judgments.
function fixture() {
  const bundle = {sourcePacketSha256:'packet',draftIndexSha256:'draft',humanGold:false,bindingThresholds:null,sessions:[],entries:Array.from({length:72},(_,i)=>({
    ordinal:i+1,claimId:`synthetic-${i}`,sessionId:'synthetic',claimRecordSha256:`claim-${i}`,sourceBindingSha256:'source',persistedClaim:{text:`Synthetic claim ${i}`},
    aiDraft:{literalCitationSupport:'unsupported',literalRationale:'Synthetic draft'},literalCitationContexts:[],replacementProposal:null}))};
  const review = pendingExport(bundle);
  Object.assign(review.entries[0],{status:'declared',decision:'approve-draft',literalCitationSupport:'unsupported',reviewer:'Umesh',reviewedAt:'2026-10-15T12:00:00.000Z',rationale:'Synthetic declaration; not actual authorization.'});
  return {bundle,review};
}
class Element {
  constructor(tag) {this.tag=tag;this.children=[];this.value='';this.textContent='';}
  append(...children) {this.children.push(...children);}
  setAttribute() {}
  querySelector(tag) {return this.children.find(child=>child.tag===tag);}
  get lastElementChild() {return this.children.at(-1);}
  click() {}
  remove() {}
}
test('resume restores saved controls and original date, pending items stay empty, export validates',async()=>{
  const {bundle,review}=fixture(), before=JSON.stringify(review), downloads=[];
  // Reordering an otherwise valid export must not attach a decision to the wrong card.
  review.entries.reverse();
  const nodes={items:new Element('main'),coverage:new Element('p'),export:new Element('button')};
  const document={getElementById:id=>nodes[id],createElement:tag=>new Element(tag),body:new Element('body')};
  const resumed=runInNewContext(`const editor=${editor.toString()};(${resumeEditor.toString()})(bundle,review)`,{bundle,review,document,structuredClone,Blob,Date,Map,URL:{createObjectURL:blob=>{downloads.push(blob);return 'blob:fixture';},revokeObjectURL(){}}});
  const card=nodes.items.children[0], pending=nodes.items.children[1];
  assert.equal(card.querySelector('select').value,'unsupported');assert.match(card.querySelector('textarea').value,/Synthetic declaration/);
  assert.match(card.lastElementChild.textContent,/2026-10-15T12:00:00.000Z/);assert.equal(pending.querySelector('select').value,'');
  assert.equal(resumed.entries.find(e=>e.claimId==='synthetic-0').reviewedAt,'2026-10-15T12:00:00.000Z');
  nodes.export.onclick();const exported=JSON.parse(await downloads[0].text());
  assert.equal(validateExport(bundle,exported).declared,1);assert.equal(exported.humanGold,false);
  assert.equal(JSON.stringify([...review.entries].reverse()),JSON.stringify(JSON.parse(before).entries));
  card.children.filter(e=>e.tag==='button')[1].onclick();
  assert.equal(validateExport(bundle,JSON.parse(JSON.stringify(resumed))).pending,72);
});
test('render binds exact input bytes, retains context and prevents script breakout',()=>{
  const {bundle,review}=fixture();review.entries[0].rationale='</script><img src=x onerror=alert(1)>';
  const bytes=Buffer.from(JSON.stringify(review,null,2)+'\n'), html=renderResumedEditor(bundle,review,bytes);
  assert.ok(html.includes(createHash('sha256').update(bytes).digest('hex')));
  assert.equal((html.match(/<script>/g)||[]).length,1);assert.equal((html.match(/<\/script>/g)||[]).length,1);
  assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('\\u003c/script>'));assert.match(html,/Resumed 1\/72/);
  assert.throws(()=>renderResumedEditor(bundle,review,Buffer.from('{}')),/resume-input-drift/);
});
test('resume rejects stale, foreign, incomplete and promoted declarations through existing strict consumer',()=>{
  for (const change of [r=>r.sourcePacketSha256='stale',r=>r.draftIndexSha256='stale',r=>r.entries[0].sourceBindingSha256='foreign',r=>r.entries.pop(),r=>r.humanGold=true,r=>r.bindingThresholds={precision:1}]) {
    const {bundle,review}=fixture();change(review);assert.throws(()=>renderResumedEditor(bundle,review));
  }
});

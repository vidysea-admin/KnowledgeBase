import express from 'express';
import { requireAuth } from 'file:///D:/KnowledgeBase/apps/api/src/auth.ts';
import { createReviewAdapters, createReviewPolicyResolver } from 'file:///D:/KnowledgeBase/apps/api/src/review-authority/policy.ts';
import { createExtractionReviewRouter } from 'file:///D:/KnowledgeBase/apps/api/src/extraction-review/router.ts';
import { ExtractionReviewError } from 'file:///D:/KnowledgeBase/apps/api/src/extraction-review/types.ts';
const sha=(c:string)=>c.repeat(64);
const items=[0,1].map(i=>({id:`item-${i}`,caseId:`case-${i}`,inputSha256:sha(String(i+1)),context:{candidate:`Fictional candidate ${i} <b>not bold</b>`,source:`Fictional source ${i}`},labelField:i?'entityLabels':'factLabels',options:i?[{correct:true},{correct:false}]:[{supported:true},{supported:false}]}));
const state:Record<string,{revision:number;audit:any[]}>={}; for(const it of items) state[it.id]={revision:0,audit:[]};
const view=()=>({format:'extraction-review-view-v1',tenantId:'fixture',packetSha256:sha('a'),total:2,reviewedCount:Object.values(state).filter(s=>s.audit.length).length,humanGoldVerified:false,bindingThresholds:null,
  items:items.map(it=>{const s=state[it.id];const last=s.audit[s.audit.length-1];return {...it,revision:s.revision,review:last?{label:last.label,rationale:last.rationale,actorId:last.actorId,at:last.at}:null,audit:s.audit};})});
const store={
  read:async()=>view(),
  approve:async(c:any,id:string,b:any)=>{const it=items.find(x=>x.id===id);if(!it)throw new ExtractionReviewError(404,'not_found');const s=state[id];
    if(b.expectedRevision!==s.revision)throw new ExtractionReviewError(409,'conflict');
    if(b.inputSha256!==it.inputSha256||b.affirmIndividualReview!==true||!b.rationale?.trim())throw new ExtractionReviewError(400,'invalid');
    if(!it.options.some(o=>JSON.stringify(o)===JSON.stringify(b.label)))throw new ExtractionReviewError(400,'invalid');
    s.revision++;s.audit.push({revision:s.revision,itemId:id,inputSha256:it.inputSha256,actorId:c.actorId,at:new Date().toISOString(),label:b.label,rationale:b.rationale});(globalThis as any).LAST={body:b,actor:c.actorId};return view();},
  export:async()=>({format:'extraction-authorized-export-v1',tenantId:'fixture',packetSha256:sha('a'),humanGoldVerified:false,bindingThresholds:null,reviewedCount:view().reviewedCount,total:2,cases:[],measurement:{cases:[],summary:{measured:view().reviewedCount}},remainingGate:'Actual complete human gold and thresholds remain required.'}),
} as any;
const policy=createReviewAdapters(createReviewPolicyResolver(JSON.stringify({version:1,tenants:[{tenantId:'fixture',keys:[
 {keyId:'human',subject:'trusted-human',reviewerKind:'human',canPropose:false,canReview:true,answerActions:[]},
 {keyId:'robot',subject:'robot',reviewerKind:'automation',canPropose:true,canReview:false,answerActions:[]}]}]})));
const app=express();
app.use((req,res,next)=>{res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');if(req.method==='OPTIONS'){res.sendStatus(204);return;}next();});
app.use(express.json());
app.get('/__last',(_q,r)=>{r.json((globalThis as any).LAST??null);});
app.use(requireAuth({verify:async(key:string)=>['human','robot'].includes(key)?{tenantId:'fixture',keyId:key,scopes:['compete']}:null} as any));
app.use(createExtractionReviewRouter({store,contextFor:policy.relationshipContextFor}));
app.listen(3300,'127.0.0.1',()=>console.log('listening 3300'));

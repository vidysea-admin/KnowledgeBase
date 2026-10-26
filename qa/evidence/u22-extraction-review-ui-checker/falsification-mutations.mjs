import fs from 'node:fs';
const S='C:/Users/Lenovo/AppData/Local/Temp/claude/d--KnowledgeBase/c2ef8d8a-4751-4a78-9ee6-bc8beb4a8c1f/scratchpad/u22';
const P='apps/web/src/pages/extraction-review/';
const m={
 k1:[P+'client.ts','/extraction-review/items/${encodeURIComponent(item.id)}','/extraction-review/items/${item.id}'],
 k2:[P+'client.ts','expectedRevision: item.revision,','expectedRevision: item.revision + 1,'],
 k3:[P+'ExtractionReviewPage.tsx','<select id="extraction-label" value={choice}','<select id="extraction-label" value={choice || "0"}'],
 k4:[P+'ExtractionReviewPage.tsx','onChange={e => { setRationale(e.target.value); setAffirm(false); }}','onChange={e => { setRationale(e.target.value); }}'],
 k5:[P+'ExtractionReviewPage.tsx','setBusy(true); setError(""); setNotice(""); setExported(null); setAffirm(false);\n    try {\n      const result = await saveExtractionReview','setBusy(true); setError(""); setNotice(""); setExported(null);\n    try {\n      const result = await saveExtractionReview'],
 k6:[P+'ExtractionReviewPage.tsx','result.packetSha256 !== packet || result.tenantId !== view.tenantId','result.packetSha256 !== packet'],
 k7:[P+'ExtractionReviewPage.tsx','try { const result = await getExtractionReview(apiKey); if (generation === epoch.current) setView(result); }','try { const result = await getExtractionReview(apiKey); setView(result); }'],
 k8:[P+'ExtractionReviewPage.tsx','{exported.total - exported.reviewedCount} pending','0 pending'],
 k9:[P+'ExtractionReviewPage.tsx','{item.audit.length > 0 && <details>','{false && <details>'],
};
for(const [k,[f,a,b]] of Object.entries(m)){
  const p=`${S}/${k}/${f}`; let t=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
  const n=t.split(a).length-1; if(n!==1){console.log(k,'MATCH COUNT',n);continue;}
  fs.writeFileSync(p,t.replace(a,()=>b)); console.log(k,'mutated');
}

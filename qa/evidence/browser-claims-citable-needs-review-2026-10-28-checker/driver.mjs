// Checker-owned Mode D driver: visible (non-headless) Google Chrome over CDP, fresh profile. Records the PID it started.
import { spawn } from "node:child_process"; import fs from "node:fs"; import path from "node:path";
const E = process.env.EVID_DIR, WEB = process.env.WEB_URL, CDP = Number(process.env.CDP_PORT ?? 9344), PROF = process.env.PROFILE_DIR;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ch = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [`--remote-debugging-port=${CDP}`, `--user-data-dir=${PROF}`, "--no-first-run", "--no-default-browser-check", "--window-size=1280,1000", "about:blank"], { stdio: "ignore" });
fs.writeFileSync(path.join(PROF, "..", "chrome.pid"), String(ch.pid));
let targets; for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {} await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === "Runtime.exceptionThrown") errs.push("EXC " + m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception?.description || "").slice(0, 200));
  else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push("CONSOLE " + m.params.args.map((a) => a.value || a.description).join(" ").slice(0, 250));
  else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errs.push("LOG " + m.params.entry.text + " " + (m.params.entry.url || "")); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) return "ERR " + JSON.stringify(r.result.exceptionDetails).slice(0, 400); return r.result.result.value; };
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable");
const nav = async (u) => { await send("Page.navigate", { url: u }); await sleep(2500); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(E, name), Buffer.from(r.result.data, "base64")); return name; };
const realClick = async (selectorExpr) => { // genuine mouse events at element centre
  const box = await ev(`(()=>{const el=${selectorExpr};el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 }); };
const H = `
window.$sleep=ms=>new Promise(r=>setTimeout(r,ms));
window.$until=async(f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){try{const v=f();if(v)return v;}catch{}await $sleep(50);}throw new Error('timeout '+f);};
window.$setVal=(el,v)=>{const p=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,v);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
window.$btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t);
window.$txt=()=>document.body.innerText; 1`;
const out = { unit: "claims-citable-needs-review", date: "2026-10-28", browser: "Google Chrome (visible, non-headless) over CDP, fresh profile, killed after", chromePid: ch.pid, pages: {} };
// ---- page 1: knowledge outputs
await nav(WEB + "/"); await ev(`localStorage.setItem('lkbApiKey','checker-key')`); errs = [];
await nav(WEB + "/knowledge-outputs"); await ev(H);
out.pages.knowledgeOutputs = {};
const P = out.pages.knowledgeOutputs;
P.loaded = await ev(`(async()=>{await $until(()=>$txt().includes('Admissions briefing (synthetic)'));return {h1:document.querySelector('h1').innerText}})()`);
await shot("01-create-form.png");
P.fill = await ev(`(async()=>{$setVal(document.querySelector('#output-title'),'Admissions FAQ');$setVal(document.querySelector('#output-purpose'),'Prepare Monday applications');const cb=[...document.querySelectorAll('input[type=checkbox]')][0];cb.click();await $sleep(100);return {checked:cb.checked,submitDisabled:$btn('Generate draft').disabled}})()`);
await realClick(`$btn('Generate draft')`);
P.generated = await ev(`(async()=>{await $until(()=>$btn('Edit draft'));
  const lis=[...document.querySelectorAll('section.card li')].filter(li=>li.querySelector('blockquote'));
  return {status:document.querySelector('[role=status]')?.innerText, partialNote:$txt().includes('Coverage is partial'), withheldNote:(($txt().match(/(\\d+) source claims were excluded/)||[])[1]??null),
   citations:lis.map(li=>({text:li.innerText.replace(/\\n/g,' | '),hasMarker:li.innerText.includes('Unverified (needs review)'),href:li.querySelector('a')?.getAttribute('href')})),
   markerCountOnPage:[...document.querySelectorAll('strong')].filter(s=>s.innerText==='Unverified (needs review)').length, conflictingQuoteShown:$txt().includes('Transcripts are waived')}})()`);
await ev(`document.querySelector('blockquote').scrollIntoView({block:'center'})`); await sleep(400);
await shot("02-draft-with-markers.png");
// export: capture markdown through the real Download button
P.exportMarkdown = await ev(`(async()=>{window.$dl=[];const oc=URL.createObjectURL;URL.createObjectURL=b=>{window.$dl.push(b);return 'blob:x'};const oclick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){window.$dl.push('click:'+this.download)};
  const b=$btn('Download Markdown'); const disabled=b.disabled; b.click(); await $until(()=>window.$dl.length>=2);
  const blob=window.$dl.find(x=>x instanceof Blob); const md=await blob.text(); URL.createObjectURL=oc;HTMLAnchorElement.prototype.click=oclick;
  return {disabled, lines:md.split('\\n').filter(l=>/Unverified|Applications open|Scholarship/.test(l)), markerLines:md.split('\\n').filter(l=>l.includes('Unverified (needs review)')).length}})()`);
errs = errs.slice(); const errsPage1 = [...errs];
// ---- click the needs-review citation (real mouse click) -> session page, evidence turn
await realClick(`[...document.querySelectorAll('section.card li')].find(li=>li.innerText.includes('Unverified (needs review)')).querySelector('a')`);
await sleep(2500); await ev(H);
errs = [];
out.pages.citationClickTarget = {};
const C = out.pages.citationClickTarget;
C.afterClick = await ev(`(async()=>{await $until(()=>document.querySelector('[data-turn-id]'));await $sleep(500);const hl=[...document.querySelectorAll('[data-turn-id]')].map(d=>({id:d.dataset.turnId,text:d.innerText.replace(/\\n/g,' | '),border:getComputedStyle(d).borderColor}));
  const cited=document.querySelector('[data-turn-id="t2"]'); return {url:location.pathname+location.hash, h1:document.querySelector('h1')?.innerText, turns:hl, citedText:cited?.innerText.replace(/\\n/g,' | '), notFound:$txt().includes('cited passage was not found'),
   citedInViewport:(()=>{const r=cited.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})(), citedHighlightedVsOthers:getComputedStyle(cited).borderColor!==getComputedStyle(document.querySelector('[data-turn-id="t1"]')).borderColor}})()`);
await shot("03-citation-target-session-turn.png");
C.consoleErrors = errs.length; C.errors = [...errs];
P.consoleErrors = errsPage1.length; P.errors = errsPage1;
// ---- reopen the saved draft from Saved drafts
await nav(WEB + "/knowledge-outputs"); await ev(H); errs = [];
out.pages.reopenSaved = await ev(`(async()=>{await $until(()=>$btn('Admissions FAQ'));$btn('Admissions FAQ').click();await $until(()=>$btn('Edit draft'));
  return {markerCount:[...document.querySelectorAll('strong')].filter(s=>s.innerText==='Unverified (needs review)').length}})()`);
out.pages.reopenSaved.consoleErrors = errs.length; out.pages.reopenSaved.errors = [...errs];
out.seen = await (await fetch(process.env.API_URL + "/__seen")).json();
out.totalConsoleErrors = (P.consoleErrors ?? 0) + C.consoleErrors + out.pages.reopenSaved.consoleErrors;
fs.writeFileSync(path.join(E, "report.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
ws.close(); try { process.kill(ch.pid); } catch {} process.exit(0);

import fs from 'node:fs';
for (const k of ['base','k7']) {
  const p=`${k}/apps/web/src/pages/extraction-review/ExtractionReviewPage.test.tsx`;
  let t=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
  t=t.replace('import { cleanup, fireEvent, render, screen, waitFor }','import { act, cleanup, fireEvent, render, screen, waitFor }');
  t=t.replace('toHaveTextContent("trusted human reviewer"); finish(fixture(true));','toHaveTextContent("trusted human reviewer"); await act(async () => { finish(fixture(true)); await new Promise(r => setTimeout(r, 50)); });');
  fs.writeFileSync(p,t); console.log(k, t.includes('await act(async')); 
}

// Independent boundary probe: controlled synthetic processes/files only.
// No product source mutation, provider, DB, browser or external message.
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runNodeScript} from '../../../scripts/webinar/graph/stage-process.mjs';

const root = mkdtempSync(join(tmpdir(), 'lkb-checker-trailing-'));
const cases = [];
try {
  // Synchronous writes exceed normal pipe capacity; the final diagnostic is
  // accepted by the OS before the direct child exits, not necessarily drained.
  writeFileSync(join(root, 'large.mjs'), `import {writeSync} from 'node:fs';
const bytes=Buffer.alloc(1024*1024, 120);
writeSync(2,bytes);writeSync(2,'\\nHTTP 503\\n');process.exit(1);`);
  for(let attempt=0;attempt<8;attempt++) {
    let code;
    try {await runNodeScript(root,'large.mjs',[],{LKB_PIPELINE_STAGE_TIMEOUT_MS:'5000'});code='resolved';}
    catch(error) {code=error.code;assert.equal(error.message,'Pipeline stage failed');}
    cases.push({case:'direct-large-tail',attempt,code,expected:'provider-5xx'});
  }
  // A realistic inherited stderr pipe remains open briefly after its direct
  // owner exits. The descendant is deliberately bounded and exits itself.
  writeFileSync(join(root, 'descendant.mjs'), `setTimeout(()=>{
process.stderr.write('HTTP 503\\n',()=>process.exit(0));},80);
setTimeout(()=>process.exit(124),1500).unref();`);
  writeFileSync(join(root, 'inherited.mjs'), `import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['descendant.mjs'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','ignore',2]});
child.unref();process.exit(1);`);
  let code;
  try {await runNodeScript(root,'inherited.mjs',[],{LKB_PIPELINE_STAGE_TIMEOUT_MS:'5000'});code='resolved';}
  catch(error) {code=error.code;assert.equal(error.message,'Pipeline stage failed');}
  cases.push({case:'inherited-tail-after-direct-exit',code,expected:'provider-5xx'});
  // Bound fixture lifetime before removing its owned directory.
  await new Promise(resolve=>setTimeout(resolve,1700));
  console.log(JSON.stringify({proof:'trailing-child-diagnostic',cases,passed:cases.filter(c=>c.code===c.expected).length,total:cases.length}));
  assert.equal(cases.every(c=>c.code===c.expected),true,'retry diagnostic lost before stderr close');
} finally {
  rmSync(root,{recursive:true,force:true});
}

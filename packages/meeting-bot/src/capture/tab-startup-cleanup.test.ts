import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createTabBrowserDeps} from "./tab-browser.js";

// A real disposable Node child impersonates the recorder protocol, never Chrome.
const child = `import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const args=process.argv,ext=args[args.indexOf('--capture-extension')+1],stop=args[args.indexOf('--stop-file')+1];
const dir=path.dirname(ext),handle=path.basename(ext).slice('.extension-'.length),status=path.join(dir,handle+'.webm.status.json');
const cfg=JSON.parse(readFileSync(path.join(ext,'config.json'),'utf8'));
writeFileSync(path.join(dir,'receiver.json'),JSON.stringify({endpoint:cfg.endpoint}));
writeFileSync(status,process.env.CLEANUP_CASE==='corrupt' ? '{' : JSON.stringify({tenantId:'foreign',untouched:true}));
console.log(JSON.stringify({event:'fatal',error:'fixture startup refused'}));
const timer=setInterval(()=>{if(existsSync(stop)){writeFileSync(path.join(dir,'child-stopped'),'yes');clearInterval(timer);}},20);`;

for (const scenario of ["corrupt", "foreign"]) {
  test(`ISS-CAPTUREMAKER-001: ${scenario} failure status cannot strand owned startup resources`, {timeout: 15000}, async () => {
    const dir=mkdtempSync(path.join(tmpdir(),"tab-startup-cleanup-")),script=path.join(dir,"child.mjs");
    const old=process.env.CLEANUP_CASE;process.env.CLEANUP_CASE=scenario;
    writeFileSync(script,child);
    const recordDir=path.join(dir,"record"),profileDir=path.join(dir,"profile");
    const tab=createTabBrowserDeps({python:process.execPath,joinScript:script,recordDir,profileDir,
      sessionId:"fixture",tenantId:"fixture",startupTimeoutMs:3000,
      extensionDir:fileURLToPath(new URL("../../py/tab-capture",import.meta.url)),log:()=>{}});
    try {
      for(let retry=0;retry<2;retry++) {
        await assert.rejects(tab.deps.launch("http://127.0.0.1/",{tenantId:"fixture",consentNote:"fixture only"}),/fixture startup refused/);
        assert.equal(existsSync(path.join(profileDir,".lkb-tab-capture.lock")),false);
        assert.equal(readdirSync(recordDir).some(name=>name.startsWith(".extension-")),false);
        assert.equal(readFileSync(path.join(recordDir,"child-stopped"),"utf8"),"yes");
        const {endpoint}=JSON.parse(readFileSync(path.join(recordDir,"receiver.json"),"utf8"));
        await assert.rejects(fetch(endpoint+"/control",{signal:AbortSignal.timeout(1000)}));
      }
      for(const name of readdirSync(recordDir).filter(name=>name.endsWith(".status.json"))) {
        assert.equal(readFileSync(path.join(recordDir,name),"utf8"),scenario==="corrupt" ? "{" : JSON.stringify({tenantId:"foreign",untouched:true}));
      }
    } finally {
      if(old===undefined)delete process.env.CLEANUP_CASE;else process.env.CLEANUP_CASE=old;
      await tab.disconnect();rmSync(dir,{recursive:true,force:true});
    }
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createTabBrowserDeps} from "./tab-browser.js";

const child=`import {existsSync,readFileSync,statSync} from 'node:fs';
const argv=process.argv,ext=argv[argv.indexOf('--capture-extension')+1],stop=argv[argv.indexOf('--stop-file')+1];
const cfg=JSON.parse(readFileSync(ext+'/config.json','utf8'));
const post=(route,body)=>fetch(cfg.endpoint+route,{method:'POST',headers:{Origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',Authorization:'Bearer '+cfg.token},body});
await post('/event',JSON.stringify({event:'capture-started'}));await post('/chunk?seq=0','fixture-media');
while(!(await(await post('/control','{}')).json()).stop)await new Promise(r=>setTimeout(r,20));
await post('/event',JSON.stringify({event:'capture-stopped',failed:false}));
while(!existsSync(stop)||!statSync(stop).isFile())await new Promise(r=>setTimeout(r,20));`;

for(const scenario of ["stop-directory","corrupt-status","foreign-status"]){
  test(`ISS-CAPTUREMAKER-003: ${scenario} stop refusal cleans only owned resources and permits retry`,{timeout:20000},async()=>{
    const root=mkdtempSync(path.join(tmpdir(),"tab-stop-cleanup-")),script=path.join(root,"child.mjs");writeFileSync(script,child);
    function adapter(name:string){
      const recordDir=path.join(root,name,"record"),profileDir=path.join(root,name,"profile");
      const tab=createTabBrowserDeps({python:process.execPath,joinScript:script,recordDir,profileDir,sessionId:name,tenantId:"fixture",
        startupTimeoutMs:3000,extensionDir:fileURLToPath(new URL("../../py/tab-capture",import.meta.url)),log:()=>{}});
      return {tab,recordDir,profileDir};
    }
    const owned=adapter("owned"),peer=adapter("peer");
    const launch=async(entry:ReturnType<typeof adapter>)=>{
      const {sessionHandle}=await entry.tab.deps.launch("http://127.0.0.1/",{tenantId:"fixture",consentNote:"fixture only"});
      const config=JSON.parse(readFileSync(path.join(entry.recordDir,`.extension-${sessionHandle}`,"config.json"),"utf8"));
      return {handle:sessionHandle,config,output:entry.tab.outputPath(sessionHandle)!};
    };
    try{
      const first=await launch(owned),other=await launch(peer);
      assert.ok(first.config.token!==other.config.token,"Independent receivers must have distinct credentials");
      const stopFile=path.join(owned.recordDir,`.stop-${first.handle}`),status=first.output+".status.json";
      let retained:string|undefined;
      if(scenario==="stop-directory")mkdirSync(stopFile);
      else {retained=scenario==="corrupt-status"?"{":JSON.stringify({tenantId:"foreign",untouched:true});writeFileSync(status,retained);}
      await assert.rejects(owned.tab.deps.stop!(first.handle),error=>{
        assert.ok(error instanceof Error);
        if(scenario==="stop-directory")assert.match(error.message,/EISDIR|EPERM|EACCES/);
        else if(scenario==="corrupt-status")assert.ok(error instanceof SyntaxError);
        else assert.match(error.message,/ownership changed/);
        return true;
      });
      await owned.tab.browserExited(first.handle);
      await assert.rejects(fetch(first.config.endpoint+"/control",{signal:AbortSignal.timeout(1000)}));
      assert.equal(existsSync(path.join(owned.profileDir,".lkb-tab-capture.lock")),false);
      assert.equal(readdirSync(owned.recordDir).some(name=>name.startsWith(".extension-")),false);
      assert.equal(readFileSync(first.output,"utf8"),"fixture-media");
      if(retained!==undefined)assert.equal(readFileSync(status,"utf8"),retained,"Foreign or corrupt evidence must remain untouched");
      else assert.ok(lstatSync(stopFile).isDirectory(),"Never recursively remove a replacement directory");
      const peerControl=()=>fetch(other.config.endpoint+"/control",{headers:{Origin:"chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",Authorization:`Bearer ${other.config.token}`}});
      assert.deepEqual(await(await peerControl()).json(),{stop:false},"Unrelated capture remains running");
      const retry=await launch(owned);await owned.tab.deps.stop!(retry.handle);
      assert.deepEqual(await(await peerControl()).json(),{stop:false},"Same-adapter retry must not stop its peer");
      await peer.tab.deps.stop!(other.handle);
      assert.equal(readFileSync(other.output,"utf8"),"fixture-media");
    }finally{
      await owned.tab.disconnect().catch(()=>{});await peer.tab.disconnect().catch(()=>{});
      rmSync(root,{recursive:true,force:true});
    }
  });
}

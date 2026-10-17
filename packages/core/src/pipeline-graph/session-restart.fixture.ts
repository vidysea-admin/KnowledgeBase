/** Owned subprocess fixture for real-file checkpoint/replay tests. Never an application entrypoint. */
import {readFileSync, existsSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {FileJobQueue} from "../job-queue/file-job-queue.js";
import {createRunStateStore} from "../run-state-store/run-state-store.js";
import {runSessionThroughGraph} from "./session-run.js";

const [root, mode] = process.argv.slice(2);
if (!root || !mode || !["committed", "unacknowledged", "resume"].includes(mode)) throw new Error("fixture arguments required");
setTimeout(() => process.exit(124),75000).unref(); // A parent killed by an outer timeout cannot leave this fixture alive.
const count = join(root,"first-calls.txt"), artifact=join(root,"derived.txt");
const result=await runSessionThroughGraph({
  tenantId:"restart-tenant",runKey:"sample",sourceFingerprint:"stable-source",workerId:`worker-${process.pid}`,
  queue:new FileJobQueue({dir:join(root,"queue"),now:Date.now,leaseMs:2000}),
  store:createRunStateStore(join(root,"runs")),now:Date.now,heartbeatMs:100,
  def:{leaseMs:2000,stages:[{name:"first",deps:[],maxAttempts:3,retryable:[]},{name:"consume",deps:["first"],maxAttempts:3,retryable:[]}]},
  handlers:{
    first:async () => {
      const calls=existsSync(count)?Number(readFileSync(count,"utf8")):0;
      writeFileSync(count,String(calls+1)); writeFileSync(artifact,"deterministic sample output");
      if(mode==="unacknowledged") {
        writeFileSync(join(root,"waiting.txt"),"side effect before acknowledgement");
        await new Promise<void>(() => {setInterval(() => undefined,1000);});
      }
      return {kind:"ok",outputFingerprint:"derived-fingerprint"};
    },
    consume:async () => {
      if(mode==="committed") {
        writeFileSync(join(root,"waiting.txt"),"first stage acknowledged");
        await new Promise<void>(() => {setInterval(() => undefined,1000);});
      }
      if(readFileSync(artifact,"utf8")!=="deterministic sample output") throw new Error("downstream output invalid");
      writeFileSync(join(root,"consumed.txt"),"verified downstream sample");
      return {kind:"ok",outputFingerprint:"consumed-fingerprint"};
    },
  },
});
if(!result.ok||result.run.outcome!=="complete") throw new Error(JSON.stringify(result));
writeFileSync(join(root,"complete.json"),JSON.stringify(result));

import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const batch=JSON.parse(readFileSync(process.argv[2],'utf8')),base='qa/evidence/goal-t051checker-broker-';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const queuePath='qa/goal-2026-10-14/test-queue.json';
for(const [position,name] of batch.ready.entries()){
 if(existsSync(base+'pause-for-priority.json')){const q=JSON.parse(readFileSync(queuePath,'utf8'));q.active=null;q.pendingBatch={path:process.argv[2],remaining:batch.ready.slice(position)};q.updatedAt=new Date().toISOString();writeFileSync(queuePath,JSON.stringify(q,null,2)+'\n');console.log(JSON.stringify({state:'deferred for priority slot',remaining:batch.ready.slice(position)}));break;}
 const path=base+name+'-spec.json',s=JSON.parse(readFileSync(path,'utf8'));
 const drift=Object.entries(s.pins).filter(([p,h])=>!existsSync(p)||hash(p)!==h.toLowerCase());
 let q=JSON.parse(readFileSync(queuePath,'utf8'));q.updatedAt=new Date().toISOString();
 if(drift.length){q.completed.push({scope:name,state:'preflight skipped',drift});writeFileSync(queuePath,JSON.stringify(q,null,2)+'\n');console.log(JSON.stringify({unit:name,skipped:drift}));continue;}
 if(existsSync(s.output+'.json'))throw Error('Immutable output already exists: '+s.output);
 q.active={agent:'/root/docker_checker',scope:name,state:'bounded serial execution',runnerPid:process.pid};writeFileSync(queuePath,JSON.stringify(q,null,2)+'\n');
 const r=spawnSync(process.execPath,[base+'run.mjs',path],{cwd:process.cwd(),encoding:'utf8',timeout:s.timeoutMs+5000,maxBuffer:4194304,windowsHide:true,shell:false});
 const receipt=existsSync(s.output+'.json')?JSON.parse(readFileSync(s.output+'.json')):null;
 q=JSON.parse(readFileSync(queuePath,'utf8'));q.active=null;q.updatedAt=new Date().toISOString();q.completed.push({scope:name,receipt:s.output+'.json',exitCode:receipt?.exitCode??r.status,elapsedMs:receipt?.elapsedMs,hashesUnchanged:receipt?.hashesUnchanged,error:r.error?.code});writeFileSync(queuePath,JSON.stringify(q,null,2)+'\n');
 const stdout=receipt?readFileSync(receipt.stdoutPath,'utf8'):'';console.log(JSON.stringify({unit:name,exit:receipt?.exitCode??r.status,ms:receipt?.elapsedMs,unchanged:receipt?.hashesUnchanged,summary:stdout.match(/^[ℹ#] (?:tests|pass|fail|skipped|duration_ms).*$/gm),error:r.error?.code}));
}

// Fixed argv-only install/codegen phases. No package lifecycle, provider or database calls.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [phase, program, ...args] = process.argv.slice(2);
if (!['lock','install','schema','generate','contracts','schema-repair','generate-repair','api-types','web-types','api-build','web-build'].includes(phase) || !program) throw new Error('Unsupported phase');
const root=resolve(import.meta.dirname,'../..');
const limit=phase==='lock'||phase==='install'||phase.endsWith('-types')||phase.endsWith('-build')?120000:60000;
const started=Date.now();let stdout='',stderr='',timedOut=false;
const child=spawn(program,args,{cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',b=>{stdout+=b;process.stdout.write(b)});
child.stderr.on('data',b=>{stderr+=b;process.stderr.write(b)});
const timer=setTimeout(()=>{timedOut=true;const kill=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>child.kill());},limit);
child.on('error',error=>{stderr+=String(error);});
child.on('close',(code,signal)=>{clearTimeout(timer);const receipt={phase,program,args,pid:child.pid,exit:code,signal,timedOut,startedAt:new Date(started).toISOString(),endedAt:new Date().toISOString(),elapsedMs:Date.now()-started,stdout,stderr};writeFileSync(resolve(import.meta.dirname,`${phase}-receipt.json`),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({phase,exit:code,timedOut,elapsedMs:receipt.elapsedMs,pid:child.pid}));process.exitCode=timedOut?124:code??1;});

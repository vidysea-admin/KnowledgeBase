import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const root = resolve(process.argv[1]?.endsWith('registration-checker-probe.mjs') ? process.argv[2] || '.' : fileURLToPath(new URL('..',import.meta.url)));
const {registerInBrowser} = await import(pathToFileURL(join(root, 'packages/meeting-bot/src/joiners/browser-joiner.ts')));
const fixtureRoot = mkdtempSync(join(root,'data', 'registration-checker-fixtures-'));
const input = {url:'https://organizer.example/register', allowedHosts:['organizer.example'],
  operator:{firstName:'Fixture',lastName:'Operator',email:'fixture@example.test'},
  form:{mode:'native-html',formSelector:'#registration',submitSelector:'button[type=submit]',
    fields:{firstName:'#first',lastName:'#last',email:'#email'}}};
const submitted = 'console.log(JSON.stringify({event:"registration-result",status:"submitted",reason:"awaiting_confirmation"}));';
const fatal = 'console.log(JSON.stringify({event:"fatal",error:"private fixture diagnostic"}));';
const cases = [
  ['positive', submitted, true, false],
  ['nonzero', `${submitted}process.exitCode=7;`, false, true],
  ['signal', `${submitted}setTimeout(()=>process.kill(process.pid,"SIGTERM"),20);`, false, true],
  ['fatal-before', `${fatal}${submitted}`, false, true],
  ['fatal-after', `${submitted}${fatal}`, false, true],
  ['duplicate', `${submitted}${submitted}`, false, true],
  ['conflicting', `${submitted}console.log(JSON.stringify({event:"registration-result",status:"uncertain",reason:"browser_failure"}));`, false, true],
  ['invalid-after-valid', `${submitted}console.log(JSON.stringify({event:"registration-result",status:"submitted",reason:"private-value!"}));`, false, true],
  ['invalid-before-valid', `console.log(JSON.stringify({event:"registration-result",status:"invalid",reason:"browser_failure"}));${submitted}`, false, true],
  ['missing', 'console.log(JSON.stringify({event:"progress",status:"submitted"}));', false, true],
  ['ordinary-progress', `console.log("ordinary diagnostic");console.log(JSON.stringify({event:"progress"}));${submitted}`, true, false],
  ['uncertain-positive', 'console.log(JSON.stringify({event:"registration-result",status:"uncertain",reason:"unsafe_form"}));', false, false],
  ['action-required-positive', 'console.log(JSON.stringify({event:"registration-result",status:"action_required",reason:"unsafe_form"}));', false, false],
  ['overflow', `${submitted}process.stdout.write("x".repeat(70000));`, false, true],
  ['timeout', `${submitted}setInterval(()=>{},100);`, false, true],
  ['cleanup-failure', `${submitted}process.exitCode=7;`, false, true, true],
];
let passed=0;
for (const [name,body,maySubmit,cleanupExpected,cleanupFailure] of cases) {
  const dir = join(fixtureRoot,name); const profileDir=dir;
  const script=join(fixtureRoot,`${name}.cjs`), receipt=join(fixtureRoot,`${name}.cleanup.json`);
  const cleanup = `require("node:fs").writeFileSync(${JSON.stringify(receipt)},JSON.stringify(process.argv.slice(2)));process.exitCode=${cleanupFailure?9:0};`;
  writeFileSync(script,`if(process.argv.includes("--cleanup-only")){${cleanup}}else{process.stdin.resume();process.stdin.on("end",()=>{${body}});}`);
  const start=performance.now();
  const result=await registerInBrowser(input,{python:process.execPath,joinScript:script,profileDir,timeoutMs:1000});
  const hasCleanup=existsSync(receipt);
  const output={name,result,cleanup:hasCleanup,elapsedMs:Math.round(performance.now()-start)};
  if (hasCleanup) {
    const argv=JSON.parse(readFileSync(receipt));
    assert.deepEqual(argv,['about:blank','--profile',profileDir,'--title','LKB registration','--stop-file',`${profileDir}/registration-stop`,'--cleanup-only']);
  }
  assert.equal(result.status==='submitted',maySubmit,JSON.stringify(output));
  assert.equal(hasCleanup,cleanupExpected,JSON.stringify(output));
  if(cleanupExpected) assert.equal(result.status,'uncertain',JSON.stringify(output));
  if(cleanupFailure) assert.equal(result.reason,'owned_cleanup_failed',JSON.stringify(output));
  if(name==='uncertain-positive') assert.deepEqual(result,{status:'uncertain',reason:'unsafe_form'});
  if(name==='action-required-positive') assert.deepEqual(result,{status:'action_required',reason:'unsafe_form'});
  passed++; console.log(JSON.stringify(output));
}
console.log(JSON.stringify({passed,total:cases.length,fixtureRoot}));

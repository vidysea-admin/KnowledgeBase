# Independent verdict: t050-langgraph-executor-replacement

VERDICT: PASS
Cycle checked: 0
Scope: D-161 official LangGraph 1.x executor replacement behind the existing buildGraph/runGraph seam, including original behavior and immediate session-run consumption. This does not complete T-050 or the operational release. Global integration lint/dependency checks, graph-finalize driver campaign, live long-stage heartbeat/restart/provider/index acceptance, default-off promotion and the later Ask replacement remain separate gates.

## Acceptance and checked bytes

Authority: D-161, Approved-by Umesh, requires actual official library execution, an exact version pin, unchanged behavior/tests and LKB_PIPELINE_GRAPH flag. Installed packages/core/node_modules/@langchain/langgraph/package.json and packages/core/package.json both identify exactly 1.4.18. No graph-specific QA contract exists; no contract was added or lowered. Relevant runner boundaries are lease fencing, tenant-scoped context and runner-owned persistence/terminal disposition. The frozen stage validator has no contracts and is explicitly vacuous.

Manifest and packet: qa/manifests/t050-langgraph-executor-replacement.md and qa/packets/t050-langgraph-executor-replacement.md, ready-for-check, cycle 0. Base HEAD 4f449b27e8573a5fd0fb8d88bdbd2b260b1ecccd. All changed source, complete changed executor logic, existing tests and immediate session-run consumer reviewed. Untracked packet/manifest included. No Ask/driver/dependency/flag changes belong to this candidate.

SHA256, validated against packet at 09:05 UTC and rechecked at 09:12:06 and 09:24:12 UTC on 2026-10-14:

- packages/core/src/pipeline-graph/pipeline-graph.ts: EBFF696D0BD2359A030F8CF5B98208694A73DEBEC3091AB3E01B847FDE433830
- packages/core/src/pipeline-graph/graph-types.ts: 4DB7E804BD0AB45917FA48AF93A3C7D4D75E6179E2822388F5B67F11079C9115
- packages/core/src/pipeline-graph/pipeline-graph.test.ts: 1EECADC893F739E4C40AB88ABB4A33817D2A28D49F98EE1F38580CA03953AF58

## Independent evidence

Official StateGraph was instrumented in-process, with prototype methods restored in finally and zero product-file mutations. Its actual compile and compiled invoke ran five times; the positive execution visited planner -> stage_0 -> planner through wrapped library callbacks. A compile marker propagated by identity before any handler, proving the package is on the required execution path rather than merely installed. Six assertions groups passed: successful node plus step/save warnings; runner store-write refusal; wrong-tenant runner refusal with zero extra handler calls; zero iteration cap with zero runner steps; waiting with zero extra handler calls; mandatory official compile path.

Exact invocation, cwd packages/core: Python subprocess.run(["C:/Program Files/nodejs/node.exe", "--import", "file:///C:/Users/product/Desktop/KnowledgeBase/.cache/coordination/safe-test-runtime/register.mjs", "--input-type=module", "-e", PROBE], timeout=30). PROBE is reproduced below. Exit 0, measured subprocess duration 1.985 seconds. Output:

```text
{"proof":"official StateGraph compile+invoke+callback-routing","cases":6,"passed":6,"compiles":5,"invokes":5,"handlerCalls":2,"productMutations":0}
EXIT 0 ELAPSED_SEC 1.985
```

One initial invocation used C:/... as --import instead of the required file:/// URL and failed before test code: ERR_UNSUPPORTED_ESM_URL_SCHEME, exit 1, duration 0.078 seconds. The corrected invocation above passed. This was not a product failure or a permission bypass; the coordinator supplied the synchronous TypeScript hook to avoid worker/esbuild subprocesses.

Original ledger union was read. ISS-T050GRAPH-001: recorded reproduction is the record-commands.ts --index/--process-video guard compared with skip-screen graph behavior. Checker independently read that exact source guard and replayed buildGraph(WEBINAR_PIPELINE, handlers, {skip:["screen"]}); 1/1 refused, error names index's screen dependency and the CLI requirement, zero handlers ran. Exact invocation uses the same Python/node/hook command above with SKIP_PROBE below, timeout=30. Exit 0, duration 1.750 seconds:

```text
{"issue":"ISS-T050GRAPH-001","recordedReproductions":1,"refused":1,"handlerCalls":0,"cliRule":"matched"}
EXIT 0 ELAPSED_SEC 1.75
```

ISS-T050GRAPH-002: no executable recorded reproduction exists in its ledger row. Explicit AT-LEAST-ONCE/idempotent-handler text remains in both source headers; checker reviewed resume and crash-before-succeed cases and attributed their successful runtime replay to the unchanged maker suite below. This documentation finding has zero recorded executable cases; no case was omitted or replaced with an easier corpus.

Independent frozen-contract command from root: Python subprocess.run(["python", "contracts/verify_contracts.py"], timeout=30). Exit 0, duration 0.125 seconds; output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Independently ran `git diff --check -- packages/core/src/pipeline-graph`, exit 0, no output; combined scoped read/hash/diff tool duration 0.544 seconds, standalone diff timing unknown.

## Attributed maker evidence, not rerun here

Byte-bound cycle-0 manifest reports exact command, cwd root, Python subprocess timeout=120:

`C:/Program Files/nodejs/node.exe --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs packages/core/src/pipeline-graph/pipeline-graph.test.ts packages/core/src/pipeline-graph/session-run.test.ts`

Exit 0, elapsed 14.062 seconds, tests 25/pass 25/fail 0/cancelled 0/skipped 0/todo 0, test duration_ms 13937.9675. Graph 19 and immediate downstream session 6. Coordinator independently confirmed these counts. Covered existing sequencing, fingerprints, screen-failure blocking index, lease-expired resume, completed-run refusal, retry exhaustion/recovery, handler-throw message suppression, bad result, tenant separation/forged lease, stale lease, waiting, optional leaf skip, iteration cap, and new cap boundaries/30 retries/reserved stage names. This is the affected sample-stage plus immediate downstream evidence; no live provider/DB/browser claim.

Typecheck: Python subprocess.run(["C:/Program Files/nodejs/node.exe", "node_modules/typescript/bin/tsc", "--noEmit", "-p", "packages/core/tsconfig.json"], timeout=120), exit 0, elapsed 5.328 seconds. Earlier concurrent knowledge-output errors were repaired by their owning lane; no graph diagnostics occurred. An earlier tsx/esbuild EPERM and user-aborted pending escalation did not execute successful test bodies and are not counted as passing evidence.

## Source findings and timing

The planner node calls the same runner policy and returns the selected generated stage identifier. A stage settles only through existing succeed/fail; structured errors and warnings flow into GraphRun. No second persistence/checkpoint authority exists. Generated identifiers avoid workflow-name collisions with library/internal names. The caller's iteration cap remains the authority and the library recursion allowance accommodates its planner/stage supersteps. The existing session heartbeat wrapper and default-off selection are untouched. No acceptance violation found.

Exact initial checker dispatch/launch timestamp was not recorded, so total launch-to-verdict elapsed is unknown and is not represented as a 2–3 minute result. First timestamped source review began 2026-10-14 08:43:30.451 UTC; reviewed source and consumer before packet readiness; pin validation recorded 09:05:00.117; final complete test/security source review and pin check recorded 09:12:06.902; final post-replay pin check recorded 09:24:12.793. Candidate BUILDING/readiness, scheduler slot waits and maker sandbox interruption were explicitly observed in messages; their exact durations and command start/end wall timestamps are unknown. The long elapsed interval was not an expanded suite, and is not assigned to drafting or approval by subtraction. Runtime commands were run only under coordinator GO, sequentially, and slot released after proof/validator then after the separately granted exact ledger replay. Draft/persist began after the final hash check; completion timestamp is in the final line below. No checker approval request was needed for successful commands.

ISSUES-WRITTEN: none
EXPLANATION: Complete scoped source/reproduction/library-execution evidence supports PASS. Reused evidence is explicitly attributed above. No full-task acceptance, activation, deployment or global integration certification is implied. No unrelated sweep or broad suite was launched.

## Reproducible independent probe inputs

PROBE:

```javascript
import assert from 'node:assert/strict';
import { StateGraph } from '@langchain/langgraph';
import { buildGraph, runGraph } from './src/pipeline-graph/pipeline-graph.ts';
const originalCompile=StateGraph.prototype.compile, originalAdd=StateGraph.prototype.addNode;
let compiles=0,invokes=0,visited=[],calls=0;
StateGraph.prototype.addNode=function(name,action,...args){return originalAdd.call(this,name,typeof action==='function'?(...a)=>{visited.push(name);return action(...a);}:action,...args);};
StateGraph.prototype.compile=function(...args){compiles++;const compiled=originalCompile.apply(this,args), invoke=compiled.invoke.bind(compiled);compiled.invoke=(...a)=>{invokes++;return invoke(...a);};return compiled;};
const lease={tenantId:'A',runKey:'session',workerId:'w',attempt:1};
const def={name:'probe',leaseMs:1000,stages:[{name:'only',deps:[],optional:false,maxAttempts:1,retryable:[]}]};
const started={ok:true,value:{kind:'started',attempt:{stage:'only',attemptId:'a'},inputFingerprint:'source:fp',attemptNumber:1,cause:'first-run'},warnings:['step-warning']};
const success={ok:true,value:{kind:'complete'}};
const built=buildGraph(def,{only:c=>{calls++;assert.equal(c.tenantId,'A');return {kind:'ok',outputFingerprint:'out'};}});assert.equal(built.ok,true);
function runner(steps,settle={ok:true,value:null,warnings:['save-warning']}){let count=0;return {step:()=>{count++;return steps.shift();},succeed:()=>settle,fail:()=>settle,skip:()=>{throw Error('unexpected skip');},count:()=>count};}
try{
 const out=await runGraph({runner:runner([started,success]),graph:built.graph,lease});
 assert.deepEqual([out.outcome,out.ran,out.warnings],['complete',['only'],['step-warning','save-warning']]);assert.deepEqual(visited,['planner','stage_0','planner']);assert.equal(calls,1);assert.equal(compiles,1);assert.equal(invokes,1);
 const fault={source:'store',code:'probe-write-refused',message:'persist refused'};visited=[];
 const failed=await runGraph({runner:runner([started],{ok:false,error:fault}),graph:built.graph,lease});assert.equal(failed.outcome,'error');assert.deepEqual(failed.error,fault);assert.deepEqual(visited,['planner','stage_0']);
 const tenantFault={source:'runner',code:'tenant-refused',message:'foreign lease'},before=calls;
 const tenant=await runGraph({runner:runner([{ok:false,error:tenantFault}]),graph:built.graph,lease:{...lease,tenantId:'B'}});assert.deepEqual(tenant.error,tenantFault);assert.equal(calls,before);
 const zr=runner([started]),zero=await runGraph({runner:zr,graph:built.graph,lease,maxIterations:0});assert.equal(zero.error.code,'iteration-cap');assert.equal(zr.count(),0);assert.equal(calls,before);
 const waiting=await runGraph({runner:runner([{ok:true,value:{kind:'waiting',reason:'busy'}}]),graph:built.graph,lease});assert.equal(waiting.outcome,'waiting');assert.equal(calls,before);
 const marker=new Error('official-compile-marker');StateGraph.prototype.compile=()=>{throw marker;};await assert.rejects(runGraph({runner:runner([started,success]),graph:built.graph,lease}),error=>error===marker);assert.equal(calls,before);
 console.log(JSON.stringify({proof:'official StateGraph compile+invoke+callback-routing',cases:6,passed:6,compiles,invokes,handlerCalls:calls,productMutations:0}));
}finally{StateGraph.prototype.compile=originalCompile;StateGraph.prototype.addNode=originalAdd;}
```

SKIP_PROBE:

```javascript
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WEBINAR_PIPELINE} from './src/domain/pipeline-workflow.ts';
import {buildGraph} from './src/pipeline-graph/pipeline-graph.ts';
const cli=readFileSync('../meeting-bot/src/capture/record-commands.ts','utf8');
assert.ok(cli.includes('if (rest.includes("--index") && !rest.includes("--process-video")) throw new Error("--index requires --process-video");'));
let calls=0;
const handlers=Object.fromEntries(WEBINAR_PIPELINE.stages.map(s=>[s.name,()=>{calls++;return {kind:'ok',outputFingerprint:'fp'};}]));
const result=buildGraph(WEBINAR_PIPELINE,handlers,{skip:['screen']});
assert.equal(result.ok,false);assert.match(result.error,/cannot skip stage screen: stage index requires it/);assert.match(result.error,/--index requires --process-video/);assert.equal(calls,0);
console.log(JSON.stringify({issue:'ISS-T050GRAPH-001',recordedReproductions:1,refused:1,handlerCalls:calls,cliRule:'matched'}));
```

Persist completion confirmed UTC: 2026-10-14T09:26:07.3853051Z

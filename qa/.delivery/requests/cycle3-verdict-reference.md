# Calendar operational completion — primary independent final CODE reviewer
Cycle checked: 3
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: CONTINUE-NEEDED
CODE-REVIEW: FAIL
PUSH-CANDIDATE: NO
SENIOR-REVIEW: Block
Active unit: qa/manifests/calendar-bot-code-release.md; explicitly approved product cycle3 of max3, no reset. Full original C1-C8 remains unaccepted.
CHECK-PLAN: CODE -> validate87-file identity and whole-unit path inventory; read three closing repair files and scanner/parser/store/DB/attendance/selector consumers; independent positive/negative acquisition-to-durable-refresh acceptance; mounted disabled-default/enabled-invalid acceptance; one isolated critical refusal falsification. Internal authorized operator/API audience; code-push boundary only.
SERIAL: user forbids subagents. No source, manifest, ledger, credentials, production, network, send, commit or push actions.
CHECKED-STATE: HEAD/base 0c2edb1497d40c227a4dd216a06bbe31b9fe502e; release-source-identity.json SHA256 a5e354108b288ac943af152ff19c3bb97e6e67126b86901fd394c984c9f1bcb1; all87 files match before/after; git diff inventory87files,4606insertions/796deletions, zero paths outside identity. Node v24.13.1 Windows x64. Installed checker SHA256835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1 matches pinned contract; lock a42c0cd17ac0b2afda449c0b00c0de9ea02923319800accb3c01faf6570b10fd. Read installed checker/senior/data guidance; no fresh root policy-check claim.

PROPOSED-ISSUE: C4-EMPTY-TIME-REFUSAL [P2, C4, >99% confidence]. Missing/unparseable time can retain scheduling authority from an old approved occurrence. apps/api/src/gws/gws-gmail.ts:196-201 only emits unresolved-body when parsed.some(...) is true. When every MIME part parses to {}, both refusal tests are bypassed. public-webinars.ts:247-263 returns {} for absent receipt or a yearless date outside31days; missing timezone also returns no concrete time. store.ts:175-180 forwards no evidenceIssue; packages/db/src/collections/meeting-candidates.ts:18-23,71-99 preserves old occurrence/status and refreshes only supplied provenance. auto-join.ts:187 refuses only a present evidenceIssue, so the old approved instant schedules. This is the same original C4 uncertainty/old-approval boundary, not a request for a new feature.
Own deterministic scanner -> API refresh -> durable DB helper -> actual selector reproduction: yearless/no provider receipt, yearless/outside31days and explicit year/missing zone each scheduled1 instead of0. Original approved status and2099-10-15T10:00Z occurrence retained; no unresolved-body persisted. Explicit-year equal-time control schedules1. Same-link conflicting MIME times and nearby receipt-inferred year each persist unresolved-body and schedule0. Six cases, three safety assertions fail; command exits1. Exact executable input/output below. Synthetic mail and in-memory DB only.

CLOSURE: named same-link MIME conflict PASS; nearby receipt-inferred year refusal PASS; explicit-year positive scheduling PASS; yearless registration intent PASS; disabled/no-flags native mounted GET200 and explicitly enabled invalid worker/rules refusal before reads PASS. General original-C4 uncertainty criterion remains FAIL on empty-parse refreshes.

INDEPENDENT COMMANDS AND RESULTS:
1. node --test --test-concurrency=1 --test-name-pattern=uncertain acquired time|requires source year|conflicting MIME|yearless registration|disabled Compose defaults --import tsx apps/api/src/gws/gws-gmail.test.ts scripts/webinar/scheduler/deps-runtime.test.mjs apps/api/src/composition/integrations/mounted-routes.test.ts -> exit0;4/4PASS,0skip, duration4872.2738ms. Existing mounted test covers both disabled defaults and invalid-enabled refusal.
2. node --import tsx --input-type=module (stdin below; child timeout30000ms) -> exit1, AssertionError: all uncertain refreshes must refuse scheduling,3 !==0. No external adapter invoked.
3. Isolated copy command: node --test --test-concurrency=1 --test-name-pattern=uncertain acquired time --import tsx scripts/webinar/scheduler/deps-runtime.test.mjs -> GREEN1/1 exit0 duration2068.2242ms; change only the copy's gws-gmail.ts:198 from 'if (parsed.some(time => time.timeProvenance?.yearSource' to 'if (false && parsed.some(time => time.timeProvenance?.yearSource' -> intended RED1/1failed exit1 duration2706.6694ms, assertion1 !==0 at deps-runtime.test.mjs:172. Each child timeout30000ms; finally restores byte backup and Buffer.equals=true; original hash unchanged. Initial copy setup lacked schema/whatsapp_candidates.schema.json and failed ERR_MODULE_NOT_FOUND; that was not counted as falsification. After copying schema, GREEN/RED succeeded. All dependency junctions unlinked before exact-path-validated owned-copy removal. No bound-tree mutation.
4. git diff --check 0c2edb1497d40c227a4dd216a06bbe31b9fe502e -> exit0, empty stdout. git diff --stat / --name-only / --numstat against same base -> exit0;87bound files, no outside-scope path. Git warns about inaccessible global ignore and future CRLF conversion; neither command failed. git rev-parse HEAD -> 0c2edb1497d40c227a4dd216a06bbe31b9fe502e.

REUSE: root cycle3 log reports685tests/681PASS/4SKIP/0FAIL,43493.8423ms; supporting maker record only. release-precheck-inputs.json is an older57-file identity with4current mismatches (capture-policy.test.ts,mounted-routes.test.ts,gws-gmail.test.ts,deps-runtime.test.mjs); configured-shell result is older684/680/4. Complete cycle3 command/config/transitive/runtime execution identity is not present in those records. No broad execution, TSC/build or prior/sibling PASS is claimed as independently reused. Current repair's critical behavior was executed directly; fail disposition makes further broad re-execution unnecessary and user forbids it.
BASELINE: unchanged extraction-review.test.mjs expects untracked2026-10-13-zoom-webinar-p1; unchanged extraction-stage-receipts.test.mjs expects2undeclared directories but clean checkout has0; scripts/qa structure cap31/30. These remain disclosed maker baseline records, not independently re-proven here; no green overall CI claim. They do not cause this CODE FAIL.
SCOREBOARD:87/87source hashes verified;4focused acceptance tests PASS;6independent refresh cases ->3correct controls/refusals,3unsafe scheduling failures;1successful isolated falsification. No sibling current result read.
LIVE-BROWSER: not performed; read-only CODE repair scope. No deployment, Calendar/Gmail live comparison, credentials or actual attendance evidence.
REMAINING: root disposition of same C4 failure under human-approved max3cap; no automatic cycle4/reset or push. Independent aggregation required. Full parent gates remain OPEN: hosted identity/config and live Calendar/Gmail comparison, active scheduler/heartbeat, real two-slot verified AV/capture/transcripts, restart/recovery,7-day observation, Ubuntu qualification, provider-backed extraction/index/cited Ask, human semantic/evaluation and separately approved production data promotion/deployment.
ISSUES-WRITTEN: none; proposed issue only; ledger/parent manifest untouched. Previous cycle2canonical preserved in primary-checker-cycle2-preserved.md. Source unchanged; only owned review outputs written.
Metrics: start=2026-10-27T12:52:01.116Z end=2026-10-27T12:55:28.396Z wall_min=3.45 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=1 cycle=3 resumes=0 tokens=unavailable builder_min=unavailable check_min=3.45 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17

## Exact independent reproducer stdin
```javascript
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {scanGmailForMeetingCandidates} from './apps/api/src/gws/gws-gmail.ts';
import {createMeetingCandidatesDeps} from './apps/api/src/store.ts';
import {createIfNew} from './packages/db/src/collections/meeting-candidates.ts';
import {selectAutoRecordItems} from './packages/meeting-bot/src/calendar/auto-join.ts';
const url='https://meet.google.com/abc-defg-hij';
mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T12:00:00Z')});
try {
 const cases=[['explicit','Date: October 15, 2099 Time: 10 AM - 11 AM UTC','Date: October 15, 2099 Time: 10 AM - 11 AM UTC',true],['mime-conflict','Date: October 15, 2099 Time: 10 AM - 11 AM UTC','Date: October 15, 2099 Time: 12 PM - 1 PM UTC',true],['yearless-near','Date: October 27 Time: 12 PM - 1 PM PT','Date: October 27 Time: 12 PM - 1 PM PT',true],['yearless-no-receipt','Date: October 27 Time: 12 PM - 1 PM PT','Date: October 27 Time: 12 PM - 1 PM PT',false],['yearless-outside-window','Date: July 15 Time: 12 PM - 1 PM PT','Date: July 15 Time: 12 PM - 1 PM PT',true],['missing-zone','Date: October 15, 2099 Time: 10 AM - 11 AM','Date: October 15, 2099 Time: 10 AM - 11 AM',true]];
 let failed=0;
 for(const [name,plain,html,receipt] of cases){
 const [found]=await scanGmailForMeetingCandidates(10,async args=>JSON.stringify(args.includes('list')?{messages:[{id:'independent'}]}:{id:'independent',...(receipt?{internalDate:String(Date.parse('2026-10-20T11:00:00Z'))}:{}),payload:{headers:[{name:'From',value:'host@example.org'},{name:'Subject',value:'Webinar invitation'},{name:'Authentication-Results',value:'mx.google.com; dkim=pass header.d=example.org'}],mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:Buffer.from(plain+' '+url).toString('base64url')}},{mimeType:'text/html',body:{data:Buffer.from(html+' '+url).toString('base64url')}}]}}),{});
 const stored={_id:'approved',tenantId:'owner',messageId:'independent',subject:'Webinar invitation',senderEmail:'host@example.org',senderDomain:'example.org',senderAuthenticated:true,status:'approved',detectedAt:'2026-10-01T00:00:00Z',startTime:'2099-10-15T10:00:00.000Z',endTime:'2099-10-15T11:00:00.000Z',meetingUrl:url};
 let writes=0;const db={collection(){return{async findOne(){return structuredClone(stored)},async updateOne(filter,u){Object.assign(stored,u.$set);writes++;return{matchedCount:1}},async insertOne(){throw Error('unexpected insert')}}}};
 const deps=createMeetingCandidatesDeps('owner',async()=>[found],()=> 'synthetic_work',{getTrustedSender:async()=>undefined,createMeetingCandidateIfNew:(t,d)=>createIfNew(t,d,db),listAllMeetingCandidates:async()=>[structuredClone(stored)]});
 await deps.scanGmail('owner');const listed=await deps.listCandidates('owner');
 const result=selectAutoRecordItems({calendarEvents:[],candidates:listed.map(r=>({...r,id:r._id,title:r.subject})),now:'2099-10-15T10:00:00Z',leadMinutes:5,trustedSenders:{emails:[],domains:[]},alreadyScheduled:[]});
 console.log(JSON.stringify({name,acquiredRefusal:found.evidenceIssue,acquiredStart:found.startTime,storedRefusal:stored.evidenceIssue,status:stored.status,retainedStart:stored.startTime,writes,scheduled:result.toSchedule.length,skipped:result.skipped}));
 if(result.toSchedule.length!==(name==='explicit'?1:0))failed++;
 }
 assert.equal(failed,0,'all uncertain refreshes must refuse scheduling');
}finally{mock.timers.reset();}
```

## Exact independent reproducer output
```text
{"name":"explicit","acquiredStart":"2099-10-15T10:00:00.000Z","status":"approved","retainedStart":"2099-10-15T10:00:00.000Z","writes":1,"scheduled":1,"skipped":[]}
{"name":"mime-conflict","acquiredRefusal":"unresolved-body","storedRefusal":"unresolved-body","status":"approved","retainedStart":"2099-10-15T10:00:00.000Z","writes":1,"scheduled":0,"skipped":[{"sessionKey":"gmail:approved","source":"gmail","sourceId":"approved","title":"Webinar invitation","reason":"needs-review"}]}
{"name":"yearless-near","acquiredRefusal":"unresolved-body","storedRefusal":"unresolved-body","status":"approved","retainedStart":"2099-10-15T10:00:00.000Z","writes":1,"scheduled":0,"skipped":[{"sessionKey":"gmail:approved","source":"gmail","sourceId":"approved","title":"Webinar invitation","reason":"needs-review"}]}
{"name":"yearless-no-receipt","status":"approved","retainedStart":"2099-10-15T10:00:00.000Z","writes":0,"scheduled":1,"skipped":[]}
{"name":"yearless-outside-window","status":"approved","retainedStart":"2099-10-15T10:00:00.000Z","writes":1,"scheduled":1,"skipped":[]}
{"name":"missing-zone","status":"approved","retainedStart":"2099-10-15T10:00:00.000Z","writes":1,"scheduled":1,"skipped":[]}
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: all uncertain refreshes must refuse scheduling

3 !== 0

    at file:///C:/Users/Lenovo/.codex/worktrees/calendar-bot-completion/KnowledgeBase/[eval1]:22:9
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 3,
  expected: 0,
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.13.1

```

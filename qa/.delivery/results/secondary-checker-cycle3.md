# Secondary independent closing CODE review

Cycle checked: 4
Immutable delivery phase: 3
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
CODE-REVIEW: PASS
DATA-REVIEW: Approve
PUSH-CANDIDATE: YES — secondary CODE opinion; root must aggregate both blind verdicts before branch push.
FAILURES: none
ISSUES-WRITTEN: none

Same original `calendar-bot-code-release` unit. Cycles 0–3 and prior failures remain preserved. Full original C1–C8 acceptance stays **OPEN**.

Only the assigned result was written: `qa/.delivery/results/secondary-checker-cycle3.md`. No source, manifest, ledger, credentials, production/network, agents, commits or push actions. No sibling current result read.

## Findings and checked state

The repaired C4 approval-authority boundary passes.

- `gws-gmail.ts:196–201` refuses conflicting MIME instants and receipt-inferred years. At `:216–220`, existing meeting/recording exclusions run before an absent `startTime` becomes `evidenceIssue: "unresolved-body"`.
- `store.ts:175–180` forwards that refusal and prevents trusted automatic approval of refused intake. `:186–190` prevents manual approval of refused candidates.
- `meeting-candidates.ts:18–23,71–99` persists refusal through the existing tenant-scoped CAS update. Approval and occurrence fields remain preserved.
- `schedule-loaders.ts:37–58` carries refusal into scheduler inputs. `auto-join.ts:187` checks it before scheduling or relying on prior approval.

Thus an old row remains `approved`, but its refreshed uncertainty prevents attendance.

HEAD/base: `0c2edb1497d40c227a4dd216a06bbe31b9fe502e`.

Verified before and after execution:

- **87/87 source hashes match** `release-source-identity.json`.
- Identity SHA256: `b343223ff52e6dda8a5dee8ec9cee1dc5a4ff31e908d1afdcfe1f4949850e6ba`.
- Diff contains exactly those 87 paths: 4,614 insertions, 802 deletions; zero outside-scope paths.
- `git diff --check 0c2edb1497d40c227a4dd216a06bbe31b9fe502e` → exit 0, empty stdout. Git emitted only an inaccessible-global-ignore warning.
- Runtime: `v24.13.1-win32-x64`.
- Installed checker SHA256: `835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1`.
- Lock SHA256: `a42c0cd17ac0b2afda449c0b00c0de9ea02923319800accb3c01faf6570b10fd`.
- Structure config SHA256: `c8a801f40f53e5ba84b63bca2012e732d5b4f15526f75c754eb7fe86ddaf4928`.
- Supplied execution contract, repair authorization and manifest hashes match disk.

Installed checker, senior and data guidance were read. Project D-014 was read: security/auth/data-write findings remain uncapped. This is the original durable approval-authority repair, not a new feature or invented fourth human exception. No fresh root policy-check is claimed.

## Independent execution evidence

Every child used `spawnSync`, project-root cwd, and `timeout: 30000`.

**Command 1**

```text
node --test --test-concurrency=1 --test-name-pattern="uncertain acquired time|requires source year|all inline MIME|summary is trusted|unsupported attachment invitations|yearless registration|cycle1 stored policy|ISS-333|ISS-322|tenant scoping|decision, identity, occurrence|Mongo array-element|wrong sender" --import tsx apps/api/src/gws/gws-gmail.test.ts scripts/webinar/scheduler/deps-runtime.test.mjs apps/api/src/routes/meeting-candidates.test.ts packages/db/src/collections/meeting-candidates.test.ts
```

Exit 0:

```text
✔ actual Gmail acquisition requires source year for scheduling identity and refuses receipt-inferred time
✔ all inline MIME parts retain conflicting join identities and times
✔ summary is trusted callback data and accounts for sender and unresolved refusals
✔ unsupported attachment invitations are explicit non-joinable refusals and later batches still run
✔ yearless registration stays reviewable as unresolved evidence without guessed time or join URL
ISS-333 original a+b+c: 2/3 historical statuses; undated authenticated case(c) deliberately pending under C4, dated positive auto_approved
✔ ISS-333 recorded reproductions (a)(b)(c) through scan -> store
✔ ISS-322 / ISS-333 extra spoofs
✔ cycle1 stored policy filters old/new classes, office mail and id approval without deleting barriers
✔ wrong sender, domain, thread, subject or explicit owner refuses without changing stored rows
✔ tenant scoping preserves foreign same-message rows while healthy new rows still insert
✔ decision, identity, occurrence and concurrent provenance races each refuse atomically
✔ Mongo array-element query equality cannot admit scalar-to-array decision or source races
✔ uncertain acquired time persists a refusal on old approved rows and never schedules
tests 13; pass 13; fail 0; skipped 0
duration_ms 4146.9055
```

A SQLite experimental warning was informational.

**Command 2 — independently authored scanner → API → DB → selector probe**

```text
node --import tsx --input-type=module
```

Exact stdin appears below. Exit 0; exact stdout:

```text
{"case":"explicit","scheduled":1,"refusal":null,"status":"approved","updates":0}
{"case":"missing-receipt","scheduled":0,"refusal":"unresolved-body","status":"approved","updates":1}
{"case":"year-outside-window","scheduled":0,"refusal":"unresolved-body","status":"approved","updates":1}
{"case":"missing-zone","scheduled":0,"refusal":"unresolved-body","status":"approved","updates":1}
{"case":"no-time","scheduled":0,"refusal":"unresolved-body","status":"approved","updates":1}
{"case":"conflicting-MIME","scheduled":0,"refusal":"unresolved-body","status":"approved","updates":1}
{"case":"inferred-year","scheduled":0,"refusal":"unresolved-body","status":"approved","updates":1}
pending-yearless: status=pending scheduled=0 trusted-approval-reads=0
nonmeeting-office-recording-summary: {"listed":5,"fetched":5,"candidates":2,"excludedNonMeeting":2,"excludedInternal":1,"refusedSender":0,"incompleteMessages":1,"complete":true}
```

The probe also verifies tenant filters, CAS guards, provenance-only update fields, zero duplicate insertion, and unchanged approval/occurrence fields. All mail and DB inputs are synthetic; no Google or Mongo adapter was invoked.

**Command 3 — original scheduler authentication reproductions**

```text
node --test --test-concurrency=1 --test-name-pattern=ISS-333 --import tsx packages/meeting-bot/src/calendar/sender-authentication.test.ts
```

Exit 0:

```text
ISS-333 (meeting-bot side, d+e): 2/2 behave as recorded
✔ ISS-333 (d): an auto_approved row without an authenticated sender is skipped; (e) a human approval is trusted regardless
tests 1; pass 1; fail 0; skipped 0
duration_ms 340.4597
```

## Recorded corpus and evidence reuse

The union issue ledger was read for ISS-333, ISS-322 and ISS-CAPTURE-003.

ISS-333 original API mail bodies and authentication headers remain unchanged:

- (a) DKIM fail → pending.
- (b) Header absent → pending.
- (c) Aligned authenticated pass → `authenticated=true`, deliberately **pending because undated** under C4.

That is **2/3 historical API statuses**. The intentional deviation is named rather than hidden. A separately dated authenticated positive remains `auto_approved`. Scheduler cases (d)/(e) pass **2/2** verbatim. Combined: **4/5 historical statuses**, with (c) intentionally superseded by the uncertainty contract.

ISS-322 extra spoof tests passed independently. Its original four-default-entry corpus was read but not independently rerun here. ISS-CAPTURE-003’s 1/1 refusal is supporting maker evidence from the 23-test API record, not this checker’s execution. No ledger issue was closed.

The maker’s integration record reports:

```text
57 selected files
685 tests; 681 PASS; 4 SKIP; 0 FAIL
duration_ms 40490.1874
exitCode 0; postHashesMatch true
```

Its input SHA256 is `486657462c7892e9025368b40d3c12b29db774ca9a4d6be61b5fde1fb4f22b13`; result SHA256 is `ac89d8b1bb6ee3dbff115862315d9dc3f733ada8640b32def5a9822a1fb9011c`.

All listed source/test hashes match except the disclosed console-only correction in `meeting-candidates.test.ts`. Reversing only `String(c.status)` to `c.status` reproduces its recorded old hash exactly. Subsequent API evidence records **23/23 PASS**; API TSC 0 is disclosed maker evidence and was not rerun.

The collection records report **725/725 Node files**, and web collection contains **143 files / 1,281 tests**. Collection is not test-body execution proof.

These are supporting maker records with verified listed identities, not a claim of independently rerunning broad integration or auditing every transitive environment input. No broad suite, TSC or build was repeated.

## Isolated falsification

Exactly one C4 falsification ran in:

```text
C:\Users\Lenovo\AppData\Local\Temp\secondary-c4-ga0mcc
```

The same independent Command 2/stdin first passed GREEN. Only copied `gws-gmail.ts:220` changed:

```text
FROM:
messageId: msg.id, ...(!startTime ? {evidenceIssue: "unresolved-body" as const} : {}),

TO:
messageId: msg.id,
```

The same command then exited 1 on the intended refusal-count assertion:

```text
{"case":"explicit","scheduled":1,"refusal":null,"status":"approved","updates":0}

AssertionError [ERR_ASSERTION]: missing-receipt

0 !== 1

at file:///C:/Users/Lenovo/AppData/Local/Temp/secondary-c4-ga0mcc/[eval1]:16:148
actual: 0
expected: 1
operator: strictEqual
Node.js v24.13.1
```

This was a product assertion failure, not an import/setup failure. Each child had a 30-second timeout. `finally` restored the byte backup; `Buffer.equals=true`. Dependency junctions were unlinked before validated owned-temp cleanup. The copy was removed, and all 87 bound source hashes remained unchanged.

## Remaining gates

This secondary repaired-CODE check is complete. Root must aggregate the primary verdict before branch push.

Full original C1–C8 remains open: hosted identity/config and browser Calendar/Gmail comparison; active scheduler/heartbeat; seven-day observation; two real verified AV/capture/transcript slots; restart/recovery; Ubuntu qualification; provider-backed capture → transcript → extraction → index → cited Ask; source-grounded work-DB repair/proposals; human semantic/evaluation gates; separately approved production promotion/deployment.

LIVE-BROWSER: not performed in this read-only CODE repair review. No deployment, actual attendance or indexing success is claimed.

Metrics: start=2026-10-27T13:23:18.779Z end=2026-10-27T13:28:06.325Z wall_min=4.79 agent_min=4.79 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=1 cycle=4 resumes=0 tokens=unavailable builder_min=unavailable check_min=4.79 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17

## Exact independent reproducer stdin

```javascript
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {scanGmailForMeetingCandidates as scan} from './apps/api/src/gws/gws-gmail.ts';
import {createMeetingCandidatesDeps as depsFor} from './apps/api/src/store.ts';
import {createIfNew} from './packages/db/src/collections/meeting-candidates.ts';
import {selectAutoRecordItems as select} from './packages/meeting-bot/src/calendar/auto-join.ts';
mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-20T12:00:00Z')});
const url='https://meet.google.com/abc-defg-hij', dated='Date: October 15, 2099 Time: 10 AM - 11 AM UTC. '+url;
const mail=(id,body,extra={})=>({id,internalDate:String(Date.parse('2026-10-20T11:00:00Z')),payload:{headers:[{name:'From',value:'host@example.org'},{name:'Subject',value:'Webinar invitation'}],mimeType:'text/plain',body:{data:Buffer.from(body).toString('base64url')}},...extra});
async function acquire(message,options={}){let summary;const rows=await scan(10,async args=>JSON.stringify(args.includes('list')?{messages:[{id:message.id}]}:message),{...options,onSummary:s=>{summary=s}});return {rows,summary};}
const schedule=rows=>select({calendarEvents:[],candidates:rows.map(r=>({...r,id:r._id,title:r.subject})),now:'2099-10-15T10:00:00Z',leadMinutes:5,trustedSenders:{emails:[],domains:[]},alreadyScheduled:[]}).toSchedule.length;
try {
 const safe=(await acquire(mail('same',dated))).rows[0];assert.equal(safe.startTime,'2099-10-15T10:00:00.000Z');
 const multipart=mail('same',dated);multipart.payload={...multipart.payload,mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:Buffer.from(dated).toString('base64url')}},{mimeType:'text/html',body:{data:Buffer.from(dated.replace('10 AM - 11 AM','12 PM - 1 PM')).toString('base64url')}}]};delete multipart.payload.body;
 const cases=[['explicit',mail('same',dated),false],['missing-receipt',mail('same','Date: October 27 Time: 12 PM - 1 PM PT '+url,{internalDate:undefined}),true],['year-outside-window',mail('same','Date: July 15 Time: 12 PM - 1 PM PT '+url),true],['missing-zone',mail('same','Date: October 15, 2099 Time: 10 AM - 11 AM '+url),true],['no-time',mail('same',url),true],['conflicting-MIME',multipart,true],['inferred-year',mail('same','Date: October 27 Time: 12 PM - 1 PM PT '+url),true]];
 for(const [name,message,refuse] of cases){const {rows,summary}=await acquire(message);assert.equal(rows.length,1,name);const found=rows[0];assert.equal(summary.incompleteMessages,refuse?1:0,name);assert.equal(summary.complete,true);
  const stored={...safe,_id:'old',tenantId:'owner',status:'approved',decidedAt:'2026-10-01T00:00:00Z',detectedAt:'2026-10-01T00:00:00Z'};const original=structuredClone(stored);let updates=0;
  const db={collection(n){assert.equal(n,'meeting_candidates');return {async findOne(f){assert.equal(f.tenantId,'owner');assert.equal(f.messageId,'same');return structuredClone(stored)},async updateOne(f,u){assert.equal(f.tenantId,'owner');assert.deepEqual(f.status,{$eq:'approved'});assert.deepEqual(f.startTime,{$eq:safe.startTime});assert.ok(f.$expr.$and.length);for(const k of Object.keys(u.$set))assert.ok(['evidenceIssue','senderAuthenticated','receivedAt','youtubeWatch','youtubeWatchIssue','meetingLinkIssue'].includes(k),k);Object.assign(stored,u.$set);updates++;return {matchedCount:1}},async insertOne(){assert.fail('refresh must not insert')}}}};
  const deps=depsFor('owner',async()=>[found],()=> 'synthetic_work',{getTrustedSender:async()=>({autoApprove:true}),createMeetingCandidateIfNew:(t,d)=>createIfNew(t,d,db),listAllMeetingCandidates:async t=>{assert.equal(t,'owner');return [structuredClone(stored)]}});
  assert.deepEqual(await deps.scanGmail('owner'),{created:0,autoApproved:0});const listed=await deps.listCandidates('owner');assert.equal(listed.length,1);assert.equal(schedule(listed),refuse?0:1,name);assert.equal(stored.evidenceIssue,refuse?'unresolved-body':undefined);for(const k of ['status','startTime','endTime','decidedAt','_id','meetingUrl'])assert.equal(stored[k],original[k],k);console.log(JSON.stringify({case:name,scheduled:schedule(listed),refusal:stored.evidenceIssue??null,status:stored.status,updates}));
 }
 const inferred=(await acquire(mail('yearless','Date: October 27 Time: 12 PM - 1 PM PT '+url))).rows[0];let inserted;let trustReads=0;
 const pending=depsFor('owner',async()=>[inferred],()=> 'synthetic_work',{getTrustedSender:async()=>{trustReads++;return {autoApprove:true}},createMeetingCandidateIfNew:async(t,d)=>{assert.equal(t,'owner');inserted=d;return true}});assert.equal((await pending.scanGmail('owner')).created,1);assert.equal(inserted.status,'pending');assert.equal(inserted.startTime,undefined);assert.equal(inserted.evidenceIssue,'unresolved-body');assert.equal(schedule([inserted]),0);assert.equal(trustReads,0);console.log('pending-yearless: status=pending scheduled=0 trusted-approval-reads=0');
 const messages=[mail('general',url,{payload:{headers:[{name:'From',value:'host@example.org'},{name:'Subject',value:'Product update'}],body:{data:Buffer.from(url).toString('base64url')}}}),mail('office',dated,{payload:{headers:[{name:'From',value:'staff@office.example'},{name:'Subject',value:'Webinar invitation'}],body:{data:Buffer.from(dated).toString('base64url')}}}),mail('recording','Watch again '+url,{payload:{headers:[{name:'From',value:'host@example.org'},{name:'Subject',value:'Webinar recording recap'}],body:{data:Buffer.from('Watch again '+url).toString('base64url')}}}),mail('valid',dated),mail('uncertain',url)];let summary;
 const rows=await scan(10,async args=>{if(args.includes('list'))return JSON.stringify({messages:messages.map(m=>({id:m.id}))});const id=JSON.parse(args[args.indexOf('--params')+1]).id;return JSON.stringify(messages.find(m=>m.id===id));},{ownDomains:['office.example'],batchSize:1,onSummary:s=>{summary=s}});
 assert.deepEqual(rows.map(r=>r.messageId),['valid','uncertain']);assert.deepEqual(summary,{listed:5,fetched:5,candidates:2,excludedNonMeeting:2,excludedInternal:1,refusedSender:0,incompleteMessages:1,complete:true});console.log('nonmeeting-office-recording-summary: '+JSON.stringify(summary));
} finally {mock.timers.reset();}
```

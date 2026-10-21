# Verdict: w26-askdoc

VERDICT: PASS
Cycle checked: 2
Reviewed SHA: 6203f224adc1f0d1199148c5241c3e093134f37c
(History: the cycle 1 and cycle 0 sections below are superseded FAIL records; this header is authoritative.)

## Cycle 2 (PASS, reviewed 6203f224)
Method: static review of `git diff d4e58489 6203f224` and `git diff origin/master...6203f224` (docs/GO-LIVE-UBUNTU.md plus maker manifest only; no source). No mongod on this machine; MongoDB behaviour below is documented behaviour and the repo's own proposal files, not a live run. Checker metrics not measured (ratio unverified).

F4 (lockout) re-checked: RESOLVED. New order: backup; `replSetName` with no keyFile and no authorization; `rs.initiate` with explicit reachable host; create `admin` (root) then `lkb_app` on the primary while auth is still off (creating users on an auth-less primary is allowed and replicates); only then add `security.keyFile` (implies authorization) and restart; verify with `mongosh -u admin ... rs.status().ok`. An admin with root exists before auth turns on, so nobody is locked out. The "skip the admin if users exist" note is consistent because auth is off during steps 2-4.
Earlier findings stay fixed: keyFile creation/size/mode (`openssl rand -base64 756`, chmod 400, mongod owner); explicit member host; T-028 scope matches `hosting.ts` / `production.ts:291-297` / `routes.ts:55,79` / `automation.ts:35`.
Data loss: none. Step 1 mongodump; restarts only; `replSetName` plus `rs.initiate` keep existing data files; no drop, delete or reinit step.
Connection string: step 7 adds `replicaSet=rs0` with the explicit host; `directConnection=true` (without `replicaSet`) only as fallback. The section 2 placeholder already carries `authSource=lkb_prod`, matching where `lkb_app` is created. Correct.
Secrets: none (placeholders only: `<ADMIN-PASSWORD>`, `<PASSWORD>`).
Read/ask path claims from cycle 0 (snapshot transactions, 503 masking) unchanged and still correct.

Non-blocking notes (not backlog): (a) a deployment that already runs with `security.authorization: enabled` must remove it for step 2, because replSet plus auth without a keyFile refuses to start (recoverable, no data loss); step 2 says "no authorization yet" but could say so explicitly, and the DB is unauthenticated during steps 2-4, so keep it bound to the server IP/firewalled. (b) Snapshot use also exists in speaker-profiles and whatsapp-review.
Remaining gates: none for this docs-only unit; a live run on a throwaway mongod was not done.

---

## Cycle 1 (FAIL, reviewed 19bd805a)
Method: static review of `git diff origin/master...19bd805a` (docs/GO-LIVE-UBUNTU.md only). No mongod/mongosh on this machine; auth behaviour below rests on documented MongoDB behaviour plus the repo's own proposal files, not a live run.

Cycle 0 findings re-checked:
- F1 keyFile: FIXED (step 2 creates it, `openssl rand -base64 756` is valid size, chmod 400, mongod owner; step 3 sets `security.keyFile`).
- F2 explicit host: FIXED (step 4 `rs.initiate` with a reachable host:port; step 6 recommends `replicaSet=rs0`, `directConnection=true` as fallback without `replicaSet`).
- F3 T-028 scope: FIXED. The new list (/keys, /hosting, /webhooks, operations schedules, automation, capture readiness) matches `hosting.ts` / `production.ts:291-297` / `routes.ts:55,79` / `automation.ts:35`; "Ask is unaffected" is true.
- Data loss: none. Step 1 mongodump backup, one brief restart; conversion to a replica set and `rs.initiate` keep existing data files.

New blocking finding F4 (step order does not do what it claims):
- Step 3 says "Do NOT set security.authorization yet" and the heading says the order means "you cannot lock yourself out". Per MongoDB documentation, setting `security.keyFile` implicitly enables client authorization, so auth IS on after step 3. The guide's mental model is wrong. The repo's own proposal (`qa/coordination/knowledge-brain-20261015/staging-replica-proposal/compose.yml:29`) passes both `--auth --keyFile`.
- With auth on and no users, the localhost exception applies, so `rs.initiate` in step 4 works (this matches MongoDB's keyfile deployment tutorial). But the exception only lets you create the FIRST user, and step 5 creates only `lkb_app` (readWrite on lkb_prod, no createUser or replSetConfigure rights). The localhost exception then closes and nobody holds an admin or cluster role: the exact lock-out the guide says it prevents. Recovery needs a restart with auth disabled. No data loss, but an avoidable outage on a fresh set-up. The repo's proposal always creates a root/admin identity first (`replica-init.js`).
- If users already exist (the normal case for the existing deployment, where section 6a already ran), the localhost exception does NOT apply. Then step 4 needs an authenticated admin with cluster privileges; the parenthetical "use the localhost exception ... then authenticate as an admin" is wrong in that case.
Required fix (doc only): after step 3 say authorization is already enforced by the keyFile; for a fresh set-up, via localhost run `rs.initiate`, then create an admin first (`use admin; db.createUser({user:"<ADMIN>",pwd:"<PASSWORD>",roles:["root"]})`), authenticate, then create `lkb_app`; for an existing deployment with users, authenticate as an existing admin that holds cluster privileges (e.g. root) for `rs.initiate`, and do not mention the localhost exception. Drop the "cannot lock yourself out" claim or make it true. Step 5's "then set authorization: enabled and restart" is then unnecessary.

Secrets: none in the cycle 1 diff (placeholders only).
Remaining gates: re-check at cycle 2; ideally one live run against a throwaway mongod to confirm the order.

---

## Cycle 0 (FAIL, reviewed 8c1f0ecf)
Base: origin/master fd471686d0f8b0b225da2c07563d1a3342fbc385 (diff `origin/master...HEAD`: 1 file, docs/GO-LIVE-UBUNTU.md, +13)
Method: static code review only (docs-only unit; no tests or builds run; no mongod/mongosh on this machine, so no live standalone-vs-replica-set run). Checker metrics: not measured (BOOTSTRAP_REVIEW scope, ratio unverified).

## Claims verified
1. Snapshot read on the Ask path: CONFIRMED. `routes/ask/ask.ts:55` `deps.tree.load(tenantId)` sits inside the try. `store.ts:58` `createMongoTreeStore` wraps `trustedTreeReads` (`trusted-readers.ts:87-107`), whose `load` calls `withKnowledgeReadSnapshot` (`visibility/read-snapshot.ts:10-34`, `session.withTransaction` with `readConcern snapshot`, "no collection-only fallback"). Any failure is rethrown as status-503 "Current knowledge tree unavailable". `ask.ts:75` routes it to `answerWorkflowFailure` when `answerWorkflow` is wired (production getter), which emits the generic 503 `answer_history_unavailable` (`answer-router.ts:25`). Masking confirmed. Standalone failure text ("Transaction numbers are only allowed on a replica set member or mongos") is the known MongoDB standalone error; not reproduced locally.
2. Affected routes: `/ask` (tree load), `/graph` (`trustedGraphReads`, `trusted-readers.ts:118-123`), session decisions (`session-decisions/reader.ts:68`). Doc is correct but not exhaustive: `speaker-profiles/store.ts:26,41` and `whatsapp-review/review-source.ts:39` also use the snapshot (note only).
5. Secrets: none in the diff (grep of added lines for pwd/password/mongodb:// found nothing; only placeholders).

## Findings (blocking)
F1 (replica-set steps unsafe for the documented deployment). Section 6a, directly above the new text, tells the operator to enable `security.authorization: enabled`. A `mongod` with `--replSet`/`replication.replSetName` and authorization enabled refuses to start without `security.keyFile` (or x509 internal auth). The new text says only "start mongod with --replSet rs0 ... run rs.initiate() once" and omits the keyFile. An operator following the guide in order gets a Mongo that will not start, which is an outage of the production DB, not a data-loss step. The repo's own staging proposal confirms the requirement: `qa/coordination/knowledge-brain-20261015/staging-replica-proposal/compose.yml:29` uses `--auth --keyFile`. Also `rs.initiate()` needs an admin/clusterManager identity once auth is on (only `lkb_app` readWrite is created in 6a); the doc does not say to initiate before enabling auth or as an admin.
F2 (connection string incomplete for this topology). Mongo runs on a separate host and the API runs in a Docker container. Plain `rs.initiate()` advertises the host's own hostname; with `replicaSet=rs0` the driver connects to that advertised name, which may not resolve from the container (the repo proposal README states this and uses `directConnection=true` for that reason). The brief asked for `replicaSet=rs0` (or `directConnection`); the doc should say to initiate with an explicit reachable `host:port` member (`rs.initiate({_id:"rs0",members:[{_id:0,host:"<server-ip>:27017"}]})`) or use `directConnection=true`.
F3 (T-028 statement overclaims). New text: "T-028 gates only key lifecycle (GET/POST /keys) and counsellor accounts." In `buildHostingIntegrations` (`composition/integrations/hosting.ts:48-130`), when `hosting` is undefined it returns without `operationsSchedules`, and `production.ts:291-297` also gates: `/hosting` and `/webhooks` (`hosting/router.ts:17`, 503 `hosting_unavailable`), operations schedules (`routes.ts:79`), automation / application forms (`automation.ts:35`, additionally behind LKB_AUTOMATION_ENABLED / LKB_APPLICATION_FORMS_ENABLED), and capture readiness (`production.ts:296`). Also `/keys` includes revoke, not only GET/POST. The Ask-independence conclusion is TRUE (Ask, with all five unset, is unaffected; keyStore stays the default), but "only" is wrong. The existing partial-env warning (every authenticated route 503) is correct against hosting.ts:59 and unchanged.

## Data-loss check
No step deletes or reinitialises data. Restarting an existing standalone mongod with `--replSet` and running `rs.initiate()` preserves existing data files. Safe, subject to F1.

## Required fix (cycle 1, doc only)
- Add keyFile (`openssl rand -base64 756 > file`, chmod 400, mongod owner, `security.keyFile`) to the replica-set step, and state the order relative to enabling authorization and who runs `rs.initiate()`.
- Give the explicit-host `rs.initiate` form (or `directConnection=true`) and why.
- Reword T-028 to: gates key lifecycle (`/keys`), `/hosting` + `/webhooks`, counsellor accounts and the optional operations/automation features; Ask and the rest of the API are unaffected.

## Remaining gates / limits
No live mongod verification possible here; F1/F2 rest on documented MongoDB behaviour plus the repo's own proposal files. Re-check at cycle 1.

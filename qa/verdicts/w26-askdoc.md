# Verdict: w26-askdoc

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 8c1f0ecfea5d2456e8b6acb5d016bb2838c4cb4b
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

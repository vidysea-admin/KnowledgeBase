# Calendar policy, publication and database isolation repairs — independent checker A

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: FAIL
Owner: policy-db-check-a
Scope: the 13 files in final-policy-db-ready-inputs.json, plus bounded caller/schema inspection and isolated falsification. Source is frozen; no product/test edits, manifest changes, agents, sibling final conclusions or real provider/database/external network access.

CHECK-PLAN: Tier L, authenticated publication and data-write boundaries. O → actual selector/evaluator and precedence tests; P → publisher restart/schema/authenticated response/fence/replay tests and authoritative fake-DB API checks; G → all exported guard families and real consumer tracing; M → actual isolated config-loading refusal/positive matrix; F → actual-source CLI duration fixture and probe-removal falsification. Budget: 15 minutes. No rendered UI or live-service criterion is asserted.

SCOREBOARD: O PASS; P PASS; G PASS; M PASS; F PASS (5/5 implementation criteria). Reviewed compatibility/runbook behavior claim FAIL (one medium finding). The overall FAIL is required by the pinned policy's explicit exception for false product-behavior claims; this is not a style/wording observation. No implementation security bypass was demonstrated.

CHECKED-STATE:
- Base and current HEAD: d9b7e08825bf10c703ba17bcc492de6ea51f4c21; reviewed working-tree diff, not a newly committed revision.
- Ready snapshot SHA256: 165f59c6a8ea19c5e76db6fb0b8b0ab6d3964890148b677911bece5442fb089d.
- Manifest SHA256: f3e01f3dc79b4b76b9cd2268515da5632c9a508066f41b7dd134217afe762c9c, ready-for-check, cycle 0, .17.
- All 13 source identities matched the snapshot before checks and immediately before this verdict; full identities below.
- Read installed checker skill, SHA256 835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1. Read senior engineering router and applied its review/security lens directly: user explicitly prohibited further agents. This is a fresh independent checker, not the builder.
- Runtime: Node v24.13.1, Windows; tsx from existing installation.

Authorization verified

The migration plan records APPROVED; the production-alias plan's later APPROVED entry resolves its earlier rejection; the office/publication Revision 1 later bounded APPROVED entry resolves earlier rejected/blocked reviews. These are plan approvals, not completion verdicts. D-196 at docs/DECISIONS.md:2589-2595 authorizes configured-office veto, authenticated rejected-publication recovery, shared alias denial and explicit script capability; it expressly preserves D-117 work isolation, D-186 app authority and separate production execution gates. D-197 at :2597-2603 separately authorizes deny-only migration repair, canonical lkb migration behavior unchanged. No production execution approval is inferred.

Independent findings

PROPOSED-ISSUE: medium | docs/GO-LIVE-UBUNTU.md:129-130 | Runbook falsely describes migration acceptance of lkb_prod after the deny-only repair.

The currently reviewed runbook says the independent migration guard's unflagged lkb_prod acceptance remains an open exposure. Current config/migrate-mongo-config.cjs:21-27 rejects lkb_prod both without opt-in and in its canonical-lkb-only opted-in branch. D-197 explicitly requires that behavior. The documented first-run procedure uses the app target lkb_prod at :68 and describes a migration at :124-130 that cannot run with this configuration even after human approval. This is an operational behavior/compatibility contradiction in an explicitly scoped changed file, not a security exploit or a request to expand migration permission. Correct the existing note to state D-197's unconditional lkb_prod refusal and canonical lkb-only opted-in migration limitation; preserve the human execution gate. Do not change the guard to make the outdated prose true.

FAILURES: one false migration-behavior statement in the reviewed compatibility document. No critical/high implementation finding.

Criterion evidence

| Criterion | Result | Independent evidence and boundary |
|---|---|---|
| O | PASS | packages/ingest/src/join-policy/join-rules.ts:137-158 derives internal identity from validated ownDomains, inserts veto at :150 after opt-out/deny/cancel/link/sender guards and before all/allow decisions. Existing native office protection remains. Real generic chain tested at packages/meeting-bot/src/calendar/join-rules/join-rules-select.test.ts:143-159, including all/rules, normalized case, true subdomain boundary, external lookalikes, approved-sender/allow inability to override, and mode-absent preservation. Generic run-pipeline.mjs:102-115 selects then applies shared rules; no global tenant registry or universal domain-coverage claim. |
| P | PASS | calendar-attendance-source.mjs:177-186 attaches discardable status only after matching tenant header, body, bounded read and JSON parse. :234-244 retries exact pending first, then allows only authenticated 400/422 plus later/different scan and same-generation safe nonnegative strictly-lower sequence fence. Sequence is retained, :249-254 persists next pending before PUT, ack verifies generation/sequence/digest/complete/time, lock finally and serialized tail remain. Actual API routes/calendar.ts:70-84 binds response tenant from auth and requires both scopes; capture-policy.ts:74-92 binds active configured key/owner and validates actual schema with 400. :179-195 replays committed receipts before freshness rejection; :197-212 stages tenant-scoped snapshot and CASes exact key fence, retaining revocation protection. No false availability ACK is forged. |
| G | PASS | transcript-provenance.mjs:92-101 protects lkb/lkb_prod trim/case variants on predicate/work paths. Legacy/backfill at :131-147 delegate or require exact staging; script fallback at :165 delegates. :158-163 requires caller capability + exact flag + explicit trimmed canonical lkb/lkb_prod and valid URL. Existing tests remove each opt-in, reject uppercase/arbitrary/global/missing names and URLs, preserve staging/work/mismatch cases. Downstream pipeline gate, Gmail preflight, actual sync refusal and manual-host authority-before-connect tests cover use of the returned selection. |
| M | PASS | config/migrate-mongo-config.cjs:21-27 keeps canonical lkb-only explicit production branch and adds lkb_prod fallback denial. Actual config-loading subprocess cases in dbguard2.test.mjs:87-96 reject trim/case aliases with no opt-in, argv flag and env opt-in; old lkb positives and staging/work/invalid/mismatch controls remain. Isolated alias-removal mutant is killed. Documentation discrepancy is separately recorded above. |
| F | PASS | transcript-provenance.test.mjs:153 enables transform-types only for DURATION_HOOK; :179 maps ../gemini-quota.js to real quota TS, with existing provider and child-process fakes retained. :188-200 still asserts success, clamped end, exact text/speaker, schema/immutable IDs, exact archived bytes, stale derived marker and four provider calls. Exact bounded probe expectation is strengthened to original + sealed snapshot recheck + extracted span, all timeout 15000. Actual transcriber :254 accounts for the extra snapshot probe. Invalid original/span durations and late-start cases still preserve original bytes/current provenance. Removing actual snapshot probe in the copy is caught. |

Relevant caller trace

Shared guard consumers honor returned targets: mint-key.mjs:50-52 before key mutation; watch-config.mjs:41 with watch-store.mjs:9/44 and watch-reingest.mjs:36-37; recover-index-attempt.mjs:108-110; eval-recall.mjs:56-57; live-verify.mjs:113-114. Work capture gates run-pipeline.mjs:58, run-pipeline-deps.mjs:62 and sync-session.mjs:162-167 refuse production aliases before downstream effects. manual-jobs/host.ts:38-44 validates child work target before authority creation. join-rules-api-host.ts:49-72 independently guards parent, creates capture-only env, removes inherited parent selection, validates child work target before connect/listen and passes copy to managed send-now. This is relevant source integration inspection, not a replacement R parent/child verdict.

Commands and results

1. node --import tsx --test --test-reporter=dot packages/meeting-bot/src/calendar/join-rules/join-rules.test.ts packages/meeting-bot/src/calendar/join-rules/join-rules-select.test.ts scripts/webinar/calendar-attendance.test.mjs scripts/lib/transcript-provenance.test.mjs scripts/lib/legacy-unbound.test.mjs scripts/lib/script-db-guard.test.mjs scripts/webinar/db-guard-paths.test.mjs scripts/lib/dbguard2.test.mjs
   Result: exit 0; 154 dot-reporter tests, no failures. No typecheck or full suite repeated.
2. node --import tsx --test --test-timeout=45000 --test-reporter=tap --test-name-pattern="durable worker|server-fenced|incomplete/failed|conflicting concurrent|revocation at publication|worker snapshots reject|snapshot digest|manual host binds" apps/api/src/composition/integrations/capture-policy.test.ts scripts/webinar/manual-jobs/host.test.ts
   Result: tests 8, pass 8, fail 0, skipped 0; runner duration 2627.482 ms, exit 0. These tests use fake DB/authority dependencies; mounted HTTP tests are excluded.
3. node C:/Users/Lenovo/AppData/Local/Temp/policy-db-check-a-EvgwYo/checker-falsify.mjs
   Result: eight selected green-before tests each exit 0, eight intended mutant tests each exit 1, all eight backups restored byte-for-byte. Each child spawn has timeout 45000; restoration is in finally, including error/timeout. No shared source was mutated. Exact matrix below. This temporary checker script is an execution instrument, not a product/test addition.
4. git diff --no-ext-diff d9b7e08825bf10c703ba17bcc492de6ea51f4c21 -- <the named affected paths>; bounded rg for real guard/worker/selector consumers; Node filesystem SHA256 verification of ready snapshot, manifest and 13 named files.
   Result: named in-place changes confirmed, actual-source fixture changes inspected, source hashes unchanged. An initially guessed route path did not exist; actual routes/calendar.ts was then located and read. Normal shell setup failed before process creation; explicitly approved elevated bounded commands worked. No protection disabled.

Falsification matrix (isolated source copy)

| Invariant removed | Green | Mutant result | Restoration |
|---|---|---|---|
| O explicit-mode office veto | 1/1 | ERR_ASSERTION in explicit attendance modes | byte equal |
| P 400 recovery eligibility | 1/1 | schema400 restart-recovery test fails refused-publication | byte equal |
| P generation/strict lower safe fence | 1/1 | cannot-discard test ERR_ASSERTION | byte equal |
| P tenant-header binding | 1/1 | unauthenticated-rejection test ERR_ASSERTION | byte equal |
| G work lkb_prod denial | 1/1 | missing expected exception | byte equal |
| G caller allowProduction opt-in | 1/1 | missing expected exception | byte equal |
| M migration fallback alias denial | 1/1 | actual lkb_prod config load unexpectedly succeeds | byte equal |
| F actual sealed-snapshot probe | 1/1 | exact three-probe trace ERR_ASSERTION | byte equal |

The publication tests additionally preserve exact wire replay across restart, test actual schema-required sourceEvents rejection (not an impossible current-producer allegation), run both 400/422 through nine refused fence/read variants, and cover twelve non-discardable authentication/protocol/status/network variants. Original substantive assertions were retained; host literal-pattern assertions were adapted to injected runtime/returned target and strengthened guard ordering, not deleted.

Full pinned source identities

- packages/ingest/src/join-policy/join-rules.ts: 88629ca54601157f7b87622bc6125235d68443305f05884ac76110be5c29fec2
- scripts/webinar/calendar-attendance-source.mjs: 7db280a0721f42598fb4e48c02250afc99395486739db83dd5d4aaa3786de791
- packages/meeting-bot/src/calendar/join-rules/join-rules.test.ts: 80cc994f4092b86e4f51674a2269ffcd294718551716fd02b39a3622bc388272
- packages/meeting-bot/src/calendar/join-rules/join-rules-select.test.ts: a9dbcb337ecae53c905621a1d4ab86ada232155357ca7ed60174bc61da3e6dfb
- scripts/webinar/calendar-attendance.test.mjs: 40a716361a5b28723b99345bbe69014138147256d8b6f3c49370a7e3a3286a42
- scripts/lib/transcript-provenance.mjs: 3f9d1cab24503c4e797c69a8e350fdf8cc2c2437294e1d85f3936cdb8bcb2908
- scripts/lib/transcript-provenance.test.mjs: 27faa4a0f46cfb28ad044bc57fdf58f7d7a5d6305663abf0a44d605a39f7398c
- scripts/lib/legacy-unbound.test.mjs: 7a60be0377770120b0d3c2f0a06ae62d233cab347e1510e8604e4711ef138517
- scripts/lib/script-db-guard.test.mjs: 24579faf6ff6a977c893f2174bdcff2a772fe31467917e16930e343c55f5be7f
- scripts/lib/dbguard2.test.mjs: 213bd5ccd2bca30e84755080cdd8f9930340594fac45baaea2b7778b7651dbbc
- scripts/webinar/db-guard-paths.test.mjs: dde5305fdc132a651ed3fbb945af0bba3a7e838a0f8e8ce566922bcaf1223b78
- config/migrate-mongo-config.cjs: c0394f6e815f31662b4e5da0ea93b010c7b831aba3f694d4114e3c95a309c646
- docs/GO-LIVE-UBUNTU.md: dc1064b81cd9483e24766c9ef3487ba79ef382bf90879ab77dfe80aaf2e2da69

REMAINING: correct the scoped runbook contradiction above, then verify changed document identity and that its migration statement matches D-197/current guard. No broad suite rerun is warranted for that prose correction alone. Other blind coordinator outcome is unknown and was not read. This verdict does not close the parent task or handshake.

LIMITS: authenticated connected-account/canonical ownDomains coverage is unverified; unknown domain identity does not establish external eligibility. No generic attendance enablement or universal office-exclusion claim follows. Actual deployed revision/runtime/Google profile, separately dual-reviewed R integration, full committed branch/push review, real capture-to-knowledge/cited answers and seven-day acceptance remain open. No deployed-app/script/migration production writes, deployment, promotion, capture activation, secrets or real providers were accessed.

LIVE-BROWSER: not applicable to these bounded policy, publication and guard criteria; no page-rendering or live feature acceptance claimed.
ISSUES-WRITTEN: none; proposed issue is recorded only in this owned verdict, as required for a blind dual coordinator. Maker owns ledger/closeout.
Metrics: start=2026-10-28T00:51:48.074Z end=2026-10-28T00:59:24.505Z wall_min=7.61 agent_min=unavailable blocked_min=0 suite_runs=0 scoped_runs=2 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable builder_min=unavailable check_min=7.61 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17


## CURRENT — same-task document and metadata closeout (2026-10-28T01:08:12.301Z)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: CONTINUE-NEEDED
Disposition: FORMAT-FIXUP; no new product-code FAIL. Original verdict and measured evidence above are preserved. The former runbook correctness finding is now resolved. This current disposition supersedes the original FAIL for closeout status, but does not grant PASS while mandatory manifest lint remains red.
Owner: policy-db-check-a

CHECK-PLAN: Same checker, bounded identity/document/manifest repair check only. No repeated behavioral tests, typecheck, mutations, sibling conclusions or delegates. Senior engineering/security lens applied directly under the explicit no-delegation instruction.
SCOREBOARD: O PASS; P PASS; G PASS; M PASS; F PASS (5/5, own prior independent evidence retained on identical product/test inputs). Runbook correction PASS. Manifest-format acceptance NOT MET.

CHECKED-STATE:
- All 12 product/test file SHA256 identities match both the prior own evidence above and final-policy-db-ready-inputs.json. All 13 current snapshot identities match, including the corrected document. No changed product/test input invalidates the recorded acceptance/falsification evidence.
- Ready snapshot SHA256: ef72b966198543b593315ce0689bb5f7626e751ca45250c0bd8b99d0cdbe580f.
- Manifest SHA256: 7fe4ab4c87fed58242903dd4ace7cf76ea3fb47dd56eb665925991c9b43eb496 (ready-for-check, cycle 0, .17).
- Corrected docs/GO-LIVE-UBUNTU.md SHA256: 5c74f65f30e98ad060b78e2e5cb6db94f2077174b97aae5451999a05a2a44ab3; prior reviewed document was dc1064b81cd9483e24766c9ef3487ba79ef382bf90879ab77dfe80aaf2e2da69.
- Existing owned verdict before append SHA256: 0297f3fc8a4881d5a8772235fca665ca881642de00d6cfea8fb4251c535fe8b2.

Document result: docs/GO-LIVE-UBUNTU.md:128-135 now explicitly states D-197 unconditional lkb_prod refusal (case/whitespace variants, with or without opt-in), canonical lkb-only existing migration production path, incompatibility with the lkb_prod app configuration, separately authorized implementation prerequisite, and human execution gate. This matches actual config/migrate-mongo-config.cjs:15-31 and D-197 at docs/DECISIONS.md:2597-2603. No authority expansion is implied. The original medium finding is resolved.

Command: node C:/Users/Lenovo/.agents/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/calendar-final-policy-db-repairs.md
Result: exit 1. Existing lint reports ERROR no-pre-check; ERROR no-test-selection; ERROR tests-not-run for O/P/G/M/F; ERROR dual-no-trigger; WARN no-round-line. Normal shell setup failed before process creation; the explicitly approved elevated read-only lint worked. No protection was disabled.

Required metadata corrections, using existing valid receipts rather than rerunning completed tests:
- Pre-check[O/P/G/M/F] must each carry the actual reviewed SHA, exact already-executed command/selection and green result. Current prose references and independent A/B summaries are not the required builder pre-check form.
- Tests lines need the criterion coverage reason and real selected tests; keep config/migrate-mongo-config.cjs/document consistency inspection separate from executable test selection. Every selected test needs matching execution evidence.
- dual-trigger must name a valid security/auth/tenancy/prod-write category plus actual path:line. Current free prose is refused by lint.
- Round line is currently a warning. Metrics fields exist with unavailable measurements explicitly recorded; lint emitted no Metrics error. Do not invent measurements or reset the prior review history.

FAILURES: none newly demonstrated in product behavior; manifest lint remains a dispatch/closeout format blocker.
REMAINING: maker corrects the owned manifest only, then this same checker verifies identity plus reruns the read-only lint. No behavioral test repetition is justified absent changed inputs. Estimated check under 2 minutes after metadata is corrected. Do not close the handshake or infer either blind coordinator PASS from this entry.
LIVE-BROWSER: not applicable to this bounded metadata/document check.
ISSUES-WRITTEN: none; no new product defect.
LIMITS: All earlier scope/source/test limitations remain. Authenticated connected-account/canonical ownDomains coverage, actual deployed revision/runtime/Google profile, separate root R integration, full committed branch/push review, real capture-to-knowledge/cited answers and seven-day acceptance remain OPEN. Root runtime is separate and unresolved. No real providers, external network, DB, secrets, source edits, production writes, deployment, activation or promotion occurred. Only this owned verdict was appended. No separate CLI summary file was created or overwritten.
Metrics: start=2026-10-28T01:07:01.435Z end=2026-10-28T01:08:12.301Z wall_min=1.18 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=0 cycle=0 resumes=1 tokens=unavailable builder_min=unavailable check_min=1.18 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17
Metrics-note: this bounded resume clock starts at the first identity/document check; initial skill/tool discovery is not captured. Prior 7.61-minute check and eight mutations remain recorded above; no lineage or cycle reset.


## CURRENT — same-cycle metadata closeout (2026-10-28T01:12:39.776Z)

Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17
VERDICT: PASS
Owner: policy-db-check-a
Disposition: Same-task FORMAT-FIXUP resolved. This CURRENT entry supersedes the prior CONTINUE-NEEDED disposition; all former reports and evidence remain intact. This coordinator PASS has no handshake/ledger/parent closeout side effects.

CHECK-PLAN: Bounded identity, manifest-lint and runbook/guard consistency check only. Installed /checker policy .17 read; senior software engineering/security perspective applied directly under the explicit no-agent instruction. No behavioral tests, typecheck, falsifications or providers rerun.
SCOREBOARD: O PASS; P PASS; G PASS; M PASS; F PASS. Reused this coordinator's retained independent acceptance/caller/falsification evidence on identical product/test inputs; 5/5 implementation criteria remain satisfied. Corrected runbook PASS. Mandatory manifest lint PASS.

CHECKED-STATE:
- Ready snapshot SHA256: ef72b966198543b593315ce0689bb5f7626e751ca45250c0bd8b99d0cdbe580f. All 13 current file identities match this snapshot before and after checks.
- All 12 product/test hashes also match this coordinator's prior full verdict hash list; no product/test input changed. Prior independent 154-test and 8-test runs and eight falsifications remain the evidence, not new executions.
- Manifest SHA256: 3e12731444744b53e982078a6499eb434fd45d5d2f811517e21c13dc998f65d2; ready-for-check, cycle 0, .17. Exact selected test reasons, base SHA plus executed pre-check commands/results qualified as pinned worktree inputs, security path:line dual trigger and Round are present. The base SHA is not represented as containing the uncommitted changes.
- Corrected docs/GO-LIVE-UBUNTU.md SHA256: 5c74f65f30e98ad060b78e2e5cb6db94f2077174b97aae5451999a05a2a44ab3.
- Existing owned verdict before append SHA256: 9f51fa2417c8e01dd445ae7c3252864cbb17da2e64413ae1693a6586c2c7e947.

Command: node C:/Users/Lenovo/.agents/skills/maker/tools/tick.mjs --lint-manifest qa/manifests/calendar-final-policy-db-repairs.md
Result: exit 0; stdout empty. Normal shell setup failed before process creation (helper_unknown_error: setup refresh had errors); approved elevated read-only lint completed successfully. No protection was disabled.

Document verification: docs/GO-LIVE-UBUNTU.md:128-135 matches config/migrate-mongo-config.cjs:15-31 and D-197 at docs/DECISIONS.md:2597-2603. The trimmed/case-insensitive fallback refuses lkb_prod; the opted-in branch accepts only exact canonical lkb, therefore also refuses lkb_prod variants. The runbook identifies the lkb_prod app/migration incompatibility, separately authorized implementation prerequisite and distinct human execution gate. No expansion of production authority is claimed.

FAILURES: none outstanding within this coordinator's bounded reviewed criteria. Previous runbook correctness finding and metadata format blocker are resolved.
ISSUES-WRITTEN: none. No sibling conclusions were read; no agents, source/test edits, real provider/network/DB/secret access, activation, deployment, production writes or promotion occurred. Only this existing owned verdict was appended; no CLI summary file was created or overwritten.
LIVE-BROWSER: not applicable to this bounded closeout; no live acceptance asserted.
LIMITS: Authenticated connected-account/canonical ownDomains coverage; actual deployed revision/runtime/Google profile; separate root R integration; full committed branch/push review; real capture-to-knowledge/cited answers; and seven-day acceptance remain OPEN. This is coordinator A's scoped PASS only; no sibling outcome or parent readiness is inferred. Maker retains dual-verdict and handshake closeout ownership.
Metrics: start=2026-10-28T01:11:52.351Z end=2026-10-28T01:12:39.776Z wall_min=0.79 agent_min=unavailable blocked_min=0 suite_runs=0 scoped_runs=0 repeat_runs=0 mutations=0 cycle=0 resumes=2 tokens=unavailable builder_min=unavailable check_min=0.79 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17
Metrics-note: bounded resume measured from first checker skill read; earlier 7.61-minute check, eight mutations and 1.18-minute repair resume remain recorded above. No history or cycle reset.

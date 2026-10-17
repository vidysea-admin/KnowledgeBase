# T-037 checker packet — cycle 2

Repository: C:/Users/product/Desktop/KnowledgeBase
Skill: skills/maker/SKILL.md; checker skill: skills/checker/SKILL.md
Manifest/verdict slug: all40goal-t037
Contract: qa/contracts/goal-t037.md C4/C5 source scope, with all full-task/live clauses remaining owed.

## Change map and boundaries

- packages/ingest/src/join-policy/registration-policy.ts is the canonical implementation validating a closed operator/form/scope/relevance shape. Scope requires an exact authenticated organizer mailbox or exact organizer domain, explicit platform derived from the actual registration URL, exact HTTPS host, a positive relevance title term and no exclusion term. Candidate must be approved/auto_approved and senderAuthenticated. Unknown platform is selectable explicitly for custom approved native HTML hosts.
- Canonical ingest registration-policy-store.ts retains exact format/path/hash/lock/error/evaluation semantics. It uses tenant validation from existing join-rule path handling, separate registration-policies/<tenant>.json, tenant-bound complete document validation, maximum bytes, no file/ancestor symlinks, exclusive existing lock implementation, fsync+atomic rename and whole-document revision CAS. Saved changes remove approval. Only approve/revoke current revision may change the persisted authorization. Read/resolve performs no writes. Resolver loads existing join-rule state; explicit deny/opt-out beats registration profile approval. Optional private registrationIdentity (proven occurrence key/source ids/session keys) adds only opt-out vetoes, with a closed shape and total 200 aliases; T-052 owns derivation from accepted non-unresolved reconciliation. No public schema field is added.
- apps/api/src/join-rules/registration-policy-router.ts mounts inside actual createJoinRulesRouter. Dedicated join-rules scope controls every profile read/write; tenant solely req.auth.tenantId. PUT/approve/revoke bodies forbid client tenant/approved flags. Statuses are 400 invalid, 412 stale, 503 unavailable; no stored payload/path/error-message leaks.
- scripts/webinar/join-rules-host.ts delegates createJoinRulesDeps to canonical ingest createJoinPolicyDeps. Normal API capture-policy.ts imports that factory from @lkb/ingest; root owns package index exports and production call. registration-policy-host.ts exports createRegistrationPolicyResolver({stateDir,tenantId,runtime}) => candidate-specific config(candidate), consumed by T-052. Runtime python/profileDir/executable values remain operator-managed prerequisites. Approved policy never returns a registration-success field.
- Operator mailbox (256), allowed hosts (20) and selectors (256) match the real T-052 registrationConfigurationReason/browser consumer. The host test invokes that actual consumer on resolved policy at accepted boundaries and verifies overflow cannot replace existing approved bytes.
- RegistrationPolicyPanel loads the profile deliberately because it contains operator PII, edits the validated shape including paired optional organization value/selector, saves then separately approves the exact saved revision, supports revoke, disables approval of unsaved edits, and renders scope/unavailable/stale feedback. Existing JoinRulesPage mounts it; existing rule editor/approval/opt-out paths remain intact.
- Bot rule/store/lock/normalizer/registration modules and platform.ts are thin compatibility exports. send-now.ts relocates only decodeAll, IdentityInput/Extractor/match, PLATFORM_EXTRACTORS and meetingIdentity to canonical ingest meeting-identity.ts, importing/reexporting prior public names; hasEmbeddedRedirect, planSendNow and capture behavior remain unchanged. No permanent duplicate definitions or ingest→bot/apps/scripts imports remain.
- Checker-owned ordinary feature regression scripts/qa/join-rules-single-writer.test.ts now recognizes exactly canonical store/factory/two lock modules, verifies strict compatibility shim and host delegation plus actual function/error identity, and preserves read-only/unauthorized-extra-writer checks. Root protection audit authorized this narrow reconciliation; maker did not edit it. Original-byte backup is in qa/evidence/all40goal-t037/. Include the checker pin below in current replay; no arbitrary directory exception or enforcement/frozen-contract edit was made.

Security flags: auth, tenancy, data writes and operator PII. No credentials are accepted in profile fields; browser form execution/confirmation remains T-052 and independently owns field-type/redirect/CAPTCHA/payment refusal. D-166 last-valid implementation untouched. Send-now, schemas, migrations, tracking, decisions and default API composition belong to other agents and are excluded.

## Historical cycle-0 evidence and required current-cycle checks

1. Broker ran C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test --test-concurrency=1 --test-timeout=30000 --import tsx packages/meeting-bot/src/calendar/join-rules/registration-policy.test.ts scripts/webinar/registration-policy-host.test.ts, cwd repository, environment overrides {} and outer timeout 120000ms. Actual exit 0; tests 10/pass 10/fail 0/skipped 0; elapsed 9284.8998ms. Started 2026-10-14T21:12:33.118Z, completed 21:12:42.407Z. Evidence: qa/evidence/goal-t051checker-broker-t037-node.json, .stdout.txt and .stderr.txt (empty). Metadata records unchanged 12 pre/post pins; fresh maker recheck matched 12/12.
2. node node_modules/vitest/vitest.mjs run src/pages/join-rules/RegistrationPolicyPanel.test.tsx src/pages/join-rules/JoinRulesPage.test.tsx --maxWorkers=1 --minWorkers=1 (cwd apps/web)
3. Appropriate targeted TypeScript check; root contracts/verify_contracts.py coordinated centrally.
4. Broker bridge: same Node --test flags on apps/api/src/composition/integrations/capture-policy.test.ts, outer timeout 30000ms, exit 0, tests/pass 2 fail 0, elapsed 682.5132ms; immutable qa/evidence/goal-t051checker-broker-t037-capture-bridge.json/raw logs. Fourteen pre/post pins unchanged.
5. Broker UI: Node node_modules/vitest/vitest.mjs run src/pages/join-rules/RegistrationPolicyPanel.test.tsx src/pages/join-rules/JoinRulesPage.test.tsx --maxWorkers=1 --minWorkers=1, cwd apps/web, outer timeout120000ms, exit0, tests/pass37 (panel4+page33), elapsed13369.7396ms; immutable qa/evidence/goal-t051checker-broker-t037-ui.json/raw logs. Twelve receipt pins unchanged; stderr contains existing React Router future-flag warnings. This snapshot preceded cycle-1 refactor/organization controls.
6. Current-cycle affected replay must include own policy/host/bridge tests, bot join-rules.test.ts, join-rules-store.test.ts, platform.test.ts, send-now.test.ts and join-rules-cas.test.ts (contains the exact ISS-UNOPTLOCK-002 recorded ledger reproduction). Broker must bound the real child-process CAS cases; no local execution. Current UI replay is the same two-file command. Root owns dependency/type gates; checker owns any ground-truth reconciliation.
7. Current-cycle writer regression replay: node --test --test-concurrency=1 --test-timeout=30000 --import tsx scripts/qa/join-rules-single-writer.test.ts, bounded outer broker timeout. Checker owns its exact path reconciliation and original backup; preserve all retained security cases.

Tests use synthetic operator values, temporary directories and loopback HTTP only. No provider key, external browser, real form submission or source data needed. No local CPU lease is granted; UI and bridge broker results remain pending. No filed issue is claimed fixed, so D-015 corpus closure is not asserted. Authenticated route evidence uses real Express middleware/routes with synthetic fixture key-store, rather than a live Mongo/API-key claim.

## Resumed actual-consumer read (no runtime evidence)

The current scripts/webinar/run-pipeline-deps.mjs now overrides raw runtime configuration with the persisted candidate-bound resolver after validateTenant verifies current API/configured tenant equality; failure clears verifiedTenant. It uses the same raw/webinars policy directory as the API special host. Current registration-workflow.ts derives bounded private restriction-only aliases from accepted non-unresolved occurrences and proven linkedCalendar, forwarding them only to config(candidate), never the external registration object.

Normal API production now calls buildCapturePolicyIntegrations, which imports the actual canonical factory from @lkb/ingest. Exact LKB_JOIN_RULES_ENABLED=1 and absolute/control-free root bind fixed confined root/raw/webinars. Constructor performs no mkdir/lock/host/provider/capture startup. Root explicitly rejected apps→scripts→meeting-bot indirection; cycle 1 removes it by canonical allowed-layer relocation without changing the dependency rule. Root index exports createJoinPolicyDeps/JoinPolicyDeps from ./join-policy/index.js. Centrally leased callers remain mutable, so actual-byte consumer/runtime evidence must be refreshed before full verdict. No source-only PASS or checked-PASS close-out is requested.

Reviewer should check source and live leased integration rather than infer PASS from this description. Final hashes/base hashes and exact command output will be appended before ready-for-check. Full task remains HOLD until genuine operational clauses pass.

## Cycle-2 approved sender projection (source only; not yet executed)

Root grants only NEW packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust.ts and matching .test.ts. Neither file existed at the tracked base. projectApprovedSenderTrust(input) returns a TrustedSenderConfig with only this candidate's exact saved mailbox/domain added, or undefined to refuse projection. It does not change any selection, candidate status, everyWebinar default or registration authorization. Existing selector/veto remain mandatory immediate consumers and consume the same stored document.

ApprovedTrustContext requires equal configured/key/document tenant, canonical tenant shape, same-tick verifiedAt===now, safe nonnegative clocks, primary validatedAt===now or last-valid age in [0,3600000), plus complete engine-validated rules/state. This is an INTERNAL caller contract over the actual authenticated tick and integrity-checked loader; a pure function cannot authenticate an API key, verify file integrity or prove a primary file exists. No client-provided context is authorized. Undefined is a refusal to project saved trust; callers must not treat it as permission to bypass enforcement or use a stale document.

Per-candidate checks require authenticated sender with aligned supplied domain, accepted status, positively classified webinar, conference-provenance HTTPS supported-platform link without credentials, valid due interval, no cancellation/registration-only flag, and valid bounded restriction-only identity aliases. The real evaluator checks source id/gmail id/proven aliases; deny and meeting opt-out beat approval. An allow rule alone cannot add trust. Bootstrap lists are copied without repair; inputs remain unchanged.

Six authored synthetic tests exercise real save/approve/reload -> distinct pending authenticated legacy selection -> unchanged veto, exact sender/domain and base preservation, tenant/clock/snapshot/invalid-state boundaries, cross-source opt-out/deny, auth/provenance/time/classification refusal, legacy dedup/no resurrection and explicit OPEN everyWebinar counterexample. No tests executed. Broker command adds packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust.test.ts to the retained affected Node/CAS/detector spec, serial and bounded; current API policy host and two-file UI replay remain required. New sole CPU broker is /root/docker_governance_review. ISS-376's four ledger cases remain the checker-owned full-policy floor, not claimed fixed by this pure projection. No live/nonproduction/human/production proof exists.

## Frozen cycle-2 source hashes (SHA256; pre-replay)

Tracked base: ed542fd01c870e5d5b64e1d72b413062d595f675; the 36 maker paths/pins below include all maker changes, granted canonical-layer compatibility edits and the two cycle-2 projection paths, plus one checker-owned regression pin (37 controlled paths total). Added policy/UI/bridge modules, canonical ingest directory and new projection paths had no base; centralized ingest root index/production wiring remain outside maker ownership.

```text
apps/api/src/join-rules/deps.ts d94290392bef332c38bcad2cb525f6a89c30640c1cd46b77eea32df79038c939
apps/api/src/join-rules/router.ts 945e23d360913e1b25f598522a6491a9a9aa63c5647ec4b6a5bc54361a3ebd66
apps/web/src/pages/join-rules/JoinRulesPage.tsx d4ff683fda777ffbdd6aeda3be960981424f1dcfcc695169720c798687ab442c
scripts/webinar/join-rules-host.ts f833502ada8e59547b8bc878093232d9a427293fb069dc4e64dc36691a322b12
packages/meeting-bot/src/calendar/join-rules/registration-policy.ts 91189292e6ae2536bc02f5c4ddd0f0426b0848bf2786202125c1790d68ee12f6
packages/meeting-bot/src/calendar/join-rules/registration-policy-store.ts fc99458a8034a2c92cf1f645f058a33d62b97a0d7a926ee781024008862aebf2
packages/meeting-bot/src/calendar/join-rules/registration-policy.test.ts 164fe32bee986140421cd3420320a46810b429fec48457f0803381d82a86c542
apps/api/src/join-rules/registration-policy-router.ts b4c0a40a41ce76005b5c5cce1ec34c41a65ac01125bce501ef49e6e6444a9761
apps/web/src/pages/join-rules/RegistrationPolicyPanel.tsx 8ef2b124a7222bd6e37a796d720e79b77325aa8fd745fbee8cb1ff76635d2bab
apps/web/src/pages/join-rules/RegistrationPolicyPanel.test.tsx 9ced7ad1a0c62fdcf565d84baf15bfccf1118ec003dd5b130d32e0623708a773
scripts/webinar/registration-policy-host.ts ab06553cb94627a7e91c5908fb2e21c8fde8403228c4d0867d60d3e47946af7e
scripts/webinar/registration-policy-host.test.ts 8f0a9dd964b87db2e21c04a9600ff898f28502bfff926c58441b0ea99faa9402
apps/api/src/composition/integrations/capture-policy.ts 3620d95c20350b07ff8767027c875c424975d523fc4de0df77937613eb70da07
apps/api/src/composition/integrations/capture-policy.test.ts d12568c611535b8413d22d2bccc163721594f0288aa39530264c2af292a47005
packages/meeting-bot/src/calendar/join-rules/join-rules.ts d675a7cfe9ff3c32556a7df748b25d40c46c6bec1a5691c1892a87b15929a169
packages/meeting-bot/src/calendar/join-rules/join-rules-normalize.ts 282535853d08f632582b2655b5c1bfa1b44837f38d295cc8692ca22eee72289c
packages/meeting-bot/src/calendar/join-rules/join-rules-store.ts 02a6a512e00e372d2af3313158984ae9345d626c21b3441989cf35349bb0981e
packages/meeting-bot/src/calendar/join-rules/join-rules-store-lock.ts 543e2f3cf2d0251e6b2f8ae488e502b36fcc3089529b7582e34f2030094dafc8
packages/meeting-bot/src/calendar/join-rules/join-rules-store-lock-steps.ts 3054fb2a071ec0ed0d1f3560c26533391bd2df127fc14c645023f17f04b437ca
packages/meeting-bot/src/calendar/join-rules/join-rules-optout.ts 9f6740c78beb8b846754836ce0fdc23d650fcd751028f3f0c831d39754f48dee
packages/meeting-bot/src/platform.ts 6faa4d15668600f5d711d14296821bfee6c2830cdf8352a428ca4453d80f31f4
packages/meeting-bot/src/send-now.ts cb7c973b28a475d1a1640c8b2a0ecac8d4edf1fb2342ea5245b00ab330b84b48
packages/ingest/src/join-policy/deps.ts 41f487cb6a933e8ef1a37eec90b07ede5a618bba5bf1089f6b32676f4d525dc6
packages/ingest/src/join-policy/index.ts 15b3ed8e1cbf97bec2cc63a901f0ce2cc4beef0328f20482e4ddf448832d9f58
packages/ingest/src/join-policy/join-rules-normalize.ts 5e99c770b0ae63667cbe60fdd6c56b2e8c51b961809c05eab07e657894cd97a6
packages/ingest/src/join-policy/join-rules-optout.ts 8490c8a0263b372009406b1aaeacbea80bcdd14646b07c5c7e958346adb29e2e
packages/ingest/src/join-policy/join-rules-store-lock-steps.ts 5365f2662ae43d37a5175c21b8a2d5bd428627e05f0cc4cea54977b82e41ac9d
packages/ingest/src/join-policy/join-rules-store-lock.ts d0f839684de27e80ec813a708927c489ab0a0d733d37dc82331edd0f49a2e776
packages/ingest/src/join-policy/join-rules-store.ts 59c6ab17e64654f257ddf7c216f83e98a7223b83e847953f112f21e27c9cd593
packages/ingest/src/join-policy/join-rules.ts b3eec6aa2bc940ad641f1c3ff31bcdae4d137c188f573475e9a1921f9b5ef34b
packages/ingest/src/join-policy/meeting-identity.ts 136214c1ab25bd34630ce4ec08ceb6af9677014f20d9133598d52c67a08c89b3
packages/ingest/src/join-policy/platform.ts 298eb0dc4ba640e9f8f8743caef385f34f511c713019eff1c7b4b89e8dd59c34
packages/ingest/src/join-policy/registration-policy-store.ts f5d04ce65cecc26ddf4bdc6c72d8971852a150ab30eba6aeab5bdd5c42143e3c
packages/ingest/src/join-policy/registration-policy.ts 4aa926a9bfc92073f483cfea0cc287be41049e15a0ccfa2ccabc200aa3bd6264
scripts/qa/join-rules-single-writer.test.ts ffabbe1fe804eea3ed297008e51107d656d202675fafe153a164f970e7405b64
packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust.ts 653297e4ad37f3dc70ff70a49562c1dc6346de438967c5273544c326e468490c
packages/meeting-bot/src/calendar/join-rules/join-rules-approved-trust.test.ts 6600c7483cbaffba7d4168f60d5cbf7ae06ca9ad107ad7880ec3dc8599bb2a92
```

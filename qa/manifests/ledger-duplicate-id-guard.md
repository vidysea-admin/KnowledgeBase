# ledger-duplicate-id-guard
Status: BLOCKED
Fix cycle: 0
Feature: duplicate ledger IDs cannot become usable union rows
Maker: /root/registration_durable
Authorization: D-103; independent registration_resource_plan implementation-plan APPROVE (root dispatch).
Backlog: qa/QUEUE.md top clear TODO ledger-duplicate-id-guard (high), project priority tier 1.
Risk tier: M � shared reader and downstream CLI behavior; only additional tests, no protected assertion weakening/config/enforcement edits.
Audience: developer/operator CLI; no external UI.
Base SHA: 614d78b8966428296f394b8bf3e6c547d41beca5
Dirty scope: existing shared checkout contains unrelated work; this maker owns ONLY scripts/lib/tracker-audit.mjs and scripts/lib/ledger-union.test.mjs plus this authorized evidence artifact. Other edits preserved.

## Governing criteria and invariants
Current contracts: qa/contracts/ledger-shard-union-readers.md (active), qa/contracts/tracker-integrity.md; qa/contracts/ledger-id-allocation.md is proposed and its allocation/write criteria are outside this read-only feature.
Existing active contract: [C1] resolves canonical first then every sorted shard; [C4] rethrows non-ENOENT directory errors; [I1] no error-swallowing introduced; [I2] reproducible commands with honest outcomes; [I3] hooks/decisions/contracts/architecture unmodified by this unit. Existing tracker-integrity C6 requires nonzero failing CLI; C7 whole structure exit0 is still blocked by unrelated baseline findings, not claimed satisfied.
D103 authorized feature acceptance criteria (maker-derived from approved plan, NOT a new or edited checker-owned contract):
A1. Refuse repeated parsed string IDs, identical or conflicting, within canonical, canonical/shard and shard/shard; report ID plus both exact one-based file locations.
A2. Preserve canonical-first sorted union order and malformed JSON count; a duplicate must throw outside the parse catch, never become unparseable accounting or a winner.
A3. Preserve file-read error propagation and valid distinct qualified IDs, including repaired ISS-360-OBSFLAKE and ISS-360-HEARTBEAT. Preserve prior valid parsed non-string-ID rows.
A4. Duplicate IDs cause existing CLI nonzero even for --gate g1; replacing the conflicting fixture ID with a distinct ID restores exit0.
Invariants: no ledger rewrite/deduplication/renumbering, no new application file, no contract/hook/architecture/registration/health edits. All standing assertions retained; only redundant historical test comments removed to stay at300 nonblank lines.
Gate: qa/gates/iss-360-duplicate-id-collision.md has historical OPEN repair gate; qa/QUEUE.md update states D055 ruling2 executed by checker, canonical IDs promoted. Guard explicitly separable and ungated. This feature does not decide or alter historical citations.

## Implementation
readLedgerRows at scripts/lib/tracker-audit.mjs:65 records first string-ID location; only JSON.parse is caught. Duplicate check outside catch throws before row is appended. Existing ledgerFiles order unchanged.
Existing ledger-union.test.mjs adds six collision cases, positive order/malformed case, parsed-row/read-error case and isolated CLI collision/repaired control. No existing assertion deleted/relaxed.

## Actual maker evidence
1. Before reader edit: node --test scripts/lib/ledger-union.test.mjs -> exit1,29 tests21pass8fail. Six collision cases fail Missing expected exception; selected g1 CLI incorrectly exit0. One already-red G4 historical-document test separate.
2. After reader edit: node --test scripts/lib/ledger-union.test.mjs scripts/lib/tracker-audit.test.mjs -> exit1,46 tests45pass1fail,0skips. All9 new cases green. Sole failure G4 master's manifests and verdicts are clean under this gate; six pre-existing historical files cite bare ISS-001/002: manifests t-031-audio-watchdog,t-033-bot-tests,u3-notify-channels,u4b-heartbeat-collection; verdicts t-031-audio-watchdog,t-047-controller. This same failure was present before reader edit. No repair authorized.
3. Final hash tree: node --test --test-name-pattern='duplicate ledger|ledger IDs retain|ledger reader preserves|selected CLI' scripts/lib/ledger-union.test.mjs -> exit0,9/9,0skips,1167.3345ms. One earlier same targeted run preceded final comment-only trim; final rerun records current test hash.
4. Affected importer: node --test scripts/lint.test.mjs -> exit0,18/18,0skips,8437.7407ms. No broad API/browser suites repeated. TierM requires affected scope, no whole-repo suite; historical full-contract structure gate remains disclosed blocked.
5. Real repository readLedgerRows(ROOT) -> exit0,464 rows,0unparseable, both repaired ISS360 IDs present. No temporary shard/ledger writes; historical contract C5's prior synthetic-repository shard campaign is not re-claimed by this feature.
6. Six bounded isolated-copy falsifiers, each node --test --test-name-pattern with subprocess timeout20s; fresh temp root per mutation, finally byte restoration+comparison, never bound tree mutation. Each baseline0 / assertion mutant1 / restored0 / bytecmptrue: duplicate-refusal(A1), one-based-diagnostics(A1), malformed-accounting(A2), canonical-sorted-order(A2), read-error-propagation(A3), selected-CLI-refusal(A4). First batch completed3 then failed mutation literal setup for sort; not product evidence. Corrected remaining3 completed separately. Temporary directories removed only after canonical temp-parent check. Commands: Python here-string bounded subprocess harness invoking node --test on copied scripts/lib/ledger-union.test.mjs; mutations respectively false duplicate predicate,index0,missing malformed increment,reversed sorted shards,swallowed file read,CLI audit bypass.
7. Scoped git diff --check -- scripts/lib/tracker-audit.mjs scripts/lib/ledger-union.test.mjs -> exit0. Whole-checkout diff check separately exposes pre-existing schedule-state trailing whitespace, preserved.

## Evidence identity / readiness protocol
Policy: proportional-verification/2026-10-05.3; native adapter codex-native/2026-10-05.3, NEW feature safe-boundary adoption. Actual readiness tick --policy-check -> exit0 targets2 drift0. Installed maker/checker reread; no claim other agents adopted.
Maker protocol SHA256: 67db6b6b125da3af317503482164f86d7026d02ba77a39e06aae1a8a1152542e
Checker protocol SHA256: 126f87de7882eeceb45ade773c1d47b8be5eb93b691cd4f90f5adade96231949
Source SHA256: 802528352cd0b463692daa6de4608ba2abbe55cd859c750d0a192cca229d5ddd (286nonblank/300).
Test SHA256: 38be5e5cecd1e61eb75f4956b73d210f86aa1b21f2b69acb6e399b0743f186a6 (300nonblank).
CLI SHA256: e872dfd4275914107553de527ef508d9ca699a9ded13de854037d50312ee4a3b
pnpm-lock.yaml SHA256: 0d1b68f769d4e60ce4e20c1c761d28b904c276394dee896aa0d7626aeaae7d87
Environment: Windows PowerShell, Node24.13.1 win32 x64; existing offline dependencies. No package installation, external registration, DB or mail actions. Standing tests are local filesystem fixtures. No deployment/browser/data-service version applicable.
Readiness means completed builder scope; no independent acceptance verdict, no ledger or full KB goal closure. ISS368 contract mismatch and T052 in-flight protocol remain unchanged. Historical ledger-id-allocation write/citation criteria and release-wide lint defects remain outside this feature.

Metrics: start=2026-10-05T14:15:34+00:00 end=2026-10-05T14:20:09.579025+00:00 wall_min=4.59 agent_min=unavailable blocked_min=0 suite_runs=5 repeat_runs=1 mutations=6 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-05.3

## Cycle-0 outcome
Independent qa/verdicts/ledger-duplicate-id-guard.md: CONTRACT_MISMATCH. Nine feature tests independently green; senior review no findings; required tracker-integrity C7 whole structure remains red (5/10 stages), existing G4 historical document failure remains. Independent falsifications unrun at concrete contract stop. No checked-PASS/goal closure, no live checker handles. Source retained pending lawful contract/gate reconciliation.

# Verdict: pr3-ci-repair

VERDICT: PASS
Status: PASS
Cycle checked: 1
Reviewed SHA: 52debfc7ee68e84537e3e891038e5bc2c2c56b64
Base SHA: 0f3d9bb4
Branch: codex/kb-build-wave-2026-10-16 (lane C:\Users\product\Desktop\KnowledgeBase-lanes\pr3-ci)
Checker: independent checker subagent, fresh context, 2026-10-17
ISSUES-WRITTEN: none

## Identity
- Lane HEAD = 52debfc7ee68e84537e3e891038e5bc2c2c56b64; `git diff --quiet 52debfc7` clean; 15 commits in 0f3d9bb4..52debfc7; 93 files.
- No manifest exists for this unit (brief-only packet); cycle 1 assumed from the brief.
- CI at 52debfc7, read via `gh run view`: push and pull_request each ran ci=success, images, build-targets(api), build-targets(web). 8/8 jobs succeeded. ci.yml runs `pnpm -r typecheck`, `pnpm -r test` and `lint:structure`. Receipt: qa/evidence/pr3-ci-repair-checker/ci-jobs.txt

## 1. D-153 product change (84b2d488, apps/api/src/ask/source-context.ts:114-124, 144)
- Recorded D-153 (docs/DECISIONS.md:2135) says invalid turns are excluded per turn, listed in a warning and never cited. The code does that. The extra restriction to `sessionVisible === true` is narrower than recorded D-153, so it adds privacy rather than removing it.
- Non-visible session: a malformed row is kept only when `visibility.sessionVisible` returns true (knowledge.ts:173-175). That call is guarded, so an error gives false, and it is false for whatsapp-batch sessions, missing sessions or sources, and withheld consent. A non-visible session's malformed row is therefore removed before `bytes`, `snapshotSHA256`, `excludedTurns`, the refusal branches and the audit-log warning or job (packages/ask/src/ask-graph.ts:108-110). The refusal messages are generic. The readEffectiveTurns errors carry no turn ids.
- Never cited: `snapshot.rows = validRows` (:158). Chunks that cover an excluded turn are dropped (:163-164).
- Revision check: `rows` = only rows that pass the visibility filter (:124). The graph hash and quote checks use `rows`.
- Checker mutations (source-exclusion.test.ts; per-mutation backup, timeout, trap, HEAD-fidelity OK). All 4 were killed:
  - M1: keep malformed rows regardless of visibility. 1 failure (the D-153 non-visible test).
  - M2: graph revision uses all retained rows. 1 failure (the graph-authority test).
  - M3: revert to the silent drop. 8 failures.
  - M4: remove the early scope check. 2 failures.
- Evidence: mutate.sh, mutate.out, M*.log

## 2. Stricter product changes (6d3e2f48)
- source-context.ts:112: `assertInScope` on raw rows before the overlay read. Before, a foreign row was either dropped silently by `filterTurns` or caused an untyped throw. It now refuses with a typed error. This is stricter, and M4 is killed by it.
- trusted-readers.ts:121: `assertValidTenantId` runs before the snapshot. An invalid tenant now gets a guard error instead of a 503. No data is read in either case, and the message does not echo the tenant. Stricter. Verified by inspection only.

## 3. Test doubles
- Exact query-count pins were replaced by `unscoped(queries, A) == []`, which checks `filter.tenantId === A` on every recorded op, plus an exact root-filter match. Every pin I sampled (ask-tenant-isolation:92-94,176-177; store-guards:97-100,195-200; scoped-routing:45-46) is equivalent for tenant isolation. The direct property is still asserted, and BlindDb is still tenant-blind (it matches on filter fields only). The new upsert and dotted-path paths do not add tenant inference.
- The 5 ISS-169 tests moved to /answer-policy/simulate. That route is the remaining `extraCandidateArmsFor(tenantId)` binding site (answer-policy/routes.ts:44), and the tests also assert that public /ask binds nothing. They keep ordered per-request binding, re-binding for the same key, and no binding when unauthorized.
- Meeting-bot fixtures (52debfc7): the seeded consent receipts and the organizer are test setup only. No assertion was removed.

## 4. Structure splits (pure moves)
I compared removed and added lines for 6 splits:
- vectorless-production-eval -> grants/diagnostics
- lean-video-obs -> -fake/-record
- workflow -> workflow-watched
- session -> session-strict
- send-now-host -> send-now/
- registration-policy-host -> registration/

The only differences are `export` prefixes, `../` depth (root `..,..,..`), the moved `captureWait`, and CODE fingerprint list entries.

## Commands (checker-run, apps/api, node v24.19.0, `timeout 600 node --test --test-force-exit --import tsx`)
| Test file | Result | Exit |
|---|---|---|
| source-exclusion | 13/13 | 0 |
| source-context | 25/25 | 0 |
| source-context-lexical | 7/7 | 0 |
| ask-tenant-isolation | 16/16 | 0 |
| ask-tenant-hostile | 70/70 | 0 |
| store-guards | 114/114 | 0 |
| scoped-routing | 18/18 | 0 |
| ask-arms, run 1 | 12/12 subtests, file-level fail | — |
| ask-arms, rerun | 12/12 | 0 |
| contracts/verify_contracts.py | vacuous PASS | 0 |

- ask-arms run 1 failed on a libuv `UV_HANDLE_CLOSING` assertion at exit, an environment fault. The rerun passed.
- Environment: lane source with temporary node_modules junctions into the main tree. These were removed afterwards and the main tree is intact. `@lkb/*` resolved to lane source through tsconfig paths.

## Notes (low, EXPLANATION only)
- The 2026-10-17 Approver refinement ("only for sessionVisible sessions") is not in docs/DECISIONS.md. Append it with scripts/append_decision.ps1 so D-153's effective record matches the code.
- controller-state.test.ts: one byte changed from 0xE9 to U+FFFD in a string literal. It decodes the same at runtime, and the length bound still holds.

## Not verified
- The apps/web test changes.
- The remaining structure splits.
- A loadGraph mutation.
- The full suite run locally (CI receipt relied on).
- Measured maker usage is unknown, so the ratio is unverified.

## Ledger
No ledger rows are tied to this unit. Nothing needs flipping.

## Metrics
Checker tokens: about 120k from the host budget counter (actual_total not exposed precisely). Active time was not measured. Maker usage is unknown, so the ratio is UNVERIFIED.

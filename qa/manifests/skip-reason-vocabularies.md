# skip-reason-vocabularies

Status: ready-for-check
Fix cycle: 0
Lane: `skipvocab`, branch `lane/skipvocab` (base 1414d79). Closes ISS-T037W1-003 (medium).
Tier: backlog tier 4 (medium issue). Not auth, tenancy or data-write: the three consumers only label and filter operator-facing reason text. No selection or scheduling behaviour changed.

## Scope
Three consumers kept their own hand-copied reason lists. Each is an ALLOWLIST for the `reason` of a webinar *operation* row (a superset of SkipReason: it also holds pipeline states such as `retry-limit`). Anything outside the list was replaced by a neutral label (never dropped, never shown raw), so the three new SkipReasons (`opted-out`, `rule-denied`, `rules-unevaluable`) would have been mislabelled.

| Consumer | Use | Before (new reason arrives) | After |
|---|---|---|---|
| apps/api/src/routes/brain.ts `listWebinarOperations` | API field `reason` shown in the operations view | `processing-failed` | shown as-is; unknown stays `processing-failed` |
| packages/meeting-bot/src/capture/telegram-channel.ts `createOperationNotifications` | reason in the Telegram alert and the dedup fingerprint | `pipeline-failed` | named as-is; unknown stays `pipeline-failed` |
| scripts/webinar/run-pipeline.mjs `runPipelineWatch` | `--watch` JSON log of operations | `details-private` | shown as-is; unknown stays `details-private` |

Before the change the three lists also differed from each other (telegram lacked `no-join-link`, `past`, etc.). Now all three accept the 14 SkipReasons plus the same pipeline-only states (telegram keeps its narrower pipeline-only set: it never listed the source-discontinuity family; unchanged).

## What changed
- core `webinar-types.ts`: new exported `SKIP_REASONS` const array; `SkipReason` is now derived from it (`(typeof SKIP_REASONS)[number]`). The union is identical (14 values). **Other lanes (attention alerts) can use `SKIP_REASONS` once this merges.** Note: lane `node_modules` junctions resolve `@lkb/core` to the MAIN tree, so no consumer imports it at runtime here.
- brain.ts: local total `Record<SkipReason, true>` (apps/api may not import meeting-bot) plus an operation-only list; exported `WEBINAR_OPERATION_REASONS`. Adding a 15th SkipReason fails `tsc` here.
- telegram-channel.ts: `NOTIFIABLE_REASONS` / `notifiableReason()` derived from `Object.keys(SKIP_REASON_MEANING)` (total record in skip-describe.ts, same package).
- run-pipeline.mjs: `OPERATION_REASONS` (exported) derived from `SKIP_REASON_MEANING` the same way.
- New test `scripts/webinar/skip-reason-vocabulary.test.mjs` (reads the 14 values from core source text; asserts the script covers each; runs `runPipelineWatch` over 14 + 1 unknown). Tests added to `brain.test.ts` and `telegram-channel.test.ts`.
- Wording: the alert and API show the reason code; no sentence is added, so meaning is unchanged from skip-describe.ts.

Deliberately NOT changed: run-pipeline.mjs line ~226 only turns `overlap-lost`, `needs-registration`, `needs-review`, `invalid-time`, `unsafe-join-link` into `action_required` operations. The veto reasons are not persisted as operations there. Doing so would be a scheduling/behaviour change, out of scope; flagged for the checker.

## Other hand-kept lists found
`git grep` for `untrusted-sender|overlap-lost|no-join-link` over apps, packages, scripts, workers: `auto-record-policy.ts:173` (a 6-reason *filter* of review states, not a vocabulary; correct as is), `calendar-attendance-policy.mjs:71` (producer), `run-pipeline.mjs:226` (selective action list, see above), the existing tests. No other full vocabulary. The attention-alerts lane's 11-value list is not in this tree.

## Evidence
Node: `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin`.
- `cd packages/meeting-bot; node --test --import tsx src/capture/telegram-channel.test.ts src/calendar/skip-describe*.test.ts` -> tests 6, pass 6, fail 0.
- `cd scripts/webinar; node --test --import tsx skip-reason-vocabulary.test.mjs` -> tests 3, pass 3, fail 0.
- `cd scripts/webinar; node --test --import tsx run-pipeline.test.mjs` -> tests 22, pass 22, fail 0.
- `cd apps/api; node --test --import tsx src/routes/brain.test.ts` -> tests 11, pass 11, fail 0.
- `node <main>/node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/core, packages/meeting-bot, apps/api -> exit 0 each.
- `node --check scripts/webinar/run-pipeline.mjs` -> ok. `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`.
- `node scripts/lint-loc.mjs` fails on `packages/index/src/pipeline/speakers-llm.ts:313` and `packages/meeting-bot/py/sb_join.py:1142`; both pre-existing, untouched here.

### D-015 measurement
ISS-T037W1-003 named three consumers (brain.ts, telegram-channel.ts, run-pipeline.mjs); the issue records no separate attack corpus, so the corpus is the 14 SkipReasons plus one unknown value per consumer.
`ISS-T037W1-003: 3/3` consumers handle all 14 values (brain 14/14 as-is + unknown -> `processing-failed`; telegram 14/14 + unknown -> `pipeline-failed`; script 14/14 + unknown -> `details-private`). No recorded reproduction left open.

### Mutations (timeout 170 s; byte backup per mutation; restored on EXIT/INT/TERM/ERR; `git hash-object` equals the pre-mutation blob, `cmp` ok every time)
| # | Mutation | Killed by |
|---|---|---|
| M1a | brain.ts: remove `rule-denied` from the Record | tsc TS2741 (`Record<SkipReason, true>` missing `rule-denied`) |
| M1b | same | brain.test.ts: 1 fail (operations test) |
| M2 | telegram: filter `opted-out` out of the derived list | telegram-channel.test.ts: 1 fail |
| M3 | run-pipeline.mjs: filter `rule-denied` | skip-reason-vocabulary.test.mjs: 2 fail |
| M4a | skip-describe.ts: delete `rules-unevaluable` | meeting-bot tsc TS2741 |
| M4b | same | skip-reason-vocabulary.test.mjs: 2 fail |
| M5a | core: delete `rule-denied` from `SKIP_REASONS` | core tsc alone: not killed (core never references it); killed by M5b and by meeting-bot tsc |
| M5b | same | skip-reason-vocabulary.test.mjs: 2 fail (count 14, runPipelineWatch) |

## Unverified
Not run: full suites, apps/web, meeting-bot full suite (CPU budget). The `@lkb/core` junction points at the main tree, so `SKIP_REASONS` is not consumed across packages in this lane.

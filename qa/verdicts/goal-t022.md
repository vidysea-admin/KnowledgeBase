# Independent verdict — T-022 review workflow source, cycle 0

VERDICT: PASS
Cycle checked: 0
Scope: Submitted source implementation and its authenticated application mount only.
Whole-task T-022: HOLD
ISSUES-WRITTEN: none

## Exact scope and remaining acceptance

The implemented source satisfies C1–C6 and the scoped verification/handshake portion of C10 in `qa/contracts/goal-t022.md`: current neutral inputs, individual application review, authenticated tenant/scopes, durable revisions and attributable audit, source/input drift refusal, CAS and authoritative all-thirty export. The live-run capability additionally implements prerequisite owner-evidence gating, D-164 predecessor ordering, bounded official-origin transport, per-pair/arithmetic checks and honest incomplete/drift reporting. This certifies that capability's source and refusal boundaries, not a successful real calibration.

**C7–C9 remain HOLD. Actual Umesh approvals: 0/30. Actual current-human-reference provider runs: none.** No genuine owner-confirmation or independent verified-human receipt was created. Typed assertions and all synthetic fixtures remain outside human gold. Historical derived-reference reports cannot meet these gates. Before any actual model result is accepted, C8 also requires provenance for the executed provider/router package bytes; the runner currently directly binds its runner, intake, LLM plumbing, scorer and MAE consumer, not every provider dependency.

The actual API composition was independently exercised. App/navigation/LoginGate and the page/client source were inspected; four unchanged DOM tests are attributed below. A deployed browser session with Umesh, whole-application compiler/build acceptance and full-task close-out are **not** certified here. The central API typecheck was reported failing on other features, with no named T-022/evaluation diagnostic; no inference that the whole application is green is made. Central integration retains those compiler/build and deployment proofs, including the broader regression requirements in the earlier evaluator contract. This source PASS cannot close T-022 or waive any outstanding full-task requirement.

## Independent review and evidence

Read the complete new review modules, publisher, page/client/tests and live runner/policy tests; reviewed the exact actual caller and immediate consumer seams in `production.ts`, `server.ts`, integrated routes, authentication, default production judge, existing async MAE and web API client. Earlier read-only advisories concerning a trusted owner-evidence gate, before/after implementation bindings and actual persistence failures were repaired before submission and included in the checked final bytes. This is not a filed-issue fix, so no ledger reproduction corpus was substituted or omitted. The new auth/tenant/write seam is security class and is not round-capped.

The checker authored `qa/evidence/goal-t022-checker-mount.mjs` independently from the full contract. Sole CPU broker `/root/docker_checker` executed the exact frozen probe centrally; the checker did not duplicate its execution. It uses the real `createServer`, real evaluation composition factory and real file store with an isolated temporary copy of all 44 current source inputs. Other application dependencies are explicit existing test fakes; no real DB or provider is accessed.

Command: `node --import tsx qa/evidence/goal-t022-checker-mount.mjs`, cwd `C:/Users/product/Desktop/KnowledgeBase`. Outer timeout **45,000 ms**; exit **0**, no signal/error; broker wall **5393.5913 ms**, UTC **2026-10-14T20:16:07.335Z–20:16:12.734Z**. Inside probe measured **1618.2108 ms**, UTC **20:16:11.020Z–20:16:12.639Z**; import/startup time is outside that inner measurement.

**46 independent assertions passed.** They verify missing/invalid credentials, missing scope, foreign-tenant read/write/export refusal, missing/unsafe/private configuration refusal, current 30 neutral inputs and 44 bindings, no-store response, forged tenant/reviewer/actor/time refusal, one fractional synthetic save with server-bound actor and audit, restart persistence, stale CAS refusal, pending export refusal, actual unconfigured mount 503, and source-drift refusal on read/write/export with prior state/audit bytes preserved. Exactly one synthetic approval existed only in the removed temporary store; real human approvals and provider calls were zero. No repository source was mutated.

Exact immutable execution receipt/stdout/stderr:

- `qa/evidence/goal-t051checker-broker-t022-independent.json`
- `qa/evidence/goal-t051checker-broker-t022-independent.stdout.txt`
- `qa/evidence/goal-t051checker-broker-t022-independent.stderr.txt`

The outer broker pins were unchanged. The probe's expanded **68/68** source, consumer, manifest/packet/contract, neutral-packet and corpus hashes matched before/after; the checker independently rechecked every expanded hash against current disk, with **zero mismatches**. Checker reconciliation, counts and all final expected/current hashes are retained in `qa/evidence/goal-t022-checker-review.json`.

## Attributed existing execution, not repeated

1. Sole broker final union: `node --import tsx --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 apps/api/src/calibration-review/router.test.ts scripts/eval/human-calibration.test.mjs`. Outer timeout **60,000 ms**; exit **0**; **17/17 PASS**, nine API and eight CLI, no cancelled/skipped tests; TAP **14745.6223 ms**, broker wall **14910.4942 ms**, UTC **2026-10-14T20:06:54.669Z–20:07:09.584Z**. Receipt `qa/evidence/goal-t051checker-broker-t022-final.json` and corresponding stdout/stderr were read. All fourteen before/after candidate pins match current bytes. Includes all **30/30** individual missing-approval export refusals, **30/30** missing item-confirmation refusals, real publisher open/rename failures preserving prior snapshots, async MAE consumption (**n=30, MAE=0.125**) using explicit synthetic references, unconfigured/forged trusted human receipts, official-origin/redirect/physical-call bounds, and current-human-corpus model predecessor refusal. No synthetic proof was configured for a real provider invocation.
2. Attributed maker web execution from `qa/manifests/goal-t022.md`: from `apps/web`, `node node_modules/vitest/vitest.mjs run src/pages/calibration-review/CalibrationReviewPage.test.tsx --maxWorkers=1 --no-file-parallelism`; exit **0**, **4/4 PASS**, one file; Vitest **32.10 s**, actual test execution **462 ms**. Exact command UTC start/end and shell duration were not recorded. The named fixtures cover neutral rendering, individual fractional save/resume, failed-save count honesty and stale-tenant response refusal. Page/client/test hashes are unchanged and were independently validated; this is attributed evidence, not an independently rerun DOM suite or browser proof.
3. Attributed frozen validator: `python contracts/verify_contracts.py`, exit **0**, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Receipt `qa/evidence/goal-t051checker-validator.json`, combined batch UTC **2026-10-14T18:39:31.7184876Z–18:39:33.1459082Z**, combined **1.4327147 s**; individual validator duration unknown. Current validator/registry hashes match the receipt. The empty-registry result supplies no functional acceptance evidence and was not rerun.

## Checked final-byte identity

All fourteen candidate files and thirteen named integration/consumer files match the maker pin sets. Their complete hashes plus the actual corpus hashes are in the expanded checker reconciliation above. Principal immutable evidence identities:

| File | SHA-256 |
|---|---|
| qa/contracts/goal-t022.md | 2e56571308345202479b3c1bbd0b772016cebfc5737b0b78487777737d2acac4 |
| qa/manifests/goal-t022.md | 73f87525fdff34f7b93f29c9180cd4d0a344dbfc6ff763976edef3bb34bd5a93 |
| qa/packets/goal-t022.md | b2d4e53e1e5846e42fd8e476ead5820cad1a5ceb59a7ab8775ff8eed3fbeef87 |
| qa/evidence/goal-t022-checker-mount.mjs | cdcba62b828243597bdc06d5bbb384c5a74d8f546643184f7be2a7b35f0887b8 |
| qa/evidence/goal-t051checker-broker-t022-final.json | 8ab49d4b3c66aba8dde32c2901403c002aa1f29ade7870e090edaec3b4e5eeeb |
| qa/evidence/goal-t051checker-broker-t022-independent.json | bff850529621c1649708c02879d3d8e5a2ac9280bad100ac4055c5cb09e2d346 |

The manifest/packet remained ready-for-check, Fix cycle 0, during the independent probe and final expanded recheck. New/untracked candidate bytes were included; no reliance on a committed-only diff. Maker may close this source unit only against this matching cycle/bytes and must retain the explicit human/live/integration HOLD fields.

## Timing checkpoints and limitations

Original checker dispatch/contract authoring and earlier read-only advisory launches were not timestamped; their durations and the user steering pause/resume intervals are unknown. Formal READY review's first measured checkpoint: **2026-10-14T20:09:45.9133887Z**. Candidate14/consumer13 pin validation checkpoint: **20:12:10.1580680Z**. Fresh CPU request/authorization exact timestamps are unknown; broker execution timestamps above are measured. Scope review and probe drafting overlapped the queue wait; their exact phase boundaries are unknown. No approval question was issued by this checker; the broker owned its elevated execution approval and sole CPU mutex.

Final receipt/source recheck checkpoint: **20:17:40.7340711Z**. Expanded current-hash reconciliation completed by **20:18:52.2084463Z**. Draft/persist start and confirmed completion are appended below. The 120–180 second efficiency target was exceeded to obtain the required independent actual application mount evidence under the shared CPU queue; no required boundary was discarded and no unmeasured interval is attributed by subtraction.

EXPLANATION: No proven acceptance violation remains in the submitted source scope. Scoped source PASS, full-task human/live/integration HOLD. No providers, browsers, real DB, full suites, threshold/routing changes, corpus/media replacement, or manufactured human evidence occurred.

Persist marker UTC: 2026-10-14T20:20:53.7872600+00:00. Main verdict write was complete before this measured checkpoint; exact draft/persist start is unknown. Elapsed from first measured formal READY checkpoint: 667.8738713 seconds; original dispatch-to-verdict elapsed unknown.

## Current route-freeze refresh — same source cycle 0

Current scoped source VERDICT: PASS
Cycle checked: 0
Full T-022 / whole-application acceptance: HOLD
ISSUES-WRITTEN: none

This addendum certifies the current frozen calibration mount bytes. The earlier receipt, source pin table and reconciliation remain historical evidence; they were not treated as proof of later shared composition bytes. Close-out waited for the root-authorized `ROUTE_FREEZE` rather than repeatedly testing intervening additions.

Checkpoint `qa/goal-2026-10-14/route-freeze.json` is dated **2026-10-14T21:21:38.423Z**. Four of thirteen shared consumer pins changed: server, production, integrated routes and App. All fourteen owned candidates, the default judge/intake/MAE consumers and page/client/test remain unchanged. Read the current complete integrated routes and affected server/auth ordering, production evaluation-factory invocation and LoginGate/App navigation. The calibration router remains the first integrated workflow after `requireAuth`, rate limiting and usage middleware. New sibling application-form, capture-readiness, session-decisions and unavailable-operations constructors justified a fresh actual `createServer` probe. Production still constructs the real evaluation store from explicit private configuration, and the calibration page remains inside LoginGate.

The sole broker executed the **unchanged checker-authored** command `node --import tsx qa/evidence/goal-t022-checker-mount.mjs`, cwd repository root, outer timeout **45,000 ms**. Exit **0**, no signal/error; broker wall **3779.5554 ms**, UTC **2026-10-14T21:26:04.623Z–21:26:08.408Z**. **46/46 independent assertions passed** on the current mounted application, covering the same current-source/auth/config/persistence/audit/CAS/drift boundaries described above. Exactly one approval was temporary synthetic test data; actual human approvals and provider calls were zero.

New immutable receipt and corresponding logs: `qa/evidence/goal-t051checker-broker-t022-independent-refresh.json`, `.stdout.txt`, `.stderr.txt`. The original receipt was preserved. Broker pins and the probe's expanded before/after hashes were unchanged. At **2026-10-14T21:27:17.0390918Z**, the checker independently reconciled **68/68** expanded hashes, **7/7** route-freeze pins and **13/13** current consumer pins against actual disk; zero mismatches. Complete current expected/current pin records and counts are `qa/evidence/goal-t022-checker-route-freeze-review.json`. No standing 17-case suite, four DOM tests, frozen validator, browser, provider or full suite was repeated.

Current authoritative metadata/evidence identities supersede the earlier table only for the refreshed current close-out:

| File | SHA-256 |
|---|---|
| qa/manifests/goal-t022.md (ready-for-check, cycle 0) | 7fe0cd6659a656d0eb240bf1fbab1a8bc5802048bddd217e9272cc728f9f6b82 |
| qa/packets/goal-t022.md | ef0020bae13946ac483610ee83881cf18e3c77313187fe9202d1c3997952dfbb |
| qa/goal-2026-10-14/route-freeze.json | 311fbd974e54da6442737f197f26d08c8bfdab92d875f36e06c0a5ccc8c640b4 |
| qa/evidence/goal-t022-integration-consumer-pins.json | c1aaa84cdd9195b6598367e825ac696ca4a7639252045e6be2736f5a52b0bac5 |
| qa/evidence/goal-t051checker-broker-t022-independent-refresh.json | 774b9414b634b768b531d02f7bbe7f1b44ab1d3df964ee6acf4637bc9ea1f75c |

Refresh review began at measured checkpoint **21:24:16.7573915Z**; seven freeze pins and exact four-consumer hash delta were verified by **21:24:57.3314110Z**. Fresh CPU request/approval exact timestamps remain unknown; measured command timestamps are above. The broker owned execution and the sole CPU mutex; checker had no parallel handle. Refresh draft/persist timing is appended below.

**All original HOLD gates are preserved:** actual owner judgments remain **0/30**, no current-human-reference live calibration exists, executed provider/router-package byte provenance remains required for C8, and deployed human UI plus coherent final transitive compiler/build proof remain central-owned and pending. Source PASS permits only matching source-unit close-out; it cannot mark T-022 done or certify the entire application. This append-only refresh changes no contract, historical result or source candidate.

Route-refresh persist marker UTC: 2026-10-14T21:28:18.6608049+00:00. Addendum write complete before this checkpoint; exact draft start unknown. Elapsed from first measured refresh review: 241.9034134 seconds. Required frozen shared-caller reconciliation and sole-CPU proof were completed despite the efficiency target; queued wait phase durations are not inferred.

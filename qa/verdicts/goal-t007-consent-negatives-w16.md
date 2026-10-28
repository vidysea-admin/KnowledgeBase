# Checker verdict: goal-t007-consent-negatives-w16

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 678264c9634d561b7d42fe721c51bb179850b3b2
Base SHA: 6b64964b66d9a92688221b8ae1ebfbca5b72bb66
Superseded candidate (not reviewed as final): 5458a204494bfdcf98647dfe44fbea73573493db (amended; delta to 678264c9 = review-source.test.ts:19 cast + manifest tsc line only)
Checked: 2026-10-16T15:13Z, independent checker (fresh context), privacy class
ISSUES-WRITTEN: none
Ledger rows: no qa/issues*.jsonl row is tied to this unit; nothing to flip. The manifest may flip to checked-PASS.

## Identity
- Lane HEAD == 678264c9 (git rev-parse). Tracked tree clean at review time; only untracked checker scratch dir `.checker-t007consent/`.
- diff 6b64964b..678264c9: 5 files. Test/fixture/manifest only; no product source changed (message-publication.ts blob 36e39941 unchanged from base).

## Clause
Native publication consent gate (apps/api/src/native-evidence/message-publication.ts:47) must refuse missing/false/withdrawn consent and write nothing to tree_index.

## Commands and results (independently produced; logs in lane `.checker-t007consent/`, exit codes in *.exit)
Node v24.19.0 (codex runtime), from apps/api, each wrapped in `timeout 600`:
- `node --test --test-force-exit --import tsx src/native-evidence/message-publication.test.ts` -> exit 0, 11 pass / 0 fail
- `tsc --noEmit -p .` -> exit 0, 0 errors (confirms the amended cycle's claim)
- `src/whatsapp-review/review-source.test.ts` -> exit 0, 9/0 (consumer of the amended line)
- `src/knowledge-outputs/workbench.test.ts` -> exit 1, 22/1. The failure is "actual TOC unreviewed sample refuses ...", ENOENT on apps/api/data/toc-migrated/2026-08-27-in-focus-4/turns.json (directory absent in the lane). This is an environment gap, unrelated to the diff. The changed test "actual T007 approval capability ..." passes.

## Own mutations on the gate (per-mutation byte backup, trap on EXIT/INT/TERM/ERR, timeout 600, cmp + git hash-object == HEAD blob verified after each)
- G1 `given !== true` -> `given === false` (absent allowed): exit 1, 1 fail (consent record absent). Matches maker M1.
- G2 gate `return fail()` -> silent `return` (approve without publishing): exit 1, 2 fail (absent; mid-transaction-after-evidence-check, "Missing expected rejection"). So the gate is observable for withdrawn consent too: a silent skip lets approval and the claim commit, and no other layer catches that.
- G3 gate moved after the tree_index updateOne (write then throw, rolled back): exit 1, 1 fail at message-publication.test.ts:73. That is the operations-count assertion (actual 1, expected 0). It proves the tests assert that no write was attempted, not merely the post-rollback state.
- Final: message-publication.ts hash 36e39941 == HEAD blob; `git status` shows no tracked changes.

## Judgements
1. Refusal proof: yes. assertNothingPublished checks that tree_index and claims rows are empty and the candidate stays needs-review. It also checks for zero tree_index updateOne operations, and that check does not depend on the fixture rollback (G3 proves it bites). Each mid-transaction test asserts `withdrawn === true`, so the hook demonstrably fired.
2. The onOperation hook is test-only and inert. message-publication-fixture.ts is imported only by three *.test.ts files (grep). It defaults to undefined, `onOperation?.()` is a no-op, and production source is untouched.
3. Defence-in-depth: acceptable. False/withdrawn consent is independently refused by the fence (store.ts:32), checkEvidence (store.ts:49) and visibility (knowledge.ts:46, reached at message-publication.ts:57). Recommendation (low, not filed): add a direct unit test that calls publishApprovedMessage with an in-transaction session stub and a `given:false` source after the upstream layers. Then a refactor that drops the upstream layers still leaves the gate itself proven for false/withdrawn.
4. The workbench/review-source `as typeof` casts do not hide a real mismatch. WhatsAppReviewInput.source is `Pick<Sources,"_id"|"tenantId"|"kind"|"path">` (detection.ts:9), so `consent` trips only the excess-property check (TS2353). The added value `{given:true, recordedBy:"owner"}` conforms to Sources.consent (generated/sources.ts:21). Low note: `as typeof x.source & Pick<Sources,"consent">`, or a `consentedReviewInput()` helper, would keep the consent field type-checked rather than erased.

## Notes (low, EXPLANATION only)
- The fake withTransaction (wire-fixtures.ts:44-48) restores all rows on error, so the mid-transaction withdrawal is itself rolled back in the fake. The assertions are unaffected. Real-Mongo serialization is covered only by consent-race-mongo.test.ts, which is env-gated and was not run here (no real Mongo).
- The manifest gives "Candidate: see git log" rather than an exact SHA. This is a packet gap only; the checker verified the SHA itself.

## Not verified
- Real-Mongo transaction isolation and the write-conflict path (env-gated test, no real Mongo by policy).
- review_budget.py assess/preflight were not run. Maker usage is unknown, so the checker ratio is unverified. Checker actual tokens are not exposed (null). Approximate active time is about 12 minutes.

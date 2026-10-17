# Checker verdict: u22anchor (lane w17-u22anchor)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 044068ddc9ea74e0e59c22fb13713cf6aa4db2be
Base SHA: d42f371366137fdc2cbda8509c6917cc323ed32e
Checker: independent (Opus 5.5), 2026-10-17
ISSUES-WRITTEN: none

## Identity
- Lane HEAD is 044068dd and its parent is d42f3713. The worktree is clean.
- The diff adds two files: the anchored sidecar and the manifest. It modifies two files: derived-drafts.mjs and its test.
- The old sidecar u22-derived-drafts-2026-10-17.json is untouched: its blob dce056d8 equals the blob at base.

## 1. Privacy (public remote)
**No archived transcript text is embedded verbatim in a field.**
- The new sidecar keys are ids, sha256 hashes, labels, tally, flags and the 40-hex artifactRevision.
- Free text exists only in the 159 rationales.
- No email, URL or phone pattern appears in the rationales.

**Every proper noun and quote in the rationales is already public at base.**
- I checked all 89 capitalized tokens with `git grep` at d42f3713 data/eval. Every one is found except the plain word "Passage".
- I checked all genuine quoted fragments, for example "established in 1962 by B.V. Doshi", "be in your lane" and "Only the mother, father, sibling, and spouse...".
- The only unmatched fragments fall into two groups:
  - false positives caused by possessive apostrophes;
  - paraphrases of claim text that is tracked in batch-03.json.

**The archived text the models judged is also public.**
- It comes from `originalMigration` inside the tracked batch JSONs.
- It equals the text at 907c9c9:data/toc-migrated/*/turns.json. 907c9c9 is an ancestor of HEAD and is contained in origin/master and other origin branches.
- **There is no new exposure.**

**Secrets.** Neither the diff nor the sidecar contains a key, token, password, Mongo URI or .env file. The only long tokens are sha256 hashes and identifiers.

## 2. No humanGold
- The sidecar passes `assertNoHumanGold`.
- humanGold is false at the top level and on all 72 items.
- Every item has humanReview `unreviewed` with null approvedBy, approvedAt and decision, and bindingThresholds null.
- `writeSidecar` is unchanged:
  - assertNoHumanGold runs before the only writeFileSync (derived-drafts.mjs:130);
  - the write uses the `wx` flag;
  - safeOutPath confines output.

## 3. Archived text spot-check against git
All 80 resolved citations were compared with `git show 907c9c9:data/toc-migrated/<session>/turns.json`. For each, the record text is byte-identical and sha256(text) equals textSha256. Result: 80/80. The sample includes these five:
- visa-blueprint-part2-c01/t011
- atlas-skilltech-c02/t007
- in-focus-2-c02/t011
- metrics-and-mingling-c02/t060
- in-focus-4-c02/t014

The sidecar `citations[].textSha256` values match a fresh resolveCitations run with 0 mismatches.

## 4. Results credibility
The new counts are supported 52, partially_supported 19, no-majority 1, unsupported 0. The verified counts are:
- 159 of 216 calls used;
- 15 items flagged;
- all 72 items have citationSource `archived-original`.

I sampled three claims that changed from unsupported to supported. Each claim is genuinely established by its archived passage:
- **visa-blueprint-part2-c05:** "guaranteed a three-year post-study work visa" after a Bachelors or Masters.
- **entrance-exams-part1-c01:** "close to 40,000 seats" against "12, 13 lakh" JEE students.
- **metrics-and-mingling-c03:** "get my 30-second pitch very ready". The tally was 2 supported to 1 partially_supported, a fair majority.

The swing is credible. The claims were extracted from exactly these archived turns. The earlier 54 "unsupported" labels came from turn-id drift, as noted in the deriveddrafts verdict.

The single no-majority item, in-focus-3-c02, carries `invalid-or-failed-vote` and is flagged. That handling is correct.

## 5. Tests (no live calls; provider keys unset)
- Command: `DD_DATA_ROOT='C:\Users\product\Desktop\KnowledgeBase' timeout 600 node --test --test-force-exit --import tsx scripts/eval/derived-drafts.test.mjs`
- Result: exit 0, 13 pass, 0 fail.
- `python -I contracts/verify_contracts.py`: exit 0 (PASS by vacuity).

## 6. D-020 mutation
The run used a per-mutation backup, a trap on EXIT/INT/TERM/ERR, `timeout 600` and a HEAD hash check.
- **Mutation M1:** removed `om.textSha256 === sha256Text(om.record.text) &&` from resolveCitation, so archived text is accepted without its hash check.
- **Result:** exit 1, 12 pass, 1 fail. The test "unresolvable citation (missing, tampered hash, wrong id) keeps the unavailable rule vote with zero model calls" failed with an AssertionError. The mutant is **KILLED**.
- **Restore:** the trap fired. The file's hash-object is 2cf92cd1efe242f3ea44a96b19797518be468471, equal to `HEAD:scripts/eval/derived-drafts.mjs`. The worktree is clean.

## Notes (not blockers)
- The commit trailer says Claude Sonnet 5.5; the repo convention is Opus 5.5.
- The manifest contains a local absolute path, `C:\Users\product\Desktop\KnowledgeBase`. It is not a secret.
- Efficiency: maker usage was not supplied, so this is BOOTSTRAP_REVIEW. Ratios are unverified and checker tokens are unknown.

## Ledger
No ledger rows reference this unit, so there is nothing to flip. The maker may close out as checked-PASS.

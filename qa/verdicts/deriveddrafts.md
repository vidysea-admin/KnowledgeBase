# Checker verdict: deriveddrafts (lane w17-deriveddrafts)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: d47e7f65e46720ecb09dc585ba67d440e158d63c
Base SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Checker: independent, fresh context (Opus 5.5), 2026-10-17
ISSUES-WRITTEN: none

## Identity
- Lane HEAD = d47e7f65e46720ecb09dc585ba67d440e158d63c, parent 9e55b642; worktree clean.
- `git diff --name-status 9e55b642 d47e7f65`: 5 files, all `A` (added). No existing file is modified,
  so neither hash-bound review packet (data/eval/calibration-human-review.json,
  data/eval/extraction-draft-review/*) nor any authoritative store is touched.

## 1. Privacy (remote is public)
- Free text in the sidecars exists only in `rationale` and `literalRationale` fields (207 strings) plus the
  T-022 `rubric`. Everything else is ids, sha256 hashes, scores, labels and flags. I enumerated every key path.
- No emails, URLs, phone numbers or +91 numbers in any rationale (regex scan).
- Person names in rationales (Wai Wah Tsang, Y.Y. Song, Sonal, B. V. Doshi, Pranav Patel, Makrand, Anisha,
  Amrita) all appear already in files tracked at 9e55b642 (calibration-human-review.json,
  extraction-adjudication-packet.json, extraction-draft-review/batch-0N.json/.md).
- All 19 quoted fragments were checked with `git grep -F` against base data/eval. Every real quote (for example
  "established in 1962 by B. V. Doshi, who is an architect", "mithai ka dabba", "Thank you. Bye-bye") is
  already tracked at base. The zero-hit matches were possessive-apostrophe false positives, not quotes.
- The cited passages the models saw come from `literalCitationContexts` inside the tracked batch JSONs
  (loadBundle, scripts/eval/extraction-review.mjs:21-50). The rationales therefore paraphrase only content
  already public at base. **They add no new exposure.** No gitignore change is needed.
- Secrets: added lines contain no API key, bearer token, `AIza`/`sk-`/`ghp_` prefix, Mongo URI, password, or
  long non-hex high-entropy token. The only long tokens are 176 sha256 binding hashes and identifiers. No
  .env file is in the diff. Keys are read only through env/--env-file (derived-drafts.mjs:198), and the
  rationales pass through `redactor` (lines 154, 162, 167).

## 2. No fabricated humanGold
- Both sidecars pass `assertNoHumanGold` when re-run independently.
- Top-level `humanGold: false`; all 30 + 72 items have `humanGold: false`.
- Every `humanReview` field is null (U2.2 `status: "unreviewed"`), and `bindingThresholds` is null.
- There is only one write path: `writeFileSync` at derived-drafts.mjs:109, inside `writeSidecar`, after
  `assertNoHumanGold(doc)` at line 107. It writes with flag `wx`, and `safeOutPath` (lines 99-104) confines
  output to data/eval/derived-drafts/*.json.
- The maker's numbers were verified from the files:
  - T-022: 30 items, 62/90 calls, 28 agree, 2 flagged.
  - U2.2: 72 items, 117/216 calls (58 x 2 + 1 Gemini tie-break; 14 deterministic rule items), all agree,
    1 flagged.
  - U2.2 labels: unsupported 54, unavailable 14, partially_supported 2, supported 2.
- The drafts are consistent with contracts goal-t022 C7, goal-u22 P3/S2 and extraction-draft-review-batches 3-4.

## 3. Sanity of the 54 "unsupported" labels
- Rendered `u22Prompt` for 5 sampled claims: visa-blueprint-part2-c01, funding-dreams-loans-forex-c05,
  in-focus-1-c03, creative-futures-c01, uniaccess-leeds-arts-university-c02.
- In every sample, the current passage is non-empty, but it is a different utterance from the one the claim
  was extracted from (for example, a greeting or "Thank you very much"). The `originalMigration` text for
  the same turn id does contain the claim (76% / 27,000 by 2030; 12-15 works; 85%/15% soft skills).
- Over all 54: every one has `sameIdContentChanged: true`, and none has an empty current text.
- **This is a genuine result of turn-id drift after re-migration, not a prompt or citation-loading defect.**
  The README definition ("`unsupported` means these particular citations do not establish it") and
  reviewBasis ("current literal source passages only") make it the correct literal label.
- Note: the prompt intentionally omits the historical passage. Reviewers should read these 54 as "citation
  repointed", not "claim false".

## 4. Tests (independent, no live LLM; provider keys unset)
- Command: `DD_DATA_ROOT='C:\Users\product\Desktop\KnowledgeBase' timeout 600 node --test --test-force-exit scripts/eval/derived-drafts.test.mjs`
- Run from the lane with node v24.19.0. Exit 0; 9 pass / 0 fail.
- `python -I contracts/verify_contracts.py`: exit 0 (PASS by vacuity, no frozen contracts).

## 5. D-020 mutation (per-mutation backup, trap on EXIT INT TERM ERR, timeout 600, HEAD check)
- M1: deleted `  assertNoHumanGold(doc);` from writeSidecar (derived-drafts.mjs:107). The diff showed exactly
  one removed line.
- Result: exit 1, 8 pass / 1 fail. "output path guard: inside derived-drafts only, no overwrite, wx write"
  failed with `AssertionError: Missing expected exception`. **KILLED.**
- Restore: the trap fired. `git hash-object` = 80094305d9b8981b05d29a78d005391b5568582b, equal to
  `HEAD:scripts/eval/derived-drafts.mjs`. Worktree is clean afterwards.

## 6. Notes (not blockers)
- The commit trailer reads `Co-Authored-By: Claude Sonnet 5.5`; repo convention is Opus 5.5.
- Tests depend on a byte-exact main tree through DD_DATA_ROOT (mixed LF/CRLF pins), as the manifest discloses.
- Efficiency accounting: maker usage was not supplied, so BOOTSTRAP_REVIEW applies and ratios are unverified.
  The review_budget.py assess phases were not run. Checker tokens and time are unknown/null.

## Ledger
No ledger rows reference this unit. Nothing to flip. The maker may close out the manifest as checked-PASS.

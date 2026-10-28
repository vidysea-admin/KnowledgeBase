# Verdict: t055-page-highlights-store

VERDICT: PASS
Status: PASS
Cycle checked: 1
Reviewed SHA: 8e39621f4d87bbf7bdb3d4e5f2e42ef376e9992d
Base SHA: 41ca141cb551416f90863522e31795a3354393fb
Code commit: 9114a99cd21a4b0974ac3cbf7a12e2f787e1e8f3
Contract: qa/contracts/goal-t055.md (C1, C2, C7 scoped; C8 not claimed; P1/P2 gates remain open, parent T-055 stays open)
Checker: independent, fresh context. Maker usage and checker token totals unknown (null); no efficiency claim made.

## Verify list

1. Net diff vs base (`git diff --name-status 41ca141c 8e39621f`): 6 product files modified (api router/store/test, web model/component/test) plus manifest and the maker's mutation evidence. No schema, generated type, index entry, store or composition-mount file is added or touched. `git grep page_highlights|pageHighlight` outside qa/ returns nothing. CLEAN.
2. Write paths: `saveHighlight` has one caller (POST /knowledge/documents/:id/highlights). `saveDocument` (POST /knowledge/documents) always writes `highlights: []`. Other `document_documents` consumers (catalog-store, automation, native-production) are read-only. The route now runs `buildPageIndex` on the tenant-owned row and `validateHighlight` before saving. Note: `store.saveHighlight` itself only checks a substring on the page and not `validateHighlight`. That is safe today with a single caller, but a future second caller would bypass offsets validation. Low-severity note only.
3. 404 vs 422: missing and foreign documents both reach `getDocument` (scopedCollection plus `own()`) and give an identical 404 `not_found`. The 400 body-shape check runs before any lookup and does not depend on existence. The 403 consent and 422 `reason` responses appear only after the document is found as tenant-owned. No existence oracle. Test asserts foreign 404 on POST and GET.
4. Probe (uncommitted; moved to qa/evidence/t055check/zz-checker-probe.test.ts.txt): 22 hostile ids, including `//evil.com`, `/\evil.com`, `\\evil.com`, `javascript:alert(1)`, `%6Aavascript:`, tab-split scheme, `https://evil.com`, `@evil.com`, `u:p@evil.com`, `%2F%2Fevil.com`, `evil.com:80`, NUL, U+0085, RLO, `x#y`, `x?y`. Every result was a same-origin path matching `/knowledge/documents/<one segment>/pages/1`, with the id percent-encoded by `encodeURIComponent`. None became an external or `javascript:` link. Observation: ids `..` and `.` give `/knowledge/documents/../pages/1`, which a browser normalises to a different in-app route. It is same-origin, ids are server-generated, and `validDocumentSummary` accepts any non-empty string, so this is a low-severity note, not external navigation.
5. Consent fail-open on a missing `sources` row: PRE-EXISTING. At base the three routes had no consent check at all (base store has no sources/consent code). The candidate only narrows exposure and fails closed for rows with `consent.given !== true` or a revoked/deleted state. Not introduced by this unit, so no FAIL. Recommend a ledger row (medium): legacy POST /knowledge/documents imports create no sources row, so the consent gate is bypassed for them.
6. Commands (each under timeout 600; outputs and exit codes in qa/evidence/t055check/):
   - API: `node --test --test-force-exit --import tsx` on collections.test.ts, collections-router.test.ts and collections-hidden-members.test.ts: exit 0, tests 15, pass 15, fail 0.
   - Web: vitest on DocumentPageEvidence, documentPageModel and KnowledgeDocumentsPage tests plus my probe: exit 0, 4 files, 10 tests passed.
   - tsc --noEmit api: exit 0. Web: exit 0.
   - lint-loc.mjs --all: exit 0 (10 stages, 0 failed).
   - tracker-audit.mjs: exit 1. Findings are repo-wide and unrelated to this unit: G2 (155 fixed issues with no verified_date) and G3 (qa/.last-sweep 289.9 days stale). Other lanes' unmerged worktrees are only listed. Same class of exit 1 the maker disclosed for cycle 0. Not attributable to this candidate.
7. My mutations on apps/web/src/pages/knowledge/documentPageModel.ts (script qa/evidence/t055check/mut.sh; per-mutation byte backup, trap on INT/TERM/ERR, timeout 300, `cmp` restore check, and `git -c core.autocrlf=true hash-object` against HEAD):
   - MB: drop the placeholder origin (`safePublicResourceUrl(path)`): KILLED (2 of 3 tests fail).
   - MA: drop the `safe.host === "citation.invalid" && safe.href === ...` conjunct: SURVIVED. The conjunct is redundant, because the prefix is fixed and `safeHttpUrl` returns the input unchanged, so the round-trip is trivially true. Not a defect; the origin itself is the load-bearing check.
   - After both: file hash a5f28eac equals HEAD blob a5f28eac; restore OK for both. No candidate file differs from HEAD (`git status` shows only the untracked evidence dir).

## Findings
None blocking. ISSUES-WRITTEN: none.

EXPLANATION notes (non-issues): the redundant host/round-trip check; the `..`/`.` id dot-segment; `store.saveHighlight` lacks its own `validateHighlight`. Maker M3 survivor (redundant `own()` tenant re-check) is accepted as defence in depth.

Recommended ledger row for the root to file: medium, consent gate fails open for legacy document imports with no `sources` row (pre-existing, not introduced by this unit).

Ledger rows that may be flipped: none are tied to this unit. The maker may close the manifest to checked-PASS for Fix cycle 1.

Not verified: live Mongo, browser or visual rendering, C8 mounting, and P1/P2 gates. The central integrator still owns the schema, composition and tracker updates.

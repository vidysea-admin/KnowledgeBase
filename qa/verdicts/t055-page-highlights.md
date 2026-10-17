# Verdict: t055-page-highlights

VERDICT: FAIL
Status: FAIL
Cycle checked: 1
Reviewed SHA: 4825bdec56841998d287b49c474376c87ef39bef
Base SHA: 7fd26f94 (cycle 0 candidate); original base a0391420
Contract: qa/contracts/goal-t055.md C1, C2 (foundation only), C7

## Cycle 1 result
The cycle-0 blocker F1 is fixed, but the candidate now breaks a different stage of the same mandatory gate.

F2 (proven, blocking): `node scripts/lint-loc.mjs --all` exits 1 at stage=snapshot: "docs/SNAPSHOT.md is stale (94 line(s) differ from a fresh regeneration)", first diff line 78: committed `scripts/toc/`, fresh `scripts/t055/`. The new directory scripts/t055/ is listed in the generated snapshot and docs/SNAPSHOT.md was not regenerated (the snapshot stage passed at 7fd26f94). Fix: regenerate docs/SNAPSHOT.md with the repo's snapshot generator (never hand-edit), or place the e2e test in an existing scripts/ subdir, then rerun lint:structure fully. Other stages: loc OK (1708 files), dirsize OK (272 dirs, scripts/ within budget), root OK, dupes, migrations, codex-hooks, lint-tests, tracker all exit 0.

Verified closed: F1. No packages/** file imports across the boundary (the cycle diff in packages touches only the index test, which no longer imports ingest). dependency-cruiser (stage=dependencies, exit 1215): all 1215 errors are no-unresolvable-workspace-import (lane has no workspace node_modules; env gap); zero errors of any other rule, none cites the t055 or page-evidence files.

Independent runs (exit 0 each): index test 8/8; scripts/t055 e2e 1/1 (real pdfjs reader; standardFontDataUrl warning only); tsc --noEmit packages/index exit 0. Mutation (seg.text.includes -> index.text.includes) killed by "forged page is rejected" (7 pass / 1 fail); per-mutation backup and trap, cmp restored, hash 9e801c07662e31f531146e473d44308fbb21a508 equals HEAD blob (core.autocrlf=true), git status clean. Product code unchanged since cycle 0, so the cycle-0 probes still apply.

Environment note: the C: drive hit 100% full during the review (a cp of scratch failed with no space left); results above were captured before that and are unaffected.

Not run: contracts/verify_contracts.py, browser, full suite. C2 persistence/route/UI, tenant binding at storage and DOCX remain outside this unit.

ISSUES-WRITTEN: none
Ledger rows may be flipped: no.

## Superseded history (cycle 0)

### Cycle 0 verdict (superseded by cycle 1)

Cycle-0 VERDICT: FAIL
Cycle-0 Status: FAIL
Cycle-0 checked: 0
Cycle-0 reviewed SHA: 7fd26f9481ef630f9fa777885a4953f603644395
Base SHA: a0391420
Contract: qa/contracts/goal-t055.md C1, C2 (foundation only), C7

#### Finding (blocking)
F1 (proven, mandatory repo gate): `node scripts/lint-loc.mjs --all` (lint:structure) exits 1 at stage=dependencies with
`error ask-index-ingest-only-ai-db-core: packages/index/src/pipeline/page-evidence/highlight-validator.test.ts -> packages/ingest/src/sources/document-pages.ts`
(.dependency-cruiser.cjs:34-39: ask|index|ingest may only import ai|db|core). This is the only hit of that rule and it is introduced by the candidate; the test-only nature gives no exemption (rule matches all files under packages/index/). The maker disclosed the risk but did not run depcruise.
Fix: delete the cross-package import from packages/index. Keep the pure-fixture tests in index (hand-built `pages`), and move the real-reader integration test (real 2-page PDF -> readPdfPages -> buildPageIndex -> validateHighlight) to a location the rule does not govern (e.g. scripts/qa/ or an apps/ test), or inject the pages via a fixture file. Re-run lint:structure fully.
Environment note: the other 1215 dependency errors (no-unresolvable-workspace-import) come from the lane having no workspace node_modules; env gap, not attributable to the candidate. The other 9 lint:structure stages exit 0 (loc 1707 files, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker).

#### Verified independently
- Test file: 8/8 pass (exit 0). tsc --noEmit packages/index: exit 0, no output.
- Own probes (temp file, removed; lane clean): quote only on page 2 claimed on page 1 with page-1 or page-2 offsets -> rejected; quote present on both pages with page-2 offsets claimed on page 1 -> offsets-mismatch; page 0, -1, 1.5, NaN, string page, null/non-object, whitespace quote, negative/fractional offsets, quote spanning the page joiner -> rejected. Astral (emoji), accented and CJK text: UTF-16 code-unit offsets validate consistently; UTF-8 byte offsets are rejected. Offsets are code units (consistent with slice), documented nowhere in code: note only.
- Own mutations (per-mutation backup): (a) seg.text.includes -> index.text.includes (whole-document search) killed by "forged page is rejected" (7 pass/1 fail); (b) drop the start/end page-range check killed by the same test. Note: my trap used a relative path inside a subshell and did not restore; I restored by `git checkout` of the file. Final `git -c core.autocrlf=true hash-object` = 9e801c07662e31f531146e473d44308fbb21a508 = HEAD blob; git status clean.
- qa/evidence/t055page (2 files): only local lane paths, no private data, secrets or URLs.

#### Notes (not issues)
- pageCount = number of segments, so a reader that yields non-contiguous page numbers (e.g. 2,5) has page 5 rejected as page-out-of-range (false reject, not a bypass).
- Scope honestly limited: C2 persistence, route and UI, tenant/source/version binding at storage and DOCX are not in this unit; scoped PASS would still have to list them as open.
- Not run: browser, full suite, contracts/verify_contracts.py.

ISSUES-WRITTEN: none
Ledger rows may be flipped: no.

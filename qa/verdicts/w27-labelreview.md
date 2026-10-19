# Verdict - w27-labelreview

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 8c2697f10be284bc47bde026fbaceb76f55745e0
Diff base: 4264418c7488d95e76bc0d86e3920efb0e0ccd72
Mode: ship (quick, rigorous on the humanGold point)

## Clauses covered
1. D-183 (docs/DECISIONS.md): additions-only (numstat 32 added, 0 removed vs 4264418c; the 32 include D-182 from the merged lane). Follows D-182. Carries `**Approved-by:** Umesh (verbatim quote in What)`. Quotes the 2026-10-19 Approver sentence verbatim. Rulings: AI-consensus working labels with confidence, optional Accept/Override, never humanGold. D-163 not superseded; contract clauses requiring human gold listed and left unedited.
2. Accept never writes human. store.ts buildRecord is the only record constructor: accept -> `labelSource: 'ai-consensus'`, override -> `'human'`; validate() rejects any record whose source disagrees with its action and any extra field (humanGold). Own HTTP probe (zz-checker-probe, deleted after use): POST accept-high-confidence with body `labelSource:'human', humanGold:true` stored only `ai-consensus`/`accept` records, no "human" or "humanGold" in the stored file, humanOverrides 0. router.test.ts covers the same for single accept with forged body fields.
3. Read-only sources. sha256 of the four packet/sidecar files identical before and after all test runs (diff vs pre-run list: HASHES_SAME). Code only readFile/stat on them.
4. API security. Router: 401 without auth, 403 without `compete` scope or a trusted human identity (tests loop all four routes incl. robot/automation key), unknown query 400, `Cache-Control: private, no-store`. Tenant: items filtered by packet tenant, state file per tenant hash, foreign tenant 404 on accept. Unset `LKB_LABEL_REVIEW_DIR`: reviews.ts leaves labelReview undefined, router answers 503 (my probe: GET and POST 503 with auth, 401 without).
5. Tests (each timeout 600, exit codes in scratchpad w27chk): API label-review store+router: 11/11 pass (exit 0). Web label-review (14) + App.wiring (21): 35/35 pass (exit 0). tsc --noEmit web exit 0; api exit 0.
6. Mutation (own): in store.ts acceptHighConfidence, changed bulk accept to write an override (human). Per-mutation byte backup, trap INT/TERM/ERR, timeout 300. KILLED: "bulk accept touches only unreviewed high-confidence items..." and my probe failed (pass 10, fail 2). Restored; `git -c core.autocrlf=true hash-object` = 40449ccc9fe6c3639a9dbc71bef0bdb4df9d9001 equals HEAD blob before and after; git status clean.

## Findings
None blocking.

## EXPLANATION (notes, not issues)
- D-183 Approved-by reads "Umesh (verbatim quote in What)" rather than the bare string; it starts with `Umesh` and the quote is present.
- Contract clauses requiring human gold (goal-t022 C4/C6/C7/C8 etc.) are still unmet by design; AI-consensus labels cannot satisfy them. Any metric consumer must say "AI-consensus".
- Not run: browser (jsdom only), full suites, lint-loc, the maker's other three mutations (maker reports them killed, not reproduced).

ISSUES-WRITTEN: none
Ledger rows may be flipped: no ledger rows are attached to this unit.

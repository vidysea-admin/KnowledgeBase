# Contract — parallel-sources-explorer

Checker-authored additive acceptance for the authorized Sources explorer frontend unit.
Existing web-app-shell-brain-calendar criterion 3 remains applicable. This contract
does not relax earlier frontend/API/security requirements or certify live data.

## Scope

Only SourcesPage.tsx, its dedicated focused tests, and unit QA records. Use the existing
listSources API and mirrored Source type. No backend, schema, credentials, provider,
database, browser, dependency, structure-budget or enforcement changes.

## Acceptance

1. Fetch existing GET /sources data using the active API key. Filters operate locally;
   changing query/kind/capture mode does not issue additional requests.
2. Trim surrounding query whitespace and search case-insensitively across both optional
   location fields (url AND path) and kind. Missing location fields are safe. Query,
   exact kind and exact capture-mode selections combine with AND semantics.
3. Kind and capture-mode options derive from returned data, contain unique values in
   deterministic order, and offer an unrestricted selection. Clear filters resets all
   controls and restores the full result set.
4. Results sort by actual creation instant descending, with deterministic source-ID
   ties. Invalid dates follow valid dates and sort deterministically among themselves.
   Filtering/sorting must not mutate the API response array.
5. Report visible/total result counts using returned records. Render distinguishable
   loading, empty tenant, no filter matches and request error states without fabricated
   rows or claiming an error is an empty tenant.
6. Every result retains real kind, capture mode, available location and creation date.
   Missing location has an honest fallback. Render external values as text, without
   unsafe HTML or executable location links.
7. A changed API key immediately conceals prior data/error and fetches with the new
   key. Responses from superseded requests or unmounted components cannot replace
   current results. This is frontend lifecycle protection, not API tenancy certification.
8. Labels permit accessible search/select/button interaction. Focused tests exercise
   combined filters, reset, ordering/date ties/missing fields, counts, error/empty and
   auth-key request races. Independent checker runs the dedicated test only, with one
   worker, plus focused static scope/boundary/budget review. No full suite or browser.

## Evidence and limits

Record command, exit/output and reviewed file SHA-256 values in checker evidence and
a cycle-matched verdict. PASS covers this additive unit only; it does not claim live
browser/provider/database acceptance, whole-repo health or earlier contract completion.

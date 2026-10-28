# Manifest — t036-alias-label-intake
**Contract:** qa/contracts/gmail-meeting-candidates-approval.md
**Goal task:** T-036
**Date:** 2026-10-05
**Fix cycle:** 1 of max 3
**Issues addressed:** none; additive user scope

## Plan approval
Fresh independent reviewer APPROVE: modify scanner in place, preserve broad inbox, add aliases and independent label scopes, union IDs and reject incomplete acquisition. Source architecture read; no new code files/schema.

## What changed
- apps/api/src/gws-gmail.ts: scanner receives optional intake, defaulting server environment LKB_GMAIL_ALIASES and LKB_GMAIL_LABEL_IDS; validates literal selectors before provider calls, union/dedup with per-scope complete pagination. Redundant header condensed to stay within existing LOC budget.
- apps/api/src/gws-gmail.test.ts: alias/label union and duplicate fetch; registration evidence; invalid configuration no-provider; incomplete label failure.
- docs/webinar-release.md: configuration and honest pending live state.

## Verification
- node --test --import tsx apps/api/src/gws-gmail.test.ts -> expected exit0
- node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json -> expected exit0
- node scripts/lint-loc.mjs -> existing four unrelated violations, no added Gmail source violation
- inspect store.ts owner/work boundary and downstream selection reject registration/non-webinar; unchanged

## Actual outputs
25 tests,25passed,0failed; test exit0; API type exit0. First new negative test exposed newline trim acceptance; rejecting control characters before trim repaired it and all25 rerun pass. Source LOC remains within300; global existing four violations unchanged. Existing source provenance, dates/links absent unless literal and registrationOnly retained.
Generated docs/SNAPSHOT.md refreshed via generator,126lines/check0, separately from this source behavior.
Official Google API filtering docs checked: API does not implicitly alias-expand; labelIds scopes are explicit.

## Live browser evidence
Not UI-touching — scanner acquisition selectors and tests/runbook only; existing review/selection unchanged. No external Gmail scan, alias/filter creation, model call, registration, capture or database write performed.

## Remaining objective
Live configured-mailbox proof, Workspace alias/forwarding, public organizer discovery and automatic registration remain required. This slice never marks T-036 or R1 complete.

**Handshake status:** checked-PASS

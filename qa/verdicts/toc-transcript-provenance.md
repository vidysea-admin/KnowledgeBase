# Independent checker verdict: TOC transcript provenance

**VERDICT:** HOLD
**Cycle checked:** 1
**Status:** BUILDING; implementation review accepted, mandatory affected stage incomplete.

The current source repairs the demonstrated stale-citation cause: replacing transcripts no longer silently reuses positional turn identities, originals are archived, derivations become stale before replacement, and seeding consumes a validated exact-byte snapshot. Explicit speech/screen selection preserves strict frame provenance and refuses changed or removed bound artifacts. Source tenants and explicit isolated work database targets are preserved; changed live transcripts with derived knowledge refuse before mutation.

Independent command node --test scripts/lib/transcript-provenance.test.mjs scripts/webinar/session-inputs.test.mjs scripts/webinar/session-rows.test.mjs exited 0: 27/27 PASS, zero skips/failures, 13311.5184ms. This includes actual CLIs with local provider/DB doubles, same-buffer replacement race, existing strict loader security/provenance floor, frame and optional artifact removal, and immediate downstream safe swap. Direct source review and git diff --check passed. Exact source hashes and results are in qa/evidence/u22-checker-provenance-2026-10-09.json and were rechecked before this verdict.

The maker mandatory affected union is 54/55 PASS. Its real FFmpeg fixture fails spawn ffmpeg ENOENT. AGENTS.md Definition of done requires: The affected stage runs green on sample data; the immediate downstream stage consumes the output without error. The 27 focused checks do not waive that requirement. This is an environmental prerequisite hold, not a claim of a demonstrated code regression. Install the actual media tools and obtain the required terminal green result before unit closeout. No skip, assertion weakening, timeout extension or checked-PASS is approved.

A local BUILDING checkpoint is acceptable. No real provider, DB, browser, production/backfill or original corpus rewrite was performed in these checks. Seven independently reviewed exact-source reconciliation proposals preserve the remaining 65 unreviewed claims; full human gold, thresholds, U2.2 corpus/semantic acceptance and R1/R2/R3 product gates remain open.

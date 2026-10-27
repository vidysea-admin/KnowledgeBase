# Existing QA test consolidation for scripts/qa31/30
Status: checked-PASS
Handshake status: checked-PASS
Policy-Version: proportional-verification/2026-10-19.17
Fix cycle:0
Tier:L (test command config)
Base:f6bf0597ca8340c7e92430515f617be87914212e
Independent diagnosis: qa/.delivery/results/structure-analysis-postpush.md. This is a separate pre-existing CI blocker, no Calendar acceptance/cycle reset.
Plan: edit scripts/qa/ledger-alloc.test.mjs imports at6/11 to include copyFileSync and READ_ID_RE. Append original fix1 comments plus a lexical block containing scripts/qa/ledger-alloc-fix1.test.mjs12-149 verbatim, with duplicate imports removed only. Preserve two differently scoped fixtures/newline behavior and every assertion/title. Verify pinned originals/corpus then remove only the superseded tracked fix1 test. Add retained existing filename to package.json test:lint so these assertions actually run in CI. No new source file, no implementation/validator/enforcement change, no budget increase. Expected399/400nonblank and30/30files;31registeredtests.
Acceptance: byte/body/assertion/title preservation against f6bf0597, real ledger read-only/temp writes only, full original recorded reproduction corpus, focused tests with180s outer timeout, actual unchanged structure budgets green, no previous test:lint entry removed, independent final check/push/CI.

Code feature ready. Final checks: Docker7/7, existing UI54/54, real copied-context TS/Vite red->green; allocator31/31 with110assertions preserved and30/30directory; policy closure72/72 and unchanged single-writer6/6; WhatsApp19/19; API/bot types0. Real committed temporary candidate root lint176/176, then19/19committed-input/single-writer follow-up after one-byte EOF-only cleanup. Actual new Docker/main CI remains required after code-push; original full C1-C8/hosted/server capture gates OPEN.

Close-out: both independent cycle0 CODE verdicts PASS/PUSH-CANDIDATE YES: qa/verdicts/calendar-bot-ci-release.md and calendar-bot-ci-release.b.md. Scope is CODE only; pre-push integration gate and actual new CI follow. Original parent C1-C8 remains CONTINUE-NEEDED.

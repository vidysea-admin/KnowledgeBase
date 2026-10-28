# Post-push Calendar web packaging repair
Status: checked-PASS
Handshake status: checked-PASS
Phase: CODE-CHECKED
Policy-Version: proportional-verification/2026-10-19.17
Fix cycle:0
Tier:L (Docker configuration)
Base:f6bf0597ca8340c7e92430515f617be87914212e
Original parent calendar-bot-operational-completion remains CONTINUE-NEEDED; prior code child pushed after dual CODE PASS. This is the newly observed post-push web image failure, not a reset of the durable-approval cycle history.
Goal: repair actual Docker web-build TS2307 for the already-built reusable join-policy import without rebuilding or duplicating policy.
Proposed existing files/functions: Dockerfile:40 web-build stage, add the required pure packages/ingest/src/join-policy source COPY before pnpm web build; scripts/qa/dockerfile-media-tool.test.mjs:81 add focused existing-file web-stage closure regression. No new product source file, dependencies, secret, runtime activation or data writes.
Acceptance: copied web-build source context fails before fix and builds after; existing web join-rules behavior remains tested; required policy module transitive closure present; source budgets unchanged. Docker availability must be measured, no local container PASS invented; actual pushed Docker CI required.
Checks: independent plan approval before edit; red/green existing test; isolated copied-context real web build; focused existing web tests; independent final CODE check and push then actual CI.
Known separate structure cap31/30 must be diagnosed against existing code with all tests preserved, no threshold/validator weakening. Runtime/configuration/hosted capture gates remain OPEN.

Independent plan approval: qa/.delivery/results/packaging-plan-postpush.md APPROVED, five-file pure closure, no new module.

Code feature ready. Final checks: Docker7/7, existing UI54/54, real copied-context TS/Vite red->green; allocator31/31 with110assertions preserved and30/30directory; policy closure72/72 and unchanged single-writer6/6; WhatsApp19/19; API/bot types0. Real committed temporary candidate root lint176/176, then19/19committed-input/single-writer follow-up after one-byte EOF-only cleanup. Actual new Docker/main CI remains required after code-push; original full C1-C8/hosted/server capture gates OPEN.

Close-out: both independent cycle0 CODE verdicts PASS/PUSH-CANDIDATE YES: qa/verdicts/calendar-bot-ci-release.md and calendar-bot-ci-release.b.md. Scope is CODE only; pre-push integration gate and actual new CI follow. Original parent C1-C8 remains CONTINUE-NEEDED.

# Post-push hosted policy snapshot I/O separation
Status: checked-PASS
Handshake status: checked-PASS
Policy-Version: proportional-verification/2026-10-19.17
Fix cycle:0 (original Calendar/data-write cycles0-4 retained; uncapped auth/data-write invariant, no reset claim)
Tier:L auth/tenancy/cache writes
Base:f6bf0597ca8340c7e92430515f617be87914212e
Observed existing downstream root test:lint175/176PASS; unchanged join-rules-single-writer static check fails because the hosted snapshot implementation added filesystem writes to the read-only enforcement module. No validator/contract change allowed.
Proposed existing files/functions: packages/meeting-bot/src/calendar/join-rules/join-rules-enforce.ts remoteRules and its networkFailure/rejected-authority dependencies relocate into existing join-rules-last-valid.ts, which already owns persisted snapshot I/O. Enforcer imports/calls the same unique handler, passing the existing degraded callback rather than creating a runtime/type cycle. Export/move the existing unverified-tenant reason only if shared; preserve actual messages/authority binding/TTL/invalidation/credential digest/atomic file writes/readOnly/sanitized logging and selection. No new module/engine/provider/API or duplicated function.
Exact approach subject to independent approval: use a minimal structural remote-context type in snapshot module; no reverse import of enforcement module. Move whole handler without changing branch behavior; import only the read-side/snapshot helper from enforcement.
Acceptance: existing static single-writer check goes RED->GREEN untouched; all existing remote/cache/last-valid/credential/tenant/refusal tests remain green, candidate selection downstream still consumes exact authenticated document. No canonical rules/state write path introduced. Original caller signatures remain compatible. Full current test:lint must be green before push.

Independent approval: qa/.delivery/results/ci-cache-plan.md APPROVED. Existing unique handler moved, no reverse import, no validator/test edit.

Code feature ready. Final checks: Docker7/7, existing UI54/54, real copied-context TS/Vite red->green; allocator31/31 with110assertions preserved and30/30directory; policy closure72/72 and unchanged single-writer6/6; WhatsApp19/19; API/bot types0. Real committed temporary candidate root lint176/176, then19/19committed-input/single-writer follow-up after one-byte EOF-only cleanup. Actual new Docker/main CI remains required after code-push; original full C1-C8/hosted/server capture gates OPEN.

Close-out: both independent cycle0 CODE verdicts PASS/PUSH-CANDIDATE YES: qa/verdicts/calendar-bot-ci-release.md and calendar-bot-ci-release.b.md. Scope is CODE only; pre-push integration gate and actual new CI follow. Original parent C1-C8 remains CONTINUE-NEEDED.

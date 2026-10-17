# Broker test request — workspace cycle repair

Status: queued
Fix cycle: 1
Identity: pins.json records exact base SHA and source SHA256s. Verify all three after hashes before tests; bind receipts to combined candidate SHA and environment/lock fingerprint.

1. pnpm lint:structure — preserve complete exit/output; confirm capture-slot-readiness.ts → tab-session-workspace.ts back edge absent with unchanged .dependency-cruiser.cjs.
2. pnpm --filter @lkb/meeting-bot typecheck — verify moved type + legacy re-export and all consumers compile.
3. From packages/meeting-bot, use existing compatible runtime: node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts src/capture/workspace/tab-session-workspace.test.ts src/capture/workspace/caller-failure-readiness.test.ts — readiness host/tenant/slot/platform/generation acceptance, authority/ownership refusal, record/downstream consumption and failure revocation.

Preflight interpreter/import containment and writable test temp parent as applicable; respect machine CPU scheduling. No browser/provider/DB access authorized by this request; if selected tests require those, persist HOLD and narrow/route safely. No new test code or mutation run is needed for pure interface relocation. Combined mandatory gates remain parent/checker responsibility; this is not a substitute for independent review.

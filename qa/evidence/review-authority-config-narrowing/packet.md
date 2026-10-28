# Review-authority config narrowing: frozen diagnostic repair

Authorized exclusive source lease: apps/api/src/review-authority/policy.ts, top-level unknown config narrowing only. Central/root authorized narrow API diagnostic repair. Base repository SHA 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; candidate is working-tree bytes.

Original raw SHA-256: `5f20356f010c9fc70600ab9c8b9a49a3398b6d49e93fc50d578c17f0e13bf790`; exact byte backup: `qa/evidence/review-authority-config-narrowing/original-policy.ts` (no overwrite permitted).
Final raw SHA-256: `efab2f3544c4877231be53703461f07aafd71db96b73713acb1c87783cad1a63`.

Exact change: the existing invalid top-level config guard now uses `return invalid();` instead of `invalid();`. `invalid()` still throws the identical error. Explicit control-flow termination lets TypeScript retain the existing shape/version/array validation narrowing before iterating config.tenants. No type cast, policy predicate, public type, default-deny behavior, actor/automation permission or side effect was changed.

Trigger: `qa/goal-vectorless-2026-10-15/verification-api-types-final-public-epoch.stdout.txt` reports src/review-authority/policy.ts(44,26) TS18046 config unknown. Immediate consumers are createReviewPolicyResolver and its existing policy tests/adapters. This touches trusted-review authorization source, so independent auth-boundary review remains mandatory; maker cannot PASS it.

No tests/typecheck/provider/DB/network calls were run by this maker. Broker must check existing `apps/api/src/review-authority/policy.test.ts` and consolidated API types at exact final hashes with all owners frozen. Central owns verifier/shared integration/checker packaging and review admission. Actual maker time/tokens/cost unknown. No provenance-unit source, candidate ID or ready handshake was changed. No independent verdict is supplied.

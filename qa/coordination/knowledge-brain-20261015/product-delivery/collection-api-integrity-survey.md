# Collection API integrity survey

2026-10-15. Read-only product survey; no source changes, tests, builds, browser, network or database writes. Priority context: T-055, tier 3. No additional unit proposed.

Read the repository AGENTS.md, ARCHITECTURE.md, current decision tail, task checkpoint and skills/maker/SKILL.md. Inspected apps/api/src/knowledge/collections-router.ts, collections-store.ts, collections.test.ts, metadata-visibility.ts and immediate consumer apps/web/src/pages/knowledge/collectionsClient.ts.

Observed safeguards: authentication-derived tenant predicates; scoped reads and writes; member visibility validation; optimistic revision matching; create retry idempotency; replacement refusal when persisted members are hidden/unavailable; and explicit collection deletion separate from partial replacement. Client write responses must match requested deduplicated membership, ID, title and revision.

Existing issue ISS-T055COLLECTIONS-001 remains open in qa/issues.T055COLLECTIONS.jsonl; its A/B exact partial-replacement regression cases and safe sibling control C are present in collections.test.ts. The goal-t055 manifest records historical broker evidence; no qa/verdicts/goal-t055.md currently exists. A focused verdict-text search for collections-store, collections-router and the issue ID returned no matching verdict. This survey neither closes the issue nor independently verifies the candidate.

No additional concrete security/data-persistence defect identified within the bounded immediate-consumer survey. The separate collections-maker-packet.md describes the chooser-retention data-loss repair owned by the UI worker; do not duplicate it in API source. Coordinator retains broker execution, same-byte attribution and independent verdict responsibilities.

Actual survey usage/time/cost unavailable; no measured efficiency claim.

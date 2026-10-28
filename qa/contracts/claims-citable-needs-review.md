# Contract — claims-citable-needs-review
Authority: D-200 (label rule), D-201 (scope narrowed to knowledge outputs; schema field; strict refuse), gate qa/gates/claims-citable-needs-review.md. Approver: Umesh, 2026-10-28.

## Acceptance criteria
- [C1] Knowledge-output evidence admits claims with status `needs-review` as citable excerpts (packages/core/src/knowledge-outputs/evidence-builder.ts). Claims with status `conflicting`, `rejected` or any other non-verified/non-needs-review status stay withheld exactly as today. A claim whose evidence turn cannot be resolved is not cited. (serves: intent#usable-kb)
- [C2] Every output citation carries `claimStatus: "verified" | "needs-review"`. schema/knowledge_outputs.schema.json gains it as an OPTIONAL additive property (old stored documents stay valid); generated types regenerated via `pnpm gen:types`; schema fixtures updated. Because citations feed `sourceDigest`, a later verified<->needs-review flip of a cited claim makes the draft stale (source_changed), as before. (serves: intent#provenance)
- [C3] The label is visible to readers: markdown export renders an "Unverified (needs review)" marker on each needs-review citation, and apps/web KnowledgeOutputsPage renders the same marker per citation. Verified citations show no marker. (serves: intent#trust)
- [C4] Verified claims rank before needs-review claims wherever excerpts are ordered/selected. (serves: intent#trust)
- [C5] Strict refuse policy: when the effective policy has `onInsufficient: "refuse"`, a draft citing any needs-review claim is refused (422) on create and export, unchanged from today's strictness. Without a refuse policy, a draft built only on needs-review claims succeeds (no 422) with coverage that does not claim to be fully verified. (serves: intent#trust)
- [C6] Out of scope, unchanged: the 200-claim / 4000-turn caps (reader.ts:18, evidence.ts:27), the counsellor/ask path, WhatsApp approval gates (claimVisible / WA_APPROVED_CLAIM_STATUS), tenant scoping. Tests pinning these stay green unmodified.

## Invariants
- [I1] Tenant isolation: every read stays scoped by tenantId; no new query path.
- [I2] No database writes, no migration.

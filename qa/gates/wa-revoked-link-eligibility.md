# Gate H-14: does a revoked/unlinked/suspended link with studentData "no" still feed external models?

**Asked:** 2026-10-30, after the W11B dual PASS (both checkers raised it independently; ISS-WASDG-006).
**Answered:** (pending, Umesh)

## Context
- W11B's `externalModelEligible` (`apps/api/src/visibility/knowledge.ts:119`) reads `studentData` only, per H-10.
- So a link that is revoked, unlinked or suspended, with `studentData: "no"`, keeps its already-captured WhatsApp knowledge eligible for external models.
- Option A (fail closed): require `link.live` too; terminal/suspended links stop feeding external models. One-line change plus tests.
- Option B (as built): eligibility follows `studentData` only; link state controls capture, not use of already-captured text.

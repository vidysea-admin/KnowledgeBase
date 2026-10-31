# Manifest — wa-events-without-archiver
**Contract:** none specific; scope plan W12 / spec R-40. Gate `qa/gates/wa-events-archiver-gate.md` answered (a) by Umesh on 2026-10-31. Fixes ISS-WACW-001.
**Goal task:** whatsapp-multiuser W12 (follow-up)
**Date:** 2026-10-31
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS (qa/verdicts/wa-events-without-archiver.md + .b.md, dual, cycle 0)
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/api/src/composition/integrations/knowledge.ts:98
**Persona walk:** skip (no screen; server composition only)
**Issues addressed:** ISS-WACW-001
**Executor:** claude (main session, main tree, branch docs/devops-golive-2026-10-26, base cf244ceb)
**Round:** one round, Round est 20 min, tier L by the auth trigger (an admin-scoped route becomes reachable in a composition where it used to answer 503).

## Criteria
- C1 With the archiver unset (no env) or invalid, GET /whatsapp/events is served by the real events router: an admin session or a whatsapp-admin key gets 200 with its own tenant's events only.
- C2 The feed keeps its auth: anonymous 401, member 403, viewer 403, and no cross-tenant read (tenant-2 admin sees only tenant-2 rows).
- C3 Links and selection stay fail-closed (503 after their scope check) without the archiver. Configured behaviour (C1/C3 test of wa-composition-wiring) is unchanged.

## What changed (base cf244ceb)
- `apps/api/src/composition/integrations/knowledge.ts` edited in place: `buildKnowledgeIntegrations` now always composes `whatsappEvents: buildWhatsAppEvents(input.db)` (`:98`). `whatsappLinks` and `whatsappSelection` stay behind `whatsAppMultiUserConfigured` (`:99`). The interface doc comment (`:34-38`) and the invalid-config warning text (`:42`) now say "links and selection".
- `routes.ts` is untouched. Its `/whatsapp/events` 503 fallback (`:94`) is now unreachable from the production composition, but it stays for compositions that omit the dep.
- `apps/api/src/composition/integrations/whatsapp-wiring.test.ts`:
  - **C2:** the five `/whatsapp/events` rows are removed. They asserted the old 503 behaviour, which this gate answer replaces on purpose. The test name and header comment now say links and selection.
  - **C4 (new):** for both env shapes, it runs the full auth matrix and tenant isolation through the real composition and real perimeter.
  - **Assertion change:** this replaces old 503 assertions with stronger 200 + tenant-isolation assertions. No assertion is weakened, but the checker should judge the change.

## Evidence
- Pre-check[C1]: cf244ceb+wt `node --test --import tsx src/composition/integrations/whatsapp-wiring.test.ts src/whatsapp/events.test.ts` (apps/api) -> 13/13 pass
- Pre-check[C2]: cf244ceb+wt same command, C4 asserts 401/403/403 and tenant-1 / tenant-2 isolation -> pass
- Pre-check[C3]: cf244ceb+wt same command, C1/C3 configured and C2 unconfigured -> pass
- Typecheck: `npx tsc --noEmit -p .` (apps/api) -> exit 0
- TDD red first: C4 failed before the code change (the events route answered 503).
- Falsification (C1 and C2 share the input file):
  - Mutation: line 98 re-gated as `...(multiUser ? { whatsappEvents: ... } : {})`.
  - Result: wiring test 2 pass / 1 fail (C4 red).
  - Restore: the file was restored from a byte backup. The rerun shows 3/3 pass and grep confirms that line 98 is the post-fix line.
  - Process note: the trap used a relative path after a `cd`, so the automatic restore failed and the file had to be restored by hand with an absolute path. No other file was touched (see `git diff --stat`). This is filed as a low process note.
- Tests[C1-C3]: `src/composition/integrations/whatsapp-wiring.test.ts`, `src/whatsapp/events.test.ts`

## Metrics
builder_min=15 check_min=14 (A) / B per its verdict

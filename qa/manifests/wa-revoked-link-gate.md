# Manifest — wa-revoked-link-gate
**Contract:** none specific; scope `docs/features/whatsapp-multiuser/plan.md` W11 part B follow-up. Policy: gate H-14 (`qa/gates/wa-revoked-link-eligibility.md`, Umesh 2026-10-30, "No, fail closed" = Option A). Raised as ISS-WASDG-006 by both W11B checkers.
**Goal task:** whatsapp-multiuser W11 part B follow-up (`wa-revoked-link-gate`)
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS (dual A 630019d0 + B 7fbc4bd8, cycle 0, 2026-10-30)
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** required
dual-trigger: security apps/api/src/visibility/knowledge.ts:119
**Persona walk:** skip (no screen; server-side egress gate)
**Issues addressed:** ISS-WASDG-006
**Executor:** claude (maker subagent, worktree `.worktrees/wa-revoked-link-gate`, branch `wave/wa-revoked-link-gate`, base 15de5c76)
**Round:** one round, Round est 30 min, tier H by the security trigger (WhatsApp text reaching external models).

## Criteria
- C1 externalModelEligible returns false for a WhatsApp source whose link is not live, for every non-live link state, even with studentData "no".
- C2 a live link with studentData "no" stays eligible and non-WhatsApp sources are unaffected.
- C3 every external-model gate that reads link eligibility applies the same live rule (no gate reads studentData alone).

## What changed (base 15de5c76, head 056056b4)
- `apps/api/src/visibility/knowledge.ts:127` the one `extEligible` return, edited in place: `link.live === true && link.state !== "suspended" && link.studentData === "no"` (previously the studentData test only). `live === true` is strict, so a missing or false `live` fails closed (revoked, unlinked, rejected carry `live` false). The `state !== "suspended"` clause is needed because `isLiveLinkState` (`packages/db/src/collections/whatsapp-links.ts:13`) keeps `suspended` in `LIVE_LINK_STATES`, so a suspended link carries `live: true` and `live` alone would leave it eligible, against the H-14 text that names suspended. No second predicate; the file stays at 300 non-blank lines (limit 300).
- Other gates: every external-model gate calls this predicate. `grep studentData apps/api/src` (non-test) finds the field read only at `knowledge.ts:127`; the other hits are comments (`store.ts:62`, `knowledge-outputs/reader.ts:17`, `ask/source-context.ts:113`, `ask/native-source-context.ts:12`, `composition/production.ts:212`) and `whatsapp/links/*` (not in scope). The call sites are `store.ts:69-70` (G1 tree, `createExternalModelTreeStore`), `ask/source-context.ts:114` (G2 transcript), `ask/native-source-context.ts:26` via `composition/integrations/native.ts:70` (G2 native), `knowledge-outputs/reader.ts:18` (G3). G4 `indexing/session.ts` refuses every WhatsApp session regardless of the link. No call-site code needed a change.
- Tests (extended in place): `apps/api/src/visibility/external-model.testsupport.ts` new `NON_LIVE_STATES` (revoked, unlinked, rejected) and link cases `suspended` (state suspended, live true, the real derived shape) and `live-missing` (live field absent), all with `studentData: "no"`, appended to `EXCLUDED`; every suite that loops `EXCLUDED` (gate, tree, hydrators, reader) therefore covers the new states at each call site. `apps/api/src/visibility/external-model-gate.test.ts`: state-model pin (`NON_LIVE_STATES` equals `TERMINAL_LINK_STATES`, none live), live requested/approved/active stay eligible, revoke-after-eligible flips on the next request, non-WhatsApp control now runs under every non-live case.
- Not touched: `apps/api/src/whatsapp/links/*`, `review/*`, `selection/*`, `packages/db`, any consent code (D-210).

## Evidence
Pre-check[C1]: 056056b4 node --test --import tsx apps/api/src/visibility/external-model-gate.test.ts -> 34 passed, 0 failed
Pre-check[C2]: 056056b4 node --test --import tsx apps/api/src/visibility/external-model-gate.test.ts apps/api/src/visibility/knowledge.test.ts apps/api/src/visibility/knowledge-batch.test.ts -> 86 passed, 0 failed
Pre-check[C3]: 056056b4 node --test --import tsx apps/api/src/visibility/external-model-tree.test.ts apps/api/src/ask/external-model-hydrators.test.ts apps/api/src/ask/native-source-context.test.ts apps/api/src/ask/source-context.test.ts apps/api/src/ask/source-context-quarantine.test.ts apps/api/src/knowledge-outputs/external-model-reader.test.ts apps/api/src/knowledge-outputs/workbench.test.ts -> 109 passed, 0 failed
Tests[C1]: apps/api/src/visibility/external-model-gate.test.ts — every non-live case (revoked, unlinked, rejected, suspended, live-missing) excluded by source and by session, plus the state-model pin and the revoke-after-eligible flip
Tests[C2]: apps/api/src/visibility/external-model-gate.test.ts — live requested/approved/active/no stay eligible; non-WhatsApp source and session kept under every link case
Tests[C3]: apps/api/src/visibility/external-model-tree.test.ts apps/api/src/ask/external-model-hydrators.test.ts apps/api/src/knowledge-outputs/external-model-reader.test.ts — each call site (G1 tree, G2 transcript, G2 native, G3 reader) run over the new non-live cases through the shared `EXCLUDED` list
Falsification[C1]: the `link.live === true && ` clause removed from knowledge.ts -> gate suite 5 red (revoked, unlinked, rejected, live-missing, revoke-after-eligible flip); `link.live === true` changed to `link.live !== false` -> 1 red (live-missing); the `link.state !== "suspended" && ` clause removed -> 1 red (suspended). Each restored from a per-mutation byte backup, `cmp` equal, `git hash-object` equal to the committed blob.
Falsification[C2]: not applicable as a mutation, since the added clauses only narrow eligibility; the live-link controls (requested, approved, active, no stay eligible) and the non-WhatsApp control stayed green under all three C1 mutations, and the existing W-6 mutation of the `!wa ||` branch remains covered by the same suite.
Falsification[C3]: the same `link.live === true && ` removal run against the call-site suites -> tree 4 red, reader 4 red, hydrators 8 red (all four gates fail through the one predicate). Restored, `cmp` equal.

## Open points (declared, not defects)
1. **`live` alone does not cover suspended.** `isLiveLinkState` treats `suspended` (and `requested`, `approved`) as live, so a bare `live === true` would have left a suspended link eligible. The predicate adds `link.state !== "suspended"` to honour H-14, which names suspended. `requested` and `approved` links (live, not yet active) stay eligible with studentData "no"; they carry no captured text before activation. If Umesh wants only `active` eligible, that is one more clause and a gate answer.
2. **Pre-existing failures at base 15de5c76, not from this unit.** `ask/ask-tenant-isolation.test.ts` and `native-evidence/message-vertical.test.ts` fail to load (SyntaxError: `whatsapp/selection/router.ts:23` imports `createMongoLinksStore`, not exported by `whatsapp/links/service.js`); `tsc --noEmit` on `apps/api` reports exactly that one error (TS2305); `lint-loc --all` `dependencies` stage fails on `apps/web/src/pages/whatsapp-links/QrCode.tsx` importing `qrcode-generator`. `ask-tenant-isolation.test.ts` fails identically with this unit stashed. Those paths are on the do-not-touch list. `lint-loc --all` stages loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests and tracker are exit 0.
3. **Memo unchanged.** The live check is resolved per capability instance like studentData, so a revoke during one request is seen on the next request (asserted).
4. **Comments** at the call sites still say "not studentData no"; left as-is to keep the diff to the predicate and tests.
5. **Consent (D-210):** no consent code was modified, extended or called; no consent issue was filed.

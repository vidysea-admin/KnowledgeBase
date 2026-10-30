# Manifest — wa-unlink-consent
**Contract:** none specific; `docs/features/whatsapp-multiuser/plan.md` W8 (acceptance 1-6) and `spec.md` R-7, R-8, R-10, R-47. Gates: `wa-revoked-link-read-access` (only an `active` link grants owner read; a terminated link never does), `wa-self-approval` (unchanged), `wa-admin-alerts` (alerts are log codes for now). Consent: D-210 applies; the existing consent writer is CALLED, never changed.
**Goal task:** whatsapp-multiuser W8 `wa-unlink-consent`
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: security|tenancy apps/api/src/whatsapp/links/service.ts:259
**Persona walk:** skip (API only; the screens are W10)
**Issues addressed:** ISS-WALINKS-001, ISS-WALINKS-006, ISS-WALINKS-008, ISS-WASYNC-001, ISS-W6-001 (producer side only, see criterion W8-5)
**Executor:** claude-sonnet (build unit, worktree `.worktrees/wa-unlink-consent`, branch `wave/wa-unlink-consent`, base 74568a6c)
**Round:** one round, est 240 min, tier H by the security and tenancy triggers (unlink changes link eligibility, quarantines candidates and withdraws source consent).

## Criteria
- W8-1 Unlink (plan W8 item 1): sync for the link stops within one scheduler cycle; pending candidates move to quarantine; each owned source goes through the consent-withdraw CAS; a racing approval loses (existing `consent-race` fixtures extended with the unlink path); the archiver `unlinkSession` step is invoked, and when the archiver is down the KB state is already `unlinked` and the step is retried.
- W8-2 Repeating unlink returns 200 and changes nothing (idempotent), including the archiver step.
- W8-3 Approved claims remain with owner recorded (Q6=6a); an admin purge is out of this unit and is named in the manifest as an open gap, not hidden.
- W8-4 Account coupling: disabling or demoting the owner suspends their links (R-10) and re-enabling does not resume them; logging out/session expiry has no effect on the link (test).
- W8-5 ISS-W6-001: the ledger repro is re-run; `withdrawWhatsAppSourceConsent` now has a non-test caller.
- W8-6 Real-Mongo concurrent test (unlink vs approve vs sync) passes and is in the evidence.
- W8-7 (R-8) Revoke is admin-only unlink plus `revokedReason` and `blocksNewRequests`; the owner cannot revoke.
- F-1 ISS-WALINKS-001: `setOwnerId` "gone" is a failure (the new archiver owner is closed, the caller gets INVALID_STATE), and the link is CAS-touched from `[approved, active]` after provision and before `getQr`; a revoke racing connect never receives a QR.
- F-2 ISS-WALINKS-006: `resume` checks the owner's account is active (member/admin); a legacy (userless) link resumes.
- F-3 ISS-WALINKS-008: unlink (and revoke) require an actor id.
- F-4 ISS-WASYNC-001: before `archiverUnlinkPending` is set, the archiver owner is asserted not to be carried by a newer link.
- S-1 Schema: `whatsapp_links.archiverUnlinkPending` lands in its OWN commit labelled "schema: pending H-3 approval" (e312bb55); `selfApproved` and `link.bound` are untouched.

## What changed (base 74568a6c, head 4f537f7d)
- Schema commit e312bb55 (own commit, H-3 pending): `schema/whatsapp_links.schema.json` (+`archiverUnlinkPending`, only valid on a non-live link), generated `packages/core/src/generated/whatsapp_links.ts`, SOURCEONLY migration `migrations/20261030120000-whatsapp-links-unlink-pending.cjs` (not applied), its test and two fixtures.
- EDIT `apps/api/src/whatsapp/links/service.ts` (300 non-blank lines, exactly the budget): `terminate` (shared unlink/revoke body: one CAS to the terminal state, one event, then `followThrough`), `followThrough` (quarantine, consent, archiver; independent, idempotent, codes only), `owed` (ISS-WASYNC-001), `accountChanged` (R-10 entry point), `LinkDataPort`, `LinksStore.touch` and `ownerInUseByOther`, `LinkGoneError`; connect/provision closed against a racing revoke (F-1); resume checks the account (F-2); unlink/revoke refuse an actor-less caller (F-3).
- EDIT `apps/api/src/whatsapp/links/router.ts`: the Mongo `LinksStore` adapter now also implements `touch` and `ownerInUseByOther`, and the production factory passes `createLinkDataPort(db)`. No route, mount or scope change.
- EDIT `apps/api/src/whatsapp/review/store.ts`: `whatsAppLinkSourceIds` (stamped sources of the link, plus unstamped legacy sources whose consent was recorded by its archiver owner; tenant-scoped, read only) and `createLinkDataPort` (`quarantineCandidates`: `needs-review` -> `rejected` by `system:wa-unlink` with a status CAS; `withdrawSources`: calls `withdrawWhatsAppSourceConsent` per source, unchanged). `review/quarantine.ts` is NOT edited: importing it from `store.ts` closed three import cycles (dependency-cruiser `no-circular`), so the helper lives in `store.ts`.
- Test support edited in place: `links.testsupport.ts` (`memoryLinkData`, store `touch`/`ownerInUseByOther`), `links.rig.testsupport.ts`, `service.test.ts` and `links.mongo.test.ts` (new required `data` dep only).
- NEW tests (the plan allows new test files): `links/unlink.test.ts` (16), `review/link-data.test.ts` (5), `links/unlink.mongo.test.ts` (1, gated).
- Not touched: `docker-compose.yml`, `.env.example`, `selection/*`, `routes.ts`, `scripts/whatsapp/sync-links.mjs` (W9 already drives `pendingUnlinks`/`confirmUnlink` from the `archiverUnlinkPending` flag), any consent code.

## Evidence
Pre-check[W8-1]: 4f537f7d node --test --import tsx src/whatsapp/links/unlink.test.ts src/whatsapp/review/link-data.test.ts -> 21 passed, 0 failed
Pre-check[W8-2]: 4f537f7d node --test --import tsx src/whatsapp/links/unlink.test.ts -> 16 passed, 0 failed
Pre-check[W8-3]: 4f537f7d node --test --import tsx src/whatsapp/review/link-data.test.ts -> 5 passed, 0 failed
Pre-check[W8-4]: 4f537f7d node --test --import tsx src/whatsapp/links/unlink.test.ts -> 16 passed, 0 failed
Pre-check[W8-5]: 4f537f7d node --test --import tsx src/whatsapp/review/link-data.test.ts src/whatsapp/review/consent-cas.test.ts src/whatsapp/review/consent-race.test.ts -> 20 passed, 0 failed
Pre-check[W8-6]: 4f537f7d node --test --import tsx src/whatsapp/review/link-data.test.ts -> 5 passed, 0 failed (includes the deterministic unlink-vs-approval interleaving sweep over the fixture isolation model: 27 interleavings, both linearizations occur). The NATIVE real-Mongo run, `src/whatsapp/links/unlink.mongo.test.ts`, is skipped here (WA_REVIEW_TEST_MONGO_URL unset, no mongod on this machine) - a GAP, not a pass: open point 2.
Pre-check[W8-7]: 4f537f7d node --test --import tsx src/whatsapp/links/unlink.test.ts -> 16 passed, 0 failed
Pre-check[F-1]: 4f537f7d node --test --import tsx src/whatsapp/links/unlink.test.ts -> 16 passed, 0 failed
Pre-check[F-2]: 4f537f7d node --test --import tsx src/whatsapp/links/unlink.test.ts -> 16 passed, 0 failed
Pre-check[F-3]: 4f537f7d node --test --import tsx src/whatsapp/links/unlink.test.ts -> 16 passed, 0 failed
Pre-check[F-4]: 4f537f7d node --test --import tsx src/whatsapp/links/unlink.test.ts -> 16 passed, 0 failed
Pre-check[S-1]: 4f537f7d node --test migrations/whatsapp-links.migration.test.mjs -> 7 passed, 0 failed (1 skipped: real-Mongo migration run, no mongod)
Regression (not a criterion): 4f537f7d node --test --import tsx src/whatsapp/links/*.test.ts src/whatsapp/review/link-data.test.ts src/whatsapp/review/consent-cas.test.ts src/whatsapp/review/consent-race.test.ts src/whatsapp/review/store.test.ts src/whatsapp/review/quarantine-native.test.ts -> 77 passed, 0 failed, 2 skipped (the two gated real-Mongo files). `npx tsc --noEmit -p apps/api` clean. `node scripts/lint-loc.mjs` OK; `lint-loc.mjs --all` stages loc, dirsize, dependencies, dupes, root, migrations, codex-hooks, lint-tests exit 0; stages snapshot and tracker fail (see open point 8).
Tests[W8-1]: apps/api/src/whatsapp/links/unlink.test.ts apps/api/src/whatsapp/review/link-data.test.ts — order (state moves before every side effect), independent data steps, archiver down then retried, link-scoped quarantine, consent withdrawal through the CAS, and a withdrawn source makes a later approval fail closed with no publication
Tests[W8-2]: apps/api/src/whatsapp/links/unlink.test.ts — repeat is 200 `changed:false`, one event, no second archiver call once done, terminal states refuse
Tests[W8-3]: apps/api/src/whatsapp/review/link-data.test.ts — an already approved candidate is not re-decided by the quarantine; nothing deletes claims
Tests[W8-4]: apps/api/src/whatsapp/links/unlink.test.ts — disable/reject/viewer-demote suspend ACTIVE links with `account_inactive` by a system actor; a healthy account event never suspends or resumes; the service exposes no logout/session entry point
Tests[W8-5]: apps/api/src/whatsapp/review/link-data.test.ts apps/api/src/whatsapp/review/consent-cas.test.ts — the port calls the existing CAS writer; the CAS suites still pass unchanged. Repro of the ledger grep: `grep -rn withdrawWhatsAppSourceConsent apps/api/src --include=*.ts` outside tests now lists `review/store.ts:233` (inside `createLinkDataPort`), reached from `links/router.ts:117` via `createLinksService` and the unlink/revoke routes
Tests[W8-6]: apps/api/src/whatsapp/review/link-data.test.ts apps/api/src/whatsapp/links/unlink.mongo.test.ts — the sweep releases the unlink (quarantine then consent withdrawal) at every point of an approval transaction: the unlink always lands, consent ends withdrawn, approved <=> published, a quarantined candidate never has a claim; `unlink.mongo.test.ts` does 20 rounds of unlink x3 (owner, admin, owner again) racing an approval on a real replica set, SKIPPED here
Tests[W8-7]: apps/api/src/whatsapp/links/unlink.test.ts — admin-only, owner refused, tenant-B admin 404, `revokedReason`, `blocksNewRequests` blocks a new request
Tests[F-1]: apps/api/src/whatsapp/links/unlink.test.ts — revoke fired inside `ensureOwner` (owner not stored, orphan closed under `orphan-<linkId>`, no QR) and inside `getSession` (no QR), plus the unlink twin and the mid-flight-owner reconcile
Tests[F-2]: apps/api/src/whatsapp/links/unlink.test.ts — missing, disabled, pending and viewer owners refused with `account_inactive`; legacy link resumes
Tests[F-3]: apps/api/src/whatsapp/links/unlink.test.ts — admin principal and admin key without an actor id get 403 on unlink and revoke with no side effect
Tests[F-4]: apps/api/src/whatsapp/links/unlink.test.ts — an owner carried by a newer link is not owed; control: an unshared owner is closed
Tests[S-1]: migrations/whatsapp-links.migration.test.mjs — schema accepts an unlinked row with the flag, refuses it on a live row
Falsification[W8-1]: removed the quarantine step (`followThrough`) -> `R-7 unlink order` and `R-8 revoke` red; removed the consent step -> same two red; made the unlink touch every needs-review candidate of the tenant (find filter and guard removed in `createLinkDataPort`) -> `W8 quarantine` red (4 moved instead of 1); removed the `withdrawWhatsAppSourceConsent` loop -> `W8 withdraw` and the late-approval test red; restored, HEAD-fidelity equal.
Falsification[W8-2]: removed the same-state branch in `terminate` -> `R-7 idempotent` red; restored, HEAD-fidelity equal.
Falsification[W8-3]: not applicable by mutation (the property is the ABSENCE of any claim write); pinned by `W8 quarantine` (a decided row is not re-decided) and by the missing purge being an open point.
Falsification[W8-4]: made `accountChanged` a no-op for disable/demote -> `R-10 account coupling` red; made it suspend on re-enable -> survived the first version of the test (the owner's link was already suspended), the test was strengthened with an ACTIVE link and the mutant is now red; restored, HEAD-fidelity equal.
Falsification[W8-5]: removed the consent loop in `createLinkDataPort` -> `W8 withdraw` red (so the non-test caller really withdraws). Equivalent mutants named: dropping only the `sourceId` find filter in `quarantineCandidates` and dropping only the tenant filter of the first `whatsAppLinkSourceIds` find both SURVIVE because a second line (the `sourceIds.includes` guard, the `tenantId` post-filter) re-enforces the same bound; removing each pair is red (`W8 quarantine`, `W8 link sources`).
Falsification[W8-6]: dropped the status CAS in the quarantine update (it then overwrites a committed approval) -> `W8 interleaving sweep` red (a claim exists over a rejected candidate); skipped the consent withdrawal -> sweep and `W8 withdraw` red; restored, HEAD-fidelity equal. The native test is not mutated (cannot run).
Falsification[W8-7]: removed `blocksNewRequests: true` -> `R-8 revoke` red; dropped the unlink owner check (`owns`) -> `R-7 authorisation` red; restored, HEAD-fidelity equal.
Falsification[F-1]: removed the pre-QR `touch` -> both ISS-WALINKS-001 race tests red; made "gone" a success (`if (stored === "gone")` -> false) -> the ensureOwner race tests red (no orphan close); restored, HEAD-fidelity equal.
Falsification[F-2]: dropped the `u.status !== "active"` / role test in `resume` -> `ISS-WALINKS-006` red; restored, HEAD-fidelity equal.
Falsification[F-3]: dropped `|| !p.actor` in `unlink` -> `R-7 authorisation` red; restored, HEAD-fidelity equal.
Falsification[F-4]: dropped the `ownerInUseByOther` assertion in `owed` -> `ISS-WASYNC-001` red (an unlink is called on the shared owner); restored, HEAD-fidelity equal.
Falsification[S-1]: not a code mutation; the schema is covered by the existing fixture pair, one valid and one invalid.

Mutation method (D-020 and its amendment): one byte backup per mutation (`*.mut.bak`, removed after use), restore in a `finally` (no `trap EXIT`), a 170 s subprocess timeout per run, and after every mutant a byte compare plus `git hash-object <file>` equal to `git rev-parse HEAD:<file>` (all 22 mutants equal, worktree clean after the run). Harness: `mutate_w8.py` in the session scratchpad (not committed). 22 mutants run: 20 killed, 2 equivalent (named above); one of the 20 (M13) survived the first test draft and was killed only after the test was strengthened.

## Open points (declared, not defects)
1. **R-10 has no production caller.** `accountChanged` / `suspendForAccount` exist and are tested at service level (W8-4), but nothing in `user-accounts` (disable, reject, demote-to-viewer) calls them, and wiring it means editing `apps/api/src/user-accounts/*` and the composition, outside this unit's listed files. Needs a follow-up unit that injects the links service into the account admin after a status/role change. Until then W8-4 is proven at the service seam only, and a disabled owner's link stays active in production.
2. **W8-6 real-Mongo test did not run here** (no mongod). `unlink.mongo.test.ts` is written to the same opt-in contract as `links.mongo.test.ts` (`WA_REVIEW_TEST_MONGO_URL`, throwaway `lkb_test_wa_unlink_<hex>` database, replica set required, dropped afterwards). It must be run by the checker or on CI Mongo and its output pasted before this criterion counts. The fixture sweep in `link-data.test.ts` covers the same race deterministically but is not a substitute for Mongo. The "sync" actor of the plan's "unlink vs approve vs sync" is modelled as a repeated unlink (the W9 retry runs the same follow-through); a literal sync-script run is not in the test.
3. **R-10 says "all non-terminal links"; the W5 hook (kept) suspends ACTIVE links only.** A `requested`/`approved` link of a disabled owner is not suspended; it cannot connect (needs the owner's own session) and nothing syncs it. Decision needed if the literal wording is wanted; it would also need `activated` handling on resume.
4. **Quarantine is a rejection.** The candidate schema is closed (`needs-review` / `approved` / `rejected`), so "move to quarantine" is `rejected` with `decision.actor = system:wa-unlink`. Distinguishable by actor, not by status; a separate quarantined status would be a candidate-schema change and was not made.
5. **Admin purge of approved claims is not built** (plan W8 item 3, H-12). Approved claims stay with the owner recorded. The withdrawn consent hides them through the existing readers (`claimVisible`), it does not delete them.
6. **Consent (D-210).** The only consent interaction is the call to the existing `withdrawWhatsAppSourceConsent` with note `link_unlinked`; no consent code, schema or policy was changed, and no consent issue is filed. If the backend team's consent handling later conflicts with a per-source withdrawal on unlink, that is theirs to raise.
7. **Schema commit awaits H-3.** e312bb55 adds `archiverUnlinkPending`; the migration is SOURCEONLY and was not applied anywhere. The service tolerates the flag being absent on old rows (nothing owed). Until the migration is applied, the Mongo `whatsapp_links` validator would reject the flag on write; do not deploy the service before it.
8. **`lint:structure --all` is not fully green** in this worktree: stage `snapshot` reports `docs/SNAPSHOT.md` stale (97 lines; the first differing line is an `auth_*` row, not this unit's), and stage `tracker` fails on the lane-ledger reference audit (advisories on old verdicts). Both look pre-existing and neither is touched here; not re-run against a clean base. `docs/SNAPSHOT.md` is generated and was not edited.
9. `service.ts` sits at exactly 300 non-blank lines, so W12 (events feed, same file, after W8) needs headroom first; the Mongo store adapter was moved into `router.ts` to fit, and `router.ts` has room.
10. Per-process rate limiters (W5 open point) are unchanged. Alerts on a failed archiver unlink are log codes only (`archiver_unlink_failed`, `quarantine_failed`, `consent_withdraw_failed`, `pending_clear_failed`, `orphan_owner`) until the `wa-admin-alerts` gate lands.
11. The commit co-author line is `Claude Sonnet 5.5` (per the harness attribution in force during this session), not the Opus 5.5 line the handoff named.

# Verdict B: wa-isolation-read-side (Mode A, dual check, second coordinator)
Date: 2026-10-30 · Cycle checked: 1 (dispatch text said "0"; manifest Fix cycle is 1 and the handshake requires equality, so 1 is stamped) · Head: 7ab17ee6 (code 21dfc204) · Base: aa8ef31a · Policy: proportional-verification/2026-10-19.17
Cycle-0 verdict archived at qa/verdicts/wa-isolation-read-side.b.r0-1.md (renamed, not edited). Bound to D:/KnowledgeBase/.worktrees/wa-isolation-read-side. No ledger rows written, no goal task closed (dual check).

## Check plan
Repair checker (cycle 1), Tier L: tenancy / cross-tenant raw read (owner-config.ts:184). api-only: no browser walk, no personas.
Scope: my cycle-0 FAIL and P-lines (C6 marker side effect, marker key and repair shape, link-state gate), the gate answer (qa/gates/wa-revoked-link-read-access.md),
the production composition of the session read path, plus the repair diff read in full and the whole-unit diff scanned (4c). All work ran in a git-archive copy of 21dfc204 outside the bound root (junctioned node_modules).

## Cycle-0 findings, re-checked
- P1 (high, C6): rejected cross-owner ingest left a pending-invalidation marker. Cycle-0 probe w7chk-probe1 re-run VERBATIM at 21dfc204: markers after rejected ingest [] (was 1), after bogus jid [], repair [], sources 0 (was 1). FIXED.
- P2 (medium, key shape and repair): marker is now keyed per (group, resolved link); repair skips malformed link ids, catches not_found/ambiguous per marker and continues. Proven by B1CHK-W3 (other-tenant marker untouched, old-key marker cleared by _id, uppercase/23-hex/numeric/null link ids skipped) and by F5/F6 below. FIXED.
- P3 (low, gate): owner view needs link.state === "active"; admin passes and is audited; unstamped fallback is active-only and unique. B1CHK-2 (state revoked/suspended/rejected/unlinked/pending/"ACTIVE"/" active"/""/null/7): owner 404 on session detail, session list and review get/source/approve/reject/list, source reader never called, no publish, other owner unaffected, admin 200 with exactly one admin.raw_read (linkId LA). FIXED.
- Production composition (re-derived independently): withSessionArtifacts(trustedBrainReads(...)) as composition/production.ts:167 and store.ts:93 build it. B1CHK-1: owner A own 200; B/L/X 404 identical to a missing id; admin and adminKey 200 with one event each (actorKind user/key), no raw text in any event; other-tenant admin 404, no event; owner reads write no event.

## Criteria (plan W7 acceptance, C1-C6)
C1 PASS (production wiring matrix, audit written once) · C2 PASS (viewer/member/plain key 404; approved claims path untouched, visibility/knowledge.ts has no link-state use and no diff) · C3 PASS (probe3 ISS-API-003: 2/2 recorded plus corpus, body only {error,code,linkId})
C4 PASS (duplicate flag test green after the ingest reorder) · C5 PASS (legacy link: owner 404, admin/adminKey 200 audited) · C6 PASS (cycle-0 repro now zero side effects; B1CHK-W1 route-level foreign/ambiguous/plain-key cases: 404/503, 0 markers/sources/sessions/turns).

## Commands (copy of 21dfc204)
- node --test --import tsx isolation-read-side + isolation-write-side: 37/37 (20+17). Wider affected set (13 files): 124 tests, 123 pass, 0 fail, 1 skipped (needs a replica-set mongod; not run, no real Mongo this cycle). tsc --noEmit apps/api exit 0.
- Cycle-0 probes 1/2/3 verbatim: 6/6 pass. New probes (qa/evidence/wa-isolation-read-side-B/): B1CHK-1/2/3, W1-W4 all pass.

## Falsification (7 edits, each in the copy; green-before, red-after, restored, hash == 21dfc204 blob; per-mutation backup and trap, timeout 240; script and output in the evidence dir)
F1 brain.ts drop `read` in withSessionArtifacts.getSessionDetail (C1) -> 7 red · F2 ingest.ts not-found no longer throws before the marker (C6) -> 4 builder tests + cycle-0 probe1 red
F3 owner-config.ts drop `link.state === "active"` (gate) -> 4 red · F4 fallback drops `state: "active"` -> 1 red · F5 compose.ts drop the NotFound catch (resilience) -> 1 red
F6 marker key drops the link part -> 1 red · F7 fallback `length === 1` -> `>= 1` -> 1 red. Seven mutants, within the L cap of 10.
Note: route-level W1 stays green under F2 because the route lists groups before ingest; the marker path is killed by the store-level tests and probe1.

## 4c diff scope
Repair diff (7 product files plus tests) read in full; whole-unit stat scanned: every changed file is in the manifest "What changed". Removed lines are signature extensions (trustedBrainReads, createWhatsAppReviewSourceRouter, createWhatsAppReviewWiring, createWhatsAppReviewRouter), `ScopedWhatsAppRouteDeps` kept as an alias, and two test assertions replaced by stronger ones (ISS-API-003 closed body; caller arg). No export, route or test deleted.
Consent code not touched (D-210). R-24 legacy-key reads out of scope per dispatch.

## Observations (non-blocking)
Re-link takeover of an unstamped pre-W7 source is impossible: migrations/20261029120000-whatsapp-links.cjs makes archiverOwnerId unique across tenants and states (B1CHK-3 only shows the shape in a fixture without that index).
PROPOSED-ISSUE: {"id":"P1","sev":"low","type":"resilience","where":"apps/api/src/whatsapp/review/compose.ts:56-65","summary":"repairPendingInvalidations rethrows any error other than not_found/ambiguous (for example one owner's archive down), so later owners' markers in the same tenant are not attempted; reproduced by B1CHK-W4 (A's marker first, archive down for A: repair threw 'archive down', B's good marker not repaired). Also no production caller of repairPendingInvalidations (definition only), pre-existing at base. Direction: continue the loop, collect failures, rethrow at the end; wire a caller or file the gap against the review-wire work.","candidate":"queue, not a unit"}

VERDICT: PASS
SCOREBOARD: 6/6 criteria met, 0/0 invariants (no qa/contracts file; the plan acceptance list is the contract)
TIER: L (tenancy / cross-tenant raw read, apps/api/src/whatsapp/owner-config.ts:184)
FAILURES: none
CAPABILITY-COVERAGE: 7/7 falsifying edits reproduced red-after, restored (hash == 21dfc204 blob)
LIVE-BROWSER: not-applicable (api-only, no UI paths changed)
ISSUES-WRITTEN: none (dual check; PROPOSED-ISSUE P1 above, low)
EXECUTOR: claude-sonnet-5-5 (checker: claude-sonnet-subagent)
EXPLANATION: Every cycle-0 side-B finding (marker side effect, per-link marker key and resilient repair, active-link gate) is fixed and re-proved by the verbatim cycle-0 probes, fresh probes and seven falsifications; the production composition now carries the read context and audits an admin read exactly once. One low resilience note (P1); real replica-set Mongo was not run (fixture Mongo only).
Metrics: start=2026-10-30T17:31:45+05:30 end=2026-10-30T17:53:00+05:30 wall_min=21 agent_min=21 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1275 mutants=7 defects_unit=0 defects_6c=0

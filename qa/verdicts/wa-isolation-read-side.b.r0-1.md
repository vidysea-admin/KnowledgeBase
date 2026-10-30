# Verdict B: wa-isolation-read-side (W7)

Cycle checked: 0
Checked: base aa8ef31a, head bfc5350f (bound HEAD later fc4060c2; `git diff bfc5350f HEAD -- apps packages schema scripts` = 0 lines, so evidence holds)
Contract: W7 acceptance in docs/features/whatsapp-multiuser/plan.md + spec.md R-25..R-30 (no qa/contracts file)

## Check plan
Tier L (tenancy trigger apps/api/src/whatsapp/owner-config.ts:184). API-only, no browser. Steps: (1) re-run manifest verify commands in a
scratch copy of `git archive bfc5350f` (worktree has no node_modules); (2) adversarial probes per criterion; (3) ISS-API-003 recorded
reproductions through the real store + router; (4) one falsification per criterion, per-mutation backup + trap + HEAD-fidelity (D-020);
(5) judge ISS-WAOWNER-002 (409/404 mapping, caller+linkId threading, repair-path scope) and -005. No mongod locally, so no real-Mongo run.

VERDICT: FAIL
SCOREBOARD: criteria 5/6 met (C1 C2 C3 C4 C5 PASS; C6 FAIL). Baseline: isolation-read/write 26 pass 0 fail; regression set 33 pass 0 fail.
TIER: L (policy proportional-verification/2026-10-19.17)

FAILURES:
- high | P1 | C6 "fail WITHOUT SIDE EFFECTS" + ISS-WAOWNER-002 repair-path scope
  apps/api/src/whatsapp/review/ingest.ts:30-31 writes the `pending-invalidation` marker (carrying the caller-supplied `linkId`) BEFORE
  `base.ingestGroup` authorizes/resolves the group, and never deletes it when ingest rejects with 404/409.
  Repro (scratch probe w7chk-probe1.test.ts): member A (uA) ingests B's jid with linkId=LB -> correctly WhatsAppGroupNotFoundError (404),
  but a marker for that jid with the attacker-chosen linkId remains. A bogus jid also leaves a marker. Consequences, all measured/read:
  (a) visibility/knowledge.ts pending() (~54-58) sees the marker, approved() (~59-60) returns null, so B's approved claims for that jid vanish
  from Search/Ask until a repair succeeds (pinned by visibility/knowledge.test.ts:125-131); review-source.ts:66/:83 throw ReviewSourceStaleError.
  (b) repairPendingInvalidations (compose.ts) then re-ingests with internal {kind:"key",admin:true} narrowed by the attacker's linkId:
  sources 0 -> 1 in the probe, an unauthorized ingest side effect.
  Existing tests (isolation-write-side.test.ts ~195-197, repair test) never assert that no marker remains after a rejected ingest.
  Marker write pre-dates W7, but W7 edited this exact line to add the caller-supplied linkId, and C6 requires zero side effects.
- medium | P2 | compose.ts repairPendingInvalidations catches only WhatsAppAmbiguousLinkError; a WhatsAppGroupNotFoundError marker (from P1) is
  rethrown and aborts the whole repair loop for the tenant (poison marker). Reproduced in the same probe.
- low | P3 | owner-config.ts unstamped-source fallback `links(tenantId).findOne({archiverOwnerId})` ignores link `state` and picks an arbitrary
  link when duplicates exist; ownerView does not check state === "active".

PROPOSED-ISSUE: P1 high (tenancy) - move marker write after group authorization/resolution (or delete it on 404/409); validate marker.linkId
  against the caller's permitted set; add test asserting no marker + no source row after rejected cross-owner ingest.
PROPOSED-ISSUE: P2 medium - repair loop must skip/delete not-found markers and continue, not abort.
PROPOSED-ISSUE: P3 low - fallback owner lookup should require state active and unique match.

CAPABILITY-COVERAGE: 6/6 falsification rows reproduced (each green before, red after, restored, restored=yes by git hash-object == HEAD:file):
  F1 C1 drop `link.userId === caller.userId` (owner-config.ts): 9 red | F2 C2 trusted-readers list pushes all WA sessions: 1 red
  F3 C3 502 code = error message: 2 red | F4 C4 drop otherCandidates from knownContent (ingest.ts): 1 red
  F5 C5 let legacy link through (owner-config.ts): 4 red | F6 C6 remove deny in review-source.ts source route: 2 red
  (Note F6 pins the route-level deny only; it does not cover the marker side effect in P1.)
LIVE-BROWSER: not-applicable (API-only)
ISSUES-WRITTEN: none (dual check: findings are PROPOSED-ISSUE lines)
EXECUTOR: checker coordinator B (sonnet), scratch tree w7chk-B-tree in the session scratchpad, node --test --import tsx, in-memory Mongo fixtures

EXPLANATION:
C1 two owners/one tenant: A gets own, 404 for B's raw id; admin sees both; non-owner admin read writes one admin.raw_read (no text; schema already allows it).
C2 viewer/non-owner get 404/403 on raw sessions/turns/candidates, approved claims via Search/Ask remain, no unapproved raw turns, no tenant-B content.
C3 ISS-API-003: 2/2 recorded reproductions refused, plus 9/9 authored shapes; 502 body is always {error, code, linkId}; GET /groups errors close to 500/503.
C4 cross-owner duplicate gives one candidate flagged duplicate with an opaque pointer, no auto-merge/drop. C5 legacy/plain-key/unresolvable links admin-only.
C6 swapped-tenant approve replay (header/query/body) -> 404/400 no row/no event; forged/unstamped/cross-tenant stamps grant nothing; other-owner candidate
id guess -> 404; other-owner groupJid and plain Bearer on non-legacy link -> rejected, BUT the rejected ingest leaves the P1 marker, so criterion 6 fails.
ISS-WAOWNER-002: 409 ambiguous_link / 404 mapping and caller+linkId threading verified OK; repair-path scope NOT OK (P1/P2). ISS-WAOWNER-005 guards pinned by tests.
Declared open points reconfirmed, not failed: marker keyed by groupJid only; opaque duplicate pointer; admin session list unaudited; no replica-set run;
legacy/plain-key admin-only vs R-24 continuity (plan acceptance 5 governs).

Metrics: start=2026-10-30T11:26:01Z end=2026-10-30T11:40:00Z wall_min=14 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=840 mutants=6 defects_unit=1 defects_6c=0

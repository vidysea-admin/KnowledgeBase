# Verdict (coordinator B) — wa-owner-resolver (W4)
Cycle checked: 0
Bound root: D:/KnowledgeBase/.worktrees/wa-owner-resolver   Base: 00de9d92 (= merge-base with docs/devops-golive-2026-10-26)   Head: 89165c77 (product code last changed at a50d2af1; 89165c77 adds only the manifest)
Policy-Version: proportional-verification/2026-10-19.17   Dual check: required (coordinator B; findings are PROPOSED-ISSUE lines, no ledger rows, no goal-task close)
Date: 2026-10-30   Contract: docs/features/whatsapp-multiuser/plan.md W4 per-unit acceptance + spec.md R-24/R-25 (no qa/contracts file)

## Check plan
Tier L (tenancy: apps/api/src/whatsapp/owner-config.ts permitted-owner set; dual-trigger line present and real). api-only: no browser walk, no persona walk.
Instruments: (1) re-run the manifest verify commands in a throwaway copy (git archive of Head + link-only node_modules junctions, outside the bound root); (2) one falsification per criterion W4-1..W4-5 (own mutants, not the builder's); (3) diff-scope read (4c) and a security read of the changed lines; (4) real local Mongo probe (127.0.0.1:27018 standalone, throwaway db, dropped) for the seed/unique-index/scoped-accessor path, plus a spoofed-linkId probe; (5) wiring check of the two compose sites. No full suite; no browser; no prod Mongo.

## Step 3: verify commands re-run (copy == Head, green-before for the copy)
- owner-config + store-isolation + route-tenant + routes/whatsapp + store-source-id + store-snapshot + store-mongo-snapshot: 48 tests, 48 pass, 0 fail.
- Wiring regression: whatsapp/review/*.test.ts 66 tests, 63 pass, 0 fail, 3 skipped (opt-in real-Mongo files, same as manifest).
- Original assertions in the three W4 test files are untouched (diff shows only two import lines removed, rest additive).

## Criteria
- W4-1 MET. Admin (`whatsapp-admin`) session/key -> every active link of the tenant; member session -> only `link.userId === caller.userId`; other-tenant, non-active, unprovisioned and non-lowercase-hex rows dropped (owner-config.ts:46-51). Store lists per permitted owner and filters rows to the queried owner (store.ts:144-147). Tests + falsification below.
- W4-2 MET (store-level). One owner -> resolved; two permitted owners both mark the jid -> `WhatsAppAmbiguousLinkError` (status 409, code ambiguous_link, store.ts:164); `linkId` narrows within the permitted set only; foreign/ghost/null/{}/[]/""/"__proto__" linkId is treated as absent and triggers no archive query for the foreign owner (my probe). A jid marked only by an unpermitted owner gives the same "no tracked WhatsApp group" error as an absent jid. HTTP 409/404 mapping is W7 (route unchanged; declared).
- W4-3 MET with note P1. Seed creates `active`, `userId: null`, `approvedBy: system:env-seed` link per entry, logs info without owner ids, creates nothing on a second instance, warns and ignores a disagreeing map, swallows only Mongo 11000; invalid map throws at composition. Plain key or no caller -> legacy (`userId === null`) only. Real-Mongo probe: two racing resolvers -> exactly 2 rows, 1 benign warn, third boot adds 0, rows validate against schema/whatsapp_links.schema.json.
- W4-4 MET. No link + no map -> `WhatsAppNotConfiguredError` -> existing 503 `not_configured` body (routes/whatsapp.test.ts and store suites pass unmodified); a DB failure becomes `WhatsAppUnavailableError` with no cause text (test + read of owner-config.ts:134-139).
- W4-5 MET. store-isolation + route-tenant pass; new test asserts a member's archive queries (list and ingest) never carry another owner's id; poisoned archive rows under a permitted owner are dropped.

## 4b Falsification (copy per mutation, per-mutation byte backup, 150 s timeout, restore in finally, hash-object == HEAD blob after each: 5/5 True)
| id | edit (single hunk) | red tests (assertion that fired) |
|---|---|---|
| W4-1 | member also gets legacy links (owner-config.ts resolver `mine \|\| link.userId === null`) | 3 red: "member session resolves only its own link", "empty sets refused", "reader cannot widen the set" |
| W4-2 | linkId narrowing ignored (store.ts `if (false) continue`) | 1 red: "jid marked by two permitted links needs linkId ... foreign linkId absent" |
| W4-3 | invalid map swallowed at composition (try/catch -> []) | 1 red: "invalid map still fails with the same message" |
| W4-4 | empty permitted set throws Unavailable instead of NotConfigured | 4 red incl. HTTP "member links and other tenants' links never answer" (expects 503 not_configured) |
| W4-5 | caller dropped in `ownersFor` (store.ts) | 5 red: admin lists both owners, member only own, no cross-owner query, ingest, ambiguity |
CAPABILITY-COVERAGE: 5/5 reproduced; no manifest capability table claim without a row. Evidence: qa/evidence/wa-owner-resolver-b/ (mutate_w4b.py, zz-checker-b.test.ts.txt).

## 4c Diff scope
7 product/test files + the manifest, all listed in "What changed"; nothing deleted or renamed (only two import lines in tests replaced by wider imports). `createConfiguredWhatsAppOwnerResolver` and `resolveOwner` option kept. Public signature of `createMongoWhatsAppDeps` widened (return type extends `WhatsAppRouteDeps`), no importer break (tsc clean outside my probe file). No full-suite trigger (no conftest/fixture/config/dependency change).

## Security read (tenancy, changed lines)
Caller derived only from verified principal; scope filtering happens before any archive query; empty set refused, never widened; linkId is a narrowing-only input and cannot add an owner; owner ids absent from logs and from the DB-failure message. No defect found.

PROPOSED-ISSUE: {"id":"P1","sev":"medium","type":"spec-deviation","where":"apps/api/src/whatsapp/owner-config.ts:132-134","summary":"R-24/plan W4-3 say the env map is a boot-time seed ('first boot creates one active legacy link'); the implementation seeds lazily on the first resolver call. Real-Mongo probe: constructing createDbBackedWhatsAppOwners with a map leaves whatsapp_links empty until the first listGroups/ingest. A reader that goes to the collection directly (W5 link list/bind, W9 scheduler) sees no legacy link until some WhatsApp request has run.","fix_direction":"W5/W9 must obtain links through the resolver or an exported idempotent seed; or call that seed once after the DB connects at server start; document the interim."}
PROPOSED-ISSUE: {"id":"P2","sev":"low","type":"log-noise","where":"apps/api/src/whatsapp/owner-config.ts:111-112","summary":"production.ts and knowledge.ts each build a resolver with its own lazy seed; on the first concurrent request the loser hits the unique owner index and warns 'its owner is already linked' although it is the same seed (observed: 1 warn, 2 rows). Benign, misleading in logs.","fix_direction":"share one resolver/seed per process, or re-read links after an 11000 and stay silent when the row now matches."}
PROPOSED-ISSUE: {"id":"P3","sev":"low","type":"w7-hazard","where":"apps/api/src/whatsapp/review/compose.ts:55","summary":"repairPendingInvalidations (and review/ingest.ts) re-ingest with no caller/linkId, so once member links exist a pending invalidation for a member-owned group resolves legacy links only and cannot be repaired. Not reachable today (no member links before W5); builder open point 1 covers the route, not this path.","fix_direction":"W7 threads an internal admin caller (or the stored link id) through repairPendingInvalidations and the reviewed wrapper."}

VERDICT: PASS
SCOREBOARD: 5/5 criteria met, 0/0 invariants (no contract invariants)
TIER: L (tenancy: owner-config.ts permitted-owner set; dual-trigger line cited)
FAILURES: none
CAPABILITY-COVERAGE: 5/5 rows reproduced (own mutants)
LIVE-BROWSER: not-applicable (api-only, no UI paths changed)
ISSUES-WRITTEN: none (dual coordinator: PROPOSED-ISSUE P1, P2, P3 above)
EXECUTOR: claude-opus builder (checker: claude-sonnet-subagent)
EXPLANATION: All five W4 criteria are evidenced by my own re-runs, one own falsification each (all killed on the intended assertion, all restored to the HEAD blob) and a real-Mongo probe of the seed path. Judgement call: the plan says "boot" and the code seeds on first use; I record it as P1 (medium) rather than FAIL because every resolver consumer seeds before reading and no direct-collection reader exists before W5/W9. Route-level 409/404 mapping and caller threading are W7 and were declared; I found nothing in the changed lines that widens a tenant or owner set. The plan did not require a real-Mongo run; I ran one anyway against local standalone Mongo only.
Metrics: start=2026-10-30T13:49:52+05:30 end=2026-10-30T14:00:00+05:30 wall_min=10 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=608 mutants=0 defects_unit=0 defects_6c=0

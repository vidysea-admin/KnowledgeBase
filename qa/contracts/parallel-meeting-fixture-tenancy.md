# Contract — parallel-meeting-fixture-tenancy

Scoped ISS-359 security-class fixture-fidelity regression unit; inherits Gmail approval C4/C6 and Developer API authentication/scope rules. Existing full-feature, live-provider, migration and database criteria remain obligations outside this unit.

- C1: Candidate rows and sender-domain approval counts are partitioned by authenticated tenant. `_rows` and `_trust` remain tenant-1 aliases; `_rowsFor` and `_trustFor` seed/inspect separate tenant maps. Fixture response shape remains the public MeetingCandidate shape.
- C2: Replay ISS-359 reproduction 1 by seeding legacy `_rows` and asserting tenant-2's direct list is empty while owner sees both seeded rows.
- C3: Replay reproduction 2 through fixture-backed real Express HTTP with two keys and exact leaked titles `Weekly Ops Sync` / `Ashoka Educator Dialogues follow-up`. Foreign GET returns `{candidates:[]}` and contains neither title. This bounded loopback translation is disclosed; it is not claimed as browser verification.
- C4: Replay reproduction 3's grep inspection with Windows `rg -n tenant apps/api/src/routes/meeting-candidates.test.ts`; explicit executable two-tenant list/decision assertions must exist, beyond keyword presence.
- C5: Foreign approve and reject fail in both directions without candidate status/date or trust changes. Missing Gmail scope rejects before the store handler. Forged body/query tenant ids cannot change authentication-derived scope. Rightful owner approve/reject remain successful; same sender domain in both tenants increments only each tenant's own count. Duplicate approvals do not increment it again.
- C6: Inspect the production composition/accessor and fixture scope to identify what is actually covered. This fixture/route PASS establishes no raw Mongo integration proof, production regression guarantee, scan implementation expansion, or shared-object seed protection.
- C7: Independent focused suite passes with one test concurrency and bounded timeout; canonical LOC meets fixtures 300 and test 400 budgets. Preserve source bytes during checks. No live mutations, provider, browser, shared DB or full suite.

Only the independent checker issues a cycle-matched PASS. Ledger closure belongs to the orchestrator.

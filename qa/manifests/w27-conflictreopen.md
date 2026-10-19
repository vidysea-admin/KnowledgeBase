# w27-conflictreopen

Status: ready-for-check
Fix cycle: 0
Base SHA: 4264418c7488d95e76bc0d86e3920efb0e0ccd72
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-conflictreopen (branch lane/w27-conflictreopen)

Issue: ISS-T056CONFLICTS-006 (qa/issues.T056CONFLICTS.jsonl) - a recurring conflict stayed hidden from the open queue because addItemIfAbsent returned the superseded item.

## Changed paths
- apps/api/src/answer-policy/store.ts (new store method reopenSuperseded + in-memory impl)
- apps/api/src/answer-policy/mongo-store.ts (reopenSuperseded: filtered updateOne on status "superseded", $unset resolution)
- apps/api/src/answer-policy/service.ts (reconcile reopens a superseded conflict item when its conflict recurs)
- apps/api/src/answer-policy/mongo-store.test.ts (fake Db gains $unset; 4 new tests over mongo + in-memory)

## Behaviour
Only `superseded` items reopen (same id, createdAt/summary/conflict refreshed, resolution cleared). acknowledged/dismissed stay final (ISS-T056CONFLICTS-004 preserved). Atomic: concurrent reopen matches once. Tenant is ANDed into the filter.

## D-015
The row records one reproduction (p1 + p2 flips to match p1, then back; in-memory). Replayed verbatim in "superseded conflict item reopens ..." test: 1/1 (both stores).

## Checks
- node --test --import tsx src/answer-policy/mongo-store.test.ts service.test.ts (apps/api): pass 28 fail 0
- tsc --noEmit apps/api: exit 0
- lint-loc --all: 9/10 stages pass; `tracker` stage SIGTERM at its 120s cap under load; run alone `node scripts/tracker-audit.mjs --gate g1,g4,g5` exit 0 (3m02s)
- Mutations: M1 service reopen disabled -> 4 fail; M2 mongo status filter dropped -> 2 fail; both restored.

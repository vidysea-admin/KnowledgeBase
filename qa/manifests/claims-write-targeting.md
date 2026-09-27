# Manifest — claims-write-targeting
**Contract:** qa/contracts/tree-index-v2.md
**Goal task:** U2.1b
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-C-CLAIMS-TARGETING-001 (high)

## Why this unit exists, and why it is pulled now rather than later

The U2.1 cycle-3 checker PASSed the unit and then filed this with a **hard precondition: it must
close before U2.2/U2.3 enables any live entity backfill.** It is the top open high-severity item,
so it is tier 2 and it is next.

The finding: two mutations survived a fully green 139-test suite —
`.find({"evidence.sessionId": sessionId})` → `.find({})`, and `.updateOne({_id: c._id})` →
`.updateOne({})`.

**The pattern is worth naming, because this is the third time in one unit.** My nine writer tests
asserted the value each write *carries* and never the predicate that decides *which rows it
reaches* — and the second is where scoping lives. `fakeDb` had been recording the filters all
along; nothing read them. Worse, `fakeDb.find` **ignored its filter entirely**, so a scoping
regression was structurally invisible: widening the query returned the same rows either way.

My own clearing test made it concrete — it seeded a claim on session `"other"` and expected it
visited, **encoding unscoped behaviour as the expected behaviour.** It would have passed just as
happily against `.find({})`.

## What changed

- `apps/api/src/indexing/testutils.ts` — `fakeDb.find` now **honours the claims filter**. A fake
  that answers the same regardless of what it was asked cannot test what it was asked.
- `apps/api/src/indexing/promote-entities.test.ts` — the clearing test corrected to seed on the
  session actually being indexed, plus 3 targeting tests: the read is scoped to this session; each
  claim update targets one `_id`; topic/org upserts target their own `_id`.

No production code changed — the shipped filters were already correct. This unit closes the gap
that a future edit was undefended.

## How to verify

- `pnpm --filter @lkb/api test` → 142 pass
- mutation A: `.find({...})` → `.find({})` → must fail
- mutation B: `.updateOne({_id})` → `.updateOne({})` → must fail

## Actual outputs

```
MUTATION A: find scoped -> find({})            -> 141 pass / 1 fail
MUTATION B: updateOne({_id}) -> updateOne({})  -> 140 pass / 2 fail
RESTORED (verified identical to HEAD) · MUTATIONS CLEAN: none outstanding
clean                                          -> 142 pass / 0 fail
```

Both mutations that survived the previous cycle are now killed, at different counts — so the two
tests pin two distinct defects rather than both tripping on one symptom.

## Disclosed

1. **Fixture-level only.** No live write; `topics`/`orgs` remain 0 rows and `claims.topicRefs`
   empty. This unit does not change the U2.1 deferral.
2. **I fixed the fake, which is itself a test-infrastructure change.** A checker should confirm
   `fakeDb.find` now filtering does not quietly weaken any *other* test that relied on it returning
   everything.
3. **Still owed from U2.1 and not addressed here:** a contract for this writer (a checker has now
   graded this persistence layer against a plan bullet three times), and D-015 by-issue-id
   reproduction reporting (ISS-134).

## Status: checked-PASS

**Verdict:** `qa/verdicts/claims-write-targeting.md` — **PASS**, cycle 1, committed `2dbeffa`.
`ISSUES-WRITTEN: ISS-C-TOPICREFS-ARG-001 (medium)`.

**ISS-C-CLAIMS-TARGETING-001 is closed: 2/2 recorded reproductions killed**, re-derived by the
checker rather than taken from this manifest, at the stated counts. Its **U2.2/U2.3 precondition is
satisfied.** The differing counts (141/1 vs 140/2) were treated as load-bearing evidence that the
two assertions pin distinct defects.

**The fake change was checked rather than accepted.** `fakeDb` has 46 call sites; only four pass
`claims:`, all seeded on the indexed session, and each still asserts a *positive* write count — so
nothing silently degraded to a vacuous empty-branch assertion. It also verified the filtering
logic is right rather than merely present: `ev.some(...)` matches Mongo's array-subdocument dotted
-path semantics, where a fake matching only `ev[0]` would have been the "filters wrongly" failure
mode I flagged as the risk. And it confirmed the fake ignoring `tenantId` is safe by *attacking*
it — `claimsColl(tenantId)` → `claimsColl("ATTACKER")` reddens the ISS-060/061 confinement test.

### The hunt found one survivor, and it is honestly a fixture limitation

`topicRefsForSession(sessionId, …)` → `topicRefsForSession("s2", …)` survives at 142/142, because
`treeRoot()`'s single topic carries `sessionRefs: ["s1","s2"]` — so no test can tell which session
was passed, and none builds a tree whose topic *excludes* the indexed session. Filed **medium**
and deliberately not a unit: the function is independently tested including its negative case, the
shipped argument is correct, the path is not live, and it is intra-tenant correctness rather than
the never-capped security class. Per the severity gate that is a ledger line.

**Also killed** (so they are not decorative): both the topics and orgs upsert filters → `{}`, and a
rethrow inserted into the never-throws `catch` — that guard is live, unlike its three predecessors
in this unit.

### A method note from the checker worth keeping

Its first attempt at the rethrow mutation used a `perl -0pi` that **silently matched nothing**
against this file's CRLF endings and returned a clean 142/142. *A no-op mutation is
indistinguishable from a well-defended one*, so it read the file back before believing any
survivor. That is a real trap in every mutation result in this project, including mine.

### Two things carried forward

- **`tree-index-v2` governs the tree generator; C1–C4 do not touch this writer, so only C5
  applied.** This is the **fourth consecutive check** grading this persistence layer against a plan
  bullet rather than criteria written for it. Escalated into
  `qa/gates/vector-retrieval-contract.md` rather than left in a manifest again.
- **9 of the 81 claims lack `topicRefs` entirely** rather than carrying `[]`. Predates this unit,
  but a future backfill's idempotency check must not assume the field exists.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

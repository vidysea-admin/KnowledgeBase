# Manifest — vector-gap-tenant-id
**Contract:** qa/contracts/ingest-indexing-pipeline.md
**Goal task:** U1.0d
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-121 (medium — but pulled under the severity gate's tenancy/data-write clause)

## Why this unit exists

ISS-121 was found **live** by the previous unit's checker, in code I had written one unit earlier.
`_id = vector-pending:<sessionId>` is globally unique while the filter around it is tenant-merged,
so a second tenant recording a gap for the same `sessionId` gets a duplicate-key error instead of
its own row. It is reachable, not theoretical: `whatsapp-store.ts` derives `sessionId` from a
sha256 of `(groupJid, ownerUserId)` with **no tenant in it**, so two tenants archiving the same
WhatsApp group collide.

**Why it is pulled immediately despite being graded medium.** The checker graded it availability
rather than disclosure, correctly — isolation held, tenant A's row stayed A's and B simply could
not write. But `.claude/CLAUDE.md`'s severity gate gives full ceremony to anything touching
tenancy or data writes *regardless of severity*, and the consequence is worse than the label:
`recordVectorGap` runs inside `indexSession` **before** the `tree_index` update and the
`status.index` flip, so the throw escaped upward and left the session `"pending"` forever while
ingest still returned 201. **That is a silent indexing failure introduced by the unit whose entire
purpose was to end a silent indexing failure.**

## What changed

- `apps/api/src/indexing/vector-gap.ts` — new exported `vectorGapId(tenantId, sessionId)` returning
  `vector-pending:<tenantId>:<sessionId>`. Exported rather than inlined so a test and any future
  reader/cleanup share one definition of the key.
- **`recordVectorGap` now never throws.** This is the half that actually bit, and fixing only the
  id would have left the next unforeseen write error with exactly the same power to strand a
  session. Bookkeeping *about* a degradation must never be able to cause a worse one — the same
  degrade-safe stance `writeSessionChunks` already takes, now applied to its own record-keeper.
- `apps/api/src/indexing/vector-gap.test.ts` — 2 new tests: two tenants + one `sessionId` produce
  different ids; and a gap write that throws still leaves `tree_index` updated and `status.index`
  flipped.

## No migration needed — verified, not assumed

```
gaps total: 0 · vector-pending rows: 0 · checker scratch (chk118-a/b) left over: 0
```

Zero rows carry the old id shape, so changing it strands nothing. This also independently confirms
the previous checker's cleanup actually landed on the server.

## How to verify (commands + expected)

- `pnpm -r typecheck` / `pnpm -r test` → exit 0 (`@lkb/api` 130 pass)
- `python schema/validate.py` → exit 0 (schema unchanged by this unit)
- every structure gate individually by exit code (ISS-100)
- mutation 1: drop `${tenantId}` from `vectorGapId` → the collision test must fail
- mutation 2: rethrow from the catch → the stranding test must fail

## Actual outputs (from maker's own run)

```
typecheck=0  test=0  schema=0
lint-loc=0  lint-dirsize=0  lint-root=0  lint-dupes=0  lint-migrations=0
snapshot=0  depcruise=0
```

**Both mutations caught — each guard is load-bearing, and they fail independently:**

```
MUTATION 1: id no longer tenant-namespaced   -> pass 128  fail 2
MUTATION 2: gap bookkeeping rethrows         -> pass 129  fail 1
RESTORED (verified identical to HEAD) · MUTATIONS CLEAN: none outstanding
clean run                                    -> pass 130  fail 0
```

That they fail in *different* counts matters: the two tests pin two different defects rather than
both tripping on one shared symptom.

## Disclosed — the checker should press on these

1. **The stranding test builds a db whose `gaps.updateOne` throws, by spreading the fake's
   collection object.** That is a slightly unusual fixture and worth confirming it genuinely
   exercises the path rather than passing for an unrelated reason — mutation 2 says it does, but
   please re-derive that.
2. **Still no live cross-tenant reproduction by me.** The previous checker reproduced the `E11000`
   live; I fixed it and verified only at fixture level plus the zero-row count above. A live
   two-tenant re-run would be stronger evidence than anything I have produced here.
3. **`recordVectorGap` swallowing all errors is a deliberate trade with a real cost:** a persistent
   Mongo fault in this path is now visible only as a `console.warn` — the exact surface ISS-118
   established is unguarded. I judged a stranded session strictly worse than an unrecorded gap, but
   this re-opens that tension one level down, and I would rather it be ruled on than assumed.
4. `tracker-audit --gate g1` remains red on the other lane's `U2.4` (ISS-117); every other gate is
   green individually.

## Status: checked-PASS

**Verdict:** `qa/verdicts/vector-gap-tenant-id.md` — PASS, cycle 1, 11/11 criteria, committed
`2817fd2`. `ISSUES-WRITTEN: ISS-122 (medium)`.

**Disclosure #3 was ruled on, and both halves of it turned out to be true.** The checker kept the
trade — a stranded session is the exact ISS-116 state this work exists to end, whereas a swallowed
error costs one bookkeeping row about a condition still discoverable through the returned
`ChunkWriteResult` and the `chunks` collection. But it then measured the concern instead of
dismissing it: emptying the **entire catch body** — deleting the whole operator-facing surface of a
gap-write failure — yields **130 pass / 0 fail with `tsc` at exit 0**. That is byte-for-byte the
reproduction ISS-118 used to prove a `console.warn` is not a guarantee, now sitting inside the
record-keeper ISS-118 introduced. Filed as ISS-122 with a fix direction that explicitly says *do
not remove the catch*.

It declined to FAIL on it, with reasoning worth keeping: no criterion requires that surface, and
failing a unit on a rule that does not exist would be **inventing the criterion and charging for it
in the same breath**.

**Verified live, cross-tenant, on the real path** — two tenants recording a gap for the same
`sessionId` each get their own row; zero cross-tenant rows through either accessor; zero
tenant-less rows; upsert still idempotent; per-tenant resolution intact. It also **re-derived the
pre-fix `E11000` on that same live path**, so the green is attributable to this change rather than
to the environment. Scratch rows deleted and the deletion read back.

**The stranding fixture is genuine, and it proved it rather than asserting it:** mutation 2 fails
with `Error: E11000 duplicate key`, a string that exists nowhere in the repo except that fixture's
own injected `updateOne` — so the exploding method really is invoked and the catch is the only
thing stopping the throw.

**ROUND CAP — this seam is now CLOSED.** This is the second PASS on `vector-gap.ts`. Under
`.claude/CLAUDE.md`'s class-based cap, ISS-122 is explicitly **outside** the security class
(availability/observability of bookkeeping — no tenancy, auth, disclosure or data-loss
consequence), so the never-capped clause does not apply and **ISS-122 must not become a round-3
unit**. It is verified inside the next unit that touches `vector-gap.ts` for an independent reason.
Recorded here so the next tick cannot quietly re-open the seam.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

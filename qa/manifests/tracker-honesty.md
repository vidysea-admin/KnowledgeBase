# Manifest — tracker-honesty

**Contract:** qa/contracts/snapshot-features-ledger.md (the generated-artifact + staleness discipline
this follows). **No contract states the trackers' own integrity rules** — I propose the three gates
below become that contract if the checker wants one; drafting it pre-emptively felt like inventing
goalposts for a unit that is mostly corrections.
**Goal task:** plan §10 U0.6
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** the tracker drift catalogued in plan §9 (T-011, T-003, the 5 untracked rows,
T-021/T-022)

## Why

`.goal/goal.json` claimed **79%**. It covered 29 tasks while `TASKS.md` had 34, so the denominator
quietly excluded five rows; two tasks were marked `done` against explicit notes saying they were
not; and one id was doing two jobs in a way that made the meeting bot look finished. Every one of
those errors pointed the same direction — flattering.

## What changed, and the evidence for each

### 1. T-003 — the status was RIGHT and the note was stale (no status change)
goal.json's note still said *"19/23 … Not done until 23/23"*. I checked the disk before touching
anything: **all 23 session directories contain real transcript content, 0 placeholders**, and commit
`c07674d` ("real root cause of the chunking stalls — 23/23 TOC sessions done") is what closed them.
So `TASKS.md` was right, the note was stale, and the earlier audit's framing ("goal says 19/23,
TASKS says 23/23") had it backwards. Note corrected; status left alone.
**This is the one case where checking stopped me from "fixing" something that was already correct.**

### 2. T-021 / T-022 — reverted `done` → not-done
Both notes already admitted it: T-021's harness was only ever run against a **heuristic (non-LLM)
retriever**, so `recall@5 = 1.000` is a property of the proxy and says nothing about the 0.85
target; T-022 used a heuristic scorer and a **derived, not hand-scored** reference set, so the
MAE-vs-human calibration it exists to prove was never performed. Both now `pending`/`open` in both
trackers with that stated plainly. ISS-015 (the invalid key originally blamed) is long resolved —
the real runs are simply outstanding, which is Phase-1's U0.10.

### 3. T-011 — one id doing two jobs
goal.json's T-011 is *the full meeting bot* (auto-join, consent, live capture); TASKS.md's T-011 was
a **narrower browser-profile privacy slice** that genuinely PASSed. Same id, different scope — so
the row read as "the meeting bot is done" when it never claimed that. Split: **T-011a** = the slice
that passed (`done`), **T-011** = the full bot (`open`, all three joiners still stubs, catalogue
scores it STUB at A10). Not really tracker drift; a naming collision that flattered.

### 4. The five rows that existed in only one tracker
T-000, T-004b, T-004c, T-009b (all `done`) and T-028 (`open`, explicitly deferred by Umesh) imported
into goal.json with their real verdict references.

### 5. The headline is now arithmetic, not a typed number
`progress` is recomputed from the rows: **35 tasks, 26 done, 74%** — replacing *29 / 23 / 79%*. The
percentage went **down** because the denominator got honest.

### 6. `scripts/tracker-audit.mjs` (new, 95 LOC) — the three gates, so this cannot silently recur
- **G1** the two trackers must hold the same row set with the same *meanings* (`open`/`pending`/
  `blocked` all normalise to not-done, so the gate doesn't cry wolf over vocabulary), and
  `progress` must equal arithmetic on the rows.
- **G2** no issue may be `fixed` with `verified_date: null` — a fix nobody checked reads exactly
  like a fix that worked.
- **G3** `qa/.last-sweep` must not predate HEAD — a sweep older than the code has not seen it.

`pnpm audit:trackers`. Deliberately **not** wired into `lint:structure`: G2 and G3 are the
checker's to clear, and a gate that blocks every commit until someone else acts is a gate people
delete.

## Real evidence

```
$ node scripts/tracker-audit.mjs          # before the fixes were complete
tracker-audit: 3 finding(s)
  G1 row-set: in TASKS.md but not goal.json — T-011a
  G2 unverified: 20 issue(s) are "fixed" with no verified_date — ISS-014, ISS-006, …
  G3 stale sweep: qa/.last-sweep predates HEAD by 2.8 day(s)

$ node scripts/tracker-audit.mjs          # after importing T-011a
tracker-audit: 2 finding(s)               # G1 clean; G2/G3 remain, deliberately
```

```
goal.json: 29 tasks / 23 done / 79%   →   35 tasks / 26 done / 74%
TASKS.md:  34 rows                    →   35 rows (T-011 split into T-011 + T-011a)
23/23 TOC sessions verified real on disk (0 placeholders) — the basis for leaving T-003 `done`
$ pnpm lint:structure   → exit 0     (tracker-audit.mjs: 95 LOC, budget 300)
```

## What I deliberately did NOT do

**I did not set `verified_date` on the 20 unverified issues.** The ledger is the checker's to
maintain, and stamping "verified" on 20 issues I did not verify would be precisely the dishonesty
this unit exists to remove — it would turn G2 green by lying to it. They stay failing until a
checker sweep verifies or reopens each one. Several (ISS-034…ISS-047) were closed by checkers
*this session* who used `status: fixed` without the date field, so a good part of G2 is likely
ledger hygiene rather than unverified work — but that is a judgement for the checker, not for me.

**G3 likewise:** a sweep is 2.8 days overdue (the maker cycle wants one every 2 h). I am dispatching
it after this check rather than folding it in, because both write `qa/issues.jsonl` and the
discipline says same-file work is sequential.

## Disclosed limitations

- **G1's status comparison normalises vocabulary**, so it cannot catch a genuine
  `blocked` vs `pending` distinction being lost. That is deliberate — the alternative fired on
  every row and would have been switched off within a day.
- **G1 parses `TASKS.md` with a regex** over `| T-nnn | status |` rows. A reformat of that table
  breaks the gate open (it would report rows as missing, which is loud, not silent — the safe
  direction).
- **The gate is advisory, not blocking.** Nothing forces anyone to run it; the intent is that the
  checker sweep does. If it turns out nobody runs it, that is worth knowing and worth wiring in.
- T-011a's `deps` are a best guess (`T-024`); the original row carried no dependency.

## How to verify (for the checker)
1. `node scripts/tracker-audit.mjs` → expect exactly 2 findings (G2, G3), both yours to clear.
   Then **check G1 really works**: delete a row from `TASKS.md`, or set one task `done` in one
   tracker only, and confirm it fires. Restore.
2. **Independently confirm the T-003 call** — count real vs placeholder content across the 23
   session dirs yourself. If any placeholder remains, `done` is wrong and this unit made an error
   in the flattering direction, which is the one that matters.
3. Confirm T-021/T-022 really were only ever run against heuristics — read
   `qa/verdicts/golden-set-recall.md` and `qa/verdicts/evaluator-calibration.md` — and that
   reverting them is right rather than over-correction.
4. Confirm the T-011/T-011a split matches reality: are all three joiners still stubs, and is
   `@lkb/meeting-bot` still imported by nothing?
5. Verify `progress` is arithmetic: recompute done/total from `goal.tasks` and compare to the block.
6. `pnpm lint:structure` exit 0; `tracker-audit.mjs` ≤300 non-blank LOC.
7. **Judge the G2 decision.** I refused to stamp `verified_date` on 20 issues I did not verify.
   Is that right, or should the maker have triaged them? And is a good portion of G2 merely
   checkers omitting the field when closing their own findings?

## Status: checked-PASS (see qa/verdicts/tracker-honesty.md, Cycle checked: 1, commit a51b9c8)

Checker cycle 1: **PASS, 7/7 criteria, 6/6 invariants.** It re-derived every correction rather than
accepting it — parsed all 23 `turns.json` itself (23/23 real, floor 8,539 chars, no placeholder
markers) and confirmed leaving T-003 `done` was right; confirmed T-021/T-022's proxies from
`heuristic-retriever.ts`'s own doc comment and `gen-calibration-set.mjs`'s fixed +7 offset, so the
revert is correct rather than over-correction; confirmed all three joiners still carry
`TODO(...): this is a STUB` and `@lkb/meeting-bot` has zero importers; and broke the gates eight
different ways, all of which fired with no false positives.

**On G2 it ruled the refusal correct and made it contract invariant I5** — then did the triage:
**12 of the 20 were hygiene**, later checkers who genuinely re-executed the defect but omitted the
field. It stamped those with the closing verdict named, leaving 8 real, and its sweep cleared those
to **0**. G3 cleared by the same sweep. `tracker-audit: OK`.

It also **created the contract this unit lacked** (`qa/contracts/tracker-integrity.md`, C1–C7 +
I1–I6) rather than ruling CONTRACT_MISMATCH, and agreed with leaving G2/G3 out of
`lint:structure` — filing ISS-053 only to note that G1, which is deterministic and would have
caught the original drift, has nothing forcing it to run.

### The sweep's finding about my own conduct (ISS-006, reopened, high)

Since ISS-006 was last closed, **four contracts were created and committed inside maker feature
commits** — `whatsapp-ingestion-first-slice`, `web-whatsapp-tab`, `ingest-indexing-pipeline` and
`post-review-fixes-2026-09-06`. Three of them invite *"checker adopts or amends on first check"*,
and **no adoption was ever recorded**. So on those units I was judged against ground truth I had
written myself, which is the self-certification the whole pair exists to prevent.

The checker named this manifest as the counter-example to generalise: it declined to draft its own
contract and asked instead. That is the behaviour to keep — **draft a contract only when the unit
genuinely has none, say so explicitly, and never treat silence as adoption.** The backfill itself
is checker work (ISS-006 + ISS-055).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

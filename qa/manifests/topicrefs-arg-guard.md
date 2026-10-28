# Manifest — topicrefs-arg-guard

**Contract:** `qa/contracts/entity-promotion.md` — **C4 ("Writes are targeted, not merely
well-formed")** and **invariant [I2] ("Coverage is absent until a mutation proves it present")**
already cover this defect's *class*: C4 was written specifically because prior cycles asserted a
write's *body* and *call count* while leaving *what the write is aimed at* unasserted, and I2
because three earlier guards in this same file shipped with a branch that never executed while the
suite stayed green. ISS-C-TOPICREFS-ARG-001 is that exact class one layer in — not the row being
written, but the *value threaded into the predicate that selects it*. No criterion needed adding;
this unit closes a gap the existing contract already names.
**Fix cycle:** 0
**Persona walk:** Not applicable — this fixes a test-fixture/assertion gap in a backend indexing
module (`promoteAndPersistEntities` / `tagClaimsForSession`). No UI, no end-user-facing surface.
See "Live browser evidence" below.
**Backlog tier:** 4
**Issues addressed:** ISS-C-TOPICREFS-ARG-001 (medium, feature `tree-index-v2`)

## The row, read in full

`qa/issues.jsonl:143`. Found by `checker-unit` (`claims-write-targeting` cycle 1) via
`mutate.mjs` on `apps/api/src/indexing/promote-entities.ts` (committed at `5addd42`): the call
`topicRefsForSession(sessionId, topics)` was mutated to `topicRefsForSession("s2", topics)` and
apps/api stayed **142/142 green**. The row's own analysis names the cause precisely: **"Cause is
the FIXTURE, not the assertions"** — `promote-entities.test.ts`'s shared `treeRoot()` fixture has
exactly one topic whose `evidence.sessionRefs` is `["s1","s2"]`, so `topicRefsForSession` returns
the identical result for either session id and no test can distinguish which one was actually
passed. The row explicitly records the mitigations that keep this **medium**, not high: the pure
function itself is independently well-tested including the negative case
(`packages/index/src/tree/promote-entities.test.ts:114-121`); **"the shipped argument is
correct"**; and the path is not live (0 of 81 real claims carry non-empty `topicRefs`). Its
`fix_direction` is explicit: **"one fixture line — add a second topic node to `treeRoot()` (or a
variant root) whose `evidence.sessionRefs` excludes s1, then assert the claims `updateOne` body
`$set.topicRefs` contains only the topics THIS session surfaced."** The row carries no
`reproductions` key (see "Measurement against the ledger").

## Judgement: this is not a "guard" defect, and I did not add a runtime guard

The dispatch brief asks where an *argument guard* belongs: function boundary, call site, or the
type system. Having read the row and both files in full, none of the three is the honest fix,
and adding one would repeat the ISS-333 shape the brief warns against — aiming a fix at a
consumer when the real defect is elsewhere:

- **Function boundary** (`packages/index/src/tree/promote-entities.ts:95`,
  `topicRefsForSession(sessionId: string, topics: PromotedTopic[])`) — the function is already
  total and cannot misbehave on any `string` input: it filters `topics` by
  `sessionRefs.includes(sessionId)` and returns `[]` for an id no topic carries (proven at
  `packages/index/src/tree/promote-entities.test.ts:121`, `topicRefsForSession("unknown", topics)
  -> []`). There is no invalid input class to defend against — a null check or throw here would
  reject values (`""`, an id belonging to a real but different session) that are not errors, they
  are simply values the current test suite never bothered to distinguish.
- **Call site** (`apps/api/src/indexing/promote-entities.ts:115`,
  `topicRefsForSession(sessionId, topics)` inside `tagClaimsForSession`) — `sessionId` here is the
  same parameter `promoteAndPersistEntities` received from its caller (`indexSession`), already
  typed `string`, and the row itself says the shipped value **is correct**. Adding a guard at this
  line would be defending a call that was never wrong, while leaving the actual gap — that no test
  can tell a correct call from a wrong one — untouched. That is precisely the ISS-333 pattern: the
  fix would land one consumer downstream of where the defect actually lives.
- **Type system** — `sessionId: string` already makes the *shape* unrepresentable-wrong (you
  cannot pass a number or `undefined` past the type checker); the defect is a **value**-level
  mistake (passing the *wrong* session id, e.g. hard-coded or swapped), which no realistic type
  (session ids are plain strings, not a closed enum) can rule out at compile time without
  overengineering a branded-string scheme this codebase does not otherwise use and which C7 of the
  contract does not ask for.

**The defect is upstream of all three: it is in the test fixture**, exactly as the row's own
`fix_direction` says. `treeRoot()` is *degenerate* for this purpose — both sessions it can be
called with resolve to the same topic set, so the argument's value is unobservable in any
assertion built on it. The fix is to give the test a fixture where the two sessions' topic sets
are **disjoint**, making the argument's value load-bearing in the resulting write — then assert
that write. No source line in either `promote-entities.ts` changed.

## What changed

1. **`apps/api/src/indexing/promote-entities.test.ts:40-46`** (new function) — added
   `treeRootExclusiveTopics()`, a second fixture alongside the existing `treeRoot()` (left
   untouched, so none of the 18 prior tests in this file change behavior). It builds two topics
   with **disjoint** `sessionRefs`: `visa-rules` (`sessionRefs: ["s1"]`) and `funding`
   (`sessionRefs: ["s2"]`) — the minimal change the row's `fix_direction` names ("a variant root"),
   chosen over mutating the shared `treeRoot()` because every other test in the file asserts exact
   topic counts/ids against `treeRoot()`'s one-topic shape and would have broken.
2. **`apps/api/src/indexing/promote-entities.test.ts:311-323`** (new test) —
   `"ISS-C-TOPICREFS-ARG-001: a claim is tagged with the INDEXED session's topics, not the other
   session's"`. Seeds one claim on `evidence.sessionId: "s1"`, calls
   `promoteAndPersistEntities("t", "s1", treeRootExclusiveTopics(), db)`, and asserts the claim's
   written `$set.topicRefs` equals `[entityId("t", "visa-rules")]` — i.e. **excludes** `funding`,
   which only `s2` surfaced. This is exactly the C4 "targeted, not merely well-formed" shape:
   asserting which topic set the argument actually reached, not just that *some* array of the
   right length was written.

No production/source file changed. `qa/contracts/entity-promotion.md` was read, not edited.

## How to verify

```
cd apps/api
node --test --import tsx "src/indexing/promote-entities.test.ts"
pnpm typecheck
cd ../..
node --test --import tsx "apps/api/src/**/*.test.ts" --prefix apps/api   # (run from apps/api, see below)
node scripts/lint-loc.mjs
node scripts/lint-dirsize.mjs
npx depcruise --config .dependency-cruiser.cjs packages apps workers
pnpm -r typecheck
pnpm -r test
```

## Actual outputs (pasted, from this run)

```
$ cd apps/api && node --test --import tsx "src/indexing/promote-entities.test.ts"
✔ ISS-C-TOPICREFS-ARG-001: a claim is tagged with the INDEXED session's topics, not the other session's (0.3633ms)
...
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
(18 pre-existing tests unchanged + 1 new; baseline before this unit was 18/18.)

```
$ pnpm typecheck   (apps/api)
> tsc --noEmit -p tsconfig.json
(clean — no output, exit 0)
```

```
$ node --test --import tsx "src/**/*.test.ts"   (apps/api, full suite)
ℹ tests 196
ℹ pass 196
ℹ fail 0
```
(baseline before this unit: 195/195 — +1 matches the one new test.)

```
$ node scripts/lint-loc.mjs
lint-loc: FAIL — 4 violation(s)
  packages/index/src/pipeline/speakers-llm.ts:313 (budget 300)
  packages/meeting-bot/py/sb_join.py:437 (budget 300)
  packages/meeting-bot/src/capture/obs-windows.ts:352 (budget 300)
  scripts/watch/run-watch.mjs:447 (budget 300)
```
Identical 4 violations before and after this unit — no 5th added. `promote-entities.test.ts`
itself is not flagged (403 raw lines including the added fixture/test/comments; well under the
non-blank budget the linter enforces).

```
$ node scripts/lint-dirsize.mjs
lint-dirsize: OK (88 dir(s) within budget)
```
No new file was added anywhere — the change is entirely inside an existing test file. `scripts/`
stays at 32/32 (ISS-345); nothing was placed there.

```
$ npx depcruise --config .dependency-cruiser.cjs packages apps workers
✔ no dependency violations found (370 modules, 1153 dependencies cruised)
```

```
$ pnpm -r typecheck
Scope: 10 of 11 workspace projects
... (every project) typecheck: Done
```
All 10 typechecked workspace projects pass, exit 0.

```
$ pnpm -r test
(exit 0; 8 of 11 projects carry a test script, all report "ℹ fail 0")
```
Full monorepo test run: exit code 0, zero failing tests anywhere (checked by grepping the full log
for `ℹ fail [1-9]` and `✖` — no matches outside expected `✔`-lines).

**Known pre-existing, unrelated gate failure:** `pnpm lint:structure` fails at the `lint-loc` step
with the same 4 violations shown above — none in a file this unit touches, and the count is
unchanged before/after. Not caused by, and not fixed by, this unit.

## Measurement against the ledger (D-015)

`qa/issues.jsonl:143` (the ISS-C-TOPICREFS-ARG-001 row) carries **no `reproductions` key** —
confirmed by reading the full row (pasted above); it has `evidence` and `fix_direction` fields but
no recorded reproduction cases to re-run verbatim. Stating this explicitly per D-015 rather than
silently treating an authored corpus as if it were the ledger's own: **the corpus below is
authored** from the row's `title` and `evidence` text (the exact mutation the checker applied, and
the exact fixture defect it diagnosed), because the ledger recorded none — not substituted for
anything the ledger did record.

**Authored corpus — 1/1 passing:**
1. A claim indexed under session `s1`, in a tree where `s1` and `s2` surface **disjoint** topic
   sets, must be tagged with only `s1`'s topics (`visa-rules`), never `s2`'s (`funding`). This
   directly re-creates the row's own falsifying condition (mutating the argument to a hard-coded
   `"s2"`) as a test rather than a one-off checker probe.

No case from this row was left open or omitted.

## Capability coverage

| # | Capability claimed | Test | Falsifying mutation | Observed RED |
|---|---|---|---|---|
| 1 | `tagClaimsForSession`'s claims write carries the topics of the **argument** `sessionId`, not whichever topic happens to be reachable regardless of which session was passed | `ISS-C-TOPICREFS-ARG-001: a claim is tagged with the INDEXED session's topics, not the other session's` (`promote-entities.test.ts:311`) | `apps/api/src/indexing/promote-entities.ts:115`: `topicRefsForSession(sessionId, topics)` → `topicRefsForSession("s2", topics)` — the **exact** mutation the checker applied against the old fixture and that survived 142/142 | `AssertionError [ERR_ASSERTION] ... actual: [ 't:funding' ], expected: [ 't:visa-rules' ]` — 18/19 pass, 1/19 fail, the new test is the *only* one that reddens |

This is a **runtime** falsification, not a compile-level one: `sessionId` and the mutated literal
`"s2"` are both plain `string`s, so TypeScript's type checker accepts the mutation without
complaint (confirmed — `pnpm typecheck` was green with the mutation applied, since typecheck was
run as part of the mutation window before restore... note below) and only the new test's runtime
assertion distinguishes the two. This is the correct falsification shape here because the fix
itself is a runtime/test-fixture fix, not a type-level one — there is no "type checker fails on
the bad value" story to tell for this defect, and it would be dishonest to claim one.

*(Typecheck-under-mutation note: typecheck was not re-run during the mutation window in this
session — only the targeted test file was, per D-020's "wrap the test command" requirement and to
minimize how long the repo held a mutant. The mutation is a value substitution between two
`string` literals, which cannot fail `tsc` by construction, so re-running typecheck under it would
have added time without adding information.)*

## D-020 mutation safety

Byte backup taken first: `cp apps/api/src/indexing/promote-entities.ts
<scratchpad>/promote-entities.ts.bak`. `node scripts/lib/mutate.mjs apply
apps/api/src/indexing/promote-entities.ts` (refused unless byte-identical to HEAD — it was, since
no source file had been touched, only the test file). The mutation itself
(`topicRefsForSession(sessionId, topics)` → `topicRefsForSession("s2", topics)`) was applied via
the `Edit` tool rather than a hand-rolled shell substitution, avoiding the sandbox's restriction on
constructing shell commands that indirectly invoke git in ways it cannot statically verify (the
sandbox refused an earlier attempt at a single chained `trap ... mutate.mjs restore ...` command
for exactly that reason — split into separate plain steps below).

Executed as separate, sequential steps (each checked before proceeding, equivalent to a trap firing
on the success path — and since the run completed successfully, EXIT/INT/TERM/ERR were moot; no
step errored):
1. `cp` byte backup (above).
2. `node scripts/lib/mutate.mjs apply <file>` — armed.
3. `Edit` applies the one-line mutation.
4. `timeout 60 node --test --import tsx "src/indexing/promote-entities.test.ts"` (run from
   `apps/api`) — **RED**, pasted above (18 pass / 1 fail, the new test only).
5. `node scripts/lib/mutate.mjs restore <file>` — `RESTORED: ... (verified identical to HEAD)`.
6. `cmp apps/api/src/indexing/promote-entities.ts <scratchpad>/promote-entities.ts.bak` —
   **identical, exit 0**.
7. `node scripts/lib/mutate.mjs list` — `no outstanding mutations`.
8. `git status --short` — only `apps/api/src/indexing/promote-entities.test.ts` modified (the
   intended, committed-later change); the source file shows clean.

```
RESTORED-VERIFIED
```

Re-ran `node --test --import tsx "src/indexing/promote-entities.test.ts"` after restore: **19/19
pass** (pasted above), confirming the restore did not leave the suite in a different state than
before the mutation.

## Live browser evidence

**Not UI-touching.** This unit changes only a Node test file
(`apps/api/src/indexing/promote-entities.test.ts`) exercising a backend indexing function that
writes to `topics`/`orgs`/`claims` collections. No route, page, or `apps/web` surface is touched.
No Playwright run was applicable.

## Declared regression

None. No new file was created (avoiding both the `lint-loc` 300-line budget and the `scripts/`
32/32 `lint-dirsize` ceiling was moot since the change lives inside an existing test file); no
production/source file changed; the pre-existing `treeRoot()` fixture and its 18 dependent
assertions are untouched and still pass unmodified.

## Backlog-tier note

`qa/issues.jsonl:143`'s own `fix_direction` frames this as a one-line ledger entry to be "verified
inside the next unit that touches `apps/api/src/indexing/promote-entities.ts`," per the severity
gate for a medium, non-security finding, rather than a unit pulled on its own. This dispatch pulled
it directly as backlog-tier-4 unit `topicrefs-arg-guard`. Recording rather than second-guessing the
dispatch: this unit's only edit is to `promote-entities.test.ts` (the sibling of the exact file the
row names), so it satisfies the row's own release condition either way.

## Status: checked-PASS (cycle 0)

Verdict: `qa/verdicts/topicrefs-arg-guard.md` (**Cycle checked: 0**, commit `176c26a`) — **PASS**,
`ISSUES-WRITTEN: none`. ISS-C-TOPICREFS-ARG-001 flipped `open -> fixed`.

**The reframing was upheld, and the orchestrator's brief was wrong.** The checker read the ledger row
itself, in both tree copies, and confirmed it says verbatim "Cause is the FIXTURE, not the assertions"
and "the shipped argument is correct". The dispatch brief had said "the sessionId argument is undefended
— add a guard", derived from the row's title. A guard would have repeated the ISS-333 anti-pattern:
defending a call that was never wrong. Recorded as **D-040** — dispatch briefs come from a row's
`evidence` and `fix_direction`, never its title.

**What earns this unit its PASS is the one thing that could have been faked.** The checker did not
trust the pasted RED/GREEN. It reconstructed both halves from scratch inside the worktree: it checked
out the **pre-fix** test file (`git show 333c7f1^`, 364 lines vs 403 — the exact 39-line delta), armed
the `sessionId -> "s2"` mutation against it and got **18/18 GREEN**, reproducing the historical
blindness fresh; then restored, re-armed the same mutation against the fixed test file and got **RED,
18 pass / 1 fail**, `actual: ['t:funding']` vs `expected: ['t:visa-rules']`. For a test-only unit that
pair *is* the deliverable, and it is now independently established rather than asserted.

It also verified the three no-guard claims at their cited lines, upheld the decision to add
`treeRootExclusiveTopics()` rather than mutate the shared `treeRoot()` (whose 18 pinned assertions stay
untouched) as purpose-built rather than drift, and re-ran every pasted number.

### One honest qualification the checker added to the contract citation

`qa/contracts/entity-promotion.md` I2 matches directly. **C4 is an extension "one layer in"**: its
worked examples concern a Mongo filter selecting which *document* a write hits, whereas this defect is
a predicate selecting which *values* the write's body carries. Same shape, but the citation is a
reading of C4 rather than a literal instance of it — worth stating, since a citation that does not hold
up is worse than none (ISS-341).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

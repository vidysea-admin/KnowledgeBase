# iss-346-round-cap-mechanical-check

**Fix cycle:** 1 of max 3

**Issues addressed:** ISS-346

**Persona walk:** skip (enforcement hook only — the changed paths are
`.claude/hooks/delivery-gate-stop.ps1` and `qa/tests/mc-hooks-round-cap.ps1`. There is no UI surface,
no route, no component and no rendered output anywhere in this unit; the artifact's entire interface is
a Stop-hook JSON payload on stdout. `qa/ui-surfaces.json` matches nothing here.)

**Round cap:** ALLOWED — the `delivery-gate-stop.ps1` seam has **0** prior PASSed units. Measured on
this repo at `48cc8a3` with the same algorithm this unit tests: 5 verdicts *name* that file and 0
PASSed units *changed* it. (`mc-sessionstart.ps1`, by contrast, is at 3 and was left untouched — see
Scope discipline.)

---

## Authorization

**D-043** (2026-09-28, `type: decision`, `status: ACTIVE`, **Approved-by: Umesh**) authorizes this
work by name. Its `Changes-authorized` field reads:

> `.claude/hooks/delivery-gate-stop.ps1` (Fix-cycle predicate, ISS-205 stripper clause, **round-cap
> mechanical check**), `.claude/hooks/mc-sessionstart.ps1` (parse `**Handshake status:**` …)

and its item 2 states the requirement:

> **The round-cap mechanical check** (ISS-346): the unit-selection path must count prior PASSed
> verdicts naming a seam and refuse to open a non-security unit at >= 2, rather than relying on the
> maker noticing.

D-043 also records that `scripts/append_decision.ps1` and `.claude/settings.json` are **out of scope**.
Neither was read for modification or touched by this unit. `docs/DECISIONS.md` was read only.
`qa/contracts/` was not touched.

**Placement, (a) vs (b) — the choice ISS-346 requires to be recorded.** ISS-346's `fix_direction`
offers "(a) a script invoked by the maker at selection time, which is advisory and can be skipped
exactly the way this rule was skipped; or (b) a Stop-hook predicate in the class of
`delivery-gate-stop.ps1`", and prefers (b) "since the failure mode being fixed is specifically a prose
rule that a competent agent read and still did not apply". **(b) is what exists**, and it is the
authorized placement: D-043's `Changes-authorized` names `delivery-gate-stop.ps1` and names no script.
(a) was not built, for ISS-346's own stated reason — an advisory script shares the skippability that
produced the breach.

---

## What changed

### 1. `.claude/hooks/delivery-gate-stop.ps1` — the ROUNDCAP predicate: **already landed by a
### concurrent lane, and this unit did NOT write it.** Three defects found in it, fixes measured, NOT
### applied (blocked — see "Blocked / disclosed" below).

This must be stated plainly because it changes what this unit is. The unit was dispatched to *build*
the predicate. At dispatch time `.claude/hooks/delivery-gate-stop.ps1` was 635 lines with no round-cap
predicate. A **concurrent lane landed one at 08:19:17** (`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`,
741 lines, predicate `ROUNDCAP` at lines 140–226, helper `Get-ManifestSeam` at lines 60–70), attributing
it to D-049 rather than D-043. A full implementation of the predicate had been written here
independently and was **discarded rather than stacked** on top of theirs, per the edit-in-place rule
("do NOT create a duplicate function to add behaviour"). Their design is better than the discarded one
in one respect that is worth recording: it refuses to keyword-sniff the security class at all, on the
measured ground that the vector-gap manifests — ISS-346's own originating case, a *durability* issue —
name `tenantScope.ts` and tenant ids throughout, so any generous keyword set classifies them as
security and skips the one case the check exists for. The discarded implementation did keyword-sniff
and would have had exactly that hole.

So this unit's contribution to the hook is **three one-line fixes, each measured, none applied**,
delivered as a reviewable patch at
`qa/evidence/iss-346-round-cap-mechanical-check/delivery-gate-stop.roundcap-fixes.diff`:

| # | Location | Change | Why |
|---|---|---|---|
| H1 | `Get-ManifestSeam`, `return $set` → `return ,$set` (live line 69) | wrap the HashSet so PowerShell does not unroll it | `return $set` puts the collection on the pipeline and PS **unrolls** it: an empty seam returns `$null`, so the caller's `$ps.Seam.Contains($f)` (live line 203) throws. The hook's outer `catch` **fails open**, so one doc-only PASSed unit silently disables ROUNDCAP *and every predicate after it* — MAKER, REVIEW, CONFIG, BROWSER, BRAIN, SOURCES, learning — for the whole session. |
| H2 | `Get-ManifestSeam` seam regex, add optional `(?::[\d,\-]+)?` before the closing backtick (live line 66) | accept `` `path/to/file.ts:56-103` `` | This repo's manifests overwhelmingly cite a path **with its line range inside the backticks**. 5 of the 6 files cited by `qa/manifests/vector-gap-durability.md` carry one, so its extracted seam was `{vector-gap.test.ts}` alone, the real seam file `vector-gap.ts` was invisible, and the count came back **1 instead of 2**. Under-counting is the **silent** direction — it lets a capped seam through, which is ISS-346 itself. |
| H3 | prior-verdict test, any-`VERDICT: PASS`-line → **last** `VERDICT:` line (live line 193) | read the operative verdict | A verdict may hold several `VERDICT:` lines (dual/concurrent checks; successive cycles appended). `qa/verdicts/iss-104-closed-class-function-words.md` holds `FAIL` at line 12 and the operative `PASS` at line 174. A plain `-match` counts a PASS that a later FAIL superseded, so a re-opened unit inflates its seam's count forever — in the **refusing** direction, silently cancelling legitimate work. |

H1+H2 together are what make the check fire on ISS-346's own recorded case. See **Actual outputs**.

> **Cycle-1 status of this table (historical record, kept as-is; do not edit the rows above).** H1 and
> H2 are now **landed live**, independently of this unit, by the same concurrent lane, at sha
> `fc328d0688d0a6ab7349e241f51b394396bc13def4b1ce75e12479ae37a0c62a` (816 lines) — see "Fix cycle 1"
> below for the full timeline. H3 is **dropped**, not applied and not rebuilt: the live hook already
> solves the same problem with a materially different and better mechanism
> (`$script:VERDICT_VOCAB`/`Get-VerdictTokens`/`Test-VerdictPass`, cumulative rather than last-line). The
> diff this unit now ships carries **one remaining hunk** — a narrower gap (comma-separated line-range
> citations) that H2 as landed does not cover. See "Fix cycle 1 — response to cycle-0 FAIL and
> ISS-ISS346-001" below for the full account.

### 2. `qa/tests/mc-hooks-round-cap.ps1` — **NEW FILE**, the standing regression test, 12 assertions

The landed predicate shipped with **no test**. This is it. It runs the **real hook** against throwaway
temp trees under `$env:TEMP`, one fresh `session_id` per assertion so the once-per-session marker never
leaks, and never reads or writes this repo's `qa/`. It follows `qa/tests/mc-hooks-stall-detect.ps1` and
`qa/tests/mc-hooks-ledger-union.ps1`: a `Check` helper, a tree builder, exit 0/1, a named detail on
failure.

**Every ALLOW assertion is corroborated positively, not by absence alone.** This is the substantive
change the review forced (see "Review fold-in"). The hook's outer `catch` fails **open** with no stdout,
so `-not ($o -match 'round cap')` passes identically for "correctly allowed" and "crashed" — and that is
not hypothetical, because H1 crashes on real data. So `CheckAllowed` runs each ALLOW tree twice: once as
built (must not block), then with the `ScheduleWakeup` stripped (the MAKER predicate, which sits
immediately *after* ROUNDCAP, must then block). If ROUNDCAP threw on that tree's shape, MAKER never runs
and there is no output, so the assertion fails as it should. Per-tree rather than via one shared CONTROL,
because the `Round cap:` field, a multi-line FAIL→PASS verdict body and a FAIL verdict body are each a
distinct parse path.

Three deliberate departures from those two, all forced and all recorded in the file's own header:

- **The suite refuses to run against the wrong file.** Assertion 1 pins the *identity* of the resolved
  hook (it must contain the ROUNDCAP predicate) and exits before anything else if it does not, so a stray
  repo-local copy cannot silently absorb the suite and still print a green RESULT.

- **The event goes in on STDIN, not as `-InputJson`.** Passing the JSON as an argument through
  `powershell -File` loses the quoting and the hook dies in `ConvertFrom-Json`
  (measured: `EXIT exception: Invalid JSON primitive`). Stdin is also how the harness really delivers it.
- **The override parameter is `-HookPath`, not `-Hook`.** PowerShell variable names are
  case-**insensitive**, so a parameter named `$Hook` is the same variable as the resolved `$hook` and was
  silently clobbered by it — the first run reported the live hook while a candidate copy had been
  passed. The parameter exists at all because the hook is wired **user-level** from
  `D:/ai_os/.claude/hooks/`, not from this repo's `.claude/hooks/`, and because a candidate copy has to
  be measurable before it lands.

### 3. `qa/evidence/iss-346-round-cap-mechanical-check/delivery-gate-stop.roundcap-fixes.diff` — NEW

The 3-hunk patch for H1–H3, unified diff against the live hook at
sha256 `28c1ae4463875bf17be245d85cb5baeb92e0a764ad0ee844a652929d11047337`.

### Scope discipline

- `.claude/hooks/mc-sessionstart.ps1` — **not touched.** It is over D-014's cap (3 prior PASSed units:
  `ledger-shard-union-reader`, `mc-hooks-bolded-status`, `T-017b-snapshot-features-ledger`) and is a
  HUMAN_GATE this tick.
- `scripts/append_decision.ps1`, `.claude/settings.json`, `docs/DECISIONS.md`, `qa/contracts/`,
  `qa/issues*.jsonl` — not written. No issue ids were allocated from this worktree; the findings above
  are handed to the maker to file, so that D-019's per-lane id rules are not bypassed.
- The live hook is **byte-identical** before and after this unit. See **Actual outputs**.

---

## How to verify

```
# 1. The standing test against the LANDED hook (expect 9/12 -- three RED, the three defects above)
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-round-cap.ps1

# 2. The same test against the 3-hunk candidate (expect 12/12)
#    (build the candidate first: copy the live hook, apply the diff)
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-round-cap.ps1 -HookPath <candidate>

# 3. ISS-346's OWN recorded reproductions, verbatim from qa/issues.jsonl
grep -l 'VERDICT: PASS' qa/verdicts/*vector-gap*            # repro 1 -> exactly 2 files
sed -n '154p;157p;187p' qa/verdicts/vector-gap-tenant-id.md  # repro 2 -> the 3 rulings
git show wave/vector-gap-durability:qa/manifests/vector-gap-durability.md | grep -n 'Status:\|Round cap:'
                                                             # repro 3 -> ready-for-check, no class decision

# 4. Repro 3 end to end: real corpus + the branch's candidate manifest, through the hook
#    (167 manifests + 167 verdicts from master, plus vector-gap-durability.md from its branch)
```

Expected for 4: the **landed** hook prints nothing and traces
`EXIT exception: You cannot call a method on a null-valued expression`; the **candidate** blocks,
naming `vector-gap-durability` and its prior PASSes.

---

## Actual outputs

**Reproduction 1** (ISS-346's own text: "returns two files"):

```
$ grep -l 'VERDICT: PASS' qa/verdicts/*vector-gap*
qa/verdicts/vector-gap-record.md
qa/verdicts/vector-gap-tenant-id.md
```

**Reproduction 2** (lines 154, 157, 187 of `vector-gap-tenant-id.md`):

```
next unit touching this file — not a unit of its own, and explicitly not a third round on this
I considered whether this belongs in the **security class** (never capped). It does not: it is
ISS-122 is filed and must **not** be promoted into a round-3 unit on its own. It is verified
```

**Reproduction 3, part 1** — the prohibited unit's manifest is at `ready-for-check` with **no** class
decision on the record (it lives on `wave/vector-gap-durability`, not on master):

```
$ git show wave/vector-gap-durability:qa/manifests/vector-gap-durability.md | grep -n 'Status:\|Round cap:'
188:## Status: ready-for-check
```

**Reproduction 3, part 2 — the LANDED hook does NOT fire on it.** Real corpus (167 manifests + 167
verdicts) plus that manifest:

```
--- LIVE hook, real corpus + vector-gap-durability manifest (ISS-346 reproduction 3) ---
<no output>
--- trace tail ---
2026-09-28T08:52:36.0903594+05:30 EXIT exception: You cannot call a method on a null-valued expression.
```

With H1 alone the exception is gone but it still does not fire — `ROUNDCAP candidates=1 capped=0`,
because H2's under-count reports 1 prior PASS where there are more. The extracted seam was:

```
candidate seam: ['apps/api/src/indexing/vector-gap.test.ts']
  vector-gap-record:     seam=['.../testutils.ts', '.../vector-gap.ts', 'packages/db/src/lib/tenantscope.ts']
  vector-gap-tenant-id:  seam=['.../vector-gap.test.ts', '.../vector-gap.ts']
```

**Reproduction 3, part 3 — with H1+H2+H3 it fires**, on the ledger's own case, unmodified:

```
--- FIXED candidate (both hunks), real corpus, ISS-346 reproduction 3 ---
{"decision":"block","reason":"Delivery gate (fires once per session): D-014 round cap --
 vector-gap-durability (6 prior PASS(es) on its seam: index-skip-surfacing, ingest-indexing-pipeline,
 promote-tree-entities, vector-gap-record, web-ingest-and-meetingbot, whatsapp-ingestion-first-slice).
 ..."}
2026-09-28T08:54:54.7763867+05:30 BLOCK-ROUNDCAP sid=repro3fix2-... capped=vector-gap-durability (6 prior PASS(es) ...)
```

**ISS-346 reproductions: 3 of 3 satisfied.** Repro 3's second clause ("no step in the maker's tier-4
selection consulted either of the two facts above") is the one this unit closes: a step now does, and
the measured block above is that step consulting both facts. None left open.

**The standing test against the LANDED hook — 9/12:**

```
hook: D:/ai_os/.claude/hooks/delivery-gate-stop.ps1
  PASS  the resolved hook actually contains the ROUNDCAP predicate (not a shadow/stale file)
  PASS  a 0-PASS seam is ALLOWED (a verdict that only MENTIONS the file does not count toward the seam)
  PASS  a >= 2-PASS seam is REFUSED, naming the unit and the count
  PASS  a SECURITY-class candidate on the same 2-PASS seam is still ALLOWED (D-014, ISS-078)
  PASS  4a: FAIL-then-PASS COUNTS (the iss-104 shape -- operative verdict is the last line)
  FAIL  4b: PASS-then-FAIL does NOT count (a superseded PASS is not a prior round) -- blocked when it should have been allowed
  PASS  1 prior PASS is ALLOWED (threshold is >= 2; a FAILed prior round does not count)
  PASS  a written 'Round cap:' waiver stands the block down (cannot wedge a session)
  PASS  an already-checked unit on a capped seam is NOT a candidate (no block on settled history)
  FAIL  a prior seam cited WITH a line range (path.ts:56-103) still counts (ISS-346's own case) -- line-range citations were skipped
  FAIL  a PASSed prior unit with no extractable seam does not fail the hook open (null-unroll guard) -- the hook threw and failed open
  PASS  CONTROL: the MAKER predicate still fires downstream when ROUNDCAP is silent
RESULT: FAIL (3 assertion(s))
```

**The same test against the 3-hunk candidate — 12/12:**

```
hook: ...\scratchpad\cand.ps1
  PASS  the resolved hook actually contains the ROUNDCAP predicate (not a shadow/stale file)
  PASS  a 0-PASS seam is ALLOWED (a verdict that only MENTIONS the file does not count toward the seam)
  PASS  a >= 2-PASS seam is REFUSED, naming the unit and the count
  PASS  a SECURITY-class candidate on the same 2-PASS seam is still ALLOWED (D-014, ISS-078)
  PASS  4a: FAIL-then-PASS COUNTS (the iss-104 shape -- operative verdict is the last line)
  PASS  4b: PASS-then-FAIL does NOT count (a superseded PASS is not a prior round)
  PASS  1 prior PASS is ALLOWED (threshold is >= 2; a FAILed prior round does not count)
  PASS  a written 'Round cap:' waiver stands the block down (cannot wedge a session)
  PASS  an already-checked unit on a capped seam is NOT a candidate (no block on settled history)
  PASS  a prior seam cited WITH a line range (path.ts:56-103) still counts (ISS-346's own case)
  PASS  a PASSed prior unit with no extractable seam does not fail the hook open (null-unroll guard)
  PASS  CONTROL: the MAKER predicate still fires downstream when ROUNDCAP is silent
RESULT: PASS (12/12 assertions)
```

**The live hook was not modified.** sha256 before any work and after every mutation run:

```
28c1ae4463875bf17be245d85cb5baeb92e0a764ad0ee844a652929d11047337  D:/ai_os/.claude/hooks/delivery-gate-stop.ps1   (before)
28c1ae4463875bf17be245d85cb5baeb92e0a764ad0ee844a652929d11047337  D:/ai_os/.claude/hooks/delivery-gate-stop.ps1   (after)
```

**Mutation-run safety (D-020 as amended 2026-09-28).** Every falsification below ran through
`scratchpad/mutate1.py`: the byte backup is taken **per mutation, immediately before it**, never per
run; the restore sits in a `finally` that fires on normal return, on exception and on
`KeyboardInterrupt`; the test is wrapped in `timeout=600`; each run ends with **two** byte checks —
`backup-identical` (the restore) and `reference-identical` (against the intended post-fix content, the
HEAD-fidelity analogue for a file that is a scratchpad copy and therefore has no HEAD blob). Every
mutation reported `restore: backup-identical=True reference-identical=True`. The mutated file is a
**copy**; the live hook's sha256 above is the proof no mutant ever reached it. A first attempt that
hand-rolled the same thing in `sh` with a run-scoped `trap ... EXIT` is exactly the shape the D-020
amendment forbids, and it also mis-escaped one `sed` into a silent no-op — which is why the whole matrix
was re-run through a per-mutation, literal-anchor harness that refuses any anchor not matching exactly
once.

---

## Capability coverage

Baseline for every row: **GREEN-BEFORE 12/12, obtained from `scratchpad/cand.ps1` — the very file each
mutation is applied to** (printed at the head of the matrix run). Every falsifying edit is a
**single hunk in a single file**, `delivery-gate-stop.ps1`, named in "What changed". The matrix was
re-run in full after the review hardening; all seven still isolate.

| Capability | Check that covers it | Falsifying edit (single hunk, `delivery-gate-stop.ps1`) | Observed |
|---|---|---|---|
| The count comes from the prior unit's **manifest `## What changed`**, not from a mention elsewhere — a manifest whose "Scope discipline" line names a file it did *not* change is not a round on it | assertion 1 (0-PASS seam allowed; 3 priors cite the seam in their verdict **and** in a Scope-discipline line) | C1: `$scope = if ($sec.Success) { $sec.Value } else { $text }` → `$scope = $text` | GREEN-before: `PASS a 0-PASS seam is ALLOWED …` / RED-after: `FAIL a 0-PASS seam is ALLOWED … -- blocked a freely-pullable seam` |
| The threshold is **>= 2**, not >= 1 (D-013/D-014) | assertion 6 (1 PASS + 1 FAIL on the seam → allowed) | C2: `if ($hits.Count -ge 2) {` → `-ge 1` | GREEN-before: `PASS 1 prior PASS is ALLOWED …` / RED-after: `FAIL 1 prior PASS is ALLOWED … -- blocked below the threshold` |
| **Security class is never capped**, and a written class decision / cited waiver exempts the unit (D-014; ISS-078 found at round 5 after four PASSes) | assertions 3 and 7 | C3: `if ($p -match '(?im)^…Round cap:\s*\S') { continue }` → `if ($false) { continue }` | GREEN-before: `PASS a SECURITY-class candidate … is still ALLOWED` / RED-after: `FAIL … -- capped a security-class unit` (assertion 7 reddens with it) |
| The operative verdict is the **LAST** `VERDICT:` line, so a superseded PASS is not a round | assertion 5 (PASS-then-FAIL → 0) with assertion 4 as its inverse (FAIL-then-PASS → counts) | C4: `if ($vLast.ToUpperInvariant() -ne 'PASS') { continue }` → `if ($vt -notmatch 'VERDICT:?\s*PASS') { continue }` | GREEN-before: `PASS 4b: PASS-then-FAIL does NOT count` / RED-after: `FAIL 4b: … -- counted a superseded PASS as a prior round` |
| Only a unit **awaiting its first check** is a candidate — settled history never blocks | assertion 8 | C5: `if (Test-Path (Join-Path $qaDirC ("verdicts\{0}.md" …))) { continue }` → `if ($false) { continue }` | GREEN-before: `PASS an already-checked unit … is NOT a candidate` / RED-after: `FAIL … -- blocked on a unit that already has a verdict` |
| A seam cited **with a line range** (`path.ts:56-103`) still counts — the dominant citation style here, and ISS-346's own case | assertion 9 | C6: drop `(?::[\d,\-]+)?` from the seam regex | GREEN-before: `PASS a prior seam cited WITH a line range … still counts` / RED-after: `FAIL … -- line-range citations were skipped, so the count under-reported` |
| A PASSed prior unit with **no extractable seam** does not fail the hook open | assertion 10 | C7: `return ,$set` → `return $set` in `Get-ManifestSeam` | GREEN-before: `PASS a PASSed prior unit with no extractable seam does not fail the hook open` / RED-after: `FAIL … -- the hook threw and failed open` (output empty; trace: `EXIT exception: You cannot call a method on a null-valued expression`) |
| The suite cannot be pointed at the wrong file and still go green | assertion 1 (the resolved hook must contain the ROUNDCAP predicate; the suite exits immediately if not) | *not mutated — it is the guard on every other row* | Verified by construction: the `hook:` line plus a hard assertion. Run A prints `hook: D:/ai_os/...` then `PASS the resolved hook actually contains the ROUNDCAP predicate`. |
| **CONTROL (isolation)** — ROUNDCAP sits before the MAKER predicate; when it is silent the rest of the hook is unchanged | assertion 12 (no `ScheduleWakeup` in the transcript → the MAKER block must still fire) | *(stays green under C1–C7)* | GREEN under **all seven** mutations: `PASS CONTROL: the MAKER predicate still fires downstream when ROUNDCAP is silent`. This is what makes C1–C7 falsifications rather than parse breaks — and it is how an earlier C1 candidate (`Seam = (Get-ManifestSeam $vt)`) was **rejected**: it threw, reddened the CONTROL too, and isolated nothing. |

---

## Review fold-in (lifecycle "review")

The `senior-software-engineer` agent reviewed `qa/tests/mc-hooks-round-cap.ps1` in fresh context.
**Verdict: Warning**, three findings, **all three applied** and the whole suite plus the full mutation
matrix re-run afterwards:

1. **[medium] Six pure-absence assertions were vacuous.** `-not ($o -match $CAP)` passes identically on a
   correct ALLOW and on a crash, because the outer `catch` fails open with no stdout — and one shared
   CONTROL tree does not cover the distinct parse paths those six use. **Fixed** by `CheckAllowed`, which
   corroborates every ALLOW positively on its own tree (strip the wakeup, require the MAKER block).
   This is the finding that mattered: it was the same "measuring against something that cannot fail"
   error D-015 exists to stop, one level down in the test itself.
2. **[low] `event.json` written `-Encoding ascii`** would silently corrupt `cwd`/`transcript_path` if
   `%TEMP%` ever held a non-ASCII character. **Fixed** → `utf8`.
3. **[low] Hook resolution printed but never asserted** — a stray repo-local copy would absorb the suite
   and still print green. **Fixed** by assertion 1, which pins the resolved hook's identity (it must
   contain the ROUNDCAP predicate) and exits before anything else if it does not.

The reviewer **could not execute** the test (its Bash tool refused to invoke `powershell` in that
session) and said so plainly rather than asserting the figures; its findings are from static tracing, and
its trace independently predicted which three assertions would be RED against the live hook. That
prediction matched the measured run. Its two Open Questions: the 5-vs-0 / 8-vs-3 seam figures (confirmed
here by direct measurement over the real corpus — see the Round cap line at the top of this manifest) and
reproducibility of the run figures (measured twice here, before and after the hardening).

---

## Fix cycle 1 — response to cycle-0 FAIL and ISS-ISS346-001

Cycle 0 FAILed on one real defect: H3 (the packaged fix for reading a verdict's operative PASS) does
not apply to the live hook and is regex-unsound on this repo's own real corpus
(`qa/verdicts/vector-cosine-retriever.md`) — full detail in
`qa/issues.iss346.jsonl` `ISS-ISS346-001` and the cycle-0 verdict. Per the checker's own instructions
("For the maker to carry forward"), in priority order:

### The ground moved again, twice more, mid-cycle — recorded, not averaged over

`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` is a different git repo's file, uncommitted, and a
concurrent lane kept editing it *during this fix cycle's own session*:

| When | sha256 | Lines | State |
|---|---|---|---|
| Dispatch brief (before this session) | `28c1ae4463...047337` | 741 | naive verdict-read; `return $set` bug; no line-range support |
| Cycle-0 checker's run | `28c1ae4463...047337` | 741 | same as above (unchanged during check) |
| **This session, start** | `2d14024c41...107c31` | 802 | ISS-372 already noted this jump before I started |
| **This session, ~08:52** | `6f2e7a16c4...b03551da7` | 810 | H1 (`return ,$set`) now landed; H3-superseding `VERDICT_VOCAB`/`Get-VerdictTokens`/`Test-VerdictPass` already present |
| **This session, ~08:57 — final, unchanged since** | `fc328d0688...9ae37a0c62a` | 816 | H2 (single-range `:56-103`) now ALSO landed; comma-lists (`:12,40-44`) still not handled |

Re-verified identical (`fc328d0688d0a6ab7349e241f51b394396bc13def4b1ce75e12479ae37a0c62a`, 816 lines)
**before every test run in this session and again just now at close-out** — it has not moved since
~08:57 and nothing in this session wrote to it (confirmed: `D:/ai_os` was never opened for write; every
mutation/falsification below ran against disposable copies under this session's scratchpad, never the
live path).

### 1. H3 — dropped, not rebuilt

**Confirmed independently, not just deferred to the checker's finding.** The live hook's own comment
block directly above `$script:VERDICT_VOCAB` (currently lines 78–108) explains in the corpus's own
numbers ("21 verdicts disagree first-vs-last, 17 FAIL→PASS and 4 PASS→FAIL. No line order tells the two
apart") exactly why "read the last VERDICT line" (H3's whole premise) is the wrong model here, and ships
a materially better one: **cumulative** — `Test-VerdictPass` returns true if *any* vocabulary-restricted
PASS token appears anywhere in the file, order-independent, because "the question is not what this
verdict's final word is, but whether this seam has EVER been PASSed." That mechanism is already wired
into ROUNDCAP's verdict-count loop (`if (-not (Test-VerdictPass $vt)) { continue }`). **H3 is not merely
inapplicable text — the thing it was trying to build already exists, in a better form, and shipping it
(by hand-reconciling against the new code, which the checker explicitly warned against) would
reintroduce the exact newest-first-archive misread the live hook's own comment documents.** Dropped from
the diff entirely; the packaged diff now ships **one hunk only** (see item 4 below).

### 2. Assertion 4b was ALSO testing the rejected H3 model — found and corrected, not just H3 itself

This is a new finding this cycle, beyond ISS-ISS346-001's text, found by re-running the standing test
against the hook as it now stands (H1 and H2 already landed): **`qa/tests/mc-hooks-round-cap.ps1`
assertion 4b failed against the live hook even after H1+H2 landed**, because 4b encoded H3's rejected
premise ("a superseded PASS is not a prior round") rather than the live hook's actual, documented,
cumulative one. Verified directly: `RunHook` on a PASS-then-FAIL tree returns a `block` naming
`2 prior PASS(es)` — the live hook counts it, correctly, per its own comment. Fixed in place at
`qa/tests/mc-hooks-round-cap.ps1` (assertion 4 block, formerly titled "THE OPERATIVE VERDICT IS THE LAST
'VERDICT:' LINE"): retitled to describe the real cumulative-OR rule, 4a left as-is (still correct: a
later PASS counts), 4b changed from `CheckAllowed` (expects ALLOW) to `Check` (expects BLOCK / `2 prior
PASS`), with the reasoning and the re-run evidence recorded inline in the test file's own comments so
this cannot silently drift back.

### 3. Newest-first-archive + vocabulary-pollution fixture — added (assertions 11 and 12)

Modeled directly on the real file the checker used to find H3 unsound,
`qa/verdicts/vector-cosine-retriever.md` (PASS at its line 13, archived cycle-1 FAIL at its line 326,
and the actual defect-triggering prose at its real line 552, `"  verdict rule rather than in the
backlog."`). Two new assertions:

- **Assertion 11** (hook-level): two priors carrying a PASS-near-top / archived-FAIL-below /
  vocabulary-polluting-prose verdict body; asserts the real hook still finds `2 prior PASS` and caps the
  candidate.
- **Assertion 12** (static, no hook call): runs H3's *exact* proposed regex
  (`(?im)^[\s\-*#>|]*VERDICT:?[ \t]*([A-Za-z-]+)`, last match) directly against assertion 11's own
  fixture text and asserts it returns something other than `PASS`. Both demonstrated live — see
  **Actual outputs** below; assertion 12 reproduces the checker's own `RULE` finding exactly.

### 4. A narrower, real gap found and fixed: comma-separated line-range citations

The already-landed H2 (`(?::\d+(?:-\d+)?)?`) handles a single range (`:56-103`) but not a comma-list
(`:12,40-44`) — a shape this repo's own manifests use (assertion 8 in the standing test, unchanged since
cycle 0, exercises exactly this and still failed against the live hook at `fc328d0688...`, sha and line
count unchanged, confirmed just now). Packaged as the diff's only remaining hunk: `(?::\d+(?:-\d+)?)?` →
`(?::[\d,\-]+)?` at `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1:72` (current line; was line 66 at
dispatch). This is a **strict broadening** (accepts everything H2 already accepted, plus comma-lists),
verified by full-suite re-run against the patched candidate (below) with no assertion regressing.

### 5. Approver instructions and counts — corrected

- The diff Approver is asked to apply is now **one hunk**, not three; H1 and H2 need no action (already
  landed). `git apply`/`patch -p0` verified to succeed against the live file's current content (below).
- The test now has **14 assertions** (12 original + 2 new), and every count in this manifest below is
  the freshly re-measured figure, not carried over from cycle 0.

### Actual outputs — fix cycle 1 (fresh re-measurement, not carried over from cycle 0)

**D-015 — ISS-346's own recorded reproductions, re-run verbatim just now, union of
`qa/issues.jsonl` + `qa/issues.iss346.jsonl` (no other lane-shard file names ISS-346):**

```
$ grep -l 'VERDICT: PASS' qa/verdicts/*vector-gap*
qa/verdicts/vector-gap-record.md
qa/verdicts/vector-gap-tenant-id.md

$ sed -n '154p;157p;187p' qa/verdicts/vector-gap-tenant-id.md
next unit touching this file — not a unit of its own, and explicitly not a third round on this
I considered whether this belongs in the **security class** (never capped). It does not: it is
ISS-122 is filed and must **not** be promoted into a round-3 unit on its own. It is verified

$ git show wave/vector-gap-durability:qa/manifests/vector-gap-durability.md | grep -n 'Status:\|Round cap:'
188:## Status: ready-for-check
```

All three match verbatim, again. Corpus is now **168 manifests / 168 verdicts** on this branch (grew
from the cycle-0 checker's 169/167 and this unit's original 167/167 — expected, not a defect). None of
ISS-346's three recorded reproductions are left open.

**Reproduction 3 end-to-end, against the CURRENT live hook** (real corpus + `wave/vector-gap-durability`'s
candidate manifest copied in, via a disposable scratch tree — never this repo's own `qa/`):

```
{"decision":"block","reason":"Delivery gate (fires once per session): D-014 round cap --
 vector-gap-durability (8 prior PASS(es) on its seam: index-skip-surfacing, ingest-indexing-pipeline,
 post-review-fixes-2026-09-06, vector-gap-record, vector-gap-tenant-id, web-ingest-and-meetingbot,
 whatsapp-chat-view-speaker-names, whatsapp-ingestion-first-slice). ..."}
```

It now fires **without needing this unit's diff at all** — H1+H2 already landed cover it, because
several of the newer PASSed units on this seam cite it without a line range. This does **not** mean the
comma-list gap (item 4) is imaginary: assertion 8's second sub-case (`:12,40-44`, no bare-path fallback
in that tree) isolates it directly, below.

**Standing test, current live hook, sha `fc328d0688d0a6ab7349e241f51b394396bc13def4b1ce75e12479ae37a0c62a`
(816 lines) — 13/14, confirmed immediately before and after this whole session's work:**

```
hook: D:/ai_os/.claude/hooks/delivery-gate-stop.ps1
  PASS  the resolved hook actually contains the ROUNDCAP predicate (not a shadow/stale file)
  PASS  a 0-PASS seam is ALLOWED (a verdict that only MENTIONS the file does not count toward the seam)
  PASS  a >= 2-PASS seam is REFUSED, naming the unit and the count
  PASS  a SECURITY-class candidate on the same 2-PASS seam is still ALLOWED (D-014, ISS-078)
  PASS  4a: FAIL-then-PASS COUNTS (a later operative PASS in the same file)
  PASS  4b: PASS-then-FAIL STILL counts (cumulative -- a seam that passed once had a round on it, whatever a later cycle said)
  PASS  1 prior PASS is ALLOWED (threshold is >= 2; a FAILed prior round does not count)
  PASS  a written 'Round cap:' waiver stands the block down (cannot wedge a session)
  PASS  an already-checked unit on a capped seam is NOT a candidate (no block on settled history)
  FAIL  a prior seam cited WITH a line range (path.ts:56-103) still counts (ISS-346's own case) -- line-range citations were skipped, so the count under-reported; got:
  PASS  a PASSed prior unit with no extractable seam does not fail the hook open (null-unroll guard)
  PASS  a newest-first-archive verdict with vocabulary-polluting prose still counts its real PASS (models vector-cosine-retriever.md; the rejected H3 rule misreads this -- see assertion 12)
  PASS  the rejected H3 rule misreads assertion 11's fixture as 'RULE', not PASS (regex-unsound on this real-corpus shape)
  PASS  CONTROL: the MAKER predicate still fires downstream when ROUNDCAP is silent
RESULT: FAIL (1 assertion(s))
```

Exactly one failure — the comma-list edge case (item 4) — and it is the ONLY thing left to land.
Assertion 12's fresh run reproduces the checker's own finding exactly: the token is `RULE`.

**Diff applicability, fresh copy of the live file at the sha above:**

```
$ patch -p0 --fuzz=0 cand.ps1 < qa/evidence/iss-346-round-cap-mechanical-check/delivery-gate-stop.roundcap-fixes.diff
patching file cand.ps1
$ echo exit=$?
exit=0
$ sha256sum cand.ps1
4f88a19e0d6d7d6c72d35297098fe41ea2129c0c7b6b63d96998c09b24b266b9  cand.ps1
```

Clean apply, **no fuzz, no rejects**. Re-running the standing test against that exact patched file:

```
RESULT: PASS (14/14 assertions)
```

**Falsification 1 (re-verifying what cycle 0 got right, on the CURRENT hook) — reverting the
already-landed H1 reddens the null-unroll guard, and only that assertion:**

```
$ diff live-H1-reverted vs candidate: 'return ,$set' -> 'return $set' in Get-ManifestSeam
  FAIL  a PASSed prior unit with no extractable seam does not fail the hook open (null-unroll guard) -- the hook threw and failed open, or miscounted; got:
RESULT: FAIL (1 assertion(s))
```

**Falsification 2 (the security-class falsification the brief specifically asked for) — inverting the
D-014 class-based exemption to count-based reddens the suite, on the security assertion itself plus the
waiver assertion that uses the same code path:**

```
$ mutation: 'if ($p -match ...Round cap:...) { continue }' -> 'if ($false) { continue }'
  FAIL  a SECURITY-class candidate on the same 2-PASS seam is still ALLOWED (D-014, ISS-078) -- blocked when it should have been allowed
  FAIL  a written 'Round cap:' waiver stands the block down (cannot wedge a session) -- blocked when it should have been allowed
RESULT: FAIL (2 assertion(s))
```

The instrument still has real teeth on the dimension that matters most (D-014/ISS-078): a count-based
regression is caught, not silently absorbed. All falsification runs above executed against disposable
scratch copies under this session's scratchpad only; the live file's sha
(`fc328d0688d0a6ab7349e241f51b394396bc13def4b1ce75e12479ae37a0c62a`, 816 lines) was re-verified
unchanged immediately after each one, and again right now at close-out.

**The live file moved a FOURTH time, after all evidence above was captured, discovered at final
close-out re-verification:** `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` is now sha256
`5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162`, **823 lines**. Re-ran the applicability
check and the full suite one more time against this newest copy before closing out, rather than letting the
evidence above go stale silently:

```
$ patch -p0 --fuzz=0 cand.ps1 < .../delivery-gate-stop.roundcap-fixes.diff   # against the 823-line copy
patching file cand.ps1
exit=0
$ sha256sum cand.ps1
fe02a112563effd5df66711f2e468191b4bf9597bb5fc08191b56a7fafdca17b  cand.ps1
$ powershell ... -File qa/tests/mc-hooks-round-cap.ps1 -HookPath cand.ps1
RESULT: PASS (14/14 assertions)
```

Diff still applies clean, still reaches 14/14. The unpatched 823-line live file was not separately
re-run against the full 14-assertion suite after this last move (only the patched copy, above, and the
diff-apply step itself, which succeeded) — if the Approver sees a DIFFERENT sha than
`5d6e0994...c4d32ded074a51ec162` when landing this, re-verify applicability first, exactly as this
manifest had to do four times in one session.

**What I did not verify this cycle:** I did not re-run the full `Capability coverage` mutation matrix
(the 7-row table under "Capability coverage" above) against the current 816-line hook — those C1–C7
mutations targeted the ORIGINAL 741-line file's exact line contents and several of the anchors (e.g. the
`$scope = ...` line, the old verdict-read line) no longer exist verbatim in the current hook, since H1–H3's
underlying code has since been rewritten by the concurrent lane. Falsifications 1 and 2 above re-cover
the two most safety-critical rows (null-unroll guard, security-class-never-capped) directly against the
CURRENT hook; the remaining rows (threshold ≥2, waiver, already-checked, CONTROL isolation) are exercised
by the 13/14 and 14/14 suite runs above but not independently mutation-falsified against the new code in
this cycle. Flagging this rather than claiming full coverage.

---

## Blocked / disclosed

**The one remaining hunk is not applied to the live hook. I could not apply it, on the same grounds as
cycle 0.** Every write to `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` from this session would be
refused by the harness's auto-mode classifier as **`[Self-Modification]`** — that hook governs this very
session's Stop event — so it was not attempted; all testing above ran against disposable scratch copies,
and the live file's sha256 (`fc328d0688d0a6ab7349e241f51b394396bc13def4b1ce75e12479ae37a0c62a`, 816
lines) is unchanged from this session's ~08:57 measurement through close-out. That is why this ships as
a one-hunk patch plus an extended standing test rather than an applied edit, and why **this unit still
cannot claim ISS-346 is closed in the live hook** — only that H1 and H2 are already landed (by a
concurrent lane, independently of this unit), that the comma-list gap is real, measured and packaged,
and that H3's job is already done, better, by code already on disk.

**Landing the remaining hunk needs the Approver.** Against the live file **as of sha256
`fc328d0688d0a6ab7349e241f51b394396bc13def4b1ce75e12479ae37a0c62a` (816 lines) — re-verify this hash
before applying, per ISS-372's pattern of this file moving underneath a session**:

```
patch -p0 --fuzz=0 delivery-gate-stop.ps1 < qa/evidence/iss-346-round-cap-mechanical-check/delivery-gate-stop.roundcap-fixes.diff
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-round-cap.ps1 -HookPath <patched-file>
# expect: RESULT: PASS (14/14 assertions)
```

Verified in this session: `patch -p0 --fuzz=0` against a fresh copy of the live file at the sha above
applies cleanly with **no fuzz and no rejects**, exit 0, and the patched result reaches **14/14**. The
unpatched live file, tested the same way immediately before and after, holds at **13/14** (only the
comma-list assertion red — see **Actual outputs**).

**Two further things the Approver should see**, both beyond this unit's authority:

1. **The same unit was built at least three times concurrently, not just twice.** Updated this cycle:
   the table above shows the live file changing shape TWICE more during this single fix-cycle session
   alone (741→802→810→816 lines), landing H1 and H2 independently of this unit's own packaged fixes for
   them. D-019 solved concurrent *id* collisions; this is the same class one level up — concurrent *unit*
   collision on one enforcement file, now measured at three-plus simultaneous writers — and nothing on
   disk prevented any of it.
2. **H1 was a HIGH-severity finding, and it is now fixed live** (confirmed this cycle: `return ,$set` is
   in place at the current sha). It is recorded here only so the Approver can see it was real and is
   closed, not to ask for action.

---

## **Status:** checked-PASS (cycle 1)

**Handshake status:** checked-PASS
- Cycle 0 **FAIL** (H3's regex unsound on real newest-first-archive verdicts) -> cycle 1 **PASS**,
  verdict `qa/verdicts/iss-346-round-cap-mechanical-check.md` (cycle-0 FAIL preserved verbatim
  below an `# ARCHIVE` marker; verdict files here read newest-cycle-first). Merged to master.
- The checker **ruled on the assertion-4b rewrite instead of accepting it**: legitimate, because the
  OLD 4b encoded H3's rejected model, the more permissive reading that lets a seam with a
  later-superseded PASS dodge the cap -- the exact failure direction this unit exists to close. The
  hook's own comment documents 21 verdicts disagreeing first-vs-last (17 FAIL->PASS, 4 PASS->FAIL)
  and names over-counting as the safe direction, since a false block clears with one `Round cap:` line.
- **Both falsifications hold, reproduced by the checker's own mutations:** reverting H1 reddens the
  null-unroll guard, and inverting D-014's security-class exemption to count-based reddens 2
  assertions. That second one is the ISS-078 protection -- the reason the cap is class-based at all.
- The disclosed capability-coverage gap was **closed, not carried**: the checker found 3 of the 5
  un-re-run anchors still present verbatim in the 823-line hook and re-mutated all three itself;
  C4 is legitimately superseded and now covered by assertions 11/12, C6 by the diff-apply test.
- **Still owed by the Approver, not by this unit:** the one remaining hunk (comma-separated line
  ranges, `:12,40-44`) is verified re-applicable at `--fuzz=0` against the live hook's current sha
  `5d6e0994` but is deliberately **NOT applied**. Landing it in `D:/ai_os` is gated behind
  `qa/gates/ai-os-enforcement-hooks-uncommitted.md`.
- Unblocks **D-052 ruling 1**, which held the `mc-sessionstart.ps1` round-cap question until this
  unit landed so the decision is made against a working instrument rather than an argument.
- `ISS-ISS346-001` closed `open -> fixed` by the checker with evidence. No new issues this cycle.

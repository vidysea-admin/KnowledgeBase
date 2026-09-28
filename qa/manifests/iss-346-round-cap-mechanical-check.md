# iss-346-round-cap-mechanical-check

**Fix cycle:** 0 of max 3

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

### 2. `qa/tests/mc-hooks-round-cap.ps1` — **NEW FILE**, the standing regression test (196 lines)

The landed predicate shipped with **no test**. This is it. It runs the **real hook** against throwaway
temp trees under `$env:TEMP`, one fresh `session_id` per assertion so the once-per-session marker never
leaks, and never reads or writes this repo's `qa/`. It follows `qa/tests/mc-hooks-stall-detect.ps1` and
`qa/tests/mc-hooks-ledger-union.ps1`: a `Check` helper, a tree builder, exit 0/1, a named detail on
failure.

Two deliberate departures from those two, both forced and both recorded in the file's own header:

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
# 1. The standing test against the LANDED hook (expect 8/11 -- three RED, the three defects above)
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-round-cap.ps1

# 2. The same test against the 3-hunk candidate (expect 11/11)
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

**The standing test against the LANDED hook — 8/11:**

```
hook: D:\ai_os\.claude\hooks\delivery-gate-stop.ps1
  PASS  a 0-PASS seam is ALLOWED (a verdict that only MENTIONS the file does not count toward the seam)
  PASS  a >= 2-PASS seam is REFUSED, naming the unit and the count
  PASS  a SECURITY-class candidate on the same 2-PASS seam is still ALLOWED (D-014, ISS-078)
  PASS  4a: FAIL-then-PASS COUNTS (the iss-104 shape -- operative verdict is the last line)
  FAIL  4b: PASS-then-FAIL does NOT count (a superseded PASS is not a prior round)
  PASS  1 prior PASS is ALLOWED (threshold is >= 2; a FAILed prior round does not count)
  PASS  a written 'Round cap:' waiver stands the block down (cannot wedge a session)
  PASS  an already-checked unit on a capped seam is NOT a candidate (no block on settled history)
  FAIL  a prior seam cited WITH a line range (path.ts:56-103) still counts (ISS-346's own case)
  FAIL  a PASSed prior unit with no extractable seam does not fail the hook open (null-unroll guard)
  PASS  CONTROL: the MAKER predicate still fires downstream when ROUNDCAP is silent
RESULT: FAIL (3 assertion(s))
```

**The same test against the 3-hunk candidate — 11/11:**

```
hook: ...\scratchpad\cand.ps1
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
RESULT: PASS (11/11 assertions)
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

Baseline for every row: **GREEN-BEFORE 11/11, obtained from `scratchpad/cand.ps1` — the very file each
mutation is applied to** (printed at the head of the matrix run). Every falsifying edit is a
**single hunk in a single file**, `delivery-gate-stop.ps1`, named in "What changed".

| Capability | Check that covers it | Falsifying edit (single hunk, `delivery-gate-stop.ps1`) | Observed |
|---|---|---|---|
| The count comes from the prior unit's **manifest `## What changed`**, not from a mention elsewhere — a manifest whose "Scope discipline" line names a file it did *not* change is not a round on it | assertion 1 (0-PASS seam allowed; 3 priors cite the seam in their verdict **and** in a Scope-discipline line) | C1: `$scope = if ($sec.Success) { $sec.Value } else { $text }` → `$scope = $text` | GREEN-before: `PASS a 0-PASS seam is ALLOWED …` / RED-after: `FAIL a 0-PASS seam is ALLOWED … -- blocked a freely-pullable seam` |
| The threshold is **>= 2**, not >= 1 (D-013/D-014) | assertion 6 (1 PASS + 1 FAIL on the seam → allowed) | C2: `if ($hits.Count -ge 2) {` → `-ge 1` | GREEN-before: `PASS 1 prior PASS is ALLOWED …` / RED-after: `FAIL 1 prior PASS is ALLOWED … -- blocked below the threshold` |
| **Security class is never capped**, and a written class decision / cited waiver exempts the unit (D-014; ISS-078 found at round 5 after four PASSes) | assertions 3 and 7 | C3: `if ($p -match '(?im)^…Round cap:\s*\S') { continue }` → `if ($false) { continue }` | GREEN-before: `PASS a SECURITY-class candidate … is still ALLOWED` / RED-after: `FAIL … -- capped a security-class unit` (assertion 7 reddens with it) |
| The operative verdict is the **LAST** `VERDICT:` line, so a superseded PASS is not a round | assertion 5 (PASS-then-FAIL → 0) with assertion 4 as its inverse (FAIL-then-PASS → counts) | C4: `if ($vLast.ToUpperInvariant() -ne 'PASS') { continue }` → `if ($vt -notmatch 'VERDICT:?\s*PASS') { continue }` | GREEN-before: `PASS 4b: PASS-then-FAIL does NOT count` / RED-after: `FAIL 4b: … -- counted a superseded PASS as a prior round` |
| Only a unit **awaiting its first check** is a candidate — settled history never blocks | assertion 8 | C5: `if (Test-Path (Join-Path $qaDirC ("verdicts\{0}.md" …))) { continue }` → `if ($false) { continue }` | GREEN-before: `PASS an already-checked unit … is NOT a candidate` / RED-after: `FAIL … -- blocked on a unit that already has a verdict` |
| A seam cited **with a line range** (`path.ts:56-103`) still counts — the dominant citation style here, and ISS-346's own case | assertion 9 | C6: drop `(?::[\d,\-]+)?` from the seam regex | GREEN-before: `PASS a prior seam cited WITH a line range … still counts` / RED-after: `FAIL … -- line-range citations were skipped, so the count under-reported` |
| A PASSed prior unit with **no extractable seam** does not fail the hook open | assertion 10 | C7: `return ,$set` → `return $set` in `Get-ManifestSeam` | GREEN-before: `PASS a PASSed prior unit with no extractable seam does not fail the hook open` / RED-after: `FAIL … -- the hook threw and failed open` (output empty; trace: `EXIT exception: You cannot call a method on a null-valued expression`) |
| **CONTROL (isolation)** — ROUNDCAP sits before the MAKER predicate; when it is silent the rest of the hook is unchanged | assertion 11 (no `ScheduleWakeup` in the transcript → the MAKER block must still fire) | *(stays green under C1–C7)* | GREEN under **all seven** mutations: `PASS CONTROL: the MAKER predicate still fires downstream when ROUNDCAP is silent`. This is what makes C1–C7 falsifications rather than parse breaks — and it is how an earlier C1 candidate (`Seam = (Get-ManifestSeam $vt)`) was **rejected**: it threw, reddened the CONTROL too, and isolated nothing. |

---

## Blocked / disclosed

**H1–H3 are not applied to the live hook. I could not apply them.** Every write to
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` from this session was refused by the harness's auto-mode
classifier as **`[Self-Modification]`** — that hook governs this very session's Stop event. The refusal
also covered setting `$env:DELIVERY_GATE_HOOK`. Per the standing rule I did not route around it: I did
not retry through another tool, interpreter or sub-agent, and the sha256 above is the evidence that
nothing reached it. That is why the fixes ship as a measured patch plus a standing test rather than as
an applied edit, and why **this unit cannot claim ISS-346 is closed in the live hook** — only that the
check exists there, that it does not yet fire on ISS-346's own case, and that three named one-line
hunks make it fire, measured.

**Landing H1–H3 needs the Approver.** `git apply` of the diff onto
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`, then
`powershell -File qa/tests/mc-hooks-round-cap.ps1` → expect `RESULT: PASS (11/11 assertions)`.

**Two further things the Approver should see**, both beyond this unit's authority:

1. **The same unit was built twice concurrently.** The landed predicate cites D-049; D-043 item 2 is
   the entry that authorized it and says item 2 "is dispatched first". Two lanes were working the same
   ISS-346 at the same time on the same enforcement file. D-019 solved concurrent *id* collisions; this
   is the same class one level up — concurrent *unit* collision — and nothing on disk prevented it.
2. **H1 is arguably a HIGH-severity finding in its own right, not a polish item.** A single doc-only
   PASSed unit makes the Stop hook throw and fail open, which silences MAKER, REVIEW, CONFIG, BROWSER,
   BRAIN, SOURCES and the learning gate for the whole session — every delivery gate at once, silently.
   It is live on this machine right now for any project whose `qa/` has one candidate and one
   seam-less PASSed manifest. This repo is in that state. I have not filed it as a ledger issue,
   because allocating an id from a worktree would cut across D-019's per-lane rules; the maker should
   file it.

---

## Status: ready-for-check

**Handshake status:** ready-for-check

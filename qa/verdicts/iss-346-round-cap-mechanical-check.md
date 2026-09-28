# Verdict — iss-346-round-cap-mechanical-check

**Cycle checked:** 1

**VERDICT: PASS**

**SCOREBOARD:** standing-test-baseline 13/14 against the live hook (unpatched), matched exactly ·
14/14 against the packaged one-hunk candidate, matched exactly · D-015 ISS-346 reproductions 3/3
verbatim-matched · security-class falsification 2/2 assertions correctly reddened (ISS-078
protection intact) · null-unroll falsification 1/1 assertion correctly reddened (isolated against
the patched candidate) · assertion-12 static falsification reproduced independently against the
real corpus file (`RULE`, not `PASS`) · diff-applicability: 1/1 hunk applies clean at `--fuzz=0`
against the CURRENT live file, byte-identical result sha to the manifest's own claim · trial-merge
against current master: clean, 0 conflicts · disclosed capability-coverage gap: independently closed
(3 of 5 un-re-run rows re-mutated here and confirmed still isolating; the other 2 are legitimately
superseded/already covered) · ISS-ISS346-001: closed (`fixed`) in `qa/issues.iss346.jsonl`

**ISSUES-WRITTEN:** none (ISS-ISS346-001 updated to `status: fixed`, not a new issue)

**EXECUTOR:** self != executor. Fresh context, did not write this code or cycle-0's verdict.
Independently re-derived every figure in this report by direct command execution against disposable
scratch copies; nothing below is taken on the manifest's word alone.

---

## Live hook state — recorded at start and end of this run

| When | sha256 | Lines (`wc -l`) |
|---|---|---|
| Start of this checker run | `5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162` | 823 |
| End of this checker run | `5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162` | 823 |

**Did not move during this check** — `diff` between the copy taken at the very start of this run and
the live file at the very end returned no output (byte-identical). This matches exactly the sha the
cycle-1 manifest recorded as its own final, fourth-observed state
(`5d6e0994...823 lines`), so the ground was stable for the whole of my run — unlike the maker's own
session, which saw it move four times. Nothing in this check wrote to `D:/ai_os`; every mutation and
patch test below ran against disposable copies under this session's own scratch dir
(`/tmp/checker-iss346/`, i.e. `C:\Users\Lenovo\AppData\Local\Temp\checker-iss346\`).

One PowerShell `Get-Content | Measure-Object -Line` reading of the live file returned 797, not 823;
`wc -l` and a second, more careful measurement both gave 823, matching the manifest exactly, so I am
treating 823 (the two independently-agreeing tools) as correct and the 797 reading as a PowerShell
line-splitting artifact on this particular file, not a real second state. Flagging it rather than
silently discarding it.

---

## H1 / H2 verified landed live, independently

Read the live hook directly (not the manifest's account of it):

- **H1** — `Get-ManifestSeam`, line 83: `return ,$set` — present, exactly as claimed.
- **H2** — line 72: `(?::\d+(?:-\d+)?)?` (single-range form) — present, exactly as claimed. The
  comma-list form (`(?::[\d,\-]+)?`) is **not** present, confirming the one remaining gap is real and
  exactly as scoped.
- **H3's replacement** — `$script:VERDICT_VOCAB` (line 122), `Get-VerdictTokens` (line 123),
  `Test-VerdictPass` (line 139) are present, with the hook's own extensive comment block (lines
  ~109–121) documenting, in the corpus's own numbers ("21 verdicts disagree first-vs-last, 17
  FAIL→PASS and 4 PASS→FAIL"), exactly the newest-first-archive reasoning the manifest attributes to
  it. This is not the maker's paraphrase — I read the comment myself.

## Diff applicability — verified against the CURRENT live file, not a stale copy

```
$ sha256sum /tmp/checker-iss346/live-copy.ps1
5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162  (fresh copy of the live file, this run)

$ patch -p0 --fuzz=0 --dry-run live-copy.ps1 < .../delivery-gate-stop.roundcap-fixes.diff
checking file live-copy.ps1
dry-run exit=0

$ patch -p0 --fuzz=0 cand.ps1 < .../delivery-gate-stop.roundcap-fixes.diff
patching file cand.ps1
apply exit=0
$ sha256sum cand.ps1
fe02a112563effd5df66711f2e468191b4bf9597bb5fc08191b56a7fafdca17b  cand.ps1
```

That result sha is **byte-identical** to the one the cycle-1 manifest itself reports for "against the
823-line copy." Clean apply, no fuzz, no rejects, confirmed independently.

## Standing test — both runs reproduced exactly

**Against the live (unpatched) hook:**
```
RESULT: FAIL (1 assertion(s))
```
Only failure: "a prior seam cited WITH a line range (path.ts:56-103) still counts" — the disclosed,
scoped comma-list gap. Matches the manifest's claimed 13/14 exactly, assertion-for-assertion.

**Against the patched candidate (`fe02a112...`):**
```
RESULT: PASS (14/14 assertions)
```
Matches the manifest's claimed 14/14 exactly.

## Assertion 12 / H3 unsoundness — reproduced independently against the real corpus file

Ran H3's exact proposed regex (`(?im)^[\s\-*#>|]*VERDICT:?[ \t]*([A-Za-z-]+)`, last match) directly
against the real `qa/verdicts/vector-cosine-retriever.md` myself (not the synthetic fixture):

```
$ (H3 regex, last match, against qa/verdicts/vector-cosine-retriever.md)
RULE
```

Matches cycle-0's finding and the manifest's claim verbatim. Assertion 11 (real hook, same-shaped
synthetic fixture) and assertion 12 (H3's regex, same fixture) both ran PASS in my own standing-test
runs above, in both directions: the live hook correctly finds the real PASS; H3's rule does not. This
is a genuine differentiator, not a fixture engineered to pass only one way.

## Falsification 1 — revert H1 (`return ,$set` → `return $set`)

Reverting H1 against the raw *unpatched* live hook (which already carries the pre-existing,
unrelated comma-list failure) naturally produces 2 failures, not 1 — that is expected and is not a
discrepancy with the manifest, once the correct baseline is used. Reverting H1 against the *patched,
14/14* candidate — the comparison the manifest's own text specifies ("diff live-H1-reverted **vs
candidate**") — reproduces the manifest's claim exactly:

```
RESULT: FAIL (1 assertion(s))
  FAIL  a PASSed prior unit with no extractable seam does not fail the hook open (null-unroll guard)
```

Only that assertion reddens. Confirmed.

## Falsification 2 — invert the D-014 security-class exemption to count-based

Mutated `if ($p -match '(?im)^[\s\-*#>|]*Round cap:\s*\S') { continue }` → `if ($false) { continue }`
in the patched candidate:

```
RESULT: FAIL (2 assertion(s))
  FAIL  a SECURITY-class candidate on the same 2-PASS seam is still ALLOWED (D-014, ISS-078)
  FAIL  a written 'Round cap:' waiver stands the block down (cannot wedge a session)
```

Exactly the 2 assertions claimed. **This is the ISS-078 falsification and it holds**: a count-based
regression on this exact seam is caught by the suite, not silently absorbed. This is the single most
important thing this unit had to get right, and it is verified independently, by me, mutating the
code myself rather than trusting the manifest's account.

## D-015 — ISS-346's own recorded reproductions, re-run verbatim

Union of `qa/issues.jsonl` + `qa/issues.*.jsonl` checked; no lane shard other than
`qa/issues.iss346.jsonl` names ISS-346.

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

All three match verbatim. None left open.

For ISS-ISS346-001's own reproductions: its original repro 1 (the old 3-hunk diff failing to `patch`
at the old sha) no longer applies verbatim because that diff and that sha both no longer exist — this
is expected, not a lapse, since cycle 1's whole point is that the diff was repackaged to one hunk.
Its repro 2 (H3's regex returns `RULE` against the real corpus file) **does** still reproduce exactly
— re-run above, independently — and is now permanently captured as assertion 12 rather than being
left as a one-off finding.

## Disclosed gap — Capability coverage rows not re-mutated

The manifest discloses it did not re-run the full 7-row mutation matrix against the current 816/823-line
hook, re-covering only the 2 most safety-critical rows (null-unroll, security-class-never-capped) via
this cycle's falsifications, and asks the checker to judge whether that is acceptable.

**I checked whether the other 5 rows' anchors still exist verbatim in the current live hook, rather
than accepting "several no longer exist" at face value:**

- **C1** (scope restricted to `## What changed` section) — anchor `$scope = if ($sec.Success) {
  $sec.Value } else { $text }` **still present verbatim** (line 64).
- **C2** (threshold `-ge 2`) — anchor `if ($hits.Count -ge 2)` **still present verbatim** (line 288).
- **C5** (already-checked skip) — anchor `if (Test-Path (Join-Path $qaDirC ("verdicts\{0}.md" -f
  $m.BaseName))) { continue }` **still present verbatim** (line 245).
- **C4** (last-VERDICT-line read) — genuinely gone, **correctly so**: it targeted code that has been
  entirely replaced by the cumulative `VERDICT_VOCAB` mechanism, which is a real design improvement,
  not a regression, and is now independently covered by assertions 11+12 (see above).
- **C6** (line-range regex) — not a separate anchor to re-mutate; directly demonstrated by the
  diff-apply test itself (assertion 9 flips from FAIL on the unpatched hook to PASS on the patched
  candidate, isolated, nothing else moving).

Since three of the five anchors are untouched, I re-mutated all three myself against the current
patched candidate rather than leaving the question open:

```
C1 mutation: $scope = if ($sec.Success) {...} else {...}  ->  $scope = $text
  FAIL  a 0-PASS seam is ALLOWED ... -- blocked when it should have been allowed
  RESULT: FAIL (1 assertion(s))

C2 mutation: if ($hits.Count -ge 2)  ->  -ge 1
  FAIL  1 prior PASS is ALLOWED (threshold is >= 2; a FAILed prior round does not count) -- blocked
  RESULT: FAIL (1 assertion(s))

C5 mutation: if (Test-Path (Join-Path $qaDirC (...))) { continue }  ->  if ($false) { continue }
  FAIL  a 0-PASS seam is ALLOWED ...
  FAIL  an already-checked unit on a capped seam is NOT a candidate ...
  RESULT: FAIL (2 assertion(s))
```

Each mutation reddens exactly the assertion(s) the original cycle-0 capability-coverage table
predicted for that row, isolated, against the *current* 823-line hook — not the 741-line file the
table was originally written against.

**Ruling: the disclosed gap is not a coverage regression.** Between the maker's own two
falsifications (C3 security-class, C7 null-unroll), my three supplementary ones (C1, C2, C5), the
diff-apply test (C6), and the legitimate C4 replacement (now covered by assertions 11+12), **all
seven original capability-coverage rows are verified against the hook as it stands today**, not
merely against the file that existed when the table was first written. The maker's disclosure was
honest and correctly flagged as unverified rather than claimed — it just turned out, on independent
re-mutation, not to be a real hole.

## Trial-merge against current master

`git merge --ff-only master` in the actual worktree: **refused** ("Diverging branches can't be
fast-forwarded"), confirming the brief's description. `git rev-list --left-right --count
master...worktree-agent-a3d4ea73632cda74e` → `41  4` (branch 4 ahead, master 41 ahead of the merge
base at this moment — these counts have moved further since the dispatch brief's "3 ahead / master 26
ahead," consistent with a fast-moving master).

`git merge-tree --write-tree master worktree-agent-a3d4ea73632cda74e` → exit 0, tree
`2b0b9dacf2cdea792715efe5ba08add5e83c0952`, **no conflict markers, no textual conflicts**. Extracted
via `git archive <tree> | tar -x` into a disposable scratch directory (never touched the real
worktree or `D:/ai_os`). The extracted `qa/manifests/`, `qa/verdicts/`, and
`qa/tests/mc-hooks-round-cap.ps1` are present and, modulo a CRLF/LF normalization artifact of
`git archive`, byte-identical in content to the branch's own copies. Running the standing test from
the trial-merged tree against the live hook reproduces the same 13/14 result. **The merge is clean;
nothing in master's concurrent work collides with this unit's files.**

## Ruling on the assertion-4b rewrite (the sharpest question in the brief)

**This is a legitimate correction, not a self-serving weakening, and it moves the instrument in the
cautious direction, not the dangerous one.**

Reasoning, from the hook's own documented intent rather than the builder's account of it: the live
hook's comment block directly above `Test-VerdictPass` states plainly that for a round cap the
question is not "what is this verdict's final word" but "has this seam been PASSed before" —
cumulative, because a seam that PASSed at cycle 0 had a PASS round spent on it whatever a later cycle
said. The rejected H3 model (a superseded PASS does *not* count) is the model the original 4b
encoded, and it is the **more permissive** reading for a seam that already spent a PASS round: it
would let such a seam avoid contributing to the cap, i.e. **under-count**, which the hook's own
comment names as "the dangerous direction — it lets a capped seam through," and which is the literal
subject of ISS-346 itself. The rewritten 4b ("PASS-then-FAIL STILL counts") makes the cap fire *more*
readily on a seam with revoked history, which is the direction the hook's own comment explicitly
prefers ("over-counting only ever makes the gate LOUDER, and a false block is cleared by one `Round
cap:` line"). I independently confirmed via falsification 2 that the security-class exemption still
holds under this model, so the correction does not trade away the D-014/ISS-078 protection to get
here.

This is also not a case of a builder discovering its own test was inconveniently red and rewriting it
to match — the cumulative model is not the builder's invention; it is documented, pre-existing code
written by a different, concurrent lane, with its own measured corpus rationale, that the builder
read and deferred to rather than reconciling H3 against it by hand (which the checker's own cycle-0
instructions explicitly warned against). Verified by re-running `RunHook` on a PASS-then-FAIL tree
against the live hook myself: it returns `block` naming `2 prior PASS(es)`, confirming the hook's
actual behavior matches the corrected assertion, not the original one.

## What the maker must carry forward

1. **The one remaining hunk (comma-list line-range support) is still not applied to the live hook**,
   for the same self-modification reason as cycle 0 — this is correctly disclosed, not a defect. The
   Approver instructions in "Blocked / disclosed" are verified accurate: `patch -p0 --fuzz=0` against
   the live file at sha `5d6e0994...c162` (823 lines) applies clean, and the patched result reaches
   14/14 (confirmed above, sha `fe02a112...a17b`).
2. **ISS-ISS346-001 closed** (`status: fixed` in `qa/issues.iss346.jsonl`) by this verdict — H3's drop
   plus the live hook's own cumulative mechanism plus assertions 11/12 together satisfy it. No
   rework needed on this point.
3. **The disclosed capability-coverage gap is now closed** by this checker run (C1, C2, C5
   independently re-mutated and confirmed still isolating against the current hook). No rework
   needed; the maker does not need to re-run the full matrix itself next cycle unless the hook's
   shape changes again.
4. **ISS-372 (the live file moving, and the 56-file `D:/ai_os` dirty tree) is independently
   reconfirmed**: `git -C D:/ai_os status --porcelain` still shows 56 files, including the same three
   enforcement hooks (`aios-write-guard.ps1`, `delivery-gate-stop.ps1`, `edit-in-place-guard.ps1`).
   Still unresolved, still not this unit's job to fix, still worth the Approver's attention given how
   many units are now measuring against a moving, uncommitted enforcement file.
5. **Trial-merge is clean** — nothing blocks this branch from landing against current master on that
   count.

## Baseline (excluded per the unit brief, not attributed here)

Not measured against this unit: the 5 pre-existing lint-loc violations, `lint-dirsize` on
`apps/api/src`, the `lint-root` count, stale `docs/SNAPSHOT.md`, `scripts/` at 32/32 (ISS-345),
`lint-codex-hooks`, or the tracker-audit findings named in the dispatch brief.

---
---

# ARCHIVE — cycle 0 verdict (FAIL), preserved verbatim below

**Cycle checked:** 0

**VERDICT: FAIL**

**SCOREBOARD:** standing-test-baseline 3/3 claimed defects reproduced · D-015 ISS-346 reproductions 3/3 verbatim-matched · security-class falsification 1/1 (inverting the cap to count-based correctly reddens the suite) · diff-applicability 2/3 hunks usable (H1, H2 apply cleanly and independently falsify correctly; H3 fails to apply at any fuzz level and is empirically unsound against the real corpus)

**ISSUES-WRITTEN:** ISS-ISS346-001 (high, lane shard `qa/issues.iss346.jsonl`)

---

## Why FAIL, given the standing test itself is good

This unit's two deliverables are (1) `qa/tests/mc-hooks-round-cap.ps1`, the standing regression test,
and (2) `qa/evidence/.../delivery-gate-stop.roundcap-fixes.diff`, a 3-hunk patch (H1, H2, H3) the
manifest presents as measured and ready for the Approver to `git apply` onto the live hook, with the
explicit expectation "RESULT: PASS (11/11 assertions)".

**(1) is sound.** I reproduced every headline claim independently:

- Ran `powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-round-cap.ps1` against the
  live hook (`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`, sha256
  `28c1ae4463875bf17be245d85cb5baeb92e0a764ad0ee844a652929d11047337`) and got exactly the claimed
  **9/12**, failing on exactly the same three assertions the manifest names: "4b: PASS-then-FAIL does
  NOT count", "a prior seam cited WITH a line range ... still counts", and "a PASSed prior unit with no
  extractable seam does not fail the hook open".
- Re-ran ISS-346's three recorded reproductions verbatim from `qa/issues.jsonl` (D-015): repro 1
  (`grep -l 'VERDICT: PASS' qa/verdicts/*vector-gap*` → the same two files), repro 2 (lines 154/157/187
  of `vector-gap-tenant-id.md` → the same three sentences), repro 3 part 1 (`git show
  wave/vector-gap-durability:qa/manifests/vector-gap-durability.md | grep ...` → `Status: ready-for-check`,
  no class decision). All matched verbatim.
- Rebuilt repro 3 end-to-end myself (real corpus from this branch's `qa/manifests` + `qa/verdicts` — 169
  manifests / 167 verdicts here, vs the manifest's 167/167 measured earlier the same day; the corpus grew
  in between, which is expected and not a defect) plus the `wave/vector-gap-durability` candidate manifest,
  through the actual live hook via stdin with a Windows-path event payload: **no output**, and the trace
  log recorded `EXIT exception: You cannot call a method on a null-valued expression.` — exactly the
  claimed fail-open. Through the H1+H2 candidate (below) it blocks and correctly names
  `vector-gap-durability` and its prior-PASS list (mine shows 9, not the manifest's 6, because more units
  have PASSed on that seam since — same mechanism, larger corpus).
- **Falsification the brief specifically asked for:** built a candidate by `patch`-ing the live hook copy
  with H1+H2 (see below), then mutated the D-014 security-class exemption line
  (`if ($p -match '(?im)^[\s\-*#>|]*Round cap:\s*\S') { continue }` → `if ($false) { continue }`, i.e.
  inverted class-based to count-based) under a per-mutation backup + restore-in-`finally` + post-run
  byte-hash check (D-020 as amended). Result: the suite goes **RED (3 failures)** — the SECURITY-class
  assertion itself fails, plus 4b and the waiver assertion — confirming the test does NOT stay green when
  the ISS-078-class protection is broken. Restore verified `backup-identical = True`. This is the one
  falsification explicitly requested in the brief, and it passed: the instrument has real teeth on the
  dimension that matters most (D-014/ISS-078).
- Independently mutated `return ,$set` back to `return $set` (reverting H1) and confirmed the null-unroll
  assertion reddens exactly as claimed, then restored (byte-identical).
- Confirmed the three `senior-software-engineer` review fixes are actually present in the shipped test
  file: the `CheckAllowed` positive-corroboration helper, `-Encoding utf8` (not ascii) on the event JSON,
  and the hook-identity guard as assertion 1.
- Confirmed this unit's own round-cap eligibility claim ("5 verdicts name delivery-gate-stop.ps1, 0
  PASSed units changed it"): of the 5 verdicts on this branch naming that file, only one
  (`mc-hooks-bolded-status`) is PASS, and its own manifest states in terms "not touched here" for that
  file — so 0-vs-5 holds and the unit was correctly free to be pulled.

**(2) H3 is not usable as shipped, and this is a real, falsifiable defect, not a nitpick.**

The manifest records the live hook's sha256 as `28c1ae4463...047337` both "before" and "after" this
unit's session, and I confirmed that is still its exact hash right now — the file has not changed, during
their session or since. Given that, I tried to actually apply the packaged patch to a fresh copy of that
exact file:

```
$ patch -p0 --fuzz=10 cand.ps1 < qa/evidence/iss-346-round-cap-mechanical-check/delivery-gate-stop.roundcap-fixes.diff
patching file cand.ps1
Hunk #1 succeeded at 63 with fuzz 1.
Hunk #2 FAILED at 206.
1 out of 2 hunks FAILED -- saving rejects to file cand.ps1.rej
```

Hunk 1 (H1 `return ,$set` + H2 the line-range regex, both inside `Get-ManifestSeam`) applies cleanly and
I confirmed by inspection the resulting code is exactly the intended fix, and by falsification (above)
that it behaves correctly and reverts correctly. **Hunk 2 (H3) fails at every fuzz level** — not a
line-offset problem. The reason: the live hook does not contain the simple
`if ((Strip-Code ($vt -replace '\*\*', '')) -notmatch '(?m)^[\s\-*#>|]*VERDICT:?\s*PASS') { continue }`
line the diff's old side shows. It instead already has a considerably more careful mechanism —
`$script:VERDICT_VOCAB`, `Get-VerdictTokens`, `Test-VerdictPass` (live lines ~90-128) — with an extensive
comment explaining exactly why H3's proposed rule ("the operative verdict is the LAST `VERDICT:` line") is
**wrong** for a real, named, measured case in this corpus: verdicts are written both
cycle-appends-downward (`iss-104-closed-class-function-words.md`: FAIL at line 12, operative PASS at line
174 — H3 handles this one correctly) **and** newest-first-with-archive
(`vector-cosine-retriever.md`: PASS at line 13, an `# ARCHIVE` cycle-1 FAIL preserved below at line 326 —
H3 would misread this one, and the live hook's own comment says so: "21 verdicts disagree first-vs-last,
17 FAIL->PASS and 4 PASS->FAIL. No line order tells the two apart.").

I did not take that comment on faith. `qa/verdicts/vector-cosine-retriever.md` is a real file in this
repo's own corpus (`## VERDICT: PASS` at line 13, `# ARCHIVE — cycle 1 verdict (FAIL), preserved verbatim`
then `## VERDICT: FAIL` starting at line 313/326). I ran H3's own proposed regex
(`(?im)^[\s\-*#>|]*VERDICT:?[ \t]*([A-Za-z-]+)`, take the last match) directly against that file's real
text and it returned the token **`RULE`** — not PASS, not FAIL, because H3's capture group has no
vocabulary restriction (unlike the live hook's `VERDICT_VOCAB`) and matched an arbitrary prose word
following a stray occurrence of "verdict" elsewhere in the file. So H3, applied literally, is not merely
stale text — it is regex-unsound on real data, in a way the shipped test's assertion 4b (a synthetic
two-file, vocabulary-clean fixture) never exercises.

The practical consequence: the manifest's own "Blocked / disclosed" section tells the Approver to
`git apply` the diff and expect `RESULT: PASS (11/11 assertions)` (itself inconsistent with the "12/12"
figure used everywhere else in the same manifest). Following that instruction literally fails at the
`git apply` step. If instead someone reconciles H3 by hand against the live hook's actual
`Get-VerdictTokens`, they would be reintroducing, not fixing, a real regression on the newest-first-archive
shape the live hook already protects against — silently, since that shape isn't in the shipped suite's
fixtures.

I have **not** applied, reverted, or committed anything to `D:/ai_os` — all mutation and patch testing
above ran against disposable scratch copies (`%TEMP%\claude\checker-iss346\`), and the live hook's sha256
is unchanged (re-verified after every test in this session).

## What I am not disputing

- H1 and H2 are real fixes, verified to apply and to behave correctly, independently falsified.
- The standing test is a genuinely working instrument for the D-052 governance question — its baseline,
  its D-015 reproductions, and its security-class falsification all held up under fresh, independent,
  adversarial re-verification.
- The manifest's disclosure of the self-modification block, the concurrent-lane collision, and H1's
  standalone severity are all accurate and were not the subject of this check.

## Baseline (excluded per the unit brief, not attributed here)

Not measured against this unit: the 4 pre-existing lint-loc violations, 5 lint-dirsize failures, lint-root
count, stale `docs/SNAPSHOT.md`, or the 5 tracker-audit findings named in the dispatch brief.

## For the maker to carry forward

1. Either drop H3 from the shipped diff (ship H1+H2 only, which are genuinely ready) or rebuild it against
   the live hook's actual `Get-VerdictTokens`/`VERDICT_VOCAB` shape, adding a newest-first-archive fixture
   (e.g. modeled on `vector-cosine-retriever.md`) to `qa/tests/mc-hooks-round-cap.ps1` so this exact defect
   class cannot recur silently.
2. Correct the "Blocked / disclosed" section's Approver instructions (the `git apply` step as written does
   not succeed) and its "11/11" vs "12/12" inconsistency.
3. ISS-ISS346-001 filed (high) with full reproduction commands; the standing test itself needs no rework.

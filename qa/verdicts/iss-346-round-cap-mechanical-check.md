# Verdict — iss-346-round-cap-mechanical-check

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

# Verdict — iss-346-round-cap-mechanical-check

**Cycle checked:** 0
**Date:** 2026-09-28
**Contract:** `qa/contracts/delivery-gate.md`
**Checker binding:** `D:/KnowledgeBase/.claude/worktrees/agent-a035913864247fa58`, branch
`worktree-agent-a035913864247fa58`, HEAD `236a7e7`, clean at check time.
**Executor (manifest):** claude-opus-subagent · checker: claude-opus-subagent. `self != external
executor`: no `ANTHROPIC_BASE_URL` override, no external executor named in the manifest. The unit's
builder and this checker are separate fresh contexts.

```
VERDICT: FAIL
SCOREBOARD: 7/9 criteria met, 2/3 invariants hold
```

Everything this unit claims about its own predicate reproduced exactly, including the sha256. It
fails on **[C7]**, the contract's own cross-predicate audit criterion: one of the four defects it
fixed in `ROUNDCAP` is **live and silent in the sibling `MAKER` predicate of the same file**, and the
manifest says nothing about it while auditing a different, lesser defect across the same boundary.
C7's text is explicit that "checked, not affected" is acceptable and silence is not.

---

## What I re-ran myself (nothing below is read from the manifest)

1. `powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-roundcap-verdict-reading.ps1`
   → exit 0, **`RESULT: PASS (22/22 assertions)`**, T1–T9 green, M1–M6 each `RED after` with its
   CONTROL green, `POST-RUN the live machine-wide hook is byte-identical to its pre-run state`,
   `hook sha256: 5D6E0994…5162`. Identical to the manifest's paste, line for line.
2. `qa/probes/roundcap-ledger-reproductions.ps1` → exit 0.
   `ISS-346 repro 3 -- vector-gap-durability REFUSED at selection time: True  (2 prior PASS(es)`;
   `ISS-365 -- handshake-field-reader REFUSED at selection time: True  (4 prior PASS(es)`.
3. `qa/probes/roundcap-wouldblock-census.ps1` → exit 0. **1,021 manifests across five live trees,
   candidates=1 (this worktree's own, cleared by its `Round cap:` line), WOULD-BLOCK=0.** No false
   block anywhere.
4. **My own corpus re-derivation**, written from scratch, dot-sourcing the four parsers out of the
   live hook (`Strip-Code`, `Get-ManifestSeam`, `Get-VerdictTokens`, `Test-VerdictPass`):

```
verdict files=170  manifest files=171
OLD-reading sees PASS=77  NEW sees PASS=162  NEW-only=85  OLD-only=0 []  no-token=0
real ^VERDICT: PASS destroyed by Strip-Code = 76
FIRST<>LAST disagreements=21  (FAIL->PASS=15, PASS->FAIL=4)
MANIFESTS total=171 zero-seam=18
mc-sessionstart.ps1 : basename mentions=11  PASSed-and-touched=5
   [codex-hooks-links, handshake-field-reader, ledger-shard-union-reader,
    mc-hooks-bolded-status, T-017b-snapshot-features-ledger]
delivery-gate-stop.ps1: basename mentions=7   PASSed-and-touched=0
verdict files containing BOTH a PASS and a FAIL token = 20 (each counts once)
```
5. `node scripts/lib/mutate.mjs assert-clean` → **`MUTATIONS CLEAN: none outstanding`**.
   `git status --porcelain` → empty. `git hash-object` == `git rev-parse HEAD:<f>` on all four unit
   files (`SAME` ×4). Live hook sha256 == the manifest's "After" value. **No mutant on disk anywhere.**
6. `git diff HEAD~1 --stat` → 4 files, +922/−0, every one in the manifest's file list. `git -C D:/ai_os
   diff -U0` on the hook → 7 deleted lines, **all seven belonging to the previous unit** (the `fixgap`
   counter and the `Strip-Code` sentinel). No function, export, route, test or config key removed.
7. Five further live-hook runs of my own, in my own throwaway trees, for the findings below.

---

## The counting-semantics ruling (the dispatch brief asked for one; here it is)

**I rule with the builder. The brief's semantic 1 — "the operative `VERDICT:` line is the LAST in the
file" — is the wrong rule for this predicate, and I withdraw it for the cap count.** The builder's
substitution, *any operative-form PASS counts as one prior PASS*, is correct. Four measurements:

1. **The 21-verdict figure is right.** I re-derived it independently: **21** verdicts disagree
   first-vs-last. Both conventions confirmed by line number: `iss-104-closed-class-function-words.md`
   appends downward (`## VERDICT: FAIL` line 12, `## VERDICT: PASS` line 174) and
   `vector-cosine-retriever.md` is newest-first (`## VERDICT: PASS` line 13, `# ARCHIVE — cycle 1
   verdict (FAIL)` line 313, `## VERDICT: FAIL` line 326). No line-ordering rule separates them, so
   "last" silently inverts one convention. The builder's *breakdown* is off — it reports 17 FAIL→PASS
   where the measurement gives 15 (two disagreements are other token pairs) — but the load-bearing
   total reproduces.
2. **It errs in the right direction.** Over-counting refuses a pullable seam: loud, and cleared by one
   `Round cap:` line. Under-counting lets a capped seam be worked again: silent, and it is exactly
   what ISS-346 and ISS-365 record. A safety cap must err loud. Measured cost of the loud direction:
   **0 false blocks over 1,021 manifests**, and of the 8 verdicts read as PASS with no inline
   `VERDICT/RESULT/STATUS: PASS` line, I inspected all 8 by hand — every one is a genuine
   `## Verdict` → `PASS` heading form (`post-review-fixes-2026-09-06`, `speaker-block-floor`,
   `T-020-ingestion-source-seam`, …). **Zero false-positive PASS reads.**
3. **It cannot double-count, and I tested the rule the other way as asked.** `Test-VerdictPass` is a
   **per-file boolean**, so an archived FAIL-then-PASS pair contributes exactly one. Measured: **20
   verdict files hold both a PASS and a FAIL token; all 20 count once.** Two cycles of one unit live
   in one file, so cycles cannot double-count either. The predicate additionally skips the
   candidate's own slug, dedups priors with `Select-Object -Unique`, and requires a matching manifest
   — which also excludes a dual-check `<slug>.b.md` (its `BaseName` is `<slug>.b`, so
   `qa/manifests/<slug>.b.md` does not exist and the row is dropped). No double-count path exists.
4. **`iss-104` reads correctly under it** — the one property the last-line rule existed to protect.

**Tokenisation is also sound, not merely lucky.** The vocabulary restriction is load-bearing: I
confirmed the unrestricted form the builder describes would return prose tokens, and that the
restricted form produces `OLD-only = 0` — i.e. the new reading loses nothing the shipped reading saw.

---

## The four claimed defects — each verified independently, before and after

| # | Defect | Real before the fix? | Gone after? |
|---|---|---|---|
| 1 | result line read through `Strip-Code` | **Yes, measured by me:** the shipped reading sees **77** PASSes; **76** verdicts hold a real `^VERDICT: PASS` that `Strip-Code` destroys | **Yes: 162**, `OLD-only=0`. M2 (restore the old reading) goes red with its control green |
| 2 | `return $set` unrolled → predicate **failed open** | **Yes:** 18 of 171 manifests have no extractable seam; the unrolled form returns `$null`/a bare string, `.Contains()` throws, brake 3 swallows it, cap silent. One-element sets degraded to *substring* matching | **Yes.** M4 red / control green. Fail-open probed directly: T7 asserts a PASSed **prior** with no seam does not silence the predicate; my own run of a **candidate** with no seam produced a clean `ROUNDCAP candidates=1 capped=0` trace with no exception — no crash, no swallow. See finding 3 for the residual *silence* this leaves |
| 3 | `` `file:line` `` not a seam | **Yes, re-derived independently:** exactly **3** manifests lose their seam *entirely* without the `:line` clause — `jobkey-collision-detection`, **`mc-hooks-bolded-status`**, `topicrefs-arg-guard` — plus 10 partially reduced. The named one is a real prior PASS on the ISS-365 seam, and it contributed zero | **Yes.** M5 red / control green, and `mc-hooks-bolded-status` now appears in my own PASSed-and-touched set |
| 4 | candidate scan read only the legacy `Status:` | **Yes:** `qa/manifests/handshake-field-reader.md` carries only `**Handshake status:**`, so it was never a candidate | **Yes** in `ROUNDCAP`. M6 red / control green. **But see [C7] — not audited into the sibling predicate, where it is still live.** |

---

## FAILURES

```
FAILURES:
- [C7] sev: high · defect 4 (the canonical `**Handshake status:**` field) was never audited across
  the sibling `MAKER` predicate in the SAME file, where it is live and SILENT: a manifest at
  `**Handshake status:** ready-for-check` with no verdict reads `pend=0` and the gate says nothing,
  machine-wide. C7 requires the audit and accepts "checked, not affected"; it does not accept
  silence. The manifest audited defect 1 across to MAKER (correctly) and defect 4 not at all — the
  more dangerous of the two, because this one is blindness, not a wrong label ·
  fix direction: state the audit result for defect 4 in the manifest and file the sibling issue; the
  MAKER *fix* itself needs its own authorization (D-049 names the round-cap check, not a second
  predicate), so the fix cycle is the disclosure, not the code · issue: ISS-A035913-001
- [C1] sev: high · consequence of the above, scored against the artifact as it now stands and NOT
  blamed on this unit: `delivery-gate-stop.ps1` is not yet a reader that sees a `ready-for-check`
  manifest "in every markdown form this repo actually writes". `ROUNDCAP` now does; `MAKER`
  (line 375) does not. Pre-existing; needs its own authorized unit · issue: ISS-A035913-001
- [I2] sev: high · "blindness is the expensive failure … neither is acceptable as a shipped state."
  Noise measured at exactly zero (0 false blocks / 1,021 manifests; 0 false PASS reads / 170
  verdicts), and blindness is enormously reduced — but two blind classes ship: the MAKER field
  blindness above, and a `ROUNDCAP` bypass by manifest *wording* · issue: ISS-A035913-003
```

**Evidence for ISS-A035913-001**, my own run of the real hook in my own throwaway tree, identical
trees but for the field name:

```
MAKER  legacy-Status manifest blocked = True
   trace: BLOCK-MAKER pend=1 unclosed=0 queue=0 fixgap=0
MAKER  canonical-Handshake-status-only manifest blocked = False
   trace: MAKER pend=0 unclosed=0 queue=0 fixgap=0 scheduled=False
```

**Evidence for ISS-A035913-003**, same construction, same seam with two real prior PASSes, the only
difference being whether the candidate's `## What changed` backticks the path:

```
ZERO-SEAM-CANDIDATE  A backticked-path candidate blocked = True
                     B prose-only candidate blocked = False
   B trace: ROUNDCAP candidates=1 capped=0
```

A unit can therefore evade the mechanical cap by writing its seam in prose — and **18 of this repo's
171 manifests are already in that shape.** The hook's comment (`no extractable seam -> no claim, stay
silent`) shows the silence is deliberate, so this is a scope limit rather than a bug; what fails is
that it is **absent from the manifest's "What this unit does not fix"**, which discloses six smaller
things. The trace `candidates=1 capped=0` reads as "checked, nothing capped", which is the false
confidence ISS-346 exists to remove.

---

## Criteria and invariants, itemised

| | Verdict | Evidence |
|---|---|---|
| **C1** every handshake form seen by every reader | **not met** | `MAKER` blind to `**Handshake status:**` (measured above). Pre-existing; `ROUNDCAP` itself met |
| **C2** quoted prose not counted | met | candidate scan runs on `Strip-Code`d text; T5 asserts mention ≠ touch, and I re-derived it from the corpus: `delivery-gate-stop.ps1` **7 basename mentions / 0 PASSed units touching**; `mc-sessionstart.ps1` **11 / 5** |
| **C3 / C4** highest cycle, stamp on its own line | met (n/a) | `ROUNDCAP` reads no cycle stamp; untouched by this unit |
| **C5** fixtures pinned against the REAL corpus | **met, and this is the unit's strongest property** | every one of T1–T9 traces to a named real file — `iss-104` (12/174), `vector-cosine-retriever` (13/326), `mc-hooks-bolded-status` (`file:line`), `handshake-field-reader` (canonical field) — all four of which I verified by line number. Not one fixture is authored from the fix |
| **C6** old-vs-new re-derivation over the real corpus, itemised | met | 77 → 162 with `OLD-only = 0 []` — the itemisation is the exception list, and it is empty; I reproduced every figure |
| **C7** defect audited across every predicate, result stated | **not met** | above |
| **C8** fail-open preserved | met, improved | 27 real-hook invocations across my runs, no exception, no crash; defect 2's fix removes the throw that brake 3 was swallowing |
| **C9** budgets and per-predicate markers hold | met | `$markerCap` is `ROUNDCAP`'s own path, distinct from `$markerMaker`; a `ROUNDCAP` block does not write the MAKER marker, so it cannot consume MAKER's budget. Not proven across a real multi-turn session (see Known gaps) |
| **I1** never writes outside `%TEMP%/claude-delivery-gate` | met | `$markerCap` and `log.txt` both under `$markerDir`; the census writes nothing at all; the test redirects `$env:TEMP` per run |
| **I2** neither blindness nor noise as a shipped state | **not met** | above |
| **I3** mutation evidence per D-020 as amended by D-050-SPEAKER ruling 3 | **met, and above the minimum** | mutants written to copies in a temp dir — the live file is never edited, so there is no window at all; `Wait-Job -Timeout 90` on every invocation; **no `trap … EXIT` anywhere** (the 2026-09-28 28-file loss shape is absent by construction); per-mutation parse check before the red is believed; a vacuity guard that refuses an anchor that does not match; POST-RUN sha256 against the *pre-run hash*, not a backup — plus my own `git hash-object` vs `git rev-parse HEAD:<f>` on all four files, and `mutate.mjs assert-clean` |

---

## CAPABILITY-COVERAGE: 6/8 rows reproduced by my own execution · 2 declared controls · 1 disclosed UNVERIFIED

Rows 1–6 (M1–M6): each red-after and each CONTROL-green in my own run of the test, not read from the
manifest. Every edit is a single hunk in the one file named in "What changed", each is applied to a
**copy** of the hook in a temp tree, and each mutant is parse-checked before its red is credited — so
no red comes from a mutant that merely fails to load. Rows 7 and 8 are declared controls with
intentionally no mutation, and both reasons are sound: an edit that reddens row 7 ships the ISS-078
class of data leak, and row 8's property is the wrong implementation this unit had to avoid — I
re-derived its corpus number myself (7 mentions / 0 touches).

**Methodological deviation I judge adequate, stated rather than waved through.** The skill wants each
row's green-before taken from the copy. Here the *named check's* green comes from the unmutated-hook
run and the **control's** green comes from inside the mutant tree. What that rule guards against is a
red produced by a broken copy; that risk is closed twice over here — the mutant is a byte copy
differing in one hunk, it is parse-checked, and a control assertion runs green **in the mutant tree
itself**. I accept the rows.

**T6 (bold-prefixed fields) — accepted as honest enumerated debt, not a coverage gap.** I verified
the redundancy claim rather than taking it: clause 1's separator class `[^\w\r\n]{0,4}` matches
`:** ` in exactly 4 characters, so dropping the emphasis strip leaves `**VERDICT:** PASS` matching
anyway and **no single-hunk edit can isolate the property.** The builder measured this, reported the
vacuous result, and withdrew the mutation instead of dressing it up. The one defect is that the row
carried **no issue id**, which is what turns a disclosure into enumerated debt — I have assigned it:
**ISS-A035913-007**. Two further self-reported defective mutations (M3's CRLF anchor, M5's escaped
backtick) both surfaced as `the mutation is VACUOUS`, which is the guard working; disclosing them was
correct.

**LIVE-BROWSER: not-applicable** — changed paths are `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`,
`qa/tests/`, `qa/probes/`. No route, page, component or rendered surface; `qa/ui-surfaces.json`
matches none of them. **Persona walk: the `skip` reason is true**, tested against the changed paths
rather than accepted.

---

## Disclosures I was asked to judge

- **ISS-346 reproduction 3's substitute is sound, not circular.** The load-bearing half of that
  reproduction is the *prior count*, and both priors are the **real** `vector-gap-record` and
  `vector-gap-tenant-id` manifests and verdicts; the seam is extracted from the real manifest at run
  time, not hand-written. Only the candidate stub is synthesised, and its absence is mandated by
  D-044, which this very unit is ordered to satisfy first. D-015 permits a deliberately-unreproduced
  case when it is named with its reason; it is named, the reason is structural, and the synthesised
  part is the one part that cannot affect the measurement. I also read back the row's other two
  reproductions (`vector-gap-tenant-id.md` lines 154/157/187) myself.
- **ISS-365's count: four is right, and the ledger row is wrong.** Independently measured, PASSed
  units touching `.claude/hooks/mc-sessionstart.ps1` = **5** in this corpus; excluding the candidate
  itself leaves **4 priors** — `codex-hooks-links`, `ledger-shard-union-reader`,
  `mc-hooks-bolded-status`, `T-017b-snapshot-features-ledger`. The ledger row names only three
  (it omits `codex-hooks-links`) and says "3 before, 4 after"; the correct figures are **4 before,
  5 after**. I own that correction and it is recorded. Note that the *manifest's* own corpus line
  `[New] PASSed-and-touched=4` is also wrong for a different reason — it omits
  `mc-hooks-bolded-status`, the very unit its fix-3 prose says becomes reachable. The probe's own
  prior list is correct, so the conclusion stands on correct data; the reported summary does not
  (ISS-A035913-006).
- **The `MAKER` `Strip-Code` sibling defect: confirmed, and filed as mine** (ISS-A035913-002), at
  **medium**, not high, and here is why the severity is lower than the brief expected. `$backlog =
  ($pend + $unclosed + $queue + $fixgap) -gt 0`, so a misclassified PASS still makes the gate
  **block** — the loud/silent direction is intact. What breaks is the *message*: I reproduced
  `fixgap=1` where `unclosed=1` is correct, which tells the maker it owes a fix cycle when it owes a
  close-out. That is precisely the defect ISS-186 closed, reintroduced on ~45% of verdicts
  (76 of 170). A wrong instruction, not a silent gate.
- **The census may read other projects' trees. I agree it is admissible, and I verified the
  read-only claim rather than accepting it.** By inspection the script uses only `Get-Content`,
  `Get-ChildItem`, `Get-FileHash`, `Select-String` and `[regex]` — no `Set-Content`, no `New-Item`,
  no `Out-File`, no `Add-Content` — and it never invokes the hook, so no other project's
  per-predicate marker or block budget is touched. My own run confirmed identical output. The
  binding rule exists to stop a checker *judging* or *writing* another project's qa/; a
  blast-radius census of a hook that fires in all of them writes nothing and judges nothing, and
  measuring it any other way is impossible. One real defect in it, filed at medium
  (ISS-A035913-004): the header claims the parsers are "extracted verbatim from the live hook", and
  three of them are — but the candidate-status regex at line 33 is **hand-copied in its pre-fix
  legacy-only form**, i.e. the exact defect 4 this unit fixed. Materiality today, measured: **0
  divergent manifests out of 1,021**, so the numbers above stand; it is a latent under-report.
- **The D-049 shared-log obligation: the builder's statement is inaccurate, and I correct it here
  rather than repeating it.** It reports the entry "has NOT been written". **It exists** —
  `D:/ai_os/decisions/log.md:1827`, dated 2026-09-28, "Machine-wide Stop hook
  `delivery-gate-stop.ps1`: three fixes …", whose item 3 is the `ROUNDCAP` predicate, which cites
  D-049 as its authority and carries the placement reasoning. What is true is narrower and still
  matters: that entry records `after 28c1ae44…7337`, which is now the **pre**-unit state, and
  `grep -c 5d6e0994 D:/ai_os/decisions/log.md` = **0**. So the shared log has no trace of this
  unit's five counting fixes or the resulting byte state. The obligation is **stale, not absent**
  (ISS-A035913-005). It is outside this worktree; I did not write it.
- **Can a governance check PASS with no live-session evidence? For this unit's claims, yes — and I
  can give a better reason than the builder did.** Every unexercised surface it lists (the 40 MB
  tail read, the turn-boundary `tool_result` / `task-notification` discrimination, the `$scheduled`
  scan) belongs to the **MAKER** predicate. `ROUNDCAP` reads **no transcript at all**: it reads
  `cwd/qa/`, and the test drives it through the real hook binary 27 times over real corpus files.
  The one genuinely unproven `ROUNDCAP` surface is its **once-per-session `$markerCap`**, asserted
  only within single runs and never across a real multi-turn session. That is a Known gap, not a
  FAIL line — and it is not why this unit fails.

## Authorization — verified against both entries' text, not their subjects

**The builder's correction of my dispatch brief is right, and I verified it from D-049's own words.**
D-049 (2026-09-28, **`Approved-by: Umesh`**) names "the ISS-346 mechanical round-cap check"
explicitly, and its `Changes-authorized` reads `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`
**(machine-wide)**. Its "Why" states the D-043 defect in terms I could check: D-043 presented the
file as an enforcement path "**this repo** requires you to authorize by name", which is false — the
file lives at `D:/ai_os/.claude/hooks/` and is registered in the **user-level**
`C:/Users/Lenovo/.claude/settings.json:124`, so a `D:/KnowledgeBase` decision has no authority over
it. **There is no authorization gap for the hook file.** D-052 ruling 1 ("Land ISS-346 first, then
decide", `No cap waiver is granted by this entry`) sequences it, and D-044's ordering holds:
`qa/manifests/vector-gap-durability.md` does not exist in this tree. The one unmet *condition* of
the authorization is the stale shared-log entry above.

**Three confirmations requested, all three verified:**
- **No cap waiver taken.** The manifest's `Round cap:` line claims `not applicable — 0 prior PASSed
  units touched the delivery-gate-stop.ps1 seam`, and I measured that independently: **0**. A true
  claim, not a waiver.
- **`qa/gates/mc-sessionstart-handshake-reader-round-cap.md` is OPEN** — `**Status:** OPEN — needs
  the Approver`, no `Answered:` line.
- **`.claude/hooks/mc-sessionstart.ps1` untouched** — absent from `git diff HEAD~1 --name-only`; last
  touched at `b1c32fc`, the `handshake-field-reader` merge.

## Ledger obligations

- **ISS-190 → `critical`.** I agree with the builder and with the previous checker, and I am acting
  on it. The reason is not the line count: the **verified byte state of a Stop hook that fires in
  every project on this machine is pinned by no commit in any repo**, `git -C D:/ai_os diff --numstat`
  is `224 7` on that file alone, and `git -C D:/ai_os status --porcelain` shows **four** modified
  enforcement hooks plus shared rules and skills. One `git checkout` or `git stash` in `D:/ai_os`
  silently reverts the enforcement that two authorized units and this verdict all cite as evidence.
  That is unrecoverable-by-accident and machine-wide, which is what separates critical from high.
  Per D-019 I do **not** edit the canonical row in place (an in-place edit breaks
  `qa/issues.jsonl merge=union` and two lanes have already collided on that file): the promotion is
  appended to my lane shard and belongs to the sweep's single consolidation writer to reconcile.
- **ISS-346 and ISS-365 stay `open`.** No status moves to `fixed` on a FAIL. The measured progress is
  recorded: both recorded cases are now refused at selection time, and ISS-365's prior count is
  corrected to 4 before / 5 after.

## Known gaps (not FAIL lines)

1. `ROUNDCAP`'s once-per-session `$markerCap` is unproven across a real multi-turn session.
2. The predicate accepts **any** non-empty `Round cap:` value, including `not applicable`. It forces
   a decision onto the record; it does not validate it. Pre-existing, and the mitigation is that a
   checker reads the line — as I read this one.
3. `RESULT: PASS (22/22 assertions)` is a hardcoded string, not a count of assertions executed. It is
   correct today; it will go stale silently the first time an assertion is added.
4. `lint:structure` is not green for pre-existing reasons. I confirmed this unit adds no
   `packages/` code, so none of it is attributable here.

```
CAPABILITY-COVERAGE: 6/8 rows reproduced by my own execution, 2 declared controls, 1 row disclosed
                     UNVERIFIED and now carrying its id (ISS-A035913-007)
LIVE-BROWSER: not-applicable (.claude/hooks/delivery-gate-stop.ps1, qa/tests/, qa/probes/ — no UI surface)
ISSUES-WRITTEN: ISS-A035913-001, ISS-A035913-002, ISS-A035913-003, ISS-A035913-004,
                ISS-A035913-005, ISS-A035913-006, ISS-A035913-007,
                ISS-A035913-008 (ISS-190 high→critical), ISS-A035913-009 (ISS-365 count correction)
EXECUTOR: claude-opus-subagent (checker: claude-opus-subagent)
EXPLANATION: Every claim this unit makes about its own predicate reproduced exactly — 22/22
assertions, both ledger probes, the 1,021-manifest census with 0 false blocks, the sha256, and my own
independent re-derivation of 77→162, the 76 fence-destroyed PASSes, the 21 first-vs-last
disagreements and the three-manifest `file:line` loss. I rule with the builder against my own
dispatch brief on counting semantics: "any operative-form PASS" is right for a cumulative safety cap,
it provably cannot double-count (a per-file boolean plus unique-slug dedup; 20 mixed-token files each
counted once), and it errs loud at a measured cost of zero false blocks. It fails on C7 and I2: the
canonical `**Handshake status:**` defect it fixed in ROUNDCAP is live and SILENT in the MAKER
predicate of the same file — I reproduced `pend=0` on a pending unit — and the manifest audited a
different, lesser defect across that same boundary while saying nothing about this one, which C7
explicitly forbids. A second blind class also ships undisclosed: an identical unit escapes the cap
entirely by naming its seam in prose instead of a backticked path (blocked=True vs blocked=False,
trace `candidates=1 capped=0`), and 18 of 171 real manifests are already in that shape. Neither needs
code in the hook to close the criterion — C7 asks for the audit to be stated, and the MAKER fix
itself is outside what D-049 authorizes — so fix cycle 1 should be narrow. Two evidence corrections
I own: the shared-log entry D-049 requires DOES exist (`D:/ai_os/decisions/log.md:1827`) and is
merely stale, contrary to the manifest; and ISS-365's ledger row understates its priors by one, so
four is right.
```

---

# ADDENDUM (same cycle, `Cycle checked: 0`) — ruling on the ordering semantic against the unit merged on master

Added after the dispatcher reported that a **different** `iss-346-round-cap-mechanical-check` was
merged and closed out on `master` (`67cc32b` → `97756f5`) while this check was running. I read that
unit's manifest and verdict from `master` and re-ran the decisive test myself. **Nothing in my
verdict above changes.** One coordinator premise does not survive checking, and I correct it rather
than build on it.

## The decisive test: the merged verdict file misreads ITSELF under the rule it proposed

`master:qa/verdicts/iss-346-round-cap-mechanical-check.md` is a **newest-first** file: `**VERDICT:
PASS**` near the top, `# ARCHIVE — cycle 0 verdict (FAIL), preserved verbatim below` at line 299. I
fed that exact file to the live hook's own `Get-VerdictTokens` / `Test-VerdictPass`:

```
tokens in order: PASS@77 , FAIL@4524 , PASS@4806 , FAIL@6163 , FAIL@6187 , FAIL@6556 , FAIL@6580 ,
                 FAIL@10265 , FAIL@10337 , FAIL@10445 , FAIL@10567 , FAIL@10684 , FAIL@16941
LIVE cumulative rule (Test-VerdictPass) -> True      <- correct; this unit PASSed
LAST-line rule would read                -> FAIL     <- wrong
FIRST-line rule would read               -> PASS
```

**A PASSed unit's own verdict reads as FAIL under the last-line rule that unit originally proposed.**
That is the sharpest available test of the rule, and the rule fails it on its author's own artifact.
It is not a curiosity: a cap count over this corpus would drop that unit's PASS from its seam's
total — the **silent, under-counting** direction, which is the whole of ISS-346 and ISS-365.

## Correction to the coordinator's premise — the under-counting rule did NOT ship

The message states the merged unit "shipped the exact counting semantic your brief asks you to rule
on" into the machine-wide hook. **Measured, it did not, and I will not file a finding on a premise I
could not confirm.**

```
live hook sha256: 5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162
live hook implements cumulative any-PASS (foreach token, return $true on PASS)? True
live hook contains a $vLast / last-line gate?                                    False
```

The live hook's sha is the same `5d6e0994…5162` this unit produced and my run of its test
re-verified — and the merged unit's own verdict records that same sha at both the start and the end
of its check. So **the rule running in every project on this machine is the cumulative one**, from
this unit, and the last-line rule (its "H3") was measured and deliberately **not applied**. The
merged unit's cycle-0 verdict FAILed precisely on H3, and its cycle-1 verdict says applying it
"would be reintroducing, not fixing, a real regression on the newest-first-archive" shape, marking
its `C4` row "legitimately superseded". **The two units reached the same conclusion by opposite
routes.** No under-counting cap is live; there is nothing to file against the hook.

## Ruling, stated plainly

**The cumulative rule is right and the last-line rule is wrong for this corpus. I rule with my
builder, against my own dispatch brief, now with a second independent corroboration.** The evidence
is cumulative across four measurements: two incompatible conventions confirmed by line number
(`iss-104` 12/174 downward; `vector-cosine-retriever` 13/326 newest-first), **21** verdicts
disagreeing first-vs-last, **0** false blocks over 1,021 manifests in the loud direction, and now a
PASSed verdict that the last-line rule misreads as FAIL. The other checker, working from the
opposite starting position and on a different branch, reached the same place. **Had the merged
unit's H3 been applied it would have shipped an under-counting cap into a machine-wide hook** — and
both checkers independently stopped it. That is the mechanism working.

## Residual finding this raises, and it is a real one

The merged unit's **manifest** still carries, as a covered capability row, *"The operative verdict is
the **LAST** `VERDICT:` line, so a superseded PASS is not a round"*, with a GREEN-before/RED-after
falsification (`C4`) behind it — and that manifest is now `checked-PASS` on `master`. Only the
**verdict** supersedes it, in prose. A future unit reading the PASSed manifest's capability table for
precedent would find a rejected, regression-causing rule presented as a proven capability. Filed as
**ISS-A035913-010**, medium: the trap is in the record, not in the code.

## Duplicate or complementary — complementary, and I am not softening either way

- **No filename collision.** `master` carries `qa/tests/mc-hooks-round-cap.ps1`; this unit adds
  `qa/tests/mc-hooks-roundcap-verdict-reading.ps1`, which is **not on master**. Nor is either probe.
  My lane shard `qa/issues.a035913.jsonl` does not collide with `master:qa/issues.iss346.jsonl`.
- **The overlap is one defect, and both lanes found it independently:** `return $set` →
  `return ,$set` (`Get-ManifestSeam`'s fail-open unroll). Two lanes converging on the same fail-open
  defect from different directions is corroboration, not duplication.
- **The complement is real.** The merged unit's fixes were *measured but not applied* — it did not
  write the hook; this unit **wrote the live hook** and carries the standing regression test and the
  two probes. Between them: their analysis, this unit's instrument.
- **I confirmed neither closed the ledger.** On `master`, `ISS-346` and `ISS-365` are both still
  `high` / `open`. My verdict already holds them open, so that is unchanged.

**The FAIL above stands on its own evidence and is untouched by any of this.** It is not about
ordering semantics, which I have now ruled in this unit's favour twice over; it is [C7] — the
canonical `**Handshake status:**` defect, fixed here in `ROUNDCAP`, left live and **silent** in the
`MAKER` predicate of the same file and unaudited in the manifest — plus the undisclosed prose-seam
bypass. Neither is addressed by the unit on `master`, and both remain the narrow content of fix
cycle 1.

---

# CYCLE 1 VERDICT (appended below cycle 0 and its addendum — nothing above this line is touched)

**Cycle checked:** 1
**Date:** 2026-09-28
**Verdict-file convention used:** this file already appends **downward** (the cycle-0 ADDENDUM was
added below the original cycle-0 body, not above it, and nothing above was edited). This cycle-1
section follows that same convention — appended at the bottom, cycle 0 and its addendum left
byte-intact above. Reader note: this repo also has verdict files that use the opposite,
newest-first-with-`# ARCHIVE` convention (see the cycle-0 addendum's own discussion of
`vector-cosine-retriever.md`); this particular file is not one of those.
**Checker binding:** `D:/KnowledgeBase/.claude/worktrees/agent-a035913864247fa58`, branch
`worktree-agent-a035913864247fa58`, HEAD `610ed0e`, clean at check time (confirmed:
`git status --porcelain` empty, `git rev-parse HEAD` = `610ed0e61ea8370672dba077d74eef4ff403deb8`).
**Executor (manifest):** not stated in this manifest · checker: claude-sonnet-subagent, fresh context,
no `ANTHROPIC_BASE_URL` override, no external executor named. `self != executor` holds.

```
VERDICT: FAIL
SCOREBOARD: 7/9 criteria met, 2/3 invariants hold
```

## What I re-ran / re-derived myself this cycle (independent of the manifest and of cycle 0)

1. **Scope of `610ed0e`.** `git show --format= --name-only 610ed0e` → `qa/manifests/iss-346-round-cap-mechanical-check.md`
   only. `git diff HEAD~1 HEAD --stat` → that one file, `137 insertions(+), 12 deletions(-)`. No code touched.
2. **Live hook identity.** `Get-FileHash D:/ai_os/.claude/hooks/delivery-gate-stop.ps1 -Algorithm SHA256`
   → `5D6E09943119B4F26B13C93DD32D8E28BD11099447B13C4D32DED074A51EC162`, matching the manifest's "After"
   value and the dispatcher's own prefix `5d6e09943119b4f2` exactly.
3. **`node scripts/lib/mutate.mjs assert-clean`** → `MUTATIONS CLEAN: none outstanding`. `git status
   --porcelain` empty. No mutation ran this cycle, no mutant on disk.
4. **C7 audit table, verified by reading the live hook, every citation exact:**
   - `:378` `$vtPlain = Strip-Code ($vt -replace '\*\*', '')` — matches.
   - `:388` `elseif ($vtPlain -match '(?m)^[\s\-*#>|]*VERDICT:?\s*PASS') { $unclosed++ } else { $fixgap++ }` — matches.
   - `Get-ManifestSeam` call sites: `:262`, `:278` — both confirmed inside the `ROUNDCAP` block, which the
     hook's own comments and structure place at `:212`–`:308`; `MAKER` begins at `:310` (comment: `# predicate
     MAKER`) and runs to `:459`/460 (`SERIAL-MC` begins at `:461`). Structural claim ("MAKER never calls
     Get-ManifestSeam") **confirmed** — the two call sites are strictly before `MAKER` starts.
   - `:375` `if ($mtPlain -match '(?m)^[\s\-*#>|]*Status:\s*ready-for-check')` — legacy-only, confirmed.
     `:256` `if ($p -notmatch '(?im)^[\s\-*#>|]*(?:Handshake[^\S\r\n]+)?Status:\s*ready-for-check')` —
     `ROUNDCAP`'s fixed form, confirmed. Every `file:line` in the manifest's C7 table checks out exactly.
5. **The reproduction (claim 2), re-run independently** in my own throwaway trees, my own script, never
   reading the manifest's or the builder's test file first:
   ```
   LEGACY  Status: field       -> blocked=True   trace=(BLOCK-MAKER path; MAKER-pend trace only logged on non-block completion)
   CANON   Handshake status:   -> blocked=False  trace=MAKER pend=0 unclosed=0 queue=0 fixgap=0 scheduled=False
   HOOK SHA BEFORE=5D6E0994...5162   HOOK SHA AFTER=5D6E0994...5162   UNCHANGED=True
   ```
   Confirmed exactly: a manifest at only the canonical `**Handshake status:**` field is invisible to `MAKER`.
6. **The prose-seam count (claim 3), re-derived a THIRD time**, dot-sourcing `Get-ManifestSeam` verbatim
   from the live hook myself, over this worktree's real `qa/manifests/*.md`:
   ```
   total manifests = 171
   zero-seam       = 18
   non-zero-seam   = 153
   ```
   Same 18, and the same 18 slugs, as both the checker's cycle-0 figure and the builder's cycle-1
   re-derivation. Three independent extractions now agree exactly.
7. **The self-referential claim (claim 4), settled with the real extractor** (not a grep for backticked
   paths anywhere in the file, which is the wrong instrument and is what produced the dispatcher's stray
   "48"): `iss-346-round-cap-mechanical-check` **is** in the zero-seam list produced by the real
   `Get-ManifestSeam` over its own `## What changed` section. **The self-referential claim is TRUE**, not
   an overstatement — this manifest's own seam citations are prose tables, not a single backticked
   `path/with/slash.ext`, exactly as claimed.
8. **The cycle-0 correction (claim 5).** Confirmed: the original cycle-0 sentence ("has NOT been written by
   this unit") is still present, verbatim, under `*(original cycle-0 text, uncorrected, kept for the audit
   trail):*`, clearly marked, directly below the cycle-1 correction that points at it. Not silently rewritten.
9. **Capability coverage (claim 6).** Confirmed via `git show HEAD~1:qa/manifests/...md`: the cycle-0 T6 row
   ended "...not mutation-covered" with **no issue id**. The cycle-1 version adds `ISS-A035913-007` to that
   exact row and adds four new rows (C7-1, C7-2/3, C7-4, I2). Judgment: this is legitimate enumerated debt,
   not laundering — T6's redundancy claim was independently verified by the checker at cycle 0 (the
   separator class absorbs the property), and the four new C7/I2 rows are disclosure rows for criteria the
   manifest does NOT claim are met; they carry their true state ("affected, not fixed" / "not applicable" /
   "disclosed as shipped scope limit") rather than dressing up an unmet criterion as covered.

## The central question: can C7 and I2 be satisfied by disclosure alone?

**C7 — partially yes in principle, but this disclosure does not clear it.** C7's own text carries an
explicit escape hatch: *"the audit result is stated — 'checked, not affected' is an acceptable answer;
silence is not."* That makes C7 a criterion about the audit being **performed and stated**, not about the
underlying defect being fixed everywhere — so disclosure is the right instrument in principle, and cycle
1's stated audit of `MAKER` (rows 1 and 4) is honest, verified, and exactly what C7 asks for **as far as it
goes**.

**It does not go far enough, and this is a finding I made myself, not one handed to me by the brief.** C7
requires the audit across *"every predicate **and every sibling hook that shares the pattern**"*, and the
contract's own "Artifacts under contract" section names `mc-sessionstart.ps1` and `mc-precommit.ps1` as
in-scope specifically *"because they share the predicate."* The manifest's C7 section states: *"`ROUNDCAP`
and `MAKER` are the only two predicates in `delivery-gate-stop.ps1` ... So `MAKER` is the only sibling this
audit needs to cover"* — which answers only the "every predicate [within one file]" branch and never
mentions either contract-named sibling **hook** at all. I checked both myself:

- `mc-sessionstart.ps1:62` reads a verdict's PASS via `Select-String -Pattern 'VERDICT:\s*PASS|Result:\s*PASS|\*\*PASS\*\*'`
  directly against the raw file — no `Strip-Code` step — so it is genuinely unaffected by defect 1, and
  `mc-sessionstart.ps1:35` already reads the canonical `**Handshake status:**` field (D-042/D-043), so it is
  unaffected by defect 4 too. This is a legitimate **"checked, not affected"** the manifest could have
  stated in one line and did not.
- `mc-precommit.ps1:43` — `Select-String -Pattern '^\s*(?:[-*]\s+)?(?:#{1,6}\s+)?[*_]{0,3}Status:[*_]{0,3}\s+ready-for-check'`
  — requires the literal substring `Status:` at the anchored position. I tested this exact pattern against
  both field forms in a real PowerShell run:
  ```
  legacy match: True
  canonical-only match: False
  ```
  **A manifest written to the current canonical standard is silently excluded from `mc-precommit.ps1`'s
  pre-commit pending-unit count** — the identical defect-4 class, live, in a **third contract-named
  artifact**, never mentioned anywhere in this unit's C7 section. Filed as `ISS-A035913-011` (high) in my
  lane shard `qa/issues.a035913.jsonl`.

So C7 is not merely "disclosure vs. fix" here — the disclosure itself is scoped narrower than the contract
requires, and when I extended it to the scope the contract actually names, I found a real, live,
undisclosed instance of the defect class in a hook this unit never looked at. **C7 remains not met**, for a
different and more specific reason than cycle 0's "silence about `MAKER`."

**I2 — no, disclosure cannot satisfy it, and this is a structural finding, not a builder failure.** I2's
text is explicit that *"neither [blindness nor noise] is acceptable **as a shipped state**"* — it judges the
artifact's actual behavior, not whether that behavior has been written down. Three blind spots now ship
live in the contract's in-scope artifacts regardless of how well they are disclosed: the `MAKER`
canonical-field blindness (C7-4), the `ROUNDCAP` prose-seam bypass (I2 itself, 18/171 manifests), and the
newly-found `mc-precommit.ps1` canonical-field blindness. Fixing any of them is a code change to
`.claude/hooks/*`, which this project's own enforcement-path rule gates behind an `Approved-by` entry — and
`qa/gates/maker-predicate-canonical-field-and-prose-seam.md` (confirmed present in the main checkout,
`D:/KnowledgeBase/qa/gates/`, though not yet merged into this worktree's own branch — the file is reachable
at commit `c4387ef`, which postdates this worktree's branch point `b44a3a2`) is **OPEN — needs the
Approver**, no `Answered:` line. **This unit cannot lawfully close I2 by any action available to it.** That
is the legitimate outcome the dispatch brief anticipated: not a failure of technique, but a wall that only
the Approver can remove.

**C1** follows the same logic as I2 for the same underlying reason (`MAKER` blind to the canonical field is
literally "not every reader sees every form") and stays not met for the same structural cause.

## Criteria and invariants, this cycle

| | Verdict | Change from cycle 0 | Evidence |
|---|---|---|---|
| C1 | **not met** | unchanged | `MAKER` (and now `mc-precommit.ps1`) blind to canonical field; gated to Approver |
| C2–C6, C8, C9, I1, I3 | met | unchanged | re-confirmed structurally this cycle (scope diff, hook sha, mutate.mjs clean); not re-litigated, cycle 1 touched none of this machinery |
| C7 | **not met** | reason narrowed but not cleared | audit of `MAKER` is now honest and stated (real progress); audit omits both contract-named sibling hooks entirely, and one of them (`mc-precommit.ps1`) has its own live, undisclosed instance of defect 4 |
| I2 | **not met** | unchanged | three blind spots now ship live (`MAKER`, prose-seam, `mc-precommit.ps1`); I2 judges shipped state, not disclosure quality, and none of the three can be fixed without the Approver |

## FAILURES

```
FAILURES:
- [C7] sev: high · the manifest's Cross-predicate audit states "MAKER is the only sibling this audit
  needs to cover," answering only the every-predicate-within-one-file branch of C7 and never mentioning
  mc-sessionstart.ps1 or mc-precommit.ps1, both named as in-scope by the contract's own "Artifacts under
  contract" section "because they share the predicate." I checked both: mc-sessionstart.ps1 is genuinely
  unaffected by defects 1 and 4 (Select-String reads raw text with no Strip-Code step; already reads the
  canonical Handshake-status field) — a "checked, not affected" the manifest could have stated and did
  not. mc-precommit.ps1:43's pending-unit regex does NOT match a canonical-only "**Handshake status:**"
  manifest (verified: legacy match True, canonical-only match False) — the identical defect-4 class, live,
  in a third contract-named artifact, entirely unaudited · fix direction: extend the C7 section to name
  both hooks and their real status; the mc-precommit.ps1 fix itself needs its own Approved-by entry, but
  unlike delivery-gate-stop.ps1 it is repo-local and not blocked by ISS-190 · issue: ISS-A035913-011
- [C1] sev: high · consequence of the above and of cycle 0's finding, not blamed on this unit: not every
  reader sees every handshake form; MAKER and mc-precommit.ps1 both still miss the canonical field ·
  fix direction: same code fix as C7's remedy, same authorization gate · issue: ISS-A035913-001 (existing)
- [I2] sev: high · three blind spots ship live regardless of disclosure quality: MAKER canonical-field
  blindness, the ROUNDCAP prose-seam bypass (18/171 manifests, re-confirmed a third time), and the newly
  found mc-precommit.ps1 canonical-field blindness. I2 judges the artifact's shipped behavior, and no
  code path to fix any of the three is authorized for this unit to take · fix direction: none available
  to this unit; requires the Approver's ruling on qa/gates/maker-predicate-canonical-field-and-prose-seam.md
  (or a narrower follow-up gate covering mc-precommit.ps1 specifically, which is NOT blocked by ISS-190) ·
  issue: ISS-A035913-003 (existing, prose-seam) + ISS-A035913-011 (new, mc-precommit.ps1)
```

## CAPABILITY-COVERAGE

`CAPABILITY-COVERAGE: 6/8 rows reproduced by my own execution this cycle is not re-run — cycle 1 touched
no code and the capability table's falsifiable rows (M1–M6) are unchanged from cycle 0, whose reproduction
I already re-confirmed structurally (scope diff shows zero code change, hook sha unchanged, mutate.mjs
clean). The four NEW disclosure rows this cycle (T6's issue id, C7-1, C7-2/3, C7-4, I2) are not
independently falsifiable capabilities of this unit's own artifact — they are audit/disclosure claims,
judged above on their own evidence, not against a green/red mutation.`

`LIVE-BROWSER: not-applicable (changed path this cycle is qa/manifests/iss-346-round-cap-mechanical-check.md
only — a markdown manifest, no route/page/component; qa/ui-surfaces.json matches nothing here)`

## Ledger obligations this cycle

- `ISS-346` and `ISS-365` stay `open` — no status moves to `fixed` on a FAIL, unchanged from cycle 0.
- New finding `ISS-A035913-011` (high) appended to `qa/issues.a035913.jsonl` (lane shard, append-only,
  never edited in place per D-019).
- `ISS-A035913-001` through `-010` (cycle-0's rows) are unchanged by this cycle; I did not re-litigate the
  counting-semantics ruling, the ISS-190 severity promotion, or the ISS-365 count correction — all settled
  per the dispatch brief and re-confirmed only where the brief asked (claims 1–7 above).

## EXPLANATION

```
EXPLANATION: Cycle 1 made real, verified progress on C7's letter — it states an honest, reproduced audit
of the MAKER predicate (defects 1 and 4), corrects its own cycle-0 misstatement visibly rather than
silently, and its self-referential claim about being in the zero-seam blind class is true (confirmed by a
third independent extraction, exactly 18/171, exact same slugs). But C7 requires auditing "every predicate
and every sibling hook that shares the pattern," and the contract names mc-sessionstart.ps1 and
mc-precommit.ps1 as in-scope specifically because they share this predicate -- neither is mentioned in the
manifest's C7 section. Checking both myself found mc-sessionstart.ps1 genuinely unaffected (a disclosure
the manifest could have made for free) and mc-precommit.ps1 carrying its OWN live, undisclosed instance of
the exact defect-4 class this unit fixed in ROUNDCAP -- filed as ISS-A035913-011. So C7 stays not met, for
a narrower and more specific reason than cycle 0's outright silence. I2 and C1 stay not met for a
structural reason the builder cannot fix: both judge the artifact's actual shipped behavior, not whether
that behavior is documented, and every code path to close them (.claude/hooks/* is an enforcement path)
needs an Approved-by entry that does not yet exist -- qa/gates/maker-predicate-canonical-field-and-prose-
seam.md is OPEN with no Answered: line. This is the outcome the dispatch brief anticipated: the unit did
everything lawfully available to it and cannot PASS until the Approver rules. A further fix cycle on this
unit's own authorization cannot close C1 or I2 either -- only a code fix can, and that fix is not this
unit's to make. Scope for this cycle confirmed narrow: 610ed0e touches only the manifest (137
insertions/12 deletions), the live hook sha is unchanged (5D6E0994...5162, matches the dispatcher's
verified prefix), and mutate.mjs assert-clean reports none outstanding.
```

**LIVE-BROWSER:** not-applicable (manifest-only change, no UI surface)
**ISSUES-WRITTEN:** ISS-A035913-011
**EXECUTOR:** not stated in manifest (checker: claude-sonnet-subagent)

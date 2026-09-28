# Manifest — iss-346-round-cap-mechanical-check

**Status:** ready-for-check
**Fix cycle:** 1 of max 3
**Issues addressed:** ISS-346, ISS-365
**Round cap:** not applicable — 0 prior PASSed units touched the `delivery-gate-stop.ps1` seam.
Measured, not asserted: 7 verdicts *mention* that filename and **0** PASSed units' manifests name it in
`## What changed` (see Actual outputs, `MENTION-VS-TOUCH`). The seam is freely pullable, and this unit's
own check re-derives that number, which is the smallest possible dogfood.
**Persona walk:** skip — the only changed runtime file is a Stop hook (`.claude/hooks/`), plus a test and
two probes under `qa/`. `ui-surfaces.json`'s pattern matches none of them, no route, component or page is
touched, and the artifact has no rendered surface for a persona to walk.

## Cycle 1 — what changed and why

Cycle 0's verdict (`qa/verdicts/iss-346-round-cap-mechanical-check.md`, `VERDICT: FAIL`, 7/9 criteria,
2/3 invariants) FAILed this unit on **[C7]**: one of the four defects fixed in `ROUNDCAP` — D-042's
canonical `**Handshake status:**` field (defect 4) — is live and **silent** in the sibling `MAKER`
predicate of the same file, and this manifest audited a different, lesser defect across that boundary
while saying nothing about the more dangerous one. **[C1]** is scored as a consequence, not blamed on
this unit. **[I2]** raised a second undisclosed blind class: a candidate escapes the round cap entirely
by naming its seam in prose instead of a backticked path.

The checker's own guidance is that this cycle is narrow: "C7 asks for the audit to be *stated*", not for
the `MAKER` code fix or the seam-grammar fix, both of which sit outside what D-049 authorizes (D-049
names the ISS-346 `ROUNDCAP` check specifically; extending it to a second predicate or to the seam
extractor would be the same "authorization is a waiver" move already refused for D-043 — see
`qa/gates/mc-sessionstart-handshake-reader-round-cap.md`). Cycle 1 therefore does exactly three things,
none of them a code change to the machine-wide hook:

1. adds the **Cross-predicate audit (C7)** section below, auditing each of the four defects against the
   `MAKER` predicate by name, `file:line`, and my own reproduction — not asserting "not affected" anywhere
   I did not actually check;
2. adds the **Disclosed blind class — prose-seam bypass (I2)** section below, with my own independent
   re-derivation of the corpus count (checker measured 18/171; I re-derived it from scratch before reading
   this sentence — see that section);
3. updates the **Capability coverage** table so the T6 `UNVERIFIED` row carries its assigned id
   `ISS-A035913-007`, and adds rows for the two audits above.

One correction carried from the verdict rather than repeated: this manifest's cycle-0 text below (under
"What this unit does not fix") said the D-049 shared-log obligation "has NOT been written by this unit."
**That is inaccurate and the checker caught it.** The entry exists at `D:/ai_os/decisions/log.md`, dated
2026-09-28, item 3 ("Machine-wide Stop hook `delivery-gate-stop.ps1`: three fixes …"), citing D-049 and
this predicate. It is **stale** — it records `after 28c1ae44…7337`, which is this unit's *pre*-state, and
`grep -c 5d6e0994 D:/ai_os/decisions/log.md` = 0 — so the shared log has no trace of this unit's five
counting fixes or the resulting byte state. The obligation is stale, not absent. Filed as
**ISS-A035913-005** (the checker's id; I did not re-file it). The cycle-0 sentence below is left in place
for the historical record of what this manifest originally claimed, with this correction pointing at it.

## Cross-predicate audit (C7)

The contract's C7 criterion requires every defect this unit fixed in `ROUNDCAP` to be checked against
every other predicate in the same file, with the result **stated** — "checked, not affected" is
acceptable; silence is not. `ROUNDCAP` and `MAKER` are the only two predicates in
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` that read `qa/manifests/*.md` at all (confirmed by
`Select-String -Pattern 'qa/manifests|qa\\manifests'` over the file: the two predicate blocks at
`ROUNDCAP` (approx. lines 212–308) and `MAKER` (lines 310–459), and nothing else). So `MAKER` is the only
sibling this audit needs to cover.

| # | Defect fixed in `ROUNDCAP` | `MAKER` predicate: affected? | `file:line` | Evidence |
|---|---|---|---|---|
| 1 | Result line read through `Strip-Code`, destroying a fenced `VERDICT: PASS` | **Affected, and NOT fixed** — live and silent-in-effect-on-the-message | `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1:378` (`$vtPlain = Strip-Code ($vt -replace '\*\*', '')`) feeding the match at `:388` (`elseif ($vtPlain -match '(?m)^[\s\-*#>|]*VERDICT:?\s*PASS') { $unclosed++ } else { $fixgap++ }`) — the exact pre-fix `ROUNDCAP` reading. **Direction confirmed same as the checker's finding, filed as ISS-A035913-002 (medium, not high):** `$backlog = ($pend + $unclosed + $queue + $fixgap) -gt 0` still blocks either way, so the gate stays loud; what breaks is which counter takes it — a fenced PASS lands in `$fixgap` (reported "owes a fix cycle") instead of `$unclosed` (correct: "PASS not closed out"). Not re-measured by me beyond confirming the code path; the checker's own reproduction (`fixgap=1` where `unclosed=1` is correct, on 76 of 170 verdicts) stands. |
| 2 | `Get-ManifestSeam`'s `return $set` unroll (empty/one-element HashSet degraded to `$null`/substring match) | **Not applicable — `MAKER` never calls `Get-ManifestSeam`.** Verified by `Select-String -Pattern 'Get-ManifestSeam' D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`: both call sites (`:262`, `:278`) are inside the `ROUNDCAP` block (`:212`–`:308`), strictly before `MAKER` begins at `:310`. `MAKER` has no seam concept at all — it counts `pend`/`unclosed`/`queue`/`fixgap` per manifest, never a cross-manifest file overlap. | n/a — structurally unreachable, not merely untested | `grep -n Get-ManifestSeam` output pasted above; no reproduction needed because there is no code path to exercise |
| 3 | `` `file:line` `` citation form rejected as a seam | **Not applicable, same reason as #2** — the citation-suffix regex lives inside `Get-ManifestSeam`, which `MAKER` never calls | n/a | same grep as row 2 |
| 4 | Candidate scan read only the legacy `Status:` field, missing D-042's canonical `**Handshake status:**` | **Affected, and NOT fixed — live and SILENT** (this is [C7]'s finding) | `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1:375` — `if ($mtPlain -match '(?m)^[\s\-*#>|]*Status:\s*ready-for-check')`, legacy-only, no `(?:Handshake[^\S\r\n]+)?` alternation (contrast `ROUNDCAP`'s fixed form at `:256`) | **Reproduced myself, real hook binary, two throwaway trees, byte-identical hook before/after:**<br>`A: legacy Status: field  → blocked = True` (`BLOCK-MAKER`, "1 check(s) pending")<br>`B: canonical **Handshake status:** field only → blocked = False`, trace `MAKER pend=0 unclosed=0 queue=0 fixgap=0 scheduled=False`<br>A manifest written to the current canonical standard makes the pending-handshake gate go completely quiet under `MAKER` — the ISS-266/ISS-267 class the hook was changed to fix, still live through this door. Filed as **ISS-A035913-001** (high, the checker's id — I did not re-file it). |

**What this audit does and does not authorize.** Stating rows 1 and 4 here is the disclosure C7 asks for.
Neither row's *fix* is in scope: `.claude/hooks/*` is a user-level enforcement path, D-049's
`Changes-authorized` names the `ROUNDCAP` predicate specifically, and it does not extend to `MAKER` or to
the seam grammar. `qa/gates/maker-predicate-canonical-field-and-prose-seam.md` is the standing `HUMAN_GATE`
for both fixes, raised by the previous tick, still `OPEN`, needing the Approver. This cycle changes nothing
about that gate — it only makes sure the manifest itself states the audit instead of leaving it to the
gate file alone.

## Disclosed blind class — prose-seam bypass (I2)

**The mechanism, by `file:line`.** `Get-ManifestSeam` (`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1:72`)
extracts a seam only from **backticked** paths matching `` `path/with/a/slash.ext` `` (optionally
`` :line `` or `` :line-line ``) inside the manifest's `## What changed` section. A file named in prose, or
cited without backticks, or without a `/`, contributes nothing to the set. The `ROUNDCAP` predicate then
skips any candidate whose own seam is empty **before ever comparing it to a prior PASS's seam**:
`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1:281` — `if ($c.Seam.Count -eq 0) { continue }        # no
extractable seam -> no claim, stay silent`. So a unit that touches the exact same file as two already-
PASSed units, but names it in prose in its own `## What changed`, is never even compared — not "compared
and found not capped", literally never evaluated. The comment states the silence is deliberate (to avoid
inventing a seam claim from thin air), which makes this a **scope limit that was never disclosed** rather
than a bug — and an un-disclosed scope limit on a safety cap is the same failure shape ISS-346 exists to
remove.

**My own re-derivation, independent of the checker's 18/171.** I extracted `Get-ManifestSeam` verbatim
from the live hook (the same method `qa/probes/roundcap-wouldblock-census.ps1` uses) and ran it over every
one of this worktree's 171 real manifests, counting how many produce a zero-size seam from their own
`## What changed` section:

```
total manifests = 171
zero-seam       = 18
non-zero-seam   = 153
```

**18 of 171 (10.5%) — I confirm the checker's count exactly, from a fresh extraction I wrote myself
without reading its script first.** The 18: `brain-knowledge-graph`, `calendar-grid-ui`,
`delivery-gate-machine-wide-fix`, `delivery-gate-manifest-blindness`, `delivery-gate-stamp-adoption`,
`guarded-fetcher`, `handshake-canonical-field`, `ISS-004-tree-index-fixtures`,
`iss-346-round-cap-mechanical-check` (this unit's own manifest — its own `## What changed` cites the hook
path in prose tables, not as a single backticked `path/with/slash.ext`, so it is itself in the blind
class it now discloses), `lint-score-split`, `score-input-trust-complete`, `session-loading-verification`,
`T-002-toc-migration`, `T-018-schema-v2`, `tracker-honesty`, `u2-4-phase3-precision-regate`,
`u4c-watch-page`, `write-guard-enforcement-gaps`.

**Consequence, one line:** any of these 18 units — and any future one shaped like them — can share a seam
with two already-PASSed units and never be capped, silently, regardless of the D-014 round-cap rule; the
`ROUNDCAP` predicate's own trace (`ROUNDCAP candidates=N capped=0`) reads as "checked, nothing capped",
which is exactly the false confidence ISS-346 was opened to remove. Filed as **ISS-A035913-003** (high,
the checker's id). The fix (backticked-path grammar is too narrow; the extractor should also recognise a
prose-cited path, or a candidate with zero extractable seam should be flagged rather than silently passed)
is outside this unit's authorization — see `qa/gates/maker-predicate-canonical-field-and-prose-seam.md`
option 1/2.

## Authorization

- **`docs/DECISIONS.md` D-049** (2026-09-28, **`Approved-by: Umesh`**) — `Changes-authorized:`
  `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` **(machine-wide)**, naming "the ISS-346 mechanical
  round-cap check" explicitly. **This, not D-043, is the authority for this file.** D-043 named the same
  path but on the false premise that it was repo-local; D-049 corrects the scope and re-authorizes at the
  correct one. D-043 remains ACTIVE and correct for its item 3 (`mc-sessionstart.ps1`). I cite both
  because the brief cited D-043, and the distinction is load-bearing: a decision of `D:/KnowledgeBase`
  cannot authorize a hook registered in the **user-level** `C:/Users/Lenovo/.claude/settings.json:124`
  that fires in every project on this machine.
- **`docs/DECISIONS.md` D-052 ruling 1** (**`Approved-by: Umesh`**) — "Land ISS-346 first, then decide."
  This unit is built before the `mc-sessionstart.ps1` cap question is settled, so that decision is made
  against a working instrument. **No cap waiver is granted by that entry**, and this unit does not take one.
- **D-044** requires this check to land *before* `wave/vector-gap-durability` gets a manifest. It has not
  got one in this tree (confirmed: `qa/manifests/vector-gap-durability.md` does not exist), so the
  ordering holds.

**Not touched, by instruction and by authorization:** `.claude/hooks/mc-sessionstart.ps1` (4 PASSed units
against a non-security cap of 2; `qa/gates/mc-sessionstart-handshake-reader-round-cap.md` is an OPEN human
gate on it), `scripts/append_decision.ps1`, `.claude/settings.json`, `docs/DECISIONS.md`, `qa/contracts/`.
Nothing of `handshake-field-reader`'s work was reverted or modified.

## The placement choice, recorded — (a) vs (b)

ISS-346's `fix_direction` offers two placements and says the choice must be recorded.

- **(a) a script the maker calls at selection time** — rejected. The issue's own words: it "is advisory
  and can be skipped exactly the way this rule was skipped". The shared maker `SKILL.md` step 4 and this
  repo's `CLAUDE.md` "Backlog priority override" are both already prose, and the cap is already written in
  both. Adding a third place to read would be more prose.
- **(b) a Stop-hook predicate in the class of `delivery-gate-stop.ps1`** — **chosen and built.** It is what
  `Changes-authorized` names, it is what ISS-346 prefers ("Prefer (b) if the Approver is willing, since the
  failure mode being fixed is specifically a prose rule that a competent agent read and still did not
  apply"), and ISS-365 settles it: on the second breach **the independent checker did not catch it either**
  — `grep -niE 'round cap|D-014'` returns nothing from either the manifest or the verdict (re-run below).
  Two readers stepping over the same sentence is evidence about the mechanism, not about either reader.

**Selection time, not check time.** The predicate's candidate set is manifests at `ready-for-check` **with
no verdict file** — a unit awaiting its *first* check. That is the state ISS-365 requires it to fire in: a
predicate that only caught a breach after the unit had been built and PASSed would reproduce ISS-346's own
evidence, where the first breach was "caught by hand, after the build".

## What changed

The `ROUNDCAP` predicate and `Get-ManifestSeam` already existed — they shipped in
`delivery-gate-machine-wide-fix` (PASSed, closed out at `b44a3a2`), which is why ISS-346 was left at
`open` rather than `fixed`. **This unit did not re-implement them. It fixed five defects in their counting,
each found by running them over this repo's real corpus rather than over fixtures.** Every one is an
*under*-count, which is the silent direction — the direction that lets a capped seam be pulled, which is
the whole of ISS-346.

### Out-of-repo change — git in THIS repo cannot track it

| File | Before (sha256) | After (sha256) |
|---|---|---|
| `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` | `28c1ae4463875bf17be245d85cb5baeb92e0a764ad0ee844a652929d11047337` | `5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162` |

Byte backup of the pre-unit file, taken **before any edit** and verified equal to the live file at backup
time: `…/scratchpad/delivery-gate-stop.ps1.PRE-ISS346.bak`, sha256 `28c1ae44…7337`.
`git -C D:/ai_os diff --numstat` reports `224 7` for this path, but that is **cumulative**: it includes the
*previous* unit's `142 / 7`, because that change was never committed either. **That is ISS-190, and this
unit inherits it rather than fixing it** — see "What this unit does not fix".

### 1. `delivery-gate-stop.ps1` — the verdict result line was read through `Strip-Code`

New `Get-VerdictTokens` / `Test-VerdictPass` (inserted after `Get-ManifestSeam`), and the single call site
inside the predicate changed from

```
if ((Strip-Code ($vt -replace '\*\*', '')) -notmatch '(?m)^[\s\-*#>|]*VERDICT:?\s*PASS') { continue }
```

to `if (-not (Test-VerdictPass $vt)) { continue }`.

**Why.** The `/checker` skill writes its result block **inside a fenced code block**, so `Strip-Code`
removed the code and with it the verdict. Measured over this repo's 170 real verdicts: **76 of them hold a
genuine `^VERDICT: PASS` that `Strip-Code` destroys**, and the clause responsible is the *original* closed-
fence rule `'```.*?```'`, not the ISS-205 clause-3 additions. Net effect: the predicate saw **77** PASSes
where **162** exist. Stripping is right for a *cycle stamp* (a digit lifted out of pasted output invents a
closed handshake) and wrong for the *result line*, because the result line is deliberately written as output.

`Test-VerdictPass` also handles the three other real forms — bold `**VERDICT:** PASS`, `Result:`/`Status:`,
and a `## Verdict` heading with `**PASS**` on a following line (8 verdicts, e.g.
`speaker-block-floor.md:18-19`) — and restricts the token to a **vocabulary**, because an unrestricted word
after an optional colon matched prose beginning "verdict that …" and returned tokens like `THAT`, `RULE`,
`COMMIT` on 14 files.

**On "the LAST `VERDICT:` line is operative", and where I deviate — deliberately, with the measurement.**
That rule is right for a verdict that appends cycles *downward*:
`qa/verdicts/iss-104-closed-class-function-words.md` is `FAIL` at line 12 and operative `PASS` at line 174,
and reading the *first* match inverts it. But this corpus **also writes newest-first**, preserving the old
cycle below under an `# ARCHIVE` marker — `qa/verdicts/vector-cosine-retriever.md` is `PASS` at 13 with an
archived cycle-1 `FAIL` at 326. That is ISS-350 reproduction 4. Measured: **21 verdicts disagree
first-vs-last, 17 `FAIL`→`PASS` and 4 `PASS`→`FAIL`**, and no ordering rule separates the two conventions.
For a **round** cap the question is not "what is this verdict's final word" but "has this seam been PASSed
before", which is cumulative. So any operative-form PASS counts as one prior PASS. That reads iss-104
correctly — the property the last-line rule exists to protect, and the one the test asserts — and it is the
loud direction. **A checker should judge this as a deviation from the brief and decide whether it agrees.**

### 2. `Get-ManifestSeam` — `return $set` unrolled, so the predicate failed OPEN

`return $set` → `return ,$set`. PowerShell enumerates a returned collection: an **empty** HashSet came back
as `$null`, a **one**-element set as a **bare string**, and only 2+ survived as a collection. **20 of this
repo's 170 manifests have no extractable seam**, and `$ps.Seam.Contains($f)` then threw *"You cannot call a
method on a null-valued expression"* — caught by the hook's fail-open brake 3, so the **entire ROUNDCAP
predicate went silent**. Found by writing the census, not by reading the code: the census crashed on real
data at `roundcap-wouldblock-census.ps1:53`. The one-element case was worse than an error — a bare string's
`.Contains()` is a **substring** test, so `xx/a/b.ts` matched a candidate seam of `a/b.ts`.

### 3. `Get-ManifestSeam` — a `file:line` citation was not a seam

Pattern gained an optional `(?::\d+(?:-\d+)?)?` before the closing backtick. This repo's **own edit-in-place
rule** says "name the exact file + function you will modify (cite `file:line`)", so the compliant citation
form was the one the extractor rejected. Measured: `qa/manifests/mc-hooks-bolded-status.md` cites
`` `.claude/hooks/mc-sessionstart.ps1:15` `` and `` `…:19-25` `` — it is **one of the three prior PASSes
ISS-365 counted by hand**, and it contributed **zero**. Obeying the repo's citation rule made a unit
invisible to the cap.

### 4. The candidate scan read only the legacy `Status:` field

`'(?m)^[\s\-*#>|]*Status:\s*ready-for-check'` →
`'(?im)^[\s\-*#>|]*(?:Handshake[^\S\r\n]+)?Status:\s*ready-for-check'`.

**This is the defect that decides whether ISS-365 is closed.** `qa/manifests/handshake-field-reader.md`
carries **no legacy `Status:` line at all** — only D-042's canonical `**Handshake status:** ready-for-check`
— so it was never even a *candidate*, and the cap could not have refused it however well it counted. Fixes
1–3 alone still let it through; measured, `REFUSED: False`. With this, `REFUSED: True (4 prior PASS(es))`.
That unit is the one that taught the sibling `mc-sessionstart.ps1` to read the canonical field; this is the
same lesson in this predicate.

### 5. New files (no existing file could host them)

- **`qa/tests/mc-hooks-roundcap-verdict-reading.ps1`** — the standing regression test. 22 assertions.
  Structure copied from `qa/tests/mc-hooks-fixgap-and-stripper.ps1`: `$env:DG_HOOK` override, a throwaway
  temp tree per run via the hook's `cwd`, `$env:TEMP` redirected into that tree so no real session's marker
  or block budget is touched, `Start-Job`/`Wait-Job -Timeout 90`, and **falsifying edits applied to a COPY
  of the hook in the temp tree, never to the live file**, with the live sha256 captured before and
  re-checked after.
- **`qa/probes/roundcap-wouldblock-census.ps1`** — read-only blast-radius census over every maker-checker
  project on this machine. Replays the predicate's parsers *extracted verbatim from the live hook* without
  invoking it.
- **`qa/probes/roundcap-ledger-reproductions.ps1`** — the D-015 measurement: runs the **real hook** against
  the two issues' own recorded cases, rebuilt from this repo's **real** manifests and verdicts.

## How to verify

```
# 1. the standing regression test (22 assertions, 6 falsifying edits, 6 controls)
powershell -NoProfile -ExecutionPolicy Bypass -File qa/tests/mc-hooks-roundcap-verdict-reading.ps1
#    expect: RESULT: PASS (22/22 assertions), exit 0, and the POST-RUN hash line

# 2. the two ledger issues' own recorded cases, against the real hook
powershell -NoProfile -ExecutionPolicy Bypass -File qa/probes/roundcap-ledger-reproductions.ps1
#    expect: ISS-346 repro 3 REFUSED: True (2 prior PASS(es)); ISS-365 REFUSED: True (4 prior PASS(es))

# 3. blast radius: how many live units the gate would refuse today
powershell -NoProfile -ExecutionPolicy Bypass -File qa/probes/roundcap-wouldblock-census.ps1

# 4. the hook parses and its identity matches this manifest
powershell -NoProfile -Command "$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('D:/ai_os/.claude/hooks/delivery-gate-stop.ps1',[ref]$null,[ref]$e);$e.Count"
#    expect: 0     (see the caveat under 'What could not be executed')

# 5. ISS-365's reproductions 1-2, verbatim
grep -A15 '^## What changed' qa/manifests/handshake-field-reader.md
grep -niE 'round cap|D-014' qa/manifests/handshake-field-reader.md qa/verdicts/handshake-field-reader.md
```

## Actual outputs

### 1. `qa/tests/mc-hooks-roundcap-verdict-reading.ps1` — exit 0

```
ROUNDCAP verdict-reading assertions
  PASS  T1 a 0-PASS seam is freely pullable (no cap block)
  PASS  T2 a seam with 2 PASSed units is REFUSED, with the result line inside a code fence
  PASS  T2 the block names both prior slugs and the count
  PASS  T3 a declared SECURITY-CLASS candidate is never capped at 2 PASSes (ISS-078)
  PASS  T4 the count reads the LAST VERDICT line, not the first (FAIL then PASS counts as a PASS)
  PASS  T5 a verdict that only MENTIONS the seam file does not count toward it
  PASS  T6 bold-prefixed fields parse: **Status:**, **VERDICT:** (ISS-350)
  PASS  T7 a PASSed prior manifest with NO extractable seam does not make the predicate fail open
  PASS  T8 a seam cited WITH a line number (`file.ts:15`, the edit-in-place form) still counts
  PASS  T9 a candidate carrying only the canonical **Handshake status:** field is seen (D-042)
  PASS  M1 raise the cap threshold from 2 to 3 -> RED after
  PASS    CONTROL stays green under M1 raise the cap threshold from 2 to 3
  PASS  M2 restore the OLD Strip-Code verdict reading (the shipped bug) -> RED after
  PASS    CONTROL stays green under M2 restore the OLD Strip-Code verdict reading (the shipped bug)
  PASS  M3 return on the FIRST verdict token instead of any operative PASS -> RED after
  PASS    CONTROL stays green under M3 return on the FIRST verdict token instead of any operative PASS
  PASS  M4 let Get-ManifestSeam unroll its HashSet again (return ,$set -> return $set) -> RED after
  PASS    CONTROL stays green under M4 let Get-ManifestSeam unroll its HashSet again (return ,$set -> return $set)
  PASS  M5 drop the optional :line suffix from the seam-path pattern -> RED after
  PASS    CONTROL stays green under M5 drop the optional :line suffix from the seam-path pattern
  PASS  M6 read only the legacy Status: field, not the canonical Handshake status: -> RED after
  PASS    CONTROL stays green under M6 read only the legacy Status: field, not the canonical Handshake status:
  PASS  POST-RUN the live machine-wide hook is byte-identical to its pre-run state
  hook sha256: 5D6E09943119B4F26B13C93DD32D8E28BD11099447B13C4D32DED074A51EC162
RESULT: PASS (22/22 assertions)
```

Two of my own mutations were defective on the first run and are reported because a checker will diff this
file against the history: **M3's anchor missed on CRLF** and had to be rewritten as a single line, and
**M5's anchor lost a literal backtick to PowerShell double-quote escaping** and was rewritten single-quoted.
Both surfaced as `the mutation is VACUOUS`, which is the harness refusing to credit an edit that changed
nothing — a vacuous mutation is exactly how a falsification gets faked, so it is worth knowing the guard
fired. A third, **M4-as-first-written (dropping the emphasis strip), was withdrawn rather than fixed** —
see Capability coverage row 6.

### 2. `qa/probes/roundcap-ledger-reproductions.ps1` — both issues' own cases

```
hook sha256: 5d6e09943119b4f26b13c93dd32d8e28bd11099447b13c4d32ded074a51ec162
ISS-346 seam paths in the real vector-gap-tenant-id manifest: apps/api/src/indexing/vector-gap.ts, apps/api/src/indexing/vector-gap.test.ts
ISS-346 repro 3 -- vector-gap-durability REFUSED at selection time: True
   vector-gap-durability (2 prior PASS(es)
ISS-365 -- handshake-field-reader REFUSED at selection time: True
   handshake-field-reader (4 prior PASS(es)
```

### 3. Corpus measurements (read-only, over this repo's real `qa/`)

```
verdicts=170  shipped-sees-PASS=77  new-sees-PASS=162  unreadable(no token)=0
NEW misses a PASS the shipped reading saw : 0  []
CORPUS verdicts=170  real ^VERDICT: PASS destroyed by Strip-Code = 76
iss-104 tokens in order: FAIL , PASS  -> counts as PASS: True
FIRST<>LAST token disagreements: 21   (17 FAIL->PASS, 4 PASS->FAIL)
MANIFESTS total=170  zero-seam=20

MENTION-VS-TOUCH delivery-gate-stop.ps1: verdicts mentioning=7  PASSed units touching=0
MENTION-VS-TOUCH mc-sessionstart.ps1:    verdicts mentioning=11 PASSed units touching=4

SEAM .claude/hooks/mc-sessionstart.ps1  [Shipped] PASSed-and-touched=1  codex-hooks-links
SEAM .claude/hooks/mc-sessionstart.ps1  [New]     PASSed-and-touched=4  codex-hooks-links, handshake-field-reader, ledger-shard-union-reader, T-017b-snapshot-features-ledger
```

The `MENTION-VS-TOUCH` numbers reproduce the brief's two hand measurements exactly (7/0 and 11/4), which is
the cross-check that the seam is read from the manifest's `## What changed` and never from a grep over the
verdict body.

### 4. Blast-radius census, `qa/probes/roundcap-wouldblock-census.ps1`

```
D:/KnowledgeBase   manifests=172 candidates=0 WOULD-BLOCK=0
D:/erp             manifests=369 candidates=0 WOULD-BLOCK=0
D:/vc              manifests=41  candidates=0 WOULD-BLOCK=0
D:/autoTesting     manifests=264 candidates=0 WOULD-BLOCK=0
this worktree      manifests=170 candidates=0 WOULD-BLOCK=0
```

**An earlier run of the same census, minutes before, reported one true positive** and it is recorded because
it is the only live firing observed:

```
D:/autoTesting     manifests=264 verdicts-read=261 candidates=1 WOULD-BLOCK=1
      CAPPED at673-sessionstart-unclosed-detector (2: at097-session-start-hook-regression, at383-sessionstart-loop-status)
```

`D:/autoTesting` runs its own live loop, so the most likely reason the candidate disappeared is that its
loop wrote that unit's verdict in between. **I did not verify that**, and I am not claiming it: the honest
statement is that the census is a snapshot of a tree I do not control, it showed one genuine third round on
a capped seam when it fired, and it shows none now. 1,016 manifests across five trees, **0 false blocks in
either run**.

### 5. ISS-365 reproductions 1–2, verbatim

```
$ grep -A15 '^## What changed' qa/manifests/handshake-field-reader.md | grep -c 'mc-sessionstart.ps1'
1
$ grep -niE 'round cap|D-014' qa/manifests/handshake-field-reader.md qa/verdicts/handshake-field-reader.md
(no output; exit 1)
```

## Measuring against the ledger (D-015) — by issue id

### `ISS-346: 3/3`

| # | Recorded reproduction | Result |
|---|---|---|
| 1 | `grep -l 'VERDICT: PASS' qa/verdicts/*vector-gap*` returns two files | **met** — `vector-gap-record.md`, `vector-gap-tenant-id.md`, exit 0 |
| 2 | `vector-gap-tenant-id.md` lines 154 / 157 / 187 carry the cap ruling, the security-class exclusion and the round-3 prohibition | **met** — all three read back verbatim (see below) |
| 3 | `vector-gap-durability.md` exists at `ready-for-check` for the prohibited unit and no selection step consults either fact | **met as far as it can be, and the gap is named.** The manifest **does not exist in this tree** — D-044 holds it back until this check lands, so the literal file the row names is absent *by design and by this unit's own ordering constraint*. It is therefore reconstructed in a throwaway tree from **the two real vector-gap manifests and verdicts** plus a candidate synthesised from ISS-346's own description (same seam, `ready-for-check`, no class decision). Result: `REFUSED: True (2 prior PASS(es))`. The second half of the row — "no step consults either fact" — is what the predicate now is. |

```
$ sed -n '154p;157p;187p' qa/verdicts/vector-gap-tenant-id.md
next unit touching this file — not a unit of its own, and explicitly not a third round on this
I considered whether this belongs in the **security class** (never capped). It does not: it is
ISS-122 is filed and must **not** be promoted into a round-3 unit on its own. It is verified
```

### `ISS-365: 4/4`

| # | Recorded reproduction | Result |
|---|---|---|
| 1 | `grep -A15 '^## What changed' qa/manifests/handshake-field-reader.md` names `.claude/hooks/mc-sessionstart.ps1` | **met** — 1 match |
| 2 | `grep -niE 'round cap\|D-014'` over both the manifest and the verdict returns nothing | **met** — no output from either file |
| 3 | PASSed units that **touched** the seam (manifest `## What changed`, reading the operative `VERDICT:` line, not a grep of the verdict body) = **3 before, 4 after** | **met, with one correction to the row, stated rather than quietly absorbed.** The predicate now counts **4**, and the row's own membership is what differs: it names `T-017b-snapshot-features-ledger`, `ledger-shard-union-reader`, `mc-hooks-bolded-status`; the predicate also finds **`codex-hooks-links`**, which landed the same day and whose `## What changed, per file` names that path. So 4 is right and the set is `codex-hooks-links, handshake-field-reader, ledger-shard-union-reader, T-017b-snapshot-features-ledger`. `mc-hooks-bolded-status` is *reachable only because of fix 3* — it cites `file:line` — and drops out again under mutation M5. |
| 4 | `git log --oneline 21b6975..HEAD` shows the gate commit predates maker `1f263e0` | **met** — 13 commits in that range; `1f263e0` is reachable |

**Why I claim ISS-365 rather than listing it as background.** The brief's condition was to claim it only
if the check "would actually have refused `handshake-field-reader` at selection time, and show that". Shown
in Actual outputs 2, against that unit's **real** manifest and the four priors' **real** manifests and
verdicts: `REFUSED: True (4 prior PASS(es))`. It is also the reason fix 4 exists — with fixes 1–3 alone the
same probe printed `REFUSED: False`, because that manifest has no legacy `Status:` line.

## Capability coverage

Falsifying edits are single-hunk, single-file edits to `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1`,
which is the file named in "What changed". Each is applied to a **copy** in a temp tree, parse-checked
before being believed (a mutant that does not parse reddens everything and isolates nothing), and the live
file's sha256 is re-checked after the run. GREEN-before is from the same tree the mutation is applied to.

| # | Capability | Check | Falsifying edit (single hunk) | Observed |
|---|---|---|---|---|
| 1 | a non-security seam with ≥2 PASSed units is **refused at selection time**; threshold is exactly 2 | T2 | **M1** `if ($hits.Count -ge 2) {` → `-ge 3` | GREEN before: `T2 … REFUSED` / RED after: `M1 → RED after` (no block), **CONTROL T1 (0-PASS) stays green** |
| 2 | the count sees a PASS written **inside a code fence** — the canonical `/checker` output form | T2 | **M2** `if (-not (Test-VerdictPass $vt)) { continue }` → the old `Strip-Code`+`VERDICT:?\s*PASS` reading | GREEN before: `T2 … REFUSED` / RED after: `M2 → RED after`, **CONTROL T6 (unfenced bold) stays green** |
| 3 | an early `FAIL` does not hide a later operative `PASS` (the iss-104 shape) | T4 | **M3** `foreach ($x in (Get-VerdictTokens $text)) { if ($x.Token -eq 'PASS') { return $true } }` → `{ return ($x.Token -eq 'PASS') }` | GREEN before: `T4 … PASS` / RED after: `M3 → RED after`, **CONTROL T2 stays green** |
| 4 | a manifest with **no extractable seam** does not make the predicate fail open | T7 | **M4** `return ,$set` → `return $set` | GREEN before: `T7 … PASS` / RED after: `M4 → RED after`, **CONTROL T2 stays green** |
| 5 | a seam cited as `file.ts:15` / `:19-25` — the form this repo's edit-in-place rule requires — counts | T8 | **M5** delete `(?::\d+(?:-\d+)?)?` from the seam-path pattern | GREEN before: `T8 … PASS` / RED after: `M5 → RED after`, **CONTROL T2 stays green** |
| 6 | a candidate carrying only D-042's canonical `**Handshake status:**` is seen | T9 | **M6** `'(?im)^…(?:Handshake[^\S\r\n]+)?Status:\s*ready-for-check'` → the legacy-only `'(?m)^…Status:…'` | GREEN before: `T9 … PASS` / RED after: `M6 → RED after`, **CONTROL T2 stays green** |
| 7 | **CONTROL** — a declared **SECURITY-CLASS** candidate is never capped, at any round count (ISS-078: a cross-tenant read disclosure first found at **round 5** after four consecutive PASSes) | T3 | intentionally none: an edit that reddens this row ships a data leak | GREEN and stays green under M1–M6 |
| 8 | **CONTROL** — a verdict that only **mentions** the seam file does not count toward it | T5 | intentionally none: it is the wrong implementation this unit had to avoid, and the corpus number (7 mentions / 0 touches) is the standing evidence | GREEN; re-derived from the live corpus in Actual outputs 3 |
| — | bold-prefixed fields parse (`**Status:**`, `**VERDICT:**`) — **UNVERIFIED, `ISS-A035913-007`** | T6 | **none is admissible — disclosed, not faked.** The property is implemented **redundantly**: dropping the emphasis strip (`$t = $text -replace '\*\*',''` → `$t = $text`) left T6 **green**, because clause 1's separator class `[^\w\r\n]{0,4}` absorbs the remaining `:** ` on its own. Either mechanism alone suffices, so no one-hunk edit isolates it. Measured in the run recorded above (`M4 … mutation falsified nothing`), then withdrawn. | asserted by T6 and used as M2's control; **not** mutation-covered. Cycle-0 disclosed this row honestly but with no issue id — the checker accepted the redundancy claim (verified it, not just taken it) and assigned `ISS-A035913-007` to turn the disclosure into enumerated debt rather than an unenumerated gap. This cycle carries that id into the row; no new measurement. |
| C7-1 | `MAKER` predicate audited for defect 1 (`Strip-Code`-stripped verdict reading) — **affected, not fixed, `ISS-A035913-002` (medium)** | manual code audit, this cycle (`file:line` above) | none applicable — disclosure, not a falsifiable capability of this unit's own artifact | `MAKER` (`:378`,`:388`) still reads the pre-fix pattern; `$backlog` still sums `fixgap`, so the gate stays loud — only the message (`fixgap` vs `unclosed`) is wrong. Not independently re-measured this cycle beyond confirming the code path; see Cross-predicate audit table above for the citation. |
| C7-2/3 | `MAKER` predicate audited for defects 2 and 3 (`Get-ManifestSeam` unroll / `file:line` seam form) — **not applicable, structurally unreachable** | `Select-String -Pattern Get-ManifestSeam` over the live hook, this cycle | n/a | Both call sites (`:262`, `:278`) sit inside `ROUNDCAP` (`:212`–`:308`), strictly before `MAKER` begins at `:310`. `MAKER` has no seam concept — verified by reading the full `MAKER` block, not merely grepping for the absence. |
| C7-4 | `MAKER` predicate audited for defect 4 (canonical `**Handshake status:**` field) — **affected, NOT fixed, live and SILENT, `ISS-A035913-001` (high)** | live hook run, this cycle, two throwaway trees | the *diagnostic* edit is swapping which field the candidate manifest carries (legacy `Status:` vs canonical `**Handshake status:**`), not a hunk in the hook — this is the audit's own falsification, over the artifact's *behavior*, not a fix to isolate | `A: legacy Status: field → blocked = True` (`BLOCK-MAKER`, 1 pending) / `B: canonical **Handshake status:** field only → blocked = False`, trace `MAKER pend=0 unclosed=0 queue=0 fixgap=0 scheduled=False`. Live hook sha256 identical before and after both runs (`5D6E0994…5162`). This is [C7]'s core finding, now stated rather than silent. |
| I2 | Prose-only seam bypass — a candidate whose `## What changed` cites its seam in prose (no backticked `path/with/slash.ext`) is never compared to any prior PASS, however many it shares — **disclosed as shipped scope limit, `ISS-A035913-003` (high)** | `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1:281` (`if ($c.Seam.Count -eq 0) { continue }`) | n/a — disclosure of an existing code path, not a new capability of this unit to falsify | Re-derived independently, this cycle: `zero-seam = 18` of `171` real manifests (matches the checker's 18/171 exactly, from a fresh extraction). Listed by slug above, including this unit's own manifest. |

## What this unit does not fix, and what it could not execute

- **ISS-190 is inherited, not fixed, and it is the largest thing here.** `D:/ai_os` is a separate repo and
  this worktree cannot commit into it, so the verified byte-state `5d6e0994…5162` of a Stop hook that fires
  in **every project on this machine** is pinned by **no commit in any repo**. The previous unit's change is
  uncommitted there too — that is why the cumulative numstat is `224 7`. The checker of the previous unit
  recommended ISS-190 rise **high → critical**; this unit is a second authorized machine-wide change resting
  on the same volatile working tree, and I agree with that recommendation. **I am deliberately not editing
  that ledger row** (D-019: concurrent lanes have collided on `qa/issues.jsonl`, and an in-place severity
  edit is not an append) — it belongs to the sweep's single consolidation writer.
- **[Cycle 1 correction — this bullet was wrong in cycle 0 and the checker caught it; left below for the
  record, corrected here rather than silently rewritten.]** Cycle 0 said the D-049 shared-log entry in
  `D:/ai_os/decisions/log.md` "has NOT been written by this unit." **It exists** —
  `D:/ai_os/decisions/log.md`, 2026-09-28 heading, item 3 ("Machine-wide Stop hook `delivery-gate-stop.ps1`:
  three fixes …"), citing D-049 and naming this predicate. What is true, and still an open obligation: it is
  **stale**, recording `after 28c1ae44…7337` — this unit's *pre*-state — and `grep -c 5d6e0994
  D:/ai_os/decisions/log.md` = 0, so the shared log carries no trace of this unit's five counting fixes or
  the resulting `5d6e0994…5162` byte state. It is outside this worktree and outside what I can commit.
  **The obligation is stale, not absent, and the unit should not be closed out as if it were met.** Filed
  as **ISS-A035913-005** (the checker's id).
- *(original cycle-0 text, uncorrected, kept for the audit trail):* "D-049's required shared-log entry in
  `D:/ai_os/decisions/log.md` has NOT been written by this unit. D-049 makes it part of the authorization
  so the other projects on this machine have a trace of why their Stop hook changed. It is outside this
  worktree and outside what I can commit. This is an open obligation of the authorization, and the unit
  should not be closed out as if it were met."
- **I could not run the parse check on the live hook.** The auto-mode classifier denied every attempt to
  `Get-FileHash` / `Get-Content` / copy / `ParseFile` that path from a shell (`[Self-Modification]`,
  `[Modify Shared Resources]`), which is correct behaviour for a machine-wide enforcement file. So verify
  step 4 above is **NOT** a command I executed. What I have instead is stronger than a parse check and is
  pasted above: the test **invokes the real hook binary 22 times** and the census extracts and runs its
  parsers, so the file demonstrably parses and executes — a parse error would have made every assertion
  fail. The mutants *were* parse-checked, inside the test. A checker with permission should still run step 4.
- **No live-session behaviour is proven.** Every run feeds a **synthetic one-line transcript** in a throwaway
  tree. The 40 MB tail read, the `$scheduled` turn-boundary scan and the `tool_result` /
  `task-notification` / `local-command-*` discrimination are untouched and unexercised, as the previous
  unit's manifest also disclosed. `ROUNDCAP`'s once-per-session marker is asserted only within single runs,
  never across a real multi-turn session. The 15 s Stop budget was not measured with a real transcript in play.
- **The sibling `MAKER` predicate has the same verdict-reading blindness and I did not fix it** (defect 1;
  see the "Cross-predicate audit (C7)" section above, row 1, `ISS-A035913-002`, medium — the gate still
  blocks, only the message is wrong). `delivery-gate-stop.ps1`'s `elseif ($vtPlain -match
  '(?m)^[\s\-*#>|]*VERDICT:?\s*PASS') { $unclosed++ } else { $fixgap++ }` reads a `Strip-Code`-stripped
  verdict, so on the 76 fenced verdicts a **PASS is miscounted as a fix gap**. That is a defect in the fix-1
  the previous unit shipped, it is out of this unit's scope, and D-049 authorizes the file for the cap
  check — not for a second predicate. **Cycle 0 filed this for the checker to raise as its own row and
  disclosed nothing about defect 4 across the same boundary — that omission is [C7]'s FAIL and is now
  corrected above** (`ISS-A035913-001`, high: defect 4 is live and *silent*, not merely mislabeled, in
  `MAKER`). I did not touch either code path, and no criterion of mine requires it.
- **The predicate accepts any non-empty `Round cap:` value**, including this manifest's own `not applicable`.
  It forces a decision onto the record; it does not validate it. Pre-existing, and the previous verdict
  recorded the same note. The mitigation is that a checker reads the line — as one must read mine.
- **`lint:structure` is not green** for pre-existing reasons (lint-loc violations, root-file count, stale
  `docs/SNAPSHOT.md`, tracker-audit findings). None attributed to this unit; it adds no `packages/` code.

## Links

D-049 (the authority) · D-052 ruling 1 (the ordering) · D-043 (cited by the brief; corrected in scope by
D-049, so **not** the authority for this file) · D-044 · D-042 · D-014 · D-013 · D-015 · D-019 ·
D-020 as amended by D-050-SPEAKER ruling 3 · ISS-346 · ISS-365 · ISS-350 · ISS-190 · ISS-122 · ISS-078 ·
ISS-083 · ISS-205 · ISS-266 · ISS-267 ·
`qa/gates/iss-122-round-cap-breach.md` · `qa/gates/mc-sessionstart-handshake-reader-round-cap.md` (left
OPEN; this unit is the instrument D-052 ruling 1 wanted built before that decision, and takes no waiver) ·
`qa/gates/d043-machine-wide-scope.md` · `C:/Users/Lenovo/.claude/settings.json:124`

## Status: ready-for-check

**Handshake status:** ready-for-check

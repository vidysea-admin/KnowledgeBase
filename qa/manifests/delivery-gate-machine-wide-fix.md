# Manifest — delivery-gate-machine-wide-fix

**Status:** ready-for-check
**Fix cycle:** 0 of max 3
**Authorized by:** `docs/DECISIONS.md` **D-049** (2026-09-28, `Approved-by: Umesh`). Required to land
before `wave/vector-gap-durability` gets a manifest (**D-044**). **D-043 is NOT the authority here** —
it purported to authorize this file on the false premise that it was repo-local; D-049 corrects that.
**Round cap:** not applicable — this is the first unit on the `delivery-gate-stop.ps1` seam since
D-049; 0 prior PASSed verdicts name it.

## Why this unit exists

`D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` is a **Stop** hook registered in the **user-level**
`C:/Users/Lenovo/.claude/settings.json:124`, so it fires in every project on this machine — `d:/erp`
(a live maker loop), `d:/vc`, `d:/autoTesting`, `d:/vidysea/*`, `D:/KnowledgeBase`, every scratch
directory, **and the session that built this unit.** D-049 authorizes three fixes to it at that scope
and requires a matching entry in the shared AIOS log so the other projects have a trace.

## Out-of-repo changes — git here cannot track them

| File | Before (sha256) | After (sha256) | Change |
|---|---|---|---|
| `D:/ai_os/.claude/hooks/delivery-gate-stop.ps1` | `70a242fb5c66027dce68385ac4e3f25c9b670bac49af925d61f71506198c0968` | `28c1ae4463875bf17be245d85cb5baeb92e0a764ad0ee844a652929d11047337` | +142 / −7 lines (606 → 741) |
| `D:/ai_os/decisions/log.md` | (append-only) | — | +72 lines: one dated entry, format matched to the existing entries |

Byte backup of the pre-unit hook, taken **before any edit**:
`C:/Users/Lenovo/AppData/Local/Temp/claude/d--KnowledgeBase/fdac419b-a942-4237-8e3c-fd427729a901/scratchpad/delivery-gate-stop.ps1.PRE-UNIT.bak`
— sha256 `70a242fb5c66027dce68385ac4e3f25c9b670bac49af925d61f71506198c0968`, verified equal to the live
file at backup time. The hook was **clean and committed** in `D:/ai_os` at `87042de` when this unit
started, so `git -C D:/ai_os diff .claude/hooks/delivery-gate-stop.ps1` is exactly this unit's change.

`C:/Users/Lenovo/.claude/settings.json` was **not touched** — D-049 does not authorize it and the
registration did not need to change.

## What changed

### Fix 1 — the `Fix cycle` predicate bug: a fix-gapped handshake was invisible

`delivery-gate-stop.ps1:253, 318, 323, 367-369, 376`. **The defect was found by reading and measuring
the code, not taken from the brief's description.** The MAKER predicate had exactly two outcomes for a
manifest at `Status: ready-for-check`:

- verdict older than the manifest's `Fix cycle` → `pend++`
- a **PASS** at the current cycle → `unclosed++`

A **non-PASS** verdict at the current cycle — a FAIL the maker owes a fix cycle for — fell into
*neither* branch, so a fix-gapped handshake contributed **zero** to `$backlog` and the gate went
**silent** on precisely the state it exists to catch. This is the ISS-266 / ISS-267 class inside this
hook (ISS-267 records the same hole in the sibling `mc-sessionstart.ps1`; ISS-266 records the live
consequence — `delivery-gate-stamp-adoption` sitting at `ready-for-check` with a cycle-1 FAIL, unchanged
for 13 days). There is now a third counter, `$fixgap`, in the counts, the `$backlog` sum, the block
reason, the marker line and the trace line.

Direction: a fix gap **is** pending work, so counting it is the loud direction — the same bias this
predicate already chose when it made an unreadable `Fix cycle` mean `[int]::MaxValue`.

Two other `Fix cycle` candidates were measured and **deliberately not changed**, so a checker does not
have to re-derive that:

- the manifest side takes the **first** `Fix cycle:` match while the verdict side takes the **max**.
  Measured over all 167 manifests: **0 divergences**, so no live defect. Named here as a latent
  asymmetry, not fixed, to keep this unit's diff to what D-049 authorizes.
- `else { [int]::MaxValue }` for an unreadable cycle is correct and stays (ISS-228's fix).

### Fix 2 — the ISS-205 stripper clause (`Strip-Code`, `delivery-gate-stop.ps1:31-52`)

ISS-205's **three own recorded reproductions already passed** on the pre-unit hook — re-measured
verbatim before any edit: 3/3 read 1 where the file's only real stamp is 1. Clauses 1
(`[^\S\r\n]*`) and 2 (the `~` sentinel) had closed them.

What was still open is the property ISS-205 actually *states* — that `Strip-Code` "can MANUFACTURE a
cycle stamp that appears nowhere in the file". The stripper handled only closed ``` fences and paired
inline spans. Three further markdown-code forms were not stripped at all, and each still manufactured
one (measured, read **9** against a real maximum of **1**):

| Form | Why it reaches a verdict |
|---|---|
| **indented** code block (≥4 spaces or a tab) | how pasted command output usually lands in a verdict — a fence is extra typing |
| **`~~~`** fence | markdown treats it exactly like ``` |
| **unclosed** ``` fence | `'```.*?```'` needs the pair; markdown renders an unclosed fence to end of file |

All three are now stripped, in an order that leaves the existing closed-fence rule first so the change
is purely additive to behaviour already measured over the corpus.

### Fix 3 — ISS-346, a mechanical D-014 round-cap check (new predicate `ROUNDCAP`)

`delivery-gate-stop.ps1:54-71` (`Get-ManifestSeam`) and `140-231` (the predicate). Placed **before**
the MAKER predicate, with its own once-per-session marker, so a capped pull is never masked by the
missing-wakeup block.

- **seam** = the source-file **paths** a manifest names in its `## What changed` section. Paths only (a
  `/` is required): measured over 166 real manifests, requiring `/` is what keeps
  `vector-cosine-retriever` out of the `vector-gap` seam, because bare basenames (`types.ts`,
  `session.ts`) recur across unrelated units. Scoped to `What changed` because manifests cite
  neighbouring files in prose (`whatsapp-store.ts:132 derives sessionId`) and counting those would
  fabricate overlaps.
- **candidate** = a manifest at `ready-for-check` with **no verdict file** — a unit awaiting its first
  check, which is exactly ISS-346's state ("manifest exists at `Status: ready-for-check` … and no
  checker dispatched"). Nothing else is read unless a candidate exists, so the common case costs one
  directory listing and adds nothing to the 15 s Stop budget.
- **count** = prior PASSed verdicts whose own manifest's seam shares ≥1 path. At **≥2**, block once.

**The cap stays CLASS-based, never count-based.** D-014 replaced a count-based cap because **ISS-078 —
a cross-tenant read disclosure letting any authenticated caller read every tenant's verbatim transcript
text — first surfaced at round 5 of the search seam after FOUR consecutive PASSes**: severity spiked
with round count instead of decaying. So the hook does **not** classify the unit itself. It supplies the
thing no step supplied (the **count**) and requires the class decision to be **written on the record**
as a `Round cap:` line — security class, a cited waiver, or withdraw-and-`file-don't-fix`. A
security-class unit is never capped; it says so on that line and proceeds at any round count.

**Keyword-sniffing the manifest was tried and rejected on measurement**, not taste: the `vector-gap`
manifests — ISS-346's *own* originating case and a **durability** issue, explicitly ruled outside the
security class by `qa/verdicts/vector-gap-tenant-id.md:157` — name `tenantScope.ts` and tenant ids
throughout, so any generous security keyword set classifies them as security and skips the one case the
check exists for.

### Where the ISS-346 check landed, and why — the open question D-049 asked me to settle

**In the hook. The shared maker `SKILL.md` was not modified.**

Measured, not assumed: the unit-selection logic the check has to guard is **prose**, in two places —
shared `D:/ai_os/.claude/skills/maker/SKILL.md` **step 4** ("Pull the next WAVE … Backlog priority:
`qa/QUEUE.md` top clear TODO row … otherwise open ledger issues by severity …"), which mentions no cap
at all, and each project's own CLAUDE.md backlog-priority section (this repo's carries the D-014 round
cap). There is no script, no tool and no data step anywhere in the selection path: `grep` over
`.claude/skills/maker/` for `round cap` / `prior PASS` / `seam` returns only the unrelated
"Domain adapter (the pluggable seam)" heading.

So a check placed in `SKILL.md` would be one more prose rule, and ISS-346's failure mode is
*specifically* a prose rule a competent agent read and still did not apply ("a rule that is only
honoured when someone remembers it is not a cap"). ISS-346's own `fix_direction` reaches the same
conclusion — option (a) "is advisory and can be skipped exactly the way this rule was skipped … Prefer
(b)" — and D-049's `Changes-authorized` names the hook for exactly that case. Nothing was edited outside
what D-049 names.

### Repo files

- `qa/tests/mc-hooks-fixgap-and-stripper.ps1` (new) — the standing regression test. Placed in `qa/tests/`,
  outside every enforcement path, following `qa/tests/mc-hooks-ledger-union.ps1`.

## How to verify — commands a checker can re-run

```
powershell -NoProfile -ExecutionPolicy Bypass -File D:/KnowledgeBase/qa/tests/mc-hooks-fixgap-and-stripper.ps1
```

Exit 0 = all assertions pass. It runs the **real** hook against throwaway temp trees via the hook's
`cwd`, with `$env:TEMP` redirected into each temp tree so the hook's own per-session markers and
`log.txt` land there and **no real session's block budget is consumed**. Nothing in `D:/KnowledgeBase`
or `D:/ai_os` is read or written except reading the hook itself.

Syntax, independently:

```
powershell -NoProfile -Command "$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('D:\ai_os\.claude\hooks\delivery-gate-stop.ps1',[ref]$t,[ref]$e)|Out-Null; if($e.Count -eq 0){'PARSE OK'}else{$e|%{$_.Message}}"
```

Corpus no-op check for fix 2 (old reader vs new over every real verdict and manifest) and the
would-block census for fix 3 are reproduced in **Actual outputs** below with the code inline.

### D-020 mutation safety, as amended by D-050 ruling 3

The falsifying edits are applied to a **copy** of the hook in a temp directory; the live machine-wide
file is **never armed**. That is strictly stronger than arm/restore — there is no window in which a
mutant is live, which is the ISS-083 hazard class (a `score: 0.5` mutation found applied to production
source) and the reason the pre-commit guard exists. Per mutation: its own copy, its own probe. Every
hook invocation runs inside `Start-Job` with `Wait-Job -Timeout 90`, and a timeout throws rather than
hanging (the earlier hand-rolled harness that hung on a `hop = -1` mutant is why). The live file's
sha256 is captured before the run and re-asserted after it as the final assertion — the post-run
touched-file check D-050 ruling 3 requires.

## Capability-coverage table

Every claim → its isolating check → the falsifying edit → observed green-before / red-after. Control
rows stay green under every mutation, so each red is provably isolated. All rows are assertions in
`qa/tests/mc-hooks-fixgap-and-stripper.ps1`.

| # | Claim | Isolating check | Falsifying edit | Observed |
|---|---|---|---|---|
| 1 | a non-PASS verdict at the current cycle is counted | manifest `Fix cycle: 1` + verdict `VERDICT: FAIL` / `Cycle checked: 1` → `fixgap=1` | **M1** `else { $fixgap++ }` → `else { }` | green → **red** (`fixgap=0`, no block) |
| 2 | …and it reaches the block | same tree → `"decision":"block"` | M1 | green → **red** (silent) |
| 3 | …and is not miscounted | same tree → `pend=0 unclosed=0` | — | green |
| 4 | **CONTROL** a PASS at the current cycle is still `unclosed` | `VERDICT: PASS` → `unclosed=1 fixgap=0` | M1–M6 | green throughout |
| 5 | **CONTROL** a closed-out manifest counts nothing and does not block | `Status: checked-PASS` → all 0, no block | M1–M6 | green throughout |
| 6 | **CONTROL** `ready-for-check` with no verdict is still `pend` | → `pend=1 fixgap=0` | — | green |
| 7 | ISS-205 **(a)** does not manufacture a stamp | reproduction (a) verbatim, real max 1, manifest cycle 3 → `pend=1` | — (already closed pre-unit; see counts) | green |
| 8 | ISS-205 **(b)** does not manufacture a stamp | reproduction (b) verbatim → `pend=1` | — | green |
| 9 | ISS-205 **(c)** does not manufacture a stamp | reproduction (c) verbatim → `pend=1` | — | green |
| 10 | a stamp in an **indented** block is not a stamp | `    Cycle checked: 9`, real max 1 → `pend=1` | **M2** drop the indented-block strip | green → **red** (`pend=0`, silent) |
| 11 | a stamp in a **`~~~`** fence is not a stamp | `~~~` fence holding 9 → `pend=1` | **M3** drop the `~~~` strip | green → **red** |
| 12 | a stamp in an **unclosed** ``` fence is not a stamp | unclosed fence holding 9 → `pend=1` | **M4** drop the unclosed-fence strip | green → **red** |
| 13 | **CONTROL** a plain unfenced stamp is still read | cycle 1 covers cycle 1 → `pend=0 unclosed=1` | M2–M4 | green throughout |
| 14 | a 3rd unit on a seam with 2 prior PASSes and no class decision is blocked | ISS-346's state rebuilt: 2 PASSed `vector-gap` units + `vector-gap-durability` awaiting first check | **M5** `-ge 2` → `-ge 3` | green → **red** (no block) |
| 15 | the block names the count and both prior verdicts | same tree, reason text asserted | M5 | green → **red** |
| 16 | **CONTROL** a declared **SECURITY-CLASS** unit is never capped, at any round count | `Round cap: SECURITY CLASS — cross-tenant read` → no block | **M6** ignore the written class decision | green → **red** *(this red is the ISS-078 inversion; it must stay green in the shipped code, and does)* |
| 17 | **CONTROL** a cited waiver on the record passes the cap | `Round cap: waived once by D-044` → no block | M6 | green → red under M6 |
| 18 | **CONTROL** a unit on a **different** seam is not capped | `cosine.ts` candidate against the `vector-gap` PASSes → no block | — | green (no false seam overlap) |
| 19 | **CONTROL** one prior PASS is under the cap | 1 PASS + candidate → no block | — | green |
| 20 | **CONTROL** a prior **FAIL** does not inflate the PASS count | a FAILed unit on the seam is not counted | — | green |
| 21 | the live machine-wide hook is byte-identical to its pre-run state | sha256 before vs after the whole run | — | green |

## Actual outputs — pasted verbatim

### Parse check, after every edit

```
$ powershell -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw 'D:/ai_os/.claude/hooks/delivery-gate-stop.ps1')) | Out-Null; 'PARSE OK'"
PARSE OK
```

and via the parser API after the ROUNDCAP predicate landed:

```
PARSE OK - 0 errors
```

Plus 30+ successful invocations of the real hook inside the regression run — a syntax error would make
every one of them throw.

### Regression test, full run

```
$ powershell -NoProfile -ExecutionPolicy Bypass -File D:\KnowledgeBase\qa\tests\mc-hooks-fixgap-and-stripper.ps1
FIX 1 -- non-PASS verdict at the current Fix cycle (ISS-266/ISS-267 class)
  PASS  FAIL at the current cycle is counted as a fix gap
  PASS  and it reaches the block (gate no longer silent)
  PASS  it is not miscounted as pending or unclosed
FIX 1 controls
  PASS  CONTROL a PASS at the current cycle is still `unclosed`, not a fix gap
  PASS  CONTROL a closed-out manifest counts nothing and does not block
  PASS  CONTROL ready-for-check with no verdict is still `pend`
FIX 2 -- ISS-205 recorded reproductions (a) (b) (c), verbatim from the ledger
  PASS  ISS-205(a) does not manufacture a stamp (gate stays loud)
  PASS  ISS-205(b) does not manufacture a stamp (gate stays loud)
  PASS  ISS-205(c) does not manufacture a stamp (gate stays loud)
FIX 2 -- ISS-205 clause 3: markdown-code forms Strip-Code never stripped
  PASS  a stamp inside an indented block is not a stamp
  PASS  a stamp inside an ~~~ fence is not a stamp
  PASS  a stamp inside an unclosed ``` fence is not a stamp
FIX 2 control
  PASS  CONTROL a plain unfenced stamp is still read (cycle 1 covers cycle 1)
FIX 3 -- ISS-346 mechanical round cap
  PASS  a 3rd unit on a seam with 2 prior PASSes and no class decision is blocked
  PASS  the block names the count and the two prior verdicts
FIX 3 controls -- the cap is CLASS-based, never count-based
  PASS  CONTROL a declared SECURITY-CLASS unit is never capped, at any round count
  PASS  CONTROL a cited waiver on the record passes the cap
  PASS  CONTROL a unit on a DIFFERENT seam is not capped (no false seam overlap)
  PASS  CONTROL one prior PASS is under the cap and is not blocked
  PASS  CONTROL a prior FAIL on the seam does not inflate the PASS count
FALSIFYING EDITS (against a temp copy of the hook -- the live file is never armed)
  PASS  M1 revert the fix-gap branch (else { $fixgap++ } -> else { }) -> RED after
  PASS    control stays green under M1 revert the fix-gap branch (else { $fixgap++ } -> else { })
  PASS  M2 revert the indented-code-block strip -> RED after
  PASS    control stays green under M2 revert the indented-code-block strip
  PASS  M3 revert the ~~~ fence strip -> RED after
  PASS    control stays green under M3 revert the ~~~ fence strip
  PASS  M4 revert the unclosed-fence strip -> RED after
  PASS    control stays green under M4 revert the unclosed-fence strip
  PASS  M5 raise the cap threshold from 2 to 3 (the ISS-346 count) -> RED after
  PASS    control stays green under M5 raise the cap threshold from 2 to 3 (the ISS-346 count)
  PASS  M6 make the cap COUNT-based by ignoring the written class decision (the ISS-078 inversion) -> RED after
  PASS    control stays green under M6 make the cap COUNT-based by ignoring the written class decision (the ISS-078 inversion)
  PASS  POST-RUN the live machine-wide hook is byte-identical to its pre-run state
  hook sha256: 28C1AE4463875BF17BE245D85CB5BAEB92E0A764AD0EE844A652929D11047337
RESULT: PASS
```

34 assertions, 0 failures.

### Live single-shot proof of fix 1, outside the harness

The hook run by hand against a throwaway tree (manifest `Fix cycle: 1`, verdict `VERDICT: FAIL` /
`Cycle checked: 1`), with `$env:TEMP` redirected:

```
STDOUT: {"decision":"block","reason":"Delivery gate (block 1 of 3 this session): maker-checker project with pending backlog (0 check(s) pending, 0 PASS not closed out, 0 queue row(s), 1 fix-gapped handshake(s) - a non-PASS verdict at the manifest\u0027s current cycle) and THIS TURN made no ScheduleWakeup call. ...}

2026-09-28T08:14:06.8893434+05:30 RUN sid=9a3ac681-... event=Stop active=False cwd=C:\Users\...\dbg2-16eee9e8
2026-09-28T08:14:07.2990034+05:30 BLOCK-MAKER sid=9a3ac681-... pend=0 unclosed=0 queue=0 fixgap=1
```

Before the fix the same tree produced no backlog at all — see M1 in the table.

### Fix 2 — the manufacturing measurement, before the fix

Reader lifted from the pre-unit hook, run over the recorded shapes and the three unhandled forms:

```
ISS-205(a) span-erased value adopts same-line digit        read=1 expect<=1 OK
ISS-205(b) bare label + blank line + digit-leading line    read=1 expect<=1 OK
ISS-205(c) span value + next line leading digit            read=1 expect<=1 OK
ADJ indented (4-space) code block holding a stamp          read=9 expect<=1 MANUFACTURED
ADJ tilde-fenced code block holding a stamp                read=9 expect<=1 MANUFACTURED
ADJ unclosed triple fence holding a stamp                  read=9 expect<=1 MANUFACTURED
```

### Fix 2 — corpus no-op, old reader vs new, over every real file

```
VERDICTS n=166 reads-higher=0 reads-lower=0
MANIFESTS ready-for-check old=2 new=2  fixcycle-diffs=0
```

0 reads higher (the gate can never be silenced), 0 reads lower, 0 `Status` differences, 0 `Fix cycle`
differences. The change is a **strict no-op on all real data** while closing the three manufacturing
forms.

### Fix 1 — what the new counter finds across every live maker-checker project

Counting logic replicated read-only, `Strip-Code` lifted verbatim out of the live hook so the probe
cannot drift from it:

```
D:\KnowledgeBase : pend=1 unclosed=0 NEW-fixgap=1  delivery-gate-stamp-adoption
D:\erp           : pend=2 unclosed=12 NEW-fixgap=20  qa-1075-..., qa-1373-..., qa-1581-..., (17 more)
D:\vc            : pend=0 unclosed=0 NEW-fixgap=0
D:\autoTesting   : pend=0 unclosed=0 NEW-fixgap=0
```

D-049's claim that the defect "is live elsewhere right now" is confirmed: **`d:/erp` has 20 fix-gapped
handshakes the gate could not see.** No project flips from never-blocking to blocking — both projects
with fix gaps already had non-zero `pend`/`unclosed`, so the change makes the count honest rather than
adding noise.

### Fix 3 — would-block census across every live maker-checker project

Candidate + seam + count logic replicated read-only, both helpers lifted verbatim from the live hook:

```
D:\KnowledgeBase : manifests=167 first-check candidates=0 WOULD-BLOCK=0
D:\erp           : manifests=369 first-check candidates=0 WOULD-BLOCK=0
D:\vc            : manifests=41  first-check candidates=0 WOULD-BLOCK=0
D:\autoTesting   : manifests=263 first-check candidates=0 WOULD-BLOCK=0
```

840 manifests, **0 false blocks today**. `ROUNDCAP` fires only on a genuinely new pull past the cap.

## D-015 — the ledger's own recorded reproductions, re-run verbatim, by issue id

### `ISS-205: 3/3`

All three reproductions in the row's `evidence` field, run in the hook runtime:

| Reproduction (verbatim) | Result |
|---|---|
| (a) `Cycle checked: \`x\`9 lines below.` → reads 9, file's only stamp is 1 | **closed** — reads 1 |
| (b) bare `Cycle checked:` line, blank line, `9 issues were written.` → reads 9 | **closed** — reads 1 |
| (c) `Cycle checked: \`N\`` + next line `3 criteria met.` → reads 3 | **closed** — reads 1 |

All three were **already closed before this unit's edits**, by clauses 1 and 2 (commits `4a71633` /
`e5402d6`, retro-ratified at the correct scope by D-049). This unit claims no credit for them and says
so rather than presenting them as its own result. Each is now **pinned** as a standing assertion
(rows 7–9), which they were not before — ISS-229 exists because a previous cycle measured itself against
a self-authored probe table instead of these three.

The row's second half — "the bound used to measure the property scores prose stamps as compliant" — is a
**measurement critique, not a runtime reproduction**. It is answered by the corpus table above, which
compares the old reader against the new one file by file rather than scoring either against a bound that
shares its error.

Related rows, stated rather than silently absorbed: **ISS-227** (reproduction (a) surviving via same-line
digit adoption) and **ISS-228** (the `Fix cycle` predicate's newline-crossing `\s*`) are both closed in
the shipped code and are now pinned by rows 7–9 and 1–3. **ISS-209** (the table pipe in the leading-marker
class) is **untouched** by this unit and remains open.

### `ISS-346: 2/3`

| Reproduction (verbatim) | Result |
|---|---|
| 1. `grep -l 'VERDICT: PASS' qa/verdicts/*vector-gap*` returns two files | **reproduces** — `vector-gap-record.md`, `vector-gap-tenant-id.md` |
| 2. `qa/verdicts/vector-gap-tenant-id.md` lines 154, 157, 187 — the cap ruling, the security-class exclusion, the round-3 prohibition | **reproduces** — all three lines present verbatim |
| 3. `qa/manifests/vector-gap-durability.md` exists at `ready-for-check` … and no selection step consulted either fact | **precondition no longer holds — deliberately left open, see below** |

**Reproduction 3 is named as left open, with its reason:** `qa/manifests/vector-gap-durability.md` does
not exist in this repo (`ls` → *No such file or directory*). D-044 ordered the manifest **not** filed
until this check landed, so the state reproduction 3 describes was correctly dismantled by the very
decision that ordered this unit. Re-creating it in the real repo to satisfy the measurement would be the
breach the check exists to prevent. Its second clause — "no step in the selection procedure counts" — is
what this unit fixes, and it is measured instead in a **throwaway tree that rebuilds that exact state**
(rows 14–15), with M5 as the falsifying edit. That is a reconstruction of a recorded case, **not** a
substitute corpus: the seam, the two prior PASSed slugs and the candidate slug are the row's own.

## What these tests cannot prove — stated plainly

**They do not prove that the fixed predicate behaves correctly against a real live transcript in a real
session.** Every run here feeds the hook a **synthetic** one-line transcript in a throwaway tree, chosen
so the ORPHAN predicate cannot fire first and so no `ScheduleWakeup` is present. A real transcript is
hundreds of megabytes of JSONL, is tail-scanned at 40 MB, and reaches the `$scheduled` turn-boundary scan
— `tool_result`, `task-notification` and `local-command-*` discrimination, the 4,000-line window, the
fallback paths. **None of that is exercised here.** Specifically unproven:

- that a real session's turn boundary is found correctly, so that `fixgap`-driven blocks land on turns
  that genuinely made no wakeup call — the F1 false-block class of 2026-09-09 lives in that code and this
  unit did not touch it, but also did not test it;
- that `ROUNDCAP`'s once-per-session marker interacts correctly with a real harness `session_id` across a
  real multi-turn session (it is asserted only within single synthetic runs);
- that the added work stays inside the 15 s Stop timeout on `d:/erp`'s 369-manifest tree with a
  hundreds-of-MB transcript. The candidate scan short-circuits at 0 candidates there (measured above),
  but that was measured **outside** the hook, not with the timeout in play.

The no-op corpus result and the four-project censuses bound the blast radius; they are not a live-session
observation. A checker wanting one should watch
`%TEMP%\claude-delivery-gate\log.txt` for `MAKER … fixgap=` and `ROUNDCAP candidates=` lines from real
sessions.

## Links

D-049 (authority) · D-044 (ordering) · D-043 (corrected in scope — **not** the authority) · D-014 ·
D-020 as amended by D-050 ruling 3 · D-015 · D-019 · ISS-205 · ISS-227 · ISS-228 · ISS-229 · ISS-266 ·
ISS-267 · ISS-346 · ISS-347 · ISS-078 · ISS-083 · ISS-122 ·
`qa/gates/d043-machine-wide-scope.md` · `qa/gates/enforcement-hooks-unauthorized-and-live-regressed.md` ·
`qa/gates/iss-122-round-cap-breach.md` · `C:/Users/Lenovo/.claude/settings.json:124`

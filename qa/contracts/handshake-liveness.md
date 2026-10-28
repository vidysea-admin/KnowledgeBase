# Contract — handshake-liveness (the maker-checker handshake: stamp format, state machine, liveness predicates)

**Status:** ACTIVE (format and predicates). Authored by the checker on 2026-10-10 under
`qa/gates/handshake-liveness-contract-start.md`, **option A, APPROVED by Umesh (Approver) on
2026-10-10** (D-122). The START question that D-022 requires for a new checker-authored contract is
therefore answered; this file is not a self-widened mandate.

**Limits of this file.** It defines a *format* and *predicates*. It changes **no reader, no hook,
no script, no manifest, no verdict and no ledger row.** The ruling authorizes the contract only; it
authorizes no enforcement-path change (see section 6).

## North star

The machine can compute, from the files alone, exactly one answer to "what does this unit owe, and
to whom?" — and when it cannot compute one, it **says so loudly** instead of reporting zero.

**Why this exists (measured, not argued).** A machine-read field is being recovered from free-form
prose, so every fix round buys exactly one more markdown edge case (the gate's framing, confirmed on
the repo's own history): ISS-176, 183, 184, 186, 192, 193, 194, 196, 199 are all a parser widening or
narrowing against prose. A canonical stamp ends the class; a fourth stripper does not. ISS-199 is
therefore settled **against this contract**, not by another stripping round.

## Scope

Files: `qa/manifests/<slug>.md`, `qa/verdicts/<slug>.md`, the optional dispatch marker
`qa/dispatch/<slug>.json`, and archived copies `*.cycleN.md`. Readers: session-start hook, Stop /
delivery gate, pre-commit guard, `scripts/lib/dispatch-state.mjs`, `scripts/tracker-audit.mjs`, and
checker sweep check 1. Not in scope: issue-ledger status (a *separate axis*, D-042 rule 1), the
`.goal`/TASKS.md status fields, and DECISIONS entries.

---

## 1. The canonical stamp (one format, one place, one per file)

### 1.1 Manifest stamp (written by the maker)

Two lines. Each starts at **column 0**, is **outside any fenced block, HTML comment, blockquote,
list item or table row**, and **appears exactly once in the file**:

```
**Handshake status:** <value>
**Fix cycle:** <N>
```

- `<value>` is exactly one of (case-sensitive): `building` `ready-for-check` `checked-PASS`
  `STALLED` `BLOCKED` `paused` `superseded`. After the value the line may carry a trailer that
  begins with ` — ` or ` (` ; the trailer is prose and is never parsed.
- `<N>` is a non-negative integer, optionally followed by ` of max <M>` and nothing else on the
  line. Regex (exact): `^\*\*Fix cycle:\*\*[ ]+(\d+)(?:[ ]+of max (\d+))?[ ]*$`.
  Status regex (exact): `^\*\*Handshake status:\*\*[ ]+(building|ready-for-check|checked-PASS|STALLED|BLOCKED|paused|superseded)(?:[ ]+(?:—|\().*)?$`.
- **Placement for new writes:** within the first 12 lines of the file (the header block), status
  line first. Readers locate by uniqueness, not position (D-042 rule 2: file position is not edit
  time), so an already-canonical field lower in a file is conforming.
- **One per file means edited in place.** A maker changes state by editing the existing line, never
  by appending a second. History of past states goes in narrative prose, which must not begin a line
  at column 0 with either bold label.

### 1.2 Verdict stamp (written by the checker)

One **stamp block per checked cycle**: two adjacent lines, column 0, outside fences/comments:

```
VERDICT: <PASS|FAIL|HOLD|CONTRACT_MISMATCH>
**Cycle checked:** <N>
```

- Cycle regex (exact): `^\*\*Cycle checked:\*\*[ ]+(\d+)[ ]*$` — nothing after the number.
  Result regex (exact): `^VERDICT: (PASS|FAIL|HOLD|CONTRACT_MISMATCH)[ ]*$`.
- A verdict file holds **one stamp block per cycle**, and a cycle appears once. Two checks in one
  file (e.g. two cycles, or a unit check and a sweep) are separate blocks with *different* cycle
  numbers; the same cycle twice with different results is undecidable (section 3.5).
- Stamp blocks may be ordered newest-first (the existing convention) or oldest-first; **file order
  carries no meaning**. The live reading keys on the cycle number (section 3.1).
- The prose report (the usual fenced `VERDICT/SCOREBOARD/FAILURES/...` block) may repeat the result
  inside its fence; a reader never takes a fenced line as the stamp for a *canonical* file.

### 1.3 Why this format (largest-share rule; the gate file specifies none)

The gate names only "one machine-readable line per field" and the anchor `Cycle checked:` at column
0 with nothing but the number after it (ISS-199 fix_direction). Choice per field = the form most
existing files already use, surveyed 2026-10-10 over `qa/manifests/` (230 live files) and
`qa/verdicts/` (225 live files):

| Field | Canonical | Evidence |
|---|---|---|
| Manifest status | `**Handshake status:**` | D-042 already made it canonical; present in 205 of 230 manifests (190 lines in the exact bold form). No legacy `Status:` spelling exceeds it. |
| Manifest fix cycle | `**Fix cycle:** N` | bold form 150 lines vs bare `Fix cycle: N` 66; `of max 3` trailer is the commonest bold shape (127). |
| Verdict result | `VERDICT: X` | plain `VERDICT: X` is the largest form (164 files), vs `**VERDICT: X**` 23, `## VERDICT:` 17, `Verdict:` 8+6, `**Result:**` 12. Bold `**VERDICT:**` is only 5. |
| Verdict cycle | `**Cycle checked:** N` | 95 files, vs `**Cycle checked: N**` 53 and bare `Cycle checked: N` 76. |

The verdict pair is deliberately the per-field plurality, so the two lines are not styled alike; this
is accepted because the *regex*, not the styling, is the contract.

---

## 2. The state machine

### 2.1 Manifest `Handshake status` values, writers, meaning

| Value | Meaning | Written by |
|---|---|---|
| `building` | maker is working; no check requested. | maker |
| `ready-for-check` | the maker asks for a check of cycle `Fix cycle: N`. Requires the manifest evidence to be complete. | maker |
| `checked-PASS` | the checker PASSed cycle N **and** the maker has closed out (the close-out flip). Requires a verdict with `Cycle checked: N` and `VERDICT: PASS` (section 3.3). | maker, after reading the verdict |
| `STALLED` | cap reached (`Fix cycle` = max with a FAIL) or the loop cannot proceed; needs a human/debug report. | maker or checker |
| `BLOCKED` | waiting on something outside the unit (a gate, an Approver decision, a dependency). | maker |
| `paused` | deliberately set aside by an Approver ruling or the maker with a stated reason. Legacy `HOLD` reads as `paused`. | Approver or maker |
| `superseded` | replaced by another unit; trailer names it (`superseded — by <slug>`). Terminal. | maker (Approver-ruled when contested) |

The **Approver (Umesh)** alone may reverse `paused`/`BLOCKED`/`STALLED` on a gate; nobody but the
checker writes a verdict; the maker never edits a verdict and the checker never edits a manifest
status (except recording a verdict file the maker then closes out).

### 2.2 Verdict results

| Result | Meaning | Debt it creates |
|---|---|---|
| `PASS` | cycle N met the contract. | maker owes the close-out flip. |
| `FAIL` | cycle N did not meet it. **A fix is owed, not a check.** | maker owes cycle N+1 (bump `Fix cycle`, return to `ready-for-check`). |
| `HOLD` | checker cannot rule without an Approver decision (a gate is open). | Approver owes a ruling; consumes no fix cycle. |
| `CONTRACT_MISMATCH` | the contract does not fit the unit, so no judgement was made. | checker owes a contract amendment/gate; **consumes no fix cycle**; not a FAIL. |

### 2.3 Allowed transitions

```
(new)            -> building                      maker
building         -> ready-for-check               maker   (Fix cycle = N)
building         -> BLOCKED | paused | superseded maker/Approver
ready-for-check  -> [verdict N written]           checker (state is DERIVED; manifest unchanged)
   verdict PASS  -> checked-PASS                  maker   (close-out; same N)
   verdict FAIL  -> building                      maker   (Fix cycle := N+1)  then -> ready-for-check
   verdict FAIL at N = max -> STALLED             maker or checker
   verdict HOLD  -> paused | BLOCKED              maker (names the gate)
   verdict CONTRACT_MISMATCH -> building/paused   maker (no cycle bump)
BLOCKED | paused -> building | ready-for-check    maker/Approver
STALLED          -> building                      Approver only (resets or lifts the cap, recorded in DECISIONS)
checked-PASS     -> (terminal; a reopen is a NEW unit slug or an Approver-ruled cycle reset)
superseded       -> (terminal)
```

Disallowed (a reader reports each as undecidable, section 3.5): `checked-PASS` over a FAIL at the
same cycle; `ready-for-check` with `Fix cycle` lower than a verdict's `Cycle checked`; any value
outside the vocabulary; a verdict file for a slug with no manifest.

### 2.4 Archived copies

`<slug>.cycleN.md` (e.g. `u4.1-recording-upload-worker.cycle1.md`, which still reads
`ready-for-check`) are **immutable evidence** of a past cycle. Rule: a file whose name matches
`^.+\.cycle[0-9]+\.md$` is **excluded from every predicate and every census**; its stamp is never
read. Files that are not `.md` (e.g. `parallel-golden-human-review-check.cjs` in `qa/manifests/`)
are ignored.

### 2.5 Dispatch marker (a hint, never evidence)

`qa/dispatch/<slug>.json` = `{slug, cycle, dispatched_at, session_id}`. A matching-cycle verdict
**always beats** the marker. A marker whose cycle is below the manifest's is ignored. A corrupt
marker reads as no marker. An unparseable `dispatched_at` reads as dead, not young. `STALE_MS` =
20 minutes (above the slowest measured Mode A check, ~14 min); erring long is the safe direction.
Source: `scripts/lib/dispatch-state.mjs` (PASSed twice; this contract is the first to judge it).

---

## 3. Liveness predicates (what every reader must compute)

Notation for a live (non-archived) slug: `S` = manifest status, `N` = manifest `Fix cycle`
(canonical, else legacy rule 4.3), `M` = max cycle in the manifest `of max M` (default 3), `C` =
live verdict cycle, `R` = live verdict result, both per 3.1. `C = none` if no verdict file or no
readable stamp.

### 3.1 Reading a verdict

Candidate stamp lines are column-0 `Cycle checked` lines **outside** fenced blocks, HTML comments and
unclosed fences (an unclosed fence suppresses everything to end of file). Fence rule (CommonMark):
opener = 3+ backticks or 3+ tildes, indented at most 3 spaces; a backtick-fence info string contains
no backtick; closer = same character, at least the opener's length, **followed by nothing but
whitespace**. `C` = the maximum candidate cycle. `R` = the result line (section 1.2, or a tolerated
legacy form, 4.1) at minimum line distance to the `C` line; ties break to the earlier line; **more
than one distinct result at distance-tied or at the same max cycle is undecidable (3.5 U7)**.

### 3.2 Check pending

`S = ready-for-check` AND (`C = none` OR `C < N`). Sub-state, from the marker (2.5): `not-dispatched`
(no marker for cycle N); `in-flight` (marker for N, age <= STALE_MS); `checker-died` (marker for N,
age > STALE_MS or unparseable). `checker-died` is pending **and** flagged attention; recovery is
re-dispatch **without consuming a fix cycle**. A `not-dispatched` unit whose manifest was last
committed more than STALE_MS ago is also flagged **stale (3.6)**.

### 3.3 PASS not closed out

`C = N` AND `R = PASS` AND `S <> checked-PASS` (normally `S = ready-for-check`). The converse is a
defect: `S = checked-PASS` with `R <> PASS` or `C <> N` is **undecidable (U5)** for canonical
manifests; for legacy manifests it is only *counted* in the baseline (many early closes pre-date
stamped verdicts), not raised.

### 3.4 Fix owed

`C = N` AND `R = FAIL` (the maker has not yet bumped `Fix cycle`). It is **its own bucket**: it is not
"pending" and not "unclosed", and a unit must be counted in exactly one of {pending, fix owed, PASS
unclosed}. If `N >= M` and `R = FAIL`, the unit is **cap-exhausted**: report as fix owed **and**
STALLED-required (attention), because the next cycle would exceed the cap. `R = HOLD` reports as
`held` (Approver owes a ruling); `R = CONTRACT_MISMATCH` reports as `contract owed` (checker owes).
Neither consumes a cycle and neither is "pending" or "fix owed".

### 3.5 Undecidable (must be reported as needing attention, never as zero)

A unit is undecidable, and listed by slug with its reason code, when any of:

- **U1** no readable status in the manifest (no canonical field and no tolerated legacy line);
- **U2** a status value outside the vocabulary and the alias table (4.2);
- **U3** two or more canonical `**Handshake status:**` lines whose values differ, or legacy status
  lines that disagree after aliasing and no canonical field exists (D-042 rule: write only when they
  agree);
- **U4** two or more distinct `Fix cycle` values and no single canonical `**Fix cycle:**` line;
- **U5** `checked-PASS` over `R <> PASS` or `C <> N` (canonical manifests); `C > N`; a verdict with
  no manifest;
- **U6** a verdict file with no readable `Cycle checked`, or no readable result, when the manifest is
  `ready-for-check` (when the manifest is closed/terminal this is baseline-counted, not raised);
- **U7** conflicting results at the same max cycle or at a distance tie;
- **U8** the reader itself failed (unreadable directory, thrown exception, unparseable file). A reader
  that cannot read **must emit undecidable, not an empty healthy-looking result** (cf. the silent-
  failure class in `tracker-audit.mjs`).

Session-start/Stop output must carry a **separate** counter, e.g. `Undecidable: K (slugs...)`. A line
that prints `Checks pending: 0 | PASS not closed out: 0` while K>0 or while any unit is fix-owed, held,
stalled, or checker-died is **non-conforming** (that exact output is the ISS-350/ISS-267 incident).

### 3.6 Stale / abandoned

- **stale-undispatched:** `S = ready-for-check`, no matching-cycle marker, no matching verdict, and the
  manifest's last commit older than STALE_MS.
- **checker-died:** 3.2.
- **abandoned:** `S = building` or `S = BLOCKED`, and the manifest's last commit older than 7 days
  (`ABANDON_MS = 7*24*3600*1000`). `paused`, `STALLED`, `superseded` are listed in the summary but
  are not "abandoned".
- Age is taken from `git log -1 --format=%cI -- <manifest>` (file position and mtime are not edit
  time). If git is unavailable, age is unknown and the unit is flagged undecidable-age (U8), not fresh.

### 3.7 Backlog consequence

`BACKLOG_EMPTY` (repo CLAUDE.md) additionally requires: fix owed = 0, held = 0, contract owed = 0,
checker-died = 0, stale = 0, **undecidable = 0**. Open `low` issues remain irrelevant to it.

---

## 4. Legacy files (read tolerantly; never rewritten)

### 4.1 Tolerated spellings (read-only grammar)

Applies only to a file with **no** canonical field of that kind. Line must start at column 0 (leading
`#`s, `-`/`*` bullet allowed); blockquote `>` and table `|` lines, fenced blocks and HTML comments
are never read.

- Manifest status: `## Status: v`, `**Status:** v`, `Status: v`, `**Status: v**`, `Handshake status: v`
  (unbolded), `- **Status:** v`. Value is the first word.
- Manifest fix cycle: `Fix cycle: N`, `**Fix cycle:** N`, with any trailer (`of max 3`, ` · Issues
  addressed ...`, prose). Absent = `0` only if no verdict exists with a cycle above 0; otherwise U4.
- Verdict cycle: `Cycle checked: N`, `**Cycle checked: N**`, `- **Cycle checked:** N`, `## ...`.
- Verdict result: `Verdict: X`, `**VERDICT: X**`, `**Verdict: X**`, `## VERDICT: X`,
  `**VERDICT:** X`, `**Result: X**`, `RESULT: X`, `Result: X`, `Status: X` (only inside a verdict
  file), and a bare column-0 `**PASS**` / `**FAIL**`. For **result only**, a line inside a fenced
  report block is accepted when the file has no unfenced result (78 verdicts keep the result only
  inside the checker's report fence). It is never accepted for the cycle number (ISS-196).

### 4.2 Value aliases

`BUILDING`, `in-progress`, `reset-awaiting-rebuild` -> `building`; `HOLD`, `PAUSED` -> `paused`;
`superseded-by <slug>` -> `superseded`. `implementation-ready`, `approved-for-implementation`,
`approved-plan-pending-schema-authorization` and any other word are **not** aliased: U2.

### 4.3 Legacy rules

1. A canonical field always beats a legacy line of the same kind.
2. Without a canonical status, all legacy status statements must agree after aliasing, else U3.
3. Multiple distinct legacy `Fix cycle` values with no canonical line = U4 (history sections such as
   `## Fix cycle 2` or older `Fix cycle: 2` paragraphs are the known cause).
4. Legacy `Fix cycle` absent = 0 only under the 4.1 condition.

### 4.4 Malformed

A file is **malformed** if it triggers any of U1-U4, U6, U7 (and can therefore not be read to one
state). Malformed files stay readable as "needs attention" until fixed by an **additive** edit.

### 4.5 Migration (no rewriting of old verdicts)

- Old verdicts are **never rewritten**. Commit messages and verdicts cite them (D-019/D-042 reasoning).
- **Touch-to-convert:** any manifest or verdict *created or next modified for a new cycle* after this
  contract is adopted carries the canonical stamp (maker for manifests, checker for verdicts). For a
  verdict this means a new canonical stamp block for the *new* cycle, above or below the legacy text;
  legacy blocks of older cycles stay as written.
- **Optional additive backfill** (its own unit, not required for conformance of readers): append one
  canonical `**Fix cycle:** N` line to manifests that already carry `**Handshake status:**` but only a
  legacy `Fix cycle` (56 files), and append stamp blocks to malformed files. Appending is additive and
  disagreement with legacy text surfaces as U3/U4/U7 rather than being hidden.
- Readers must implement section 4.1 permanently; the canonical format is the *write* rule.

---

## 5. Acceptance criteria (a future implementation unit is judged against these)

Each criterion gives the file state, then the expected reading. All run against ONE shared fixture
corpus used by every reader (C24); a reader that passes alone but disagrees with another reader fails.

**C1 — canonical manifest reads.** Manifest lines `**Handshake status:** ready-for-check` and
`**Fix cycle:** 1 of max 3`. Expect `S=ready-for-check, N=1, M=3`.

**C2 — ISS-A035913-001 (verbatim).** Two identical throwaway trees differing only in the field name:
legacy `**Status:** ready-for-check` -> pending (`BLOCK-MAKER pend=1`); canonical
`**Handshake status:** ready-for-check` -> pending, **`pend=1`**, not `MAKER pend=0 unclosed=0 queue=0
fixgap=0, no block`. Every reader, both field names.

**C3 — uniqueness.** Two column-0 `**Handshake status:**` lines with values `checked-PASS` and
`ready-for-check` (handshake-field-reader.md shape). Expect U3, listed; not pending, not zero.

**C4 — vocabulary.** `**Handshake status:** in-progress` -> U2 (canonical field, out of vocab).
Legacy `Status: in-progress` -> alias `building` (not pending). `Status: implementation-ready` -> U2.

**C5 — canonical verdict reads.** `VERDICT: FAIL` immediately above `**Cycle checked:** 1` -> `C=1,
R=FAIL`. Trailing text after the number (`**Cycle checked:** 1 (matches ...)`) is **not canonical**; it
is read via 4.1 and counted as legacy.

**C6 — newest-first multi-cycle file (ISS-350 reproduction 3).** hybrid-merge.md shape: `Cycle checked:
3` + `VERDICT: PASS` near line 11, an older `Cycle checked: 1` + `VERDICT: FAIL` near line 380. Taking the
last VERDICT match yields FAIL; the contract reading is `C=3, R=PASS`.

**C7 — check pending.** `S=ready-for-check, N=0`, no verdict file -> pending (`not-dispatched`).
`N=2` with a verdict at `C=1` -> pending.

**C8 — fix owed, counted once (ISS-267 fixture, verbatim).** A manifest at `Fix cycle: 1` plus a
verdict at `Cycle checked: 1` / `VERDICT: FAIL` must be reported **once, as fix owed, and NOT
double-counted as pending**. The session line is `fix owed: 1`, not `Checks pending: 0 | PASS not
closed out: 0`.

**C9 — PASS not closed out.** `S=ready-for-check, N=0`, verdict `C=0, R=PASS` -> PASS-unclosed, not
pending, not fix owed. (iss-322-333-sender-authentication shape: legacy `Status: ready-for-check`,
`Fix cycle: 0`, verdict PASS cycle 0.)

**C10 — checked-PASS is clean only when matched.** `checked-PASS`, `N=1`, verdict `C=1, R=PASS` -> none
of the buckets. Same manifest with verdict `C=1, R=FAIL` -> U5 (canonical), never silently clean.

**C11 — HOLD and CONTRACT_MISMATCH.** `C=N, R=HOLD` -> `held`. `C=N, R=CONTRACT_MISMATCH` -> `contract
owed`. Neither increments `Fix cycle`, neither is pending, neither is fix owed
(iss-368-heartbeat-read-failure-is-not-health and ledger-duplicate-id-guard are the live examples).

**C12 — cap.** `N=3 of max 3`, `C=3, R=FAIL`, `S<>STALLED` -> fix owed + cap-exhausted flag.

**C13 — non-pending states are listed, not hidden.** `building`, `BLOCKED`, `paused`, `STALLED`,
`superseded` never count as pending; the summary prints their counts. `building`/`BLOCKED` past 7 days
-> abandoned.

**C14 — archived copies (verbatim case).** `qa/manifests/u4.1-recording-upload-worker.cycle1.md` reads
`**Handshake status:** ready-for-check`; `qa/verdicts/u4.1-recording-upload-worker.cycle1.md` and
`.cycle2.md` exist. Expect: all three excluded; they contribute to no counter. The live
`u4.1-recording-upload-worker.md` (`checked-PASS`, `Fix cycle: 3`) is read normally.

**C15 — dispatch states (ISS-178 recorded reproduction + fix_direction, verbatim).**
(a) `ready-for-check`, no `qa/verdicts/<slug>.md`, no marker -> `not-dispatched` (never "died").
(b) marker `{slug,cycle:N,dispatched_at}` younger than 20 min, no matching verdict -> `in-flight`.
(c) marker older than 20 min, no matching-cycle verdict -> `checker-died` (high attention),
re-dispatch **without consuming a fix cycle**.
(d) recurrence of 2026-09-25: `t-030-telegram-alerts`, `Fix cycle 0`, `Status ready-for-check`, no
verdict at any cycle, `qa/dispatch/` holds only another slug's marker -> `not-dispatched`, flagged
stale once the manifest's last commit is older than 20 min; it must not read as healthy.
(e) a matching-cycle verdict beats a marker of any age; a corrupt marker = no marker; an unparseable
`dispatched_at` = `checker-died`, never `in-flight`.

**C16 — undecidable is never zero.** Any fixture in U1-U8 yields a named `Undecidable: K` entry with
slug and reason; a reader that throws or finds an unreadable directory emits U8, not an empty result.
A session line with K>0 and all other counters 0 must still be non-silent.

**C17 — ISS-196 reproductions (verbatim; each must NOT be read as a stamp).** The recorded shapes
(16 probes: 12 already correct, 4 overcount). Each text below is placed in a verdict whose only
real stamp is `**Cycle checked:** 1`; expected `C=1` in every case (the quoted `9`/`7` never wins):
- (a) `~~~` line, `Cycle checked: 9`, `~~~` line -> not counted (tilde fence). Without the real stamp,
  `C=none`.
- (b) `<!-- Cycle checked: 9 -->` -> not counted.
- (c) ``see `Cycle checked: 9` here`` -> not counted (mid-line span; also not at column 0).
- (d) an **unclosed** ``` fence containing `Cycle checked: 9` -> not counted (an unclosed fence
  suppresses to end of file); and a ````-wrapped fence containing an inner ``` pair around `Cycle
  checked: 7` -> not counted. The issue records (d) as a shape (outputs 9 and 7), not as byte text;
  these two are the representative fixtures and must be kept verbatim in the test.
Also the recorded live fact: shape (c) is live prose in 10 verdict files and must read as zero
stamps there.

**C18 — ISS-199 reproductions (verbatim).** Expected: none of the quoted numbers is read.
1. ``see ``Cycle checked: 9`` here`` (double-backtick span) -> not counted (was 9).
2. ``a ` b `Cycle checked: 9` `` (odd backtick count on one line) -> not counted (was 9).
3. A verdict containing ``` / `Cycle checked: 9` / ``` `` trailing`` / `Cycle checked: 8` -> the
   closer carries trailing text so per CommonMark it is not a closer; the fence is unclosed and
   suppresses everything after it -> `C=none` (was 8).
Also: the indented-fence allowance (up to 3 spaces) is tested both ways (3 spaces closes, 4 does
not). These close ISS-199 **by the canonical anchor and 3.1, not by a fourth stripper**; the
regression test must name ISS-199 and report `3/3` by id.

**C19 — ISS-178 three-state report from the sweep.** Sweep check 1 reports three states, not two:
no stamp = never dispatched; stamp younger than 20 min = in flight; older with no matching-cycle
verdict = CHECKER DIED. (This is the unmet obligation 5 recorded on ISS-178 by the dispatch-state-
tracking cycle-1 check.)

**C20 — legacy forms read (ISS-350 reproduction 4).** Each of `Verdict: PASS`, `VERDICT: PASS`,
`**VERDICT: PASS**`, `## VERDICT: PASS`, `**Verdict: PASS**`, `**Result: PASS**`, bare `**PASS**` at
column 0 reads as `R=PASS`. The 40+ closed-PASS units writing `Verdict: PASS` must not read as no
verdict. (The session-start `Select-String 'VERDICT:\s*PASS'` is case-insensitive but blind to
`**Result: PASS**` and bare `**PASS**`.)

**C21 — legacy manifest forms read (ISS-350 reproduction 1).** Each of `## Status: ready-for-check`,
`**Status:** ready-for-check`, `Status: ready-for-check`, `**Status: ready-for-check**` reads
`S=ready-for-check`. An anchored grep for one form sees 30 of 159 — the reader must see all. A
prose/blockquote mention (`> Status: ready-for-check`) and a schema example in a fence must not.

**C22 — legacy disagreement.** Legacy `Status: BLOCKED` written *below* a `checked-PASS` status and no
canonical field -> U3. With a canonical field `checked-PASS` -> `checked-PASS` (rule 4.3.1; position is
not time).

**C23 — result inside the report fence (legacy).** A verdict whose only `VERDICT: PASS` is inside a
fenced report block and whose `Cycle checked: 3` is outside -> `C=3, R=PASS`. A `Cycle checked: 9`
inside the same fence is not read.

**C24 — one corpus, every reader.** The session-start hook, the Stop/delivery-gate predicate, the
pre-commit guard, `dispatch-state.mjs`, `tracker-audit.mjs` and sweep check 1 are all run over the
same fixture directory and must produce identical per-slug {S, N, C, R, bucket}. Reader-vs-reader
disagreement is a failure even when each is "right" against its own fixture.

**C25 — corpus census reproduces.** Run over the live repo, a conforming implementation's census
equals the baseline in section 7 (within the files changed since 2026-10-10), and lists the same
malformed file names. A reader that classifies the live corpus without producing a census does not
satisfy C24.

**C26 — migration safety.** No criterion above requires editing an existing verdict; a diff of
`qa/verdicts/` from the implementing unit may only add files or append stamp blocks for new cycles.
Any rewrite of an existing verdict line is a failure.

---

## 6. Readers that must change (this contract changes none)

| Reader | Where | Today | Needed |
|---|---|---|---|
| Session-start hook | `.claude/hooks/mc-sessionstart.ps1` | no `Handshake` anchor; no FAIL-at-current-cycle bucket (ISS-267, ISS-350, ISS-A035913-001 sibling); prints 0 over fix-owed units | 3.1-3.5 buckets, separate `Undecidable` counter, `$backlog` includes fix owed/held/undecidable |
| Pre-commit guard | `.claude/hooks/mc-precommit.ps1` | same legacy anchor family (audit requested by ISS-A035913-001) | same predicates |
| Dispatch state | `scripts/lib/dispatch-state.mjs` (+ `.test.mjs`) | `canonicalHandshakeStatus` exists; stripper-based `verdictCycle`; `manifestCycle` takes first legacy match | replace stripper with 3.1 fence-aware, column-0 stamp reading; add fix owed/held/undecidable |
| Tracker audit | `scripts/tracker-audit.mjs` | reads handshake with its own parser | share one parser (C24) |
| Sweep check 1 | `skills/checker/SKILL.md` procedure (checker-owned) | two states | three states + undecidable (C19) |
| Machine-wide Stop gate | `delivery-gate-stop.ps1` (:375 MAKER predicate) and `tracker`-level readers | lived in `D:/ai_os`; **`D:/ai_os` does not exist on this machine** | cannot be edited or verified here; implementer must carry the same fixtures to wherever it lives (contract `delivery-gate.md` already names it) |

**Enforcement paths.** Everything under `.claude/hooks/*` (and `scripts/append_decision.ps1`,
`.claude/settings.json`) is an enforcement path: editing it needs a DECISIONS entry with
`**Approved-by:** Umesh` recorded after explicit confirmation. The 2026-10-10 ruling authorizes
**this contract only**. `ISS-267`, `ISS-A035913-001` and the round-cap gate
`qa/gates/mc-sessionstart-handshake-reader-round-cap.md` queue changes to the same hook and should be
answered and landed together (ISS-214). `scripts/lib/dispatch-state.mjs` and `scripts/tracker-audit.mjs`
are not enforcement paths and can be built through `/maker` once a unit is pulled; they are **not**
exempt from the D-014 round cap (this seam is non-security: count prior PASSes first).

---

## 7. Measured baseline (2026-10-10, HEAD 536a56a, live non-archived `.md` only)

Method: survey script over `qa/manifests/*.md` (230 live; 1 archived copy and 1 `.cjs` excluded) and
`qa/verdicts/*.md` (225 live; 2 archived copies excluded). Classification: **conforming** = meets 1.1
resp. 1.2 exactly; **legacy** = decidable under section 4 but not canonical; **malformed** = U1-U7.

**Manifests: 230 live = 138 conforming + 85 legacy-tolerated + 7 malformed.** (Of the 85 legacy, 29 have
no canonical status at all — including recent units such as `iss-322-333-sender-authentication`,
`iss-capture-001-trusted-sender-domain-spoof`, `iss-368-heartbeat-read-failure-is-not-health` which
postdate D-042 and used plain `Status:` — and the other 56 have the canonical status but only a legacy `Fix cycle` spelling.)

Status-line spellings seen (lines): `**Handshake status:** v` 190; `## Status: v` 71; bare `Status: v`
69; `**Status:** v` 44; `**Status: v**` 25; `Handshake status: v` (unbolded) 4. Values: checked-PASS
dominant; also ready-for-check, superseded 3, STALLED 2, reset-awaiting-rebuild 2, BLOCKED 3,
BUILDING 3, HOLD 1, in-progress 2, implementation-ready 1, approved-* 2. Fix-cycle spellings:
`**Fix cycle:** N of max 3` 127 files, bare `Fix cycle: N` 59, `**Fix cycle:** N` bare 18,
trailer forms 11; 18 manifests carry no Fix cycle line.

**Malformed manifests (7):**
- `delivery-gate-manifest-blindness.md` — U4 (Fix cycle 0 vs 2 vs 3, no canonical line)
- `write-guard-enforcement-gaps.md` — U4 (0 vs 2 vs 3)
- `scoped-collection-updateOne.md` — U4 (3 vs 2)
- `u0-zoom-iframe-traversal.md` — U4 (3 vs 2)
- `parallel-jobs-read.md` — U2 (`implementation-ready`)
- `webinar-release-repair-plan.md` — U2 (`approved-for-implementation` and `approved-plan-pending-schema-authorization`)
- `handshake-field-reader.md` — U3 (two canonical lines: `checked-PASS` vs `ready-for-check`)

Also non-vocabulary canonical values read by alias, not malformed: `t052-executable-registration.md`
(`in-progress` -> building), `umesh-calendar-attendance.md` (`HOLD` -> paused),
`bounded-ask-source-context.md` (unbolded `BUILDING`).

**Verdicts: 225 live = 17 conforming + 199 legacy-tolerated + 9 malformed.** Result-line spellings
(files): `VERDICT: X` 164, `**VERDICT: X**` 23, `## VERDICT: X` 17, `**Result: X**` 12,
`Verdict: X` 8, `**Verdict: X**` 6, `**VERDICT:** X` 5, others <=2; 78 files carry the result only
inside the checker's fenced report; 8 carry only a bare `**PASS**`/`**FAIL**`. Cycle spellings
(files): `**Cycle checked:** N` 95, bare `Cycle checked: N` 76, `**Cycle checked: N**` 53, bullet forms 2.
27 verdict files hold more than one distinct cycle (multiple checks in one file, newest-first);
3 use `VERDICT: HOLD`, 2 use `CONTRACT_MISMATCH`.

**Malformed verdicts (9):**
`calendar-auto-join.md`, `evaluator-calibration.md`, `live-record-repair.md`,
`speaker-rules-data-module-extraction.md`, `u2-4-phase3-precision-regate.md` (no `Cycle checked`
outside a fence); `disable-thinking-budget.md`, `session-pages-accessor.md`, `webinar-portable-release.md`
(no result line); `transcription-empty-result-guard.md` (neither).
Of these, only **`u2-4-phase3-precision-regate`** (manifest `ready-for-check`) and
**`webinar-portable-release`** (manifest `in-progress`, no canonical field) sit on a manifest that is
not closed: those two are **live undecidable today (U6)** and the current session-start line counts
neither. The other seven attach to closed `checked-PASS` manifests and are baseline-counted only.

Not measured here: same-cycle conflicting results inside one verdict file (U7), and the per-slug
git ages for 3.6 — the implementing unit must produce both (C25).

---

## Amendment log

- 2026-10-10 — created (option A, D-122). No prior revision.

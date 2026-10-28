# iss-298-ledger-id-allocator - independent check
Cycle checked: 0
VERDICT: FAIL

Checked commit 1595722 (base a71685e), worktree KnowledgeBase-lanes/alloc, node v24.19.0. Contract judged by its text, as directed.

## Scope
`git show --stat 1595722`: 5 files, all new (3 scripts, `qa/issues.alloc.jsonl`, manifest). `scripts/lib/id-divergence*` untouched. `git diff a71685e 1595722 -- qa/issues.jsonl 'qa/issues.*.jsonl'` shows only the 3 added rows of the new shard; no pre-existing row edited.

## Contract table (qa/contracts/ledger-id-allocation.md)
| Id | Verdict | Proof |
|---|---|---|
| C1 one operation | Met in code (lock, read union, pick, re-read, one append). NOT met on the real ledger: the allocator refuses it (see Defect 1) | test "C1 ..."; my append probes |
| C2 re-verify before write | Met exactly (`afterAllocate` seam; abort, never overwrite) | "C2 re-verification"; mutation M1 |
| C3 citation gate | NARROWER: `cite-check` reads only `ISSUES-WRITTEN` lines, flags unresolved ids or rows whose feature is another known unit's slug; not wired as a gate | "C3/I3"; ISS-ALLOC-003 |
| C4 no renumber | Met (no code path rewrites a row; only `appendFileSync`) | "byte-identical"; grep for writes |
| C5 duplicates hard fail | Met, both `file:line` named, exit 1 | "C5 duplicate across main and shard"; mutation M1 |
| C6 correction recorded | Process, not code. Acceptable: the contract places the mapping in the verdict | none needed |
| I1 append-only | Met | byte-prefix test |
| I2 shard not a copy | Met (every read is the union) | "C1 union" |
| I3 detector can fail | Met for the narrowed C3 (mis-cited fixture reported, fixed one clean) | "C3/I3" |

C3 and C6: delivering the narrower C3 is NOT by itself a FAIL, and it is not the earlier attempt's CONTRACT_MISMATCH. The earlier verdict (`ledger-duplicate-id-guard`) stopped on a different gated contract (tracker-integrity [C7], `lint:structure` exit 0) and merely noted this contract was not adopted. Here the maker's narrowing is principled (the contract's literal rule "row feature != citing unit" flags 240 of 266 real citations, almost all legitimate); but "runs as a gate in tracker-audit" is genuinely undelivered. That residual is a contract-author/Approver matter (how a unit declares its feature; whether the gate goes in tracker-audit), not something the maker can settle, and I do not hold the unit on it. It is routed as an open item below.

Ratification: the contract header says `Status: proposed`. Other contracts (delivery-gate, etc.) carry the same word and are used as ground truth in this repo, so "proposed" alone does not void it; but no entry in docs/DECISIONS.md names `ledger-id-allocation` or ISS-298 (grep: no hits; only a list mention in docs/spec.md), and the earlier verdict records it as "not adopted". So the contract is checker-authored, never Approver-ratified. Consequence: this verdict measures the unit against that text only; no Approver has accepted the text, and wiring the tool into hooks or skills (enforcement paths) needs an Approver entry with `Approved-by: Umesh`. Adoption is not implied by any verdict.

## Defect 1 (blocking): the tool rejects ids that Approver decisions put in the ledger
`verify` on the real ledger (read-only), exit 1:
```
rows=479 findings=4   (478 at maker's commit; +1 is my ISS-ALLOC-004)
wrong-form issues.jsonl:142 / :143 / :358 / :359
```
Ids: ISS-C-CLAIMS-TARGETING-001, ISS-C-TOPICREFS-ARG-001, ISS-360-OBSFLAKE, ISS-360-HEARTBEAT. No duplicates, no unparseable lines, no id-less row in the union today (confirmed: the four are the only findings).
- ISS-360-OBSFLAKE / ISS-360-HEARTBEAT: D-055 ruling 2 (`Approved-by: Umesh`, status ACTIVE) explicitly PROMOTES them to real ids and retires bare ISS-360. They are lawful.
- ISS-C-CLAIMS-TARGETING-001 / ISS-C-TOPICREFS-ARG-001: lane-form ids sitting in the main file. D-019 says lane ids are never renumbered on merge, so a lane-form id in the main file is exactly what D-019 produces. They are lawful.
- The "main ids must be plain ISS-digits" rule appears nowhere in the contract; the maker invented it. So this is a defect in the TOOL (its read grammar is stricter than decisions already in force), not in the ledger, and not a gap needing a new Approver ruling. ISS-ALLOC-001's fix_direction ("Approver decision... grandfather or accept") over-escalates. Right resolution: keep ALLOCATION strict (new main ids `ISS-<n>`, new lane ids `ISS-<LANE>-<nnn>`), but make the READER accept any `ISS-<QUALIFIER...>-<digits|WORD>` already present in either file kind, still counting duplicates across the whole union; do not add an allowlist, do not rename rows. The max-numeric computation for main must keep ignoring qualified ids. ISS-ALLOC-001 stays HIGH (it makes the tool unusable on the only ledger it exists for).

## Defect 2 (non-blocking, ISS-ALLOC-004, medium): lock acquisition can spin forever
EACCES/EPERM on creating the lock plus an absent lock file takes the `ENOENT -> continue` branch, which skips the 8 s deadline and the sleep. Reproduced on a temp copy with `icacls /deny product:(WD,AD)` on the temp qa dir: process still running at 20 s (killed). Fails closed (nothing written) but hangs and burns a core.

## Experiments (temp copies only; real qa/issues*.jsonl untouched)
Allocation: main ISS-99, 100, 7 -> next `ISS-101` (numeric, gap not reused); lane x with ISS-X-005 -> `ISS-X-006`; new lane -> `ISS-NEWLANE-001`; past 999 -> `ISS-Z-1000` (unpadded, fine); lane `a` and `a-b` do not interfere (`ISS-A-002`, `ISS-A-B-003`); plain id in a shard and lane id in main both refused (per the tool's own, too-strict grammar). `ISS-007` in main counts as 7 -> `ISS-8`.
Lane names: rejected `..`, `a/b`, `a\b`, `C:x`, `nul`, `con`, `NUL`, `aux`, `com1`, `lpt9`, `x.`, `x `, ` x`, empty, 300 chars, `x.jsonl`, `a.b`, `-x`, `a b`, non-ASCII, NUL byte, `.x`. Accepted: `issues` (gives qa/issues.issues.jsonl; harmless). Case: lane `Foo` against existing `issues.foo.jsonl` resolves to the same file on this case-insensitive FS, next id `ISS-FOO-002`, no second file; uppercase-named existing shard `issues.Bar.jsonl` also counted (`ISS-BAR-002`).
Refusals (all "Nothing was changed", exit 1, file bytes unchanged): invalid JSON line, row with no id, non-string id, array row, duplicate within a file, duplicate across files (2 findings, both locations), UTF-8 BOM (main and shard), partial last line (`{"id":"ISS-2","fea`) and unterminated-but-parseable-prefix line: refused and reported, never skipped. Tolerated: empty file (-> `ISS-1`), absent main file (created), blank line in the middle (matches `readLedgerRows`, per the maker's stated choice and the real `issues.104cc.jsonl`).
No trailing newline (the classic append bug), tested explicitly: file `row1\nrow2` (no final `\n`) then append -> `row1\nrow2\nrow3\n`, three lines, all parse (one append call carries the leading separator). CRLF with and without a final newline: all three rows end `\r\n`; LF files stay LF.
Concurrency, real processes, temp copy of the real ledger (4 wrong-form rows removed so it is clean, ~1 MB, 472 rows), 13 node processes x 20 appends (4 main, 4 laneA, 4 laneB, 1 `alloc`), repeated 3 times, `waitMs` raised to 60 s:
```
rep1: procs=13 ms=32965 badProcs=0 rowsBefore=472 rowsAfter=732 added=260 expected=260 unparseable=0 dupIds=0 lockLeft=false
rep2: procs=13 ms=29771 badProcs=0 rowsBefore=472 rowsAfter=732 added=260 expected=260 unparseable=0 dupIds=0 lockLeft=false
rep3: procs=13 ms=27504 badProcs=0 rowsBefore=472 rowsAfter=732 added=260 expected=260 unparseable=0 dupIds=0 lockLeft=false
```
One global lock serialises every append, including different lanes (correct, since a main id must be unique against every shard); slower, not unsafe. Note the default 8 s wait is short for ~13-way contention on a 1 MB ledger (about 115 ms per append), so a loser fails with a clear non-zero exit rather than waiting; it never proceeds unlocked.
Killed holder (`taskkill /F` on a process holding the lock): next `append` printed `stale ledger lock ... (age 30s > 30s, content {"pid":42704,...}). NOT stealing it: confirm the holder is dead, delete the file by hand, then retry.`, exit 1, no row written; again at age 61 s, same. Manual `rm` of the lock then `append` -> `ISS-2`, exit 0, lock gone. Staleness is measured from the FILE MTIME (`statSync`), not the `at` field inside; a legitimate holder slower than 30 s would only be mis-REPORTED as stale to waiters, never robbed, so low risk. Fresh lock: waits ~8 s then `still held after 8000ms ... retry later`, exit 1, lock untouched. Lock release: `finally` in `appendRow`; a refusal on a bad ledger leaves no lock file (checked).
Durability: `rg writeFileSync|truncate|renameSync|rmSync|copyFile` over both scripts: no matches. The only ledger write is one `appendFileSync(target, lead + line + eol, {flag:"a"})`.

## Commands
- `timeout 180 node --test scripts/qa/ledger-alloc.test.mjs`: tests 16, pass 16, fail 0 (13.6 s); prints `ISS-298: 5/5`.
- `node --check` on both scripts: OK. `node scripts/lint-dirsize.mjs`: `OK (110 dir(s) within budget)`.
- `node scripts/qa/ledger-alloc-cli.mjs cite-check`: `units=473 cited=266 unattributed=146 mismatches=94 ledger-findings=4` (matches the maker; triage tool only).

## Mutations (each on scripts/qa/ledger-alloc.mjs, byte backup per mutation, `finally` restore, 120 s timeout, HEAD-hash check after each)
| Mutation | Result |
|---|---|
| M1 skip duplicate detection (`if (first.has(row.id))` -> `if (false)`) | KILLED (refusals, C5 cross-file) |
| M2 lock opened with `"w"` instead of `"wx"` | KILLED (concurrency, both lock tests) |
| M3 steal a stale lock instead of reporting | KILLED (stale-lock test) |
| M4 lexical instead of numeric max | KILLED (C1 next ids, concurrency) |
| M5 drop the trailing-newline separator | KILLED (EOL test) |
Final: `git hash-object scripts/qa/ledger-alloc.mjs` = `git rev-parse HEAD:scripts/qa/ledger-alloc.mjs` = df634eed4bfd9ac83925cd7bbfdc0ccbdd61a265; tests, CLI and manifest also unchanged (`git status --short` showed only my own files).

## D-015 replay
ISS-298's row records one incident in prose (webinar-bot-live verdict citing 289/290/291/292; 289/290 belong to speaker-resolution-llm, 292 to brain-knowledge-graph, 291 its own; ids later re-allocated 294-297) and no input files. The fixture reproduces exactly that: rows 289/290/292 with those features, 291 with webinar-bot-live, a verdict with that ISSUES-WRITTEN line; asserts 289/290/292 flagged and 291 not, plus two allocations get distinct ids. 5/5 is a faithful reconstruction of what is recorded. Honest limit, which the maker states: the original concurrent timing is not replayed (covered separately by the real-process test above).

## Issues
- ISS-ALLOC-001 (high, maker's): severity stands; the DESCRIPTION of its resolution is wrong (see Defect 1): it is a tool-grammar defect fixable by the maker, no Approver ruling needed.
- ISS-ALLOC-002 (low): verified (ISS-117, 314, 362, 363, 366, 372 lack `feature`); correctly described and graded.
- ISS-ALLOC-003 (low): numbers reproduce (266 / 146 / 94); correct. Open Approver/contract-author item: how a unit declares its feature, and whether C3 becomes a tracker-audit gate; plus ratification of the contract.
- ISS-ALLOC-004 (medium, mine): lock acquisition spin.

ISSUES-WRITTEN: ISS-ALLOC-004

EXPLANATION: The core mechanism is sound: 780 concurrent appends across three rounds, no duplicate, no lost or joined row; stale and fresh locks behave as documented; five mutations die. The unit fails because its reader refuses the real ledger over a form rule that neither the contract nor D-019 / D-055 supports, so C1 (max over the real union) cannot run on the one ledger it exists for; the fix is local (reader grammar, allocation stays strict) and needs a cycle-1 re-check against the real ledger returning `findings=0`. After that I would expect PASS for C1, C2, C4, C5, I1 to I3 and the triage form of C3. C3-as-gate and contract ratification remain open for the Approver and are not blockers for this unit. Medium ISS-ALLOC-004 is filed, not a pulled unit; verify it inside the next unit that touches acquireLock.


---

# Cycle 1
Cycle checked: 1
VERDICT: PASS

Checked commit 9ba8694 (fix d1fb6d0, base a71685e), worktree KnowledgeBase-lanes/alloc, node v24.19.0. Experiments on temp copies; the real ledger was only read (`verify`). Scope: `git show d1fb6d0 --stat` is 3 files (ledger-alloc.mjs, ledger-alloc.test.mjs, new ledger-alloc-fix1.test.mjs); the fix edited no ledger row.

## 1. Real ledger and D-015 counts
`node scripts/qa/ledger-alloc-cli.mjs verify` on the real union: `rows=479 findings=0`, exit 0. My own script (not the maker's test) over every row of all `qa/issues*.jsonl`: all 479 ids match `READ_ID_RE`; the four ids ISS-ALLOC-001 recorded (ISS-C-CLAIMS-TARGETING-001, ISS-C-TOPICREFS-ARG-001, ISS-360-OBSFLAKE, ISS-360-HEARTBEAT) are accepted.
- ISS-ALLOC-001 recorded evidence (4 ids at issues.jsonl:142/143/358/359): 4/4 accepted.
- ISS-298 recorded reproduction (289/290/291/292 mis-citation, rebuilt from the row's prose): 5/5, in each of 4 runs.
- ISS-ALLOC-004 recorded reproduction (icacls-denied qa dir, `append --main`): 1/1, exit 1 in 0.6 to 1.7 s, EPERM named, no lock file left, no spin.

## 2. Reading grammar `^ISS-[A-Z0-9]+(?:-[A-Z0-9]+)*$`
Refused (`wrong-form` or `no-id`): `iss-12`, `ISS-abc`, `ISS- 1`, `ISS-1 `, `ISS--1`, `ISS-1-`, `-ISS-1`, `ISS-`, `ISS`, `12`, `ISS_1`, `ISS-1.2`, `"ISS-1\n"`, `"ISS-1\r"`, NBSP, `ISS-é`, `ISS-ß`, full-width digit, `ISS-1-a_b`, and non-strings (number, null, `[]`, `["ISS-1"]`, `{}`, true, `""`, `" "`). Accepted: `ISS-1`, `ISS-007`, `ISS-U0-8`, `ISS-T-033-1`, `ISS-360-OBSFLAKE`, `ISS-A-B-C-D-9`, `ISS-0`. The width is right: it admits every real id and nothing lower-case, spaced, empty-segmented or non-string. (JS `$` without the `m` flag does not match before a trailing `\n`, so that refusal holds.)

Leading zeros: `ISS-7` and `ISS-007` are distinct strings and can coexist with no finding (a numeric twin is not a duplicate). The numeric max copes: main {099,100} gives `ISS-101`; only `ISS-0100` gives `ISS-101`; only `ISS-007` gives `ISS-8`; lane `ISS-X-0100` gives `ISS-X-101`; `ISS-X-5` plus `ISS-X-005` gives `ISS-X-006`. The next id is always numerically above every existing twin, so it cannot collide. Consistency with tracker-audit: its G4 reads only 3-digit bare `ISS-\d{3}` citations and 3-digit lane suffixes and never normalises zeros either; the real main ledger is zero-padded to 3 digits up to ISS-099 (99 rows) and unpadded from ISS-100, and an unpadded `ISS-<n>` continues that. Consistent.
Edge (low, EXPLANATION only): an existing id of 22 or more digits (lawful to the reader) makes `Number()` overflow, so the allocator would write `ISS-1e+21`, an id its own reader then refuses. Needs an absurd id; no real row is near it.

## 3. Numbering with qualified ids (temp ledgers)
main {360, 360-OBSFLAKE, 360-HEARTBEAT, 361} gives `ISS-362`. main {1, 2, 999-X} gives `ISS-3`; {999-X} only gives `ISS-1` (qualified ids neither push nor block). Lane `c-claims-targeting` with `-001/-002` in main and no shard gives `ISS-C-CLAIMS-TARGETING-003`. Lane `C` on the same data gives `ISS-C-001`; lane `c-claims` gives `ISS-C-CLAIMS-001`; lane `360` gives `ISS-360-001` (beside plain 360 and `360-OBSFLAKE`); lane `OBSFLAKE` gives `ISS-OBSFLAKE-001`; lane `u4` (has `ISS-U4-1`) gives `ISS-U4-002`; lane `U` (has `ISS-U-4001`) gives `ISS-U-4002`; lane `t` beside a `t-033` shard (`ISS-T-033-1/2`) gives `ISS-T-001`, lane `t-033` gives `ISS-T-033-003`; shards `issues.a.jsonl` plus `issues.A.jsonl` are one namespace (`ISS-A-003`). A lane namespace is matched by the exact regex `^ISS-<LANE>-(\d+)$`, so a digit segment in the lane name (`T-033`) is told from the sequence number because the sequence is only the final all-digit segment of exactly that lane; no two lane names produce overlapping id strings. Lane `t` with `ISS-T-033` present counts it as number 33 (next `ISS-T-034`), which does not collide with lane `t-033`'s `ISS-T-033-nnn`; a human may find `ISS-T-033` against `ISS-T-033-001` confusable (low).

### Next id for every real shard (computed on the real union; every one unused union-wide)
| lane | next | shard's last ids | note |
|---|---|---|---|
| 104cc | ISS-104CC-004 | -2, -3 | width 3 vs unpadded |
| 274wire | ISS-274WIRE-004 | -2, -3 | width 3 vs unpadded |
| WEBINARRELEASE | ISS-WEBINARRELEASE-018 | -016, -017 | consistent |
| a035913 | ISS-A035913-012 | -010, -011 | consistent |
| a0cdaee | ISS-A0CDAEE-003 | -001, -002 | consistent |
| alloc | ISS-ALLOC-005 (006 now) | -003, -004 | consistent |
| c-unrun-writers | ISS-C-UNRUN-WRITERS-023 | -021, -022 | consistent |
| capture | ISS-CAPTURE-004 | -002, -003 | consistent |
| iss260, iss346 | ISS-ISS260-002, ISS-ISS346-002 | -001 | consistent |
| live-record-repair | ISS-LIVE-RECORD-REPAIR-004 | -002, -003 | consistent |
| spkdata, stampadopt | -002 | -001 | consistent |
| t-029, t-031 | ISS-T-029-002, ISS-T-031-002 | -1 | width 3 vs unpadded |
| t-033 | ISS-T-033-003 | -1, -2 | width 3 vs unpadded |
| t-047-controller | ISS-T-047-CONTROLLER-003 | -001, -002 | consistent |
| t044w | ISS-T044W-002 | -001 | consistent |
| t057-b8-knowledge-explorer | ISS-T057-B8-KNOWLEDGE-EXPLORER-005 | -003, -004 | consistent |
| u0 | ISS-U0-009 | -7, -8 | width 3 vs unpadded |
| u1 | ISS-U1-005 | -3, -4 | width 3 vs unpadded |
| u2, u2fix | ISS-U2-002, ISS-U2FIX-002 | -1 | width 3 vs unpadded |
| u3 | ISS-U3-003 | -001, -002 | consistent |
| u4bhb, u4br2 | ISS-U4BHB-005, ISS-U4BR2-002 | -003/-004, -001 | consistent |

No collision and no wrong number anywhere; the numeric max is right in every shard. The only surprise is style: in 9 shards (104cc, 274wire, t-029, t-031, t-033, u0, u1, u2, u2fix) the numbers so far are unpadded and the allocator pads to 3 digits (`ISS-U0-8` then `ISS-U0-009`). Distinct ids, right order, and it follows the project's stated `ISS-<LANE>-NNN`; cosmetic, low, not filed.

## 4. Uniqueness across the union
A duplicate across main and a shard is refused with both `file:line` named; a duplicate inside one shard is refused. A candidate that exists anywhere is never returned; mutation M3 below shows the explicit candidate-exists check is unreachable defence in depth (the max rule already excludes it, and `appendRow` re-reads the union before writing, C2).

## 5. Lock
(a) Denied qa dir, no lock file: `cannot create ledger lock ...: EPERM (...). This is not contention; fix the directory permissions or path. Nothing was changed.` exit 1, 1.7 s wall including node start-up, no lock left, no spin. ISS-ALLOC-004 resolved.
(b) The softening. Denied dir plus a FRESH lock file: waits the 8 s deadline, then `still held by someone else after 8000ms (age 10s, content {...})`, exit 1 (9.1 s wall). For a fresh lock that is the true reading and the message prints the holder's content. Denied dir plus a STALE lock (2020 timestamp): `stale ledger lock ... NOT stealing it` at once; the user deletes it and then meets the real EPERM. So the real cause is not hidden for long. The deadline is overall, not per attempt (`start` is set once and the check runs on every pass, including the ENOENT-after-EEXIST path); mutation M5 shows its removal is caught.
(c) Staleness. Empty file: mtime fallback ("age 4s, content unreadable", held while fresh). Truncated JSON with an old mtime: stale reported. Valid JSON whose `at` is "banana": mtime fallback, held. `at` in 2099: age negative, never stale, waits the deadline and prints the content (low: a dead holder with a future stamp looks alive until someone reads the message). Never stolen in any case.
(d) Concurrency, real child processes, temp copy of the real 479-row union, `appendRow`, default 8 s wait, 13 processes x 20 appends (4 main, 4 lane A, 4 lane B, 1 alloc), 4 runs:
```
run1: ok=249 timedOut=10 otherErr=1 dupIds=0 unparseable=0 lockLeft=false (32.8 s)
run2: ok=255 timedOut=4  otherErr=1 dupIds=0 unparseable=0 lockLeft=false (24.0 s)
run3: ok=252 timedOut=5  otherErr=3 dupIds=0 unparseable=0 lockLeft=false (21.5 s)
run4: ok=241 timedOut=18 otherErr=1 dupIds=0 unparseable=0 lockLeft=false (48.7 s); rows per worker tag == that worker's ok count
```
Rows added equalled successful appends exactly in every run. Mutual exclusion holds: no duplicate id, no lost or joined row, no lock left, timeouts are clean failures. 4 processes x 20, 4 runs: timedOut 0/1/0/0, otherErr 0/0/1/0. The default 8 s is adequate for 2 to 3 concurrent loops and short at 13-way (about 115 to 175 ms per append on the 1 MB ledger). NEW DEFECT: the "otherErr" cases are `cannot create ledger lock ...: EPERM ... This is not contention` raised while another process's lock was mid-delete: the file is gone by the time `statSync` runs, so the softening (which applies only while the file still exists) does not catch it. It fails closed and a retry works, but the diagnosis is wrong. Filed ISS-ALLOC-005 (medium; not a pulled unit, verify inside the next unit that touches `acquireLock`).

## 6. The two edited existing tests (`git show d1fb6d0 -- scripts/qa/ledger-alloc.test.mjs`; four assertions changed in three tests plus one regex)
- "C1 union": before, a plain `ISS-6` in a shard made `nextId` throw `/wrong-form|not clean/` (the old over-strict reader); after, it asserts `nextId === "ISS-7"` (the shard's plain id still counts). A stronger positive assertion replaced a refusal that was the defect itself.
- "refusals": the wrong-form case changed from `ISS-Q-2` in main (now lawful) to `iss-3` (still refused); bad-JSON, no-id and duplicate cases untouched, same "Nothing was changed" assertions.
- "C5 duplicate across main and shard": dropped the single assertion that the shard's plain `ISS-2` is ALSO a wrong-form finding (no longer true); the duplicate assertions (`other`/`loc` and the CLI `issues.jsonl:2 and issues.k.jsonl:2`) stay.
- "lock: fresh lock": message regex updated to `still held by someone else after 150ms`.
No real refusal was weakened or removed.

## 7. Commands
- `timeout 300 node --test scripts/qa/ledger-alloc.test.mjs scripts/qa/ledger-alloc-fix1.test.mjs`, 4 runs: each `tests 25 / pass 25 / fail 0`; `ISS-298: 5/5`.
- `node --check` on all 4 scripts: OK. `node scripts/lint-dirsize.mjs`: `OK (110 dir(s) within budget)`. `node scripts/lint-loc.mjs`: no violation names a ledger-alloc file (non-blank lines: ledger-alloc.mjs 219 of 300, its test 224 of 400, fix1 test 139 of 400, cli 62); the violations it lists elsewhere pre-date this unit.
- Mutations on `scripts/qa/ledger-alloc.mjs`, byte backup per mutation, restored in `finally`, `spawnSync` 100 s timeout, hash check after each:

| Mutation | Result |
|---|---|
| M1 plain max also counts qualified ids (drop the `$` in the main regex) | KILLED ("qualified ids neither push nor block") |
| M2 ignore lane ids living in the main file | KILLED ("a lane whose earlier ids live in the MAIN file ...") |
| M3 drop the candidate-exists check | SURVIVED: equivalent, unreachable behind the max rule and the C2 re-read |
| M4 every lock error retried as contention until the deadline | KILLED (ISS-ALLOC-004 reproduction test) |
| M5 remove the overall deadline | KILLED (4 tests fail, incl. "held by someone else" and the fresh-lock timeout) |

Final: `git hash-object scripts/qa/ledger-alloc.mjs` = `git rev-parse HEAD:scripts/qa/ledger-alloc.mjs` = 138fa304bce0e7edeb7f85aaa3fc66285a40f347 (tests and CLI unchanged; `git status` showed only my own files). One git call crashed once with 0xC000012D (machine out of resources, unrelated); the file was verified restored afterwards.

## 8. Manifest
The Fix cycle 1 section matches what I measured (grammars, numbering, lock, `rows=479 findings=0`, 25/25 tests three times). It is silent on the transient-EPERM race (ISS-ALLOC-005); its softening sentence is true as stated. The not-delivered list still says C3 `cite-check` is a triage tool, nothing is wired into hooks or skills, and the contract is `proposed` and unratified.

ISSUES-WRITTEN: ISS-ALLOC-005

EXPLANATION: The cycle-0 blocker is gone. The tool runs on the real ledger (`findings=0`), keeps every real refusal (bad JSON, id-less row, duplicate anywhere, BOM, partial line, malformed id), numbers correctly for the main tree and for all 27 real lane namespaces with no collision, never steals a lock, and the multi-process runs show no duplicate, lost or corrupted row. ISS-ALLOC-001 is verified (cause: the tool's over-strict reader; no Approver decision was needed). ISS-ALLOC-004 is verified (the denied-dir case fails fast and clearly; the deadline is overall and its removal is caught by a test). Medium ISS-ALLOC-005 is a spurious, fail-closed error message under contention, not an exclusion or data defect, so it does not hold the unit. Low notes, not filed: lane ids are padded to 3 digits where 9 shards are unpadded; a 22-digit id would overflow to `ISS-1e+21`; a future-dated lock stamp never goes stale; M3 is an equivalent mutant; the 8 s default is short at 13-way contention. ISS-298 (recommendation only; the row in qa/issues.jsonl is not edited here): the row asks for [C1] to [C6] built to the contract plus a citation-integrity gate in tracker-audit. The allocator delivers C1, C2, C4, C5 and a triage-only C3 that nothing calls, and the contract is unratified. I would not close ISS-298 on a tool no workflow invokes: mark it `in_progress` noting the allocator exists and is verified, and close it once the Approver ratifies the contract and the allocator plus the citation gate are wired in (that touches enforcement paths and needs `Approved-by: Umesh`).

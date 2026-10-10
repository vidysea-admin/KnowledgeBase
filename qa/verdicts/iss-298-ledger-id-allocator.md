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

# iss-298-ledger-id-allocator
Status: ready-for-check
Fix cycle: 1
Feature: ledger-id-allocation
Maker: lane/alloc (worktree KnowledgeBase-lanes/alloc), base a71685e
Backlog: ISS-298 (qa/contracts/ledger-id-allocation.md), assigned by the orchestrator.
Round cap: PASSed verdicts naming this seam = 0 (the only verdict naming it, ledger-duplicate-id-guard, is CONTRACT_MISMATCH). Cap not reached.
Risk tier: high (data writes to the ledger: full ceremony).

## Where it lives
- `scripts/qa/ledger-alloc.mjs` (219 lines, library), `scripts/qa/ledger-alloc-cli.mjs` (66, thin CLI), `scripts/qa/ledger-alloc.test.mjs` (244).
- scripts/ root and scripts/lib are at their limits; scripts/qa/ has room. `node scripts/lint-dirsize.mjs` -> `OK (110 dir(s) within budget)`. `lint-loc` lists none of these files. No new dependency.
- Lane ledger: `qa/issues.alloc.jsonl` (ISS-ALLOC-001..003).

## Contract criteria
| Id | How met | Test |
|---|---|---|
| C1 one operation | `appendRow` takes the lock, reads the union, picks the id, re-reads, writes one line, all in one call. `nextId`/`next-id` exist but are labelled ADVISORY: they do NOT satisfy C1 alone and the CLI/`append` is the supported path. | "C1 allocation and append are one operation", "C1 next ids" |
| C2 re-verify before write | Second union read after the id is chosen; id taken => `LedgerError`, nothing written. `afterAllocate` option is a test seam that plays the competing writer. | "C2 re-verification ... ABORT" |
| C3 citation integrity | `cite-check` (read-only). Narrower than the contract, see below. NOT wired as a gate. | "C3/I3 citation check ..." |
| C4 no renumbering | Only `appendFileSync`; no code path rewrites a row. Wrong-form/duplicate => refusal, never repair. | "existing rows are byte-identical" |
| C5 duplicates hard fail | `readUnion` finding `duplicate` names both `file:line`; append/next-id/verify exit 1. | "refusals", "C5 duplicate across main and shard" |
| C6 correction recorded | NOT automated: it is a checker-verdict statement. `append` prints the id so old->new can be recorded. | none |
| I1 append-only | Same as C4; also byte-prefix test. | "existing rows are byte-identical" |
| I2 shard is not a copy | Every read is the full union (`unionFiles`). | "C1 next ids", "C1 union" |
| I3 detector can fail | C3 checker proven on a mis-cited fixture, and passes after correction. | "C3/I3 ..." |

Choices the contract left open: whitespace-only lines are TOLERATED (as tracker-audit `readLedgerRows` does; one exists in qa/issues.104cc.jsonl); other unparseable lines refuse. Required row fields (contract excludes row schema): non-empty `feature`, `title`, `evidence`, `severity` in critical/high/medium/low; `id` must be absent; `date` and `status:"open"` defaulted. File EOL is preserved (CRLF/LF); a file lacking a final newline gets one before the new row in the same append call; a new shard borrows the main ledger's EOL.

## Locking
Exclusive lock file `qa/.issues-ledger.lock` created with `wx` (one lock for the whole union, since a main id must be unique against every shard), content `{pid, at}`, released in `finally`. Contention (EEXIST/EPERM/EBUSY/EACCES) retries with jittered sleep up to 8s then errors "still held". A lock older than 30s is a STALE LOCK: the error names it, shows its content, says "NOT stealing", leaves it in place. Write is a single `appendFileSync(..., {flag:"a"})` of the full line.

## Evidence
`timeout 180 node --test scripts/qa/ledger-alloc.test.mjs` (node v24.19.0):
```
ℹ tests 16
ℹ pass 16
ℹ fail 0
```
Includes the concurrency test (6 real node processes x 5 appends across main, lane l1, lane l2 against a temp ledger: 30 distinct ids, union findings `[]`, main ids contiguous 2..16, lock released), the stale-lock test, hostile lane names (`..` `a/b` `a\b` `C:x` `nul` `con` `com1` trailing dot, 41 chars, NUL byte, non-strings), and every refusal (bad JSON, no id, duplicate, wrong form, locked) with an unchanged-bytes assertion.

D-015, ISS-298's recorded reproduction (webinar-bot-live verdict citing ISS-289/290/291/292; 289/290 belong to speaker-resolution-llm, 292 to brain-knowledge-graph, 291 its own; plus the read/append window): `ISS-298: 5/5` (289, 290, 292 flagged, 291 not flagged, two allocations in the window get distinct ids). The row records no other reproductions; the replay is a reconstruction in a fixture because the ledger row records the incident in prose, not as input files. Limit: it does not replay the original concurrent timing.

### Real-ledger verify (read-only), `node scripts/qa/ledger-alloc-cli.mjs verify`, exit 1
```
rows=478 findings=4
wrong-form	issues.jsonl:142	main ledger id must be ISS-<digits>
wrong-form	issues.jsonl:143	main ledger id must be ISS-<digits>
wrong-form	issues.jsonl:358	main ledger id must be ISS-<digits>
wrong-form	issues.jsonl:359	main ledger id must be ISS-<digits>
```
Rows: ISS-C-CLAIMS-TARGETING-001, ISS-C-TOPICREFS-ARG-001, ISS-360-OBSFLAKE, ISS-360-HEARTBEAT. No duplicates, no unparseable lines, no row without id. Filed as ISS-ALLOC-001 (high). Consequence: **the allocator refuses the real ledger as it stands**; it cannot be used on it until the Approver decides how these four ids are treated. No existing row was touched.

`cite-check` on the real tree: `units=472 cited=266 unattributed=146 mismatches=94 ledger-findings=4`, 0 unresolved. The 94 are candidates, not asserted defects (ISS-ALLOC-003). Also ISS-ALLOC-002 (6 rows lack `feature`).

## How this differs from the earlier CONTRACT_MISMATCH attempt (ledger-duplicate-id-guard)
That unit was a read-only duplicate refusal inside `tracker-audit.mjs` (A1-A4 maker-derived criteria), and its verdict stopped on a different contract: tracker-integrity [C7] requires `pnpm lint:structure` exit 0, which failed on unrelated baseline findings; the verdict also states ledger-id-allocation was "proposed ... not adopted". This unit builds the allocation/append side (C1, C2, C4, C5) that unit explicitly scoped out, in new files only, touching neither tracker-audit nor lint config. It does not claim lint:structure exit 0: `lint-loc` still reports baseline overages elsewhere (e.g. scripts/watch/run-watch.mjs 556); none are in the new files. The contract's status line still says `proposed`; whether it is adopted is the Approver's call and the checker should judge against its text as the orchestrator directed.

## Not delivered
- NOT wired into any hook, `append_decision.ps1`, or the maker/checker skills (enforcement paths and shared skills need the Approver): adoption is voluntary until then. Concurrent loops that keep hand-appending bypass the lock entirely; C2's re-read only protects callers that use `appendRow`.
- C3 is narrower than the contract: only `ISSUES-WRITTEN:` lines, and only flags unresolved ids or ids whose row feature equals another existing unit's slug. Not a gate; not in tracker-audit.
- C6 (old->new mapping in verdicts) is process, not code.
- Cycle 0's "unusable on the real ledger" is resolved by Fix cycle 1. Still true: one global lock serialises all appends; no stale-lock stealing; the contract is still `proposed` and unratified; C3 `cite-check` is a triage tool, not a gate; nothing is wired into hooks or skills.

## Fix cycle 1
**What failed (verdict FAIL, cycle 0).** The mechanism passed but the READER refused the real ledger (`verify`: 4 wrong-form, exit 1), so the allocator could not run on the real repo. The cycle-0 maker invented the rule "ids in the main file must be plain `ISS-<digits>`"; it is in neither the contract nor any decision. The four ids are lawful: `ISS-360-OBSFLAKE` and `ISS-360-HEARTBEAT` were created on purpose by D-055 ruling 2, and `ISS-C-CLAIMS-TARGETING-001` and `ISS-C-TOPICREFS-ARG-001` are lane ids that arrived by merge, which D-019 forbids renumbering. **Cause: the tool's over-strict reader. No Approver decision is needed** (ISS-ALLOC-001's "Approver decision" fix_direction was wrong; its row is left in place, the checker flips status). No row was edited and there is no allowlist.

**Two grammars.**
- READING (any file, any row): `READ_ID_RE = /^ISS-[A-Z0-9]+(?:-[A-Z0-9]+)*$/` (`ISS-` then upper-case alphanumeric segments, single hyphens). Covers plain `ISS-12`, lane `ISS-U3-001`, qualified `ISS-360-OBSFLAKE`. Still refused: lower case, spaces, empty segment, trailing hyphen, missing `ISS-`, empty/non-string/missing id, a duplicate id anywhere in the union, an unparseable line, a BOM, a partial last line.
- ALLOCATING (unchanged): main = exactly `ISS-<digits>`; shard = exactly `ISS-<LANE>-<digits>` (3 digits, LANE upper-cased).

**Numbering.** Plain next = 1 + max over ids that are EXACTLY `ISS-<digits>` anywhere in the union; qualified ids neither count nor block (`ISS-360-OBSFLAKE` is not a second 360). Lane next = 1 + max over ids exactly `ISS-<LANE>-<digits>` in ANY file, so a lane whose rows were merged into the main file continues after them (`ISS-C-CLAIMS-TARGETING-001/002` in main => next `-003`/`-004`); lane `C` is a separate namespace from `C-CLAIMS-TARGETING`. The chosen id must also be unused across the union or the append is refused.

**Lock.** Hard overall deadline (`waitMs`; env `LEDGER_LOCK_WAIT_MS`; default 8000 kept). `EEXIST` = "still held by someone else", retried to the deadline. Any other open error (ENOENT, EROFS, EACCES/EPERM/EBUSY with no lock file present, ...) fails immediately as "cannot create ledger lock ... <CODE>". One deliberate softening: EACCES/EPERM/EBUSY while a lock file DOES exist is treated as contention (Windows reports a mid-delete lock that way). Staleness age now comes from the `at` timestamp inside the lock when it parses, else mtime. Stale locks are still reported, never stolen. Documented in the `acquireLock` doc comment.

### Real-ledger verify (read-only), `node scripts/qa/ledger-alloc-cli.mjs verify`, exit 0
```
rows=479 findings=0
```

### Evidence (fix cycle 1)
`timeout 300 node --test scripts/qa/ledger-alloc.test.mjs scripts/qa/ledger-alloc-fix1.test.mjs` (node v24.19.0), run 3 times, each `tests 25 / pass 25 / fail 0` (16 existing incl. the multi-process test, 2 edited for the new grammar, plus 9 new in `ledger-alloc-fix1.test.mjs`). New tests read the real union and assert every id is accepted (0 findings); refusals; numbering cases; lock cases; an append on a temp COPY of every real ledger file.
- `ISS-298: 5/5` (recorded reproduction replay, unchanged).
- `ISS-ALLOC-004: 1/1`: icacls-denied qa dir, `append --main` now exits 1 in about 0.6-2 s with `cannot create ledger lock ...: EPERM`, no lock left, no spin.
- Non-blank lines: ledger-alloc.mjs 219, ledger-alloc.test.mjs 224, ledger-alloc-fix1.test.mjs 139.
- Windows-only run; lock contention codes for POSIX are covered but untested here.

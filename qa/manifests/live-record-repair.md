# Manifest — live-record-repair: the Ashoka 2026-09-27 recording failure (ISS-323 + ISS-324)

Fix cycle: 1 · Issues addressed: ISS-323 (high), ISS-324 (high) · Executor: claude-opus-5 (maker, in-session)
· Executor rationale: the root cause was already isolated read-only in this session; delegating would
have re-derived it. Goal task: T-047 / U5 (capture path) · Lane: `wave/live-record-repair`
· Backlog tier: **2** (open critical/high) — the data-capture path, so full ceremony regardless of severity.

**Unit:** the live recording path failed on a real webinar — the Ashoka Educator Dialogues of
2026-09-27 was **not recorded**. Two ledger rows, one failure surface.

## Root cause (diagnosed before any edit)

### ISS-323(c) — argv destroyed by cmd.exe. CONFIRMED by direct evidence.

`start-record-detached.ps1:75` launched `Start-Process -FilePath "pnpm"`. `pnpm` resolves to
`pnpm.cmd`, and cmd.exe **re-parses argv**, splitting the Zoom join URL at its unquoted `&`. The
10:51 run's own logs prove it: the recorded command line ends at `...AAAAA"` with **no `&uuid=`
segment and no `--until 12:30` at all**, and stderr reads

```
'uuid' is not recognized as an internal or external command,
operable program or batch file.
```

cmd.exe took `uuid=WN_...  --until 12:30` as a *second command*. The CLI then failed its own usage check.

### ISS-324 — a fixed 120 s budget over an opaque browser bring-up. ROOT CAUSE IDENTIFIED.

`obs-windows.ts:259-266` raced `opened`, `exited`, and a flat `sleep(120_000)`. The child's first
output of any kind is `emit("opened")` — everything before it is silent:

```
SB(uc=True, headed=True, user_data_dir=data/bot-profile)   # sb_join.py:339  <- opaque, minutes possible
  -> uc_open_with_reconnect(url, 4)                        # sb_join.py:340
    -> emit("opened")                                      # sb_join.py:341  <- first signal
```

**The 11:08/11:35 logs contain exactly one child line, `[bot] starting {}`.** That line is not a
node-side message — no such string exists in `packages/meeting-bot/src` (verified by grep). It is the
child's own `emit("starting")` (sb_join.py:333) rendered by node's event logger. So python started,
imported SeleniumBase 4.51.9, killed orphans, and *spoke* — then `SB()` never returned inside the
remaining budget. Three compounding faults:

1. **No `child.on("error")`** (line 239): a spawn failure emits `error`, never `exit`, so it fell
   through to the *same* `"timeout"` branch. `"did not open the page"` could not be distinguished
   from "the interpreter never ran", and it named a page that was never reached.
2. **The child's diagnostics were discarded.** Only `emit()` passes `flush=True`; there was no `-u`
   and no `PYTHONUNBUFFERED`, so SeleniumBase's own bootstrap output sat block-buffered in the pipe
   and was destroyed by `child.kill()` at line 265.
3. **The tests structurally cannot see this.** `obs-windows.test.ts:111` injects
   `python: process.execPath` — a fake node child. 250 green tests never start a real browser.

**Ruled out by direct probe:** `python` resolves (`...\hermes\hermes-agent\venv\Scripts\python.exe`,
3.11.15) with `seleniumbase 4.51.9` importing cleanly; 5.0 GB free; no leftover bot Chrome; argv
intact on the 11:08 run. A crash would have printed a traceback (stderr is line-buffered in 3.9+)
and resolved `exited`. It reported `timeout` — **the child was alive inside `SB()` at t=120 s.**

## What changed (edit-in-place; no new production module)

- **`scripts/webinar/start-record-detached.ps1`** — launches `node.exe` with `--import tsx` and the
  CLI entry directly, never a `pnpm`/`.cmd`/sh shim, with **every argument individually quoted** so
  neither PowerShell's joining nor any downstream re-parse can split a URL on `&` or a title on
  spaces. Adds a **liveness gate**: exits non-zero when `$proc` is null/has no `Id`, or when the
  child dies inside `-LivenessSeconds` (default 5), tailing both logs; it can no longer print a
  success line with an empty pid. New `-CliEntry` / `-LivenessSeconds` params are the test seam.
- **`packages/meeting-bot/py/sb_join.py`** — a daemon thread emits `bootstrapping` every 10 s while
  `SB()` brings the browser up, and `driver-ready` / `navigating` mark the stages after it. `emit()`
  now holds a lock, since two threads write the stream. Indentation of the existing `with` body is
  untouched (no `try:` wrapper) — the daemon dies with the process.
- **`packages/meeting-bot/src/capture/obs-windows.ts`** — the budget **resets on every progress
  event** and fires only when progress itself stalls (`openStallMs`, default 90 s) under an absolute
  cap (`openCapMs`, default 480 s); adds `child.on("error")`; spawns with `PYTHONUNBUFFERED=1`; keeps
  a 20-line ring buffer of child output and reports the last 5 lines plus the **last stage reached**
  in every failure message.

## How to verify (exact commands)

From `D:/KnowledgeBase-lanes/live-record-repair`:
1. `cd packages/meeting-bot && node --test --import tsx "src/**/*.test.ts"` → **250 pass, 0 fail**
2. `cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json` → exit 0, no output
3. `node --test scripts/webinar/start-record-detached.test.mjs` → **3 pass, 0 fail**
4. `python -m pytest packages/meeting-bot/py -q` → **35 passed**
5. `python -m py_compile packages/meeting-bot/py/sb_join.py` → exit 0

## Actual outputs

```
$ node --test --import tsx "src/**/*.test.ts"
i tests 250 · pass 250 · fail 0 · duration_ms 27093.2567

$ npx tsc --noEmit -p tsconfig.json
(no output, exit 0)

$ node --test scripts/webinar/start-record-detached.test.mjs
ok ISS-323(c): the Zoom join URL's `&` and a title with spaces reach the recorder argv intact (11307ms)
ok ISS-323(a,b): a recorder that dies immediately makes the launcher exit non-zero and never claim success (3167ms)
ok ISS-323: the happy path still reports a real pid and exits 0 (10294ms)
i tests 3 · pass 3 · fail 0

$ python -m pytest packages/meeting-bot/py -q
35 passed in 14.46s
```

## Evidence against the ledger, by issue id (D-015)

| Recorded reproduction | Status | Measured |
|---|---|---|
| **ISS-323(c)** `&` in the join URL splits the command; `'uuid' is not recognized`; `--until` lost | **FIXED, verified** | argv-fidelity test asserts the URL arrives as ONE argument with both query params and that `&uuid=...` is never its own argument — 1/1 |
| **ISS-323(b)** prints `started detached record: pid ` (empty) and exits 0 on a launch that never happened | **FIXED, verified** | immediate-exit test: launcher exits non-zero, prints `launch FAILED`, and never prints a success line with an empty pid — 1/1 |
| **ISS-323(a)** `Start-Process -FilePath pnpm` resolves the *sh* shim -> `%1 is not a valid Win32 application` | **NOT REPRODUCED AS WRITTEN — named, not omitted** | Probed directly on this machine today: `Start-Process -FilePath "pnpm" -PassThru` **launches with a real pid**. `Get-Command pnpm -All` lists `pnpm.ps1`, `pnpm.cmd`, `pnpm`. The 10:38 symptom is real (both logs 0 bytes, peer reported an empty pid, exit 0) but its stated *mechanism* is not attributable from the evidence on disk. The fix addresses the symptom class regardless (the liveness gate above); I am **not** claiming the sh-shim mechanism verified. |
| **ISS-324** `bot browser did not open the page (timeout)` with correct argv, RAM free, no leftover Chrome | **FIXED at the level a unit test can reach; LIVE PROOF OUTSTANDING** | 4 new tests: progress past the stall window now opens (1/1); a wedged bring-up fails naming `last stage: starting` **and** the child's own output (1/1); child stderr reaches the thrown error (1/1); an unspawnable interpreter reports *that*, not a page timeout (1/1) |

**The ISS-324 reproduction cannot be re-run verbatim in a unit test, and I am naming that rather than
substituting for it.** Its recorded reproduction is a *live* one — a real Zoom webinar, a real
chromedriver bootstrap, a real signed-in profile. The suite injects a fake node child
(`obs-windows.test.ts:111`), which is precisely why 250 green tests missed this bug; a test that
mocks the child cannot prove a real browser now comes up. The tests above prove the **new contract**
(the budget is progress-relative, not a total; failures name the stage and carry the child's output),
and they are falsifiable against any fixed-budget implementation of the same parameter. **What they
do not prove is that the live Ashoka path now records.** That needs one instrumented live run.

## Verification gap / what is NOT proven

- **No live run has happened.** Required to close ISS-324: one real meeting, `.log` showing
  `starting -> bootstrapping... -> driver-ready -> navigating -> opened`, and a non-empty recording
  file. This also finally attributes *which* step consumed the original 120 s (chromedriver bootstrap
  vs profile load vs sign-in redirect), which the evidence on disk still cannot.
- **`pnpm lint:structure` is RED, and one violation is mine.** `lint-loc` fails with 4 violations;
  master already fails with **3** (`speakers-llm.ts:313`, `sb_join.py:415`, `run-watch.mjs:447`).
  Mine: `obs-windows.ts` 300 → **352** (budget 300) and `sb_join.py` 415 → 437. **Master's
  `obs-windows.ts` sits at exactly 300**, so any addition to that file trips C1 — trimming comments
  cannot recover 52 lines, so this structurally requires a file split. Per the anti-drift rule I have
  **not** created a new module on my own initiative; raised as a HUMAN_GATE
  (`qa/gates/obs-windows-loc-split.md`) with the fix complete and tested behind it.

## Shared-data disclosure (D-024)

No database writes. No Mongo connection is opened by this unit. Touches only the bot launch path.
The test suite writes only to OS temp dirs and cleans the `raw/webinars/record-*` logs it creates.

## Issues filed by this unit

- **ISS-LIVE-RECORD-REPAIR-001** (medium) — the launcher is not detached from its *caller*:
  `Start-Process`'s redirects force handle inheritance, so a pipe-reading caller blocks for the whole
  recording (measured 10.2 s vs 2.3 s for an 8 s child; 32.7 s through the real launcher).
  **Pre-existing** — the pnpm version carried identical redirects. Not fixed here: a clean fix trades
  against the ISS-323 liveness gate, which requires waiting on the child. Needs a design call.

## Fix cycle 1 — the fresh-context review's own findings (2026-09-27)

The `senior-software-engineer` agent reviewed c8cbbf4 in fresh context, re-ran both new suites
itself rather than trusting this manifest, and returned **VERDICT: Warning** with one *reproduced*
defect in code this unit introduced. Both of its findings are fixed in this cycle.

- **ISS-LIVE-RECORD-REPAIR-002 (high) — the ISS-323 fix had re-introduced the very bug class it
  exists to close.** Cycle 0's per-argument quoting escaped only the quote character, which is not
  `CommandLineToArgvW` escaping: an argument ending in a backslash emits an undoubled run, so that
  backslash escapes the closing quote we added and the argument never closes. The reviewer's
  standalone repro merged three arguments into one and **lost `--until 12:30` entirely** — the same
  silent-argv-corruption shape as ISS-323(c), reachable because the title is partly
  email/candidate-sourced free text (ISS-317 note, `task-scheduler.ts:16-30`). Fixed by
  `Quote-Win32Argv` (`start-record-detached.ps1:95-118`), which implements the real algorithm.
  The same repro also established that Windows PowerShell 5.1's `Start-Process -ArgumentList` joins
  the array into one raw command line with **no escaping of its own**, so exactness here is not
  optional. Cycle 0's containment claim holds and is worth recording: the new liveness gate turns
  this into a *loud* `launch FAILED` rather than the silent success ISS-323 was about.
- **ISS-LIVE-RECORD-REPAIR-003 (medium) — the absolute `openCapMs` branch had no test.** All four
  cycle-0 ISS-324 tests set `openCapMs: 20_000`, so only `opened` and `stalled` were ever executed.
  The cap is the one mechanism stopping a child that emits progress faster than `openStallMs` from
  resetting the budget forever — i.e. exactly the evasion the reviewer probed. Now covered.

Also **confirmed by the review, not by me**: `settled` cannot let the polling loop outlive the
outcome by more than one ≤1s tick; the cap is checked independently of the stall reset; `_EMIT_LOCK`
covers the only `print(` in `sb_join.py`; the bring-up daemon thread dies via the `except` +
`sys.exit(1)` at `sb_join.py:469-474`; `env: { ...process.env, ... }` changes nothing but the one
variable; and `-CliEntry` is unreachable from Task Scheduler (`task-scheduler.ts:131`).

### Cycle 1 outputs

```
$ node --test scripts/webinar/start-record-detached.test.mjs
i tests 4 | pass 4 | fail 0        (includes the trailing-backslash regression)

$ node --test --import tsx src/capture/obs-windows.test.ts
i tests 8 | pass 8 | fail 0        (includes the openCapMs cap branch; ends in 1.33s against a 1.2s cap)

$ node --test --import tsx "src/**/*.test.ts"
i tests 251 | pass 251 | fail 0

$ npx tsc --noEmit -p tsconfig.json
(no output, exit 0)
```

**Still not proven, unchanged from cycle 0:** no live run. The review did not change that, and said
so — it re-ran the two relevant suites, not a browser.

**Status:** checked-PASS (cycle 1)

## Close-out — 2026-09-27 15:5x

`/checker` PASSed cycle 1 (`qa/verdicts/live-record-repair.md`, **Cycle checked: 1**, commit
`2bbb37c`), verifying at `f01b47a` and confirming no source drift since. It reproduced both lane
rows independently, then falsified each in throwaway copies: reverting the quoter to the naive
scheme failed exactly the new trailing-backslash test and nothing else, and stubbing the cap branch
to `if (false && ...)` failed exactly the `/cap/` attribution assertion. Seven hostile inputs were
run through the real launcher — 6/6 non-degenerate cases round-tripped byte-identical; the empty
string never reaches the quoter (filtered upstream by the pre-existing `if ($Title)`).

A fresh `senior-software-engineer` review of `f01b47a` returned **Approve, no findings** — the same
reviewer class that found the cycle-0 quoting defect, hand-tracing all seven requested edge cases
and confirming unconditional quoting is harmless for every argument this script builds (no
`--flag=value` forms exist here, and `$node` goes through `-FilePath`, not the quoter).

ISS-LIVE-RECORD-REPAIR-002 and -003 moved `fixed` → `verified`.

**Still NOT closed, and not claimed:** no live browser/OBS run has proved this end-to-end. The
suite injects a fake node child (`obs-windows.test.ts:111`), which is structurally why 250 green
tests missed the bug that lost the Ashoka recording. The proof method is a HUMAN_GATE for Umesh
(throwaway Zoom vs next real webinar). 251/251 + 4/4 + 8/8 + 35 pytest + clean `tsc` is the ceiling
this harness can reach, not evidence the webinar would record.

**Disclosed, not filed (low, EXPLANATION only):** under concurrent CPU load two timing-sensitive
tests flake — the ISS-323(a,b) liveness wait and a pre-existing ISS-324 timing test. Both 8/8 and
5/5 in isolation; a pre-existing tight-budget property, not introduced here.

**Gated, non-blocking:** `node scripts/lint-loc.mjs` still fails with exactly the 4 declared C1
violations (`speakers-llm.ts:313`, `sb_join.py:437`, `obs-windows.ts:352`, `run-watch.mjs:447`) —
the state `qa/gates/obs-windows-loc-split.md` is waiting on Umesh to resolve.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

# Verdict — u5-auto-record-scheduler

**Cycle checked:** 1
**Date:** 2026-09-27
**Checker:** fresh claude-sonnet-subagent (this session), bound to `D:\KnowledgeBase`. Lane
`D:\KnowledgeBase-lanes\u5-auto-record`, branch `wave/u5-auto-record`, commit `2277245`
(branched at `58a9f4c`).

## Merge cleanliness (re-run myself)
`git -C D:\KnowledgeBase merge-tree --write-tree master wave/u5-auto-record` → exit 0, wrote tree
`67b44763a5262c62c562ba07ec26c4a761befa34`, **no conflict markers in the output**. The branch
merges cleanly onto current master (`82c4185`) despite master having moved since the branch point
(manifest's own disclosed Known gap #8).

## Verify commands re-run (RAM-constrained scope: 4 calendar test files + tsc, per dispatch — not
the monorepo lint-loc/depcruise/full workspace commands)
```
$ cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json
(no output — exit 0)

$ node --test --import tsx src/calendar/auto-join.test.ts src/calendar/schedule-state.test.ts \
    src/calendar/task-scheduler.test.ts src/calendar/schedule-tick.test.ts
ℹ tests 49
ℹ pass 49
ℹ fail 0
```
Matches the manifest's claimed output exactly. **`lint-loc`/`depcruise`/full `pnpm -r test` were
NOT re-run by me** (RAM ~1.9GB, another builder running, per dispatch constraint) — those rows are
`UNVERIFIED-by-checker`, not credited as independently re-derived.

## Diff scope (step 4c)
`git diff 58a9f4c..2277245 --stat`: 11 files, all inside `packages/meeting-bot/src/calendar/*`
(new) + a 2-line `cli.ts` addition (`import { runScheduleTick }` at :48, one dispatch line at
:165) + the manifest itself. **No file outside the manifest's "What changed" was touched; no
existing export/function/test was deleted or renamed.** Matches the manifest's own claim exactly.

## Capability coverage (step 4b) — spot-checked with real falsifying edits in a throwaway copy
Copy made at `C:\Users\Lenovo\AppData\Local\Temp\claude\...\scratchpad\u5-checker-copy`
(`packages/meeting-bot/src` copied, `node_modules` re-junctioned to the same target the lane
itself uses — never the bound tree). Green-before confirmed first (`auto-join.test.ts`: 31/31 in
the copy, before any edit).

- **Row "rejected candidate never overridden by config trust"** — removed the `item.rejected`
  short-circuit in `auto-join.ts` (single-hunk revert of the exact fix the manifest describes).
  Result: exactly `selectAutoRecordItems: a rejected candidate is never auto-scheduled even from a
  trusted domain` turns red (`1 !== 0`); every other test in the file stays green. **Isolates
  correctly.**
- **Row "join-token never logged"** — replaced `redactJoinLink`'s body with `return url` (single
  file, single function). Result: exactly the 3 tests tied to that claim turn red
  (`redactJoinLink: strips a tk=…`, `redactJoinLink: an unparseable URL never throws`, `dry-run
  output never contains the raw join-link token`); the other 36 stay green. **Isolates
  correctly.**
- The remaining 10 capability-coverage rows were read-reviewed against their named tests but not
  independently falsified in this check (time/RAM budget spent instead on the adversarial cases
  below, which found the unit's actual blocking defects). **`CAPABILITY-COVERAGE: 2/12 rows
  reproduced, 10 UNVERIFIED-by-checker (read-reviewed only)`.**

## Adversarial findings (beyond the maker's 49 tests)

### 1. Command injection via `schtasks /tr` — ISS-317 (already filed by a concurrent background
review before this check started; **not duplicated here, confirmed independently**)
`task-scheduler.ts:76` builds `/tr` as a single command-line string with naive
`a.replace(/"/g, '\\"')` quoting, from `title`/`sessionId`/`url` values schedule-tick.ts:176-183
takes straight from the (partly external, email-sourced) `AutoRecordItem`. Task Scheduler later
re-parses that string with real Windows command-line rules to launch `powershell.exe`.
I reproduced this independently with a standalone simulation of `CommandLineToArgvW`'s documented
backslash/quote rules (not a real process, no real `schtasks` invoked) against the exact function
in `task-scheduler.ts:76`:
- a title ending in a single backslash (`"evil\\"`) makes the constructed `/tr` string fail to
  round-trip: the intended closing quote is consumed as an escaped literal quote instead, and the
  parser reads `-Title evil\" -SessionId gmail:c1` as ONE merged argument.
- a crafted title containing `\"` sequences (e.g. from a Gmail subject line, since `title` in
  `AutoRecordCandidateInput` traces straight to `subject` on a real Gmail message) breaks the
  quoting outright and **injects new arguments into the eventual `powershell.exe` invocation**,
  including a `-Command` flag with arbitrary PowerShell, confirmed in the simulation
  (`re-parsed argv` shows a spurious `"-Command"` token appearing where none was intended).
- No test in `task-scheduler.test.ts` exercises a hostile title/sessionId/url — every case there
  uses ASCII text with no quotes/backslashes, so this was untested, not merely unfixed.

This is a **security-class finding per this repo's severity gate (auth/trust-boundary +
outward-facing action) and is never round-capped.** It alone is sufficient to FAIL this unit; see
`ISS-317` for the maker's fix direction (persist the item to a gitignored JSON file, make `/tr` a
fixed command with a validated `-Job <sessionKey>` argument instead of interpolating untrusted
text).

**Aggravating detail not in ISS-317's own evidence, noted here rather than filed as a duplicate:**
the manifest's "join-token never logged" claim is true for console/dry-run output (verified above,
falsifying-edit row 2) but does **not** cover the fact that the raw `meetingUrl` (with its `tk=`
token) is still passed as a `/tr` argument to a REAL Windows Scheduled Task once one is actually
created — visible to any local user/process via `schtasks /query /tn <name> /fo LIST /v` or the
Task Scheduler GUI's Actions tab, a different exposure surface than a log line. `raw/webinars/` is
correctly gitignored (`.gitignore:2`) and `schedule-state.json` never stores the URL, so there is
no git-level or state-file exposure — the exposure is local-OS-level only, and would be fixed by
ISS-317's own proposed remedy (move the sensitive fields out of `/tr` into a file).

### 2. Default trusted domains are too broad for the approved policy — ISS-318 (filed)
`auto-record-policy.ts:61`: `DEFAULT_TRUSTED_SENDER_DOMAINS = ["theoutreachcollective.in",
"ashoka.edu.in", "zoho.com", "zoom.us"]`. `isTrustedSender` (exact-domain match, verified via
`isTrustedSender: domain match, derived from email…` and the module's own logic) trusts **any**
sender whose address ends in `@zoho.com` or `@zoom.us` — free, public, multi-tenant email domains,
not partner organizations. Judged against the actual approval text (`qa/feedback-inbox.md`
2026-09-26T23:54:34+05:30 / 23:56:41+05:30): Umesh approved "auto-joins meetings from **trusted
senders**" and confirmed with "registration forms stay human… real Telegram/WhatsApp sends still
need their own approval" — nothing in either approval names Zoho or Zoom's own domains, and the
other two list entries are genuine partner organizations (TOC, Ashoka). Trusting `zoho.com` means
a stranger's personal Zoho Mail account, and trusting `zoom.us` means Zoom's own automated/
marketing mail, both auto-trigger a real recording as Umesh with zero human step. **Combined with
finding 1, this widens the practical attacker population for the injection to "anyone who can send
mail from a zoho.com or zoom.us address,"** which is a low bar. Severity: high, security-class
(trust-boundary), not capped.

### 3. Sessions crossing midnight get a stop-time already in the past — ISS-319 (filed)
`schedule-tick.ts:180` calls `toLocalHHMM(item.endTime)` (extracts only `HH:mm`, drops the date)
and passes it as `-Until` to `start-record-detached.ps1`, which resolves it via
`record-commands.ts:38` `todayAt()` — always "today" relative to when the launcher script
actually runs (the START day, since the Scheduled Task fires on the correct start date). A session
starting 23:30 and ending 00:30 the next day (a real, plausible TOC-evening-session shape) gets
`-Until 00:30` resolved to the START day at 00:30 — roughly 23 hours in the past relative to when
the recording begins — not disclosed in the manifest's Known gaps (which cover "no real task
created," a different concern than this composition bug). Not exercised by any of the 49 tests
(none constructs a midnight-crossing candidate). Severity: medium — narrow boundary condition, but
a real, silent, undisclosed truncation of a legitimate auto-triggered recording.

### 4. No cross-source dedup key — ISS-320 (filed, low, informational)
`sessionKey` is `cal:<id>` or `gmail:<id>` — no correlation by `meetingUrl` or time-window across
sources, so the same real meeting arriving via both a future Calendar integration and the Gmail
pipeline would get two keys. **Currently unreachable** (`loadCalendarEvents` always returns `[]` —
calendar-auto-join.md's own disclosed non-goal, still true), so not blocking. Filed for when
Calendar OAuth lands.

### Cases checked and found correct (no finding)
- **Domain-suffix spoofing** (`evil-ashoka.edu.in`, `ashoka.edu.in.evil.com`): `isTrustedSender`
  does an exact `Array.includes` match on the derived domain, not a suffix/substring test — both
  spoof attempts correctly return `false`. Verified by reading `auto-record-policy.ts:42-58`
  (`domainOf`/`isTrustedSender`); no test needed to falsify since the logic is exact-match, not
  regex/substring.
- **Display-name spoofing** ("karunn@vidysea.com" `<x@evil.com>`): the upstream Gmail extractor
  (`apps/api/src/gws-gmail.ts:114-117`, `extractEmail`/`FROM_RE`, pre-existing T-028/U2 code, not
  touched by this unit) pulls the address from inside `<...>` when present, not the display-name
  text, so a spoofed display name does not change the domain actually checked. Out of this unit's
  diff scope; verified by reading, not re-tested.
- **Case folding**: verified by the maker's own test + confirmed by reading — both env-parsed and
  default lists are lower-cased at load time, and the match lower-cases its inputs.
- **Overlap resolution determinism**: sort-then-cluster-then-earliest-wins/longest-tiebreak is a
  pure, deterministic sort — confirmed by reading and by the existing tests (no flake surface).
- **Registration vs. join-link classification** (Zoom `/w/` vs `/j/` vs `/webinar/register/`,
  Zoho, Google Meet): this is entirely upstream (`gws-gmail.ts`'s `REGISTER_URL_RE`/
  `DIRECT_JOIN_RE`/`isRegistrationOnly`, U2/T-028 code) — U5 only consumes the resulting
  `registrationOnly` boolean (`auto-join.ts:224`), verified via
  `selectAutoRecordItems: registrationOnly -> needs-registration` and the falsification above (not
  re-run here) is out of this unit's diff and not re-derived independently.
- **Candidate-loader error vs. genuine-zero observability**: `createHttpCandidateLoader` logs a
  distinct, human-readable reason for "no API key," "non-2xx," and "network throw" before
  returning `[]` in each case (`schedule-tick.ts:87-108`) — a human reading the tick's log CAN
  distinguish "saw nothing because of an error" from "genuinely nothing." Not a silent failure.
- **Past/in-progress sessions**: a session that started minutes ago and hasn't ended is correctly
  included (matches T-025's own contract criterion 2(b) and its pre-existing test); not a U5-
  introduced issue.

## Issues addressed
None claimed by the manifest (new unit) — none to verify as fixed.

## Scoreboard
- tsc / 49-test suite: **MET** (re-run, matches manifest)
- lint-loc / depcruise / full workspace suite: **UNVERIFIED-by-checker** (not re-run, RAM budget)
- diff scope / no unauthorized deletions: **MET**
- merge cleanliness against current master: **MET**
- capability coverage: **2/12 reproduced**, 10 UNVERIFIED-by-checker
- trusted-sender policy fidelity to the actual approval: **FAILED** (ISS-318)
- schtasks argument safety: **FAILED** (ISS-317, confirmed independently)
- midnight/timezone correctness of `-Until`: **FAILED** (ISS-319)
- cross-source dedup completeness: **PARTIAL**, low severity, not currently reachable (ISS-320)

**Dual check:** not triggered — confirmed no `.goal/goal.json` task matching this slug exists at
all (grep for `u5`/`auto-record`/`auto_record` in `tasks[]` returned nothing), so the manifest's
own "no" stands; this is a single Mode A verdict, not a `.b.md`.

```
VERDICT: FAIL
SCOREBOARD: 4/9 criteria met, 2 UNVERIFIED-by-checker, 3 FAILED (2 security-class, uncapped)
FAILURES:
- [schtasks-injection] sev: high · task-scheduler.ts:76 builds /tr with naive quote-escaping from
  partly email-sourced title/url; a crafted title breaks Windows argv parsing and injects extra
  powershell.exe arguments (confirmed via independent CommandLineToArgvW simulation) · fix:
  persist the item to a gitignored JSON file and make /tr a fixed, validated command · issue:
  ISS-317 (filed by concurrent background review, confirmed independently here, not duplicated)
- [trusted-domain-breadth] sev: high · auto-record-policy.ts:61 default-trusts the public domains
  zoho.com/zoom.us, letting any sender on those domains auto-trigger a real recording as Umesh,
  beyond what the approved "trusted senders" policy named · fix: drop the two vendor domains from
  the default, rely on named partner domains + the DB 3-approval mechanism · issue: ISS-318
- [midnight-until-bug] sev: medium · schedule-tick.ts:180 + record-commands.ts:38 lose the end-day
  across midnight, silently truncating an auto-triggered recording to near-zero length · fix: pass
  a full ISO end datetime / day-offset through, not a bare HH:mm · issue: ISS-319
CAPABILITY-COVERAGE: 2/12 rows reproduced (real falsifying edits, both isolated correctly) | 10 UNVERIFIED-by-checker (read-reviewed only, time/RAM budget)
LIVE-BROWSER: not-applicable (changed paths are packages/meeting-bot/src/calendar/*.ts + a 2-line cli.ts dispatch addition — a CLI/scheduler unit with no new screen, matches the manifest's own "Persona walk: skip" reasoning)
ISSUES-WRITTEN: ISS-318, ISS-319, ISS-320 (ISS-317 pre-existing, confirmed not duplicated)
EXECUTOR: claude-opus-subagent (manifest) — self != executor confirmed (checker: claude-sonnet-subagent, no ANTHROPIC_BASE_URL override)
EXPLANATION: The maker's own 49 tests are real and pass, the diff stays exactly in scope, and the
branch merges cleanly onto current master — solid mechanical work. But this unit's entire premise
is "auto-trigger real recordings without asking," and the two things that matter most for that
premise — who gets trusted, and whether trusted input can be safely turned into a Windows command
line — both fail under adversarial input the maker's tests never constructed (no hostile title/
url in any test; no test names zoho.com/zoom.us as anything but a green-path fixture). Per this
repo's severity gate, security-class findings on an outward-facing/auto-triggering unit are never
round-capped, so this is not "fix it next cycle" debt — it blocks PASS at cycle 1.
```

## Delegation ledger (cycle 1)
Appended the verdict/issues half of this unit's row to
`D:\KnowledgeBase\qa\delegation-ledger.jsonl`.

---

# CYCLE 2 (this section governs — Cycle checked: 2)

**Cycle checked:** 2
**Date:** 2026-09-27
**Checker:** fresh claude-sonnet-subagent (this session), bound to `D:\KnowledgeBase`. Lane
`D:\KnowledgeBase-lanes\u5-auto-record`, branch `wave/u5-auto-record`, commit `43df5b8`
(fix cycle 2, responding to this file's own cycle-1 FAIL at `83ff56d`).

## Verify commands re-run (own runs, RAM-constrained scope per dispatch — targeted tests + tsc on
meeting-bot only)
```
$ cd packages/meeting-bot && npx tsc --noEmit -p tsconfig.json
(no output — exit 0)

$ node --test --import tsx src/calendar/auto-join.test.ts src/calendar/schedule-state.test.ts \
    src/calendar/task-scheduler.test.ts src/calendar/schedule-tick.test.ts \
    src/capture/record-commands.test.ts
ℹ tests 82
ℹ pass 82
ℹ fail 0
```
Matches the manifest's claimed output exactly (82/82).

`lint-loc`/`depcruise`/full `pnpm -r test` were NOT re-run (same RAM-budget dispatch constraint as
cycle 1 and as this cycle's own manifest). Manually re-derived line counts instead (`wc -l`):
`task-scheduler.ts` 151, `schedule-state.ts` 108, `schedule-tick.ts` 220,
`auto-record-policy.ts` 92, `record-commands.ts` 298 — matches the manifest's claim exactly, all
at/under the 300-LOC budget. `UNVERIFIED-by-checker` for lint-loc/depcruise/full-suite, same as
cycle 1.

## PowerShell launcher — parse-check only (no execution; `Start-Process` would actually launch
`pnpm`, forbidden by this cycle's dispatch constraints)
```
[PS] [System.Management.Automation.Language.Parser]::ParseFile(
  'scripts\webinar\start-record-detached.ps1', [ref]$tokens, [ref]$errors)
-> PARSE OK - 0 errors
```
Confirms the manifest's em-dash fix claim; independently re-run, not just re-read.

## Backward-compatibility hard criterion — re-verified independently

**`todayAt` bare `HH:MM` form, byte-for-byte vs. master's pre-U5 implementation** (`git show
58a9f4c:packages/meeting-bot/src/capture/record-commands.ts`): wrote a standalone script that
calls the REAL exported `todayAt` from this cycle's code and a byte-for-byte copy of master's
`todayAt` side by side, for 8 `HH:MM` inputs including boundary cases (`00:00`, `23:59`) and an
explicit "earlier than now" case (`now`'s hour − 2, wrapping). **All 8 + the earlier-than-now case
match to the millisecond** (both resolve to the same instant, both anchor to *today* even when
that lands in the past relative to `now` — i.e. no behavior change for a time earlier than now:
still today, not tomorrow). Evidence:
```
00:00 master=2026-09-26T18:30:00.000Z new=2026-09-26T18:30:00.000Z MATCH
00:45 ... MATCH   09:05 ... MATCH   12:00 ... MATCH   23:59 ... MATCH   23:30 ... MATCH   05:00 ... MATCH
ALL MATCH
earlier-than-now case: 07:00 master=2026-09-27T01:30:00.000Z new=2026-09-27T01:30:00.000Z MATCH
Both resolve to TODAY (possibly in the past relative to now), not tomorrow: true
```
**MET** — the bare-`HH:mm` path is unchanged.

**Direct invocation `-Url <join> -Until <HH:mm> -Title <t> -SessionId <id>`** (today's live-webinar
usage): read-traced the full script. Master had `[Parameter(Mandatory=$true)]` on `-Url`/`-Until`;
this cycle drops `Mandatory` and replaces it with an explicit
`if (-not $Url -or -not $Until) { Write-Error <usage>; exit 1 }` check placed AFTER the `-Job`
resolution block (so `-Job` can supply them) but BEFORE `New-Item`/`Start-Process`. For the exact
direct-invocation shape named in this cycle's dispatch (`-Url`/`-Until`/`-Title`/`-SessionId`, no
`-Job`): the `-Job` block is skipped entirely (falsy `$Job`), the mandatory-check passes since both
are present, and `$cliArgs` construction (`@("--filter","@lkb/meeting-bot","cli","record",$Url,
"--until",$Until)` + conditional `--title`/`--session-id` appends) is byte-for-byte unchanged from
master. **MET — parameter binding and behavior for the existing manual path are unchanged.**

**Neither `-Job` nor `-Url` given:** traced the same path — `$Job` falsy skips the resolution
block, `$Url`/`$Until` stay `$null`, the mandatory-check fires, `Write-Error` + `exit 1`. **Fails
loudly, never reaches `New-Item`/`Start-Process`, never launches with an empty url — matches the
hard criterion exactly.**

## Capability coverage (step 4b) — 3 real falsifying edits in a throwaway copy (own copy, own
edits, never the bound tree)
Copy made at `...\scratchpad\u5-c2-checker-copy` (`packages/meeting-bot/src` + a `node_modules`
junction to the lane's own `node_modules` — never the bound tree itself), deleted after use.
Green-before confirmed for each file first.

- **ISS-317 row (jobKey validation gate)** — replaced `scheduleOnce`'s `if
  (!JOB_KEY_RE.test(opts.jobKey))` with `if (false)` (single-hunk, single file). Green-before:
  23/23 in `task-scheduler.test.ts`. Red-after: **exactly the 12 hostile-jobKey rejection tests
  turn red** (`evil\"`, `a;rm -rf`, `$(whoami)`, `` `backtick` ``, `%VAR%`, `line\nbreak`,
  `a&b|c`, `-Command`, `UPPER-CASE`, `has space`, `""`, 65-char), the other 11 stay green.
  **Isolates correctly.**
- **ISS-318 row (default trusted domains)** — restored `zoho.com`/`zoom.us` to
  `DEFAULT_TRUSTED_SENDER_DOMAINS` (single-hunk, single file). Green-before: 33/33 in
  `auto-join.test.ts`. Red-after: **exactly the 3 ISS-318-named tests turn red** (`falls back to
  the fix-cycle-2 defaults`, `defaults no longer trust… zoho.com/zoom.us`, `a stranger on
  zoho.com/zoom.us is untrusted`), the other 30 stay green. **Isolates correctly.**
- **ISS-319 row (todayAt ISO/midnight handling)** — removed the ISO-datetime branch from
  `todayAt`, leaving only the bare-`HH:mm` parse (single-hunk, single file). Green-before: 10/10 in
  `record-commands.test.ts`. Red-after: **exactly the 2 ISS-319-named tests turn red** (`a full ISO
  datetime is parsed directly`, `ISS-319's own reproduction — a session crossing midnight…`); the
  other 8 in that file, and the unrelated `schedule-tick.test.ts` ISS-319 row (which asserts the
  job-file's `until` field directly, independent of `todayAt`), stay green. **Isolates correctly.**

**CAPABILITY-COVERAGE: 3/3 targeted rows reproduced with real falsifying edits, all isolate
correctly; the remaining ~11 rows read-reviewed only (RAM/time budget, same discipline as cycle
1) — `UNVERIFIED-by-checker` for those, not credited as independently re-derived.**

## Diff scope (step 4c) — re-run myself
`git diff 2277245..43df5b8 --stat`: 12 files — the 5 `packages/meeting-bot/src/calendar/*`
production files + their 4 test files + `record-commands.ts`/`record-commands.test.ts` +
`start-record-detached.ps1` + this manifest/verdict pair. Matches the manifest's own claimed file
set exactly. Inspected every removed line (`git diff … | grep '^-[^-]'`) in
`schedule-tick.ts`/`task-scheduler.ts`: every deletion is the vulnerable old API surface being
replaced as part of the disclosed ISS-317 fix (`taskNameFor` helper, the old `command`/`args`-based
`ScheduleOnceOptions` shape, the naive-escaping `taskRun` builder) — **no undisclosed deletion, no
file outside the manifest's "What changed" touched.** **MET.**

## D-015 measurement — each issue's own recorded reproduction, re-run by me, counts by id
- **ISS-317** (schtasks `/tr` injection): re-ran the full `task-scheduler.test.ts` (23/23 pass,
  independently) — covers every hostile-character class ISS-317's own `fix_direction` named
  (quotes, backslash-quote, `&`, `|`, `;`, `$(...)`, backticks, `%VAR%`, newline) — plus my own
  falsifying edit above (12/12 correctly isolated). **ISS-317: 23/23 re-run, 12/12 isolated —
  fixed, verified.**
- **ISS-318** (over-broad trust defaults): re-ran `auto-join.test.ts` (33/33 pass) + my own
  falsifying edit (3/3 correctly isolated) + read-confirmed `DEFAULT_TRUSTED_SENDER_DOMAINS` no
  longer contains `zoho.com`/`zoom.us`. **ISS-318: 33/33 re-run, 3/3 isolated — fixed, verified.**
- **ISS-319** (midnight `-Until`): re-ran `record-commands.test.ts` (10/10 pass, includes ISS-319's
  own named 23:30→00:45 reproduction) + my own falsifying edit (2/2 correctly isolated) + my own
  independent `todayAt` byte-for-byte compat script (above). **ISS-319: 10/10 re-run, 2/2
  isolated — fixed, verified.**
- **ISS-320** (cross-source dedup, low, note-only): manifest correctly takes no action this cycle;
  nothing to re-run.

## New adversarial findings (beyond the three named issues) — filed, neither blocks this PASS

### ISS-321 (medium, filed) — jobKey derivation collision
`deriveJobKey`'s lossy collapse (`toLowerCase` + collapse-non-`[a-z0-9]`-to-`-`) makes distinct
`sessionKey`s map to the SAME `jobKey` — reproduced with the real exported function:
`deriveJobKey('gmail:abc_123') === deriveJobKey('gmail:abc-123')`, `deriveJobKey('gmail:ABC') ===
deriveJobKey('GMAIL:ABC')`, `deriveJobKey('cal:ABC_DEF') === deriveJobKey('cal:abc-def')`, all
`=== true`. Neither `writeScheduledJob` (unconditional `writeFileSync`) nor `scheduleOnce`'s
`/create /f` detects or warns on a collision — a second session silently overwrites the first's
job file and Scheduled Task. **Currently unreachable** (gmail `sessionKey`s are Mongo ObjectIds —
already collision-free under this transform; calendar events are stubbed to `[]`, same
reachability caveat this unit's own manifest discloses for calendar-sourced items) — same profile
already accepted for ISS-320, so **not blocking this PASS**, filed for when Calendar OAuth lands.
Per this repo's severity gate, a data-write-touching finding needs full ceremony once it's
actionable, regardless of severity — noted for whoever picks it up.

### ISS-322 (high, filed, out of this unit's diff — pre-existing T-028/U2 code) — no sender
authentication anywhere in the trusted-sender pipeline
Read `apps/api/src/gws-gmail.ts:114-116,278-280` (`extractEmail`/`FROM_RE`, `fetchOne`): `senderEmail`
is a bare regex pull of the raw `From` header text Gmail returned — **no SPF/DKIM/DMARC check
anywhere in this file**, no read of an `Authentication-Results` header, nothing. This predates and
is outside this unit's diff (T-028/U2, untouched by U5) — cycle 1's checker already flagged the
sibling "display-name spoofing" case as out-of-scope/read-only for the same reason, and I'm treating
this the same way: **not re-tested live, not blocking this cycle's PASS** (D-015 scope discipline —
ISS-317/318/319's own recorded reproductions are all independently satisfied above). What's new
this cycle: `auto-record-policy.ts` now trusts `umeshsugara@vidysea.com` itself (the account being
scanned) specifically because a self-forwarded invite's `senderEmail` equals that address — meaning
a *spoofed* `From: umeshsugara@vidysea.com` header gets **identical** treatment to a genuine
self-forward, with no authentication step distinguishing them. This is a systemic gap affecting all
four default trust entries, not something this unit introduced, but adding the scanned account's own
address as a trusted identity raises the stakes of that pre-existing gap. Flagged `HUMAN_GATE`-
worthy in the filed issue: whether Umesh accepts this residual risk, or wants gws-gmail.ts to surface
an authentication signal before U6 (the recurring poller) makes this pipeline run unattended.

### Noted, not filed (below my >80%-confidence bar for a FAILURES line or a ledger row)
Whether `start-record-detached.ps1`'s `Start-Process -FilePath "pnpm" -ArgumentList $cliArgs`
(unchanged from pre-U5 T-047, now fed partially email-sourced `$Title`/`$Url` via the `-Job` path)
has the same re-parse hazard as the old `/tr` string: architecturally these differ (schtasks's `/tr`
is a single string re-parsed a SECOND time by Task Scheduler when the task fires — the actual
ISS-317 bug; PowerShell's `-ArgumentList` array is quoted ONCE, directly into `CreateProcess`, no
second untrusted re-parse boundary), so I don't have independent evidence this is actually exploitable,
and confirming it empirically would require actually launching `pnpm` — forbidden by this cycle's
dispatch constraints. Question for a future cycle/human, not a finding here.

## Adversarial re-verification of items cycle 1 already checked (re-confirmed, not just re-read)
- **Join token never in `/tr`**: confirmed via read — the fixed `/tr` shape
  (`task-scheduler.ts:131`) contains only `launcherPath`/`jobKey`; the sensitive `url` lives only in
  the per-job JSON file. **MET.**
- **Job JSON under a gitignored path**: `git check-ignore -v raw/webinars/scheduled/abc.json` →
  matched by `.gitignore:67` (`raw/webinars/`). **MET.**
- **No `Invoke-Expression`, no string-built commands from JSON fields in the `-Job` path**: read the
  full script — zero occurrences of `Invoke-Expression`; `$Url`/`$Title`/`$SessionId` (whether from
  direct params or the job JSON) travel only as individual elements of the `$cliArgs` array handed
  to `Start-Process -ArgumentList`, never string-concatenated into a shell command. **MET.**
- **`-Job` regex re-validated in PowerShell, file read is safe**: confirmed the `$Job -notmatch
  '^[a-z0-9-]{1,64}$'` check runs BEFORE `Test-Path`/`Get-Content` — a hostile `-Job` value is
  refused before any file-system read, and the same shape blocks path traversal (no `.`/`/`/`\` in
  the allowed character class). **MET.**
- **`launcherPath` traversal**: `RECORD_LAUNCHER` is a fixed, repo-controlled constant
  (`path.join(REPO_ROOT, "scripts", "webinar", "start-record-detached.ps1")`) — never built from any
  candidate/sender/user input, so there is no external input surface for traversal here at all.
  **MET.**
- **Trust defaults now exactly partner orgs + named emails**: confirmed —
  `DEFAULT_TRUSTED_SENDER_EMAILS = ["karunn@vidysea.com", "umeshsugara@vidysea.com"]`,
  `DEFAULT_TRUSTED_SENDER_DOMAINS = ["theoutreachcollective.in", "ashoka.edu.in"]`. Whether adding
  `umeshsugara@vidysea.com` is fully consistent with the approved policy is judged above (ISS-322) —
  the *domains* half is unambiguously fixed exactly as ISS-318 demanded.

## Ledger
`ISS-317`, `ISS-318`, `ISS-319` → `fixed`, `regression_check` set to the exact re-run command,
in `D:\KnowledgeBase\qa\issues.jsonl` (re-read max id across `qa/issues*.jsonl` as 320 before
appending). `ISS-321` (medium, jobKey collision), `ISS-322` (high, sender-authentication gap,
out-of-diff) filed new, both `open`, neither blocks this PASS per the reasoning above.

```
VERDICT: PASS
SCOREBOARD: 3/3 named issues (ISS-317/318/319) independently confirmed fixed with regression
coverage re-run by me; backward-compat hard criterion MET (todayAt byte-for-byte vs master + direct-
invocation parameter binding unchanged + loud failure on neither -Job nor -Url); diff scope clean;
3/3 targeted capability rows re-isolated with my own falsifying edits
FAILURES: none
CAPABILITY-COVERAGE: 3/3 targeted rows reproduced (real falsifying edits, all isolate correctly) |
~11 UNVERIFIED-by-checker (read-reviewed only, same RAM/time budget as cycle 1)
LIVE-BROWSER: not-applicable (CLI/scheduler unit, no new screen — matches manifest's "Persona walk:
skip", unchanged from cycle 1)
ISSUES-WRITTEN: ISS-321, ISS-322 (new, neither blocking); ISS-317/318/319 marked fixed
EXECUTOR: claude-opus-subagent (manifest) — self != executor confirmed (checker: claude-sonnet-
subagent, no ANTHROPIC_BASE_URL override)
EXPLANATION: All three named security-class findings (ISS-317 command injection, ISS-318 over-broad
trust defaults, ISS-319 midnight truncation) are genuinely fixed — I independently re-ran every test,
applied my own falsifying edits (not the maker's), and re-derived the backward-compatibility hard
criterion (todayAt byte-for-byte vs. master, direct-invocation binding unchanged, loud failure on
missing input) from first principles rather than trusting the manifest's claims. Diff scope is clean.
My own adversarial hunt found two more things (ISS-321 jobKey collisions, ISS-322 no sender
authentication anywhere upstream) — both real, neither blocking: ISS-321 is currently unreachable
(same profile as the already-accepted ISS-320), and ISS-322 is a pre-existing, out-of-this-unit's-diff
gap in T-028/U2 code that adding umeshsugara@vidysea.com makes more consequential but did not create.
Per D-015, this cycle is measured against ISS-317/318/319's own recorded reproductions, and all three
are satisfied by evidence I produced myself, not evidence I merely re-read.
```

## Delegation ledger (cycle 2)
Appended the verdict/issues half of this unit's row to `D:\KnowledgeBase\qa\delegation-ledger.jsonl`.

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

## Delegation ledger
Appended the verdict/issues half of this unit's row to
`D:\KnowledgeBase\qa\delegation-ledger.jsonl`.

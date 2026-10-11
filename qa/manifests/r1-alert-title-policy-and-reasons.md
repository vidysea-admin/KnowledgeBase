# Manifest — r1-alert-title-policy-and-reasons

**Status:** ready-for-check
**Fix cycle:** 1
**Lane:** ALERTFIX (branch lane/alertfix, base 9dae5d3). **Security class:** credential handling (meeting passcodes in operator alerts). Full ceremony.
**Backlog tier:** 2 (open high security issue ISS-R1ALERTS-009; also -010, -011 medium and ISS-T037W1-003 / contract W10).
**Round cap:** security class, never capped.

## Scope
1. Replace the hand-kept 11-value skip-reason list in `attention-alerts.ts` with the core `SKIP_REASONS` (14 values) so `opted-out`, `rule-denied`, `rules-unevaluable` stop bucketing as `other` (W10, ISS-T037W1-003).
2. An explicit, typed title policy on the alert formatter, with the safe value as the default, so the Approver's pending ruling on ISS-R1ALERTS-009 is a one-line choice.
3. ISS-R1ALERTS-011: under the deny-list policy a recognised keyword anywhere hides the whole title.
Files: `attention-alerts.ts` (210 non-blank lines), `alert-text.ts` (142), tests `alert-title-policy.test.ts` (new, 160), plus edits to `attention-alerts.test.ts`, `alert-text.test.ts`, `alert-text.corpus.test.ts` (all < 400). All six alert files now live in `packages/meeting-bot/src/calendar/alerts/` (see Relocation); no new source file. `qa/issues.alertfix.jsonl` (new, one row).

## The policy, as built
`TitlePolicy = "omit" | "masked"`; `AttentionInput.titlePolicy?`; `DEFAULT_TITLE_POLICY = "omit"`; `resolveTitlePolicy(v)` returns `"masked"` only for the exact string `"masked"`, otherwise `"omit"` (absent, null, wrong case, wrong type, a throwing getter: all `omit`). Both routes (skipped, job) read the same resolved value.
- **omit (default).** The title argument is never read. The alert is identified by headline, formatted start time and the existing hashed id. Nothing derived from the title, not even length. Title line: `<headline>: <start> [<id>]`. Body is still 4 lines; line 2 is `Event ref: <id> (title not shown)` instead of `Event: <title>`.
- **masked.** Today's deny-list rendering (`Event: <neutralised title>`), unchanged except for -011 below. Must be requested by name.
Why `omit` is the default: a deny-list cannot be proven to catch a secret it has no word for (ISS-R1ALERTS-009, cycle-2 contract amendment). A default that fails safe means a wiring unit that forgets the option cannot leak titles; opting into `masked` is a visible, reviewable line.

## Rows closed, by policy
| Row | omit (default) | masked (opt-in) |
|---|---|---|
| ISS-R1ALERTS-009 (high) | closed by construction for the title field | NOT closed: documented limit |
| ISS-R1ALERTS-010 (medium) | closed by construction | NOT closed: misspelt keywords still unrecognised (no keyword growth, by instruction) |
| ISS-R1ALERTS-011 (medium) | closed by construction | closed: keyword anywhere hides the whole title (one `(hidden)`) |
`masked` still cannot catch a secret with no recognised keyword (009) or a misspelt/joined keyword (010). Those rows are closed only for the default policy. Ledger statuses are not edited here.
Other title-adjacent leak classes (ISS-R1ALERTS-001..008) hold under both policies (below).

## Not done
- Nothing is wired to any sender (W8). `grep -rn buildAttentionAlerts` outside `packages/meeting-bot/src/calendar/alerts/` stays empty.
- The Approver's ruling on ISS-R1ALERTS-009 is still pending. This unit does not pre-empt it: it only makes the safe option the default and the other an explicit opt-in.
- No `contracts/` or verdict edits. Body line count is unchanged (4), so there is no conflict with the stated contract; W8(b) ("headline, hashed id, start time and a non-sensitive identifier supplied by the wiring") is what `omit` implements, minus the wiring-supplied identifier.
- Platform text: the alert never carried a platform, so none is shown.

## W9 handle finding
Under `omit` the handle is the hashed id (first 20 hex of SHA-256 over the UTF-16LE session key) in both title line and body, plus the formatted start. Two different meetings at the same start time get different keys and ids and therefore different title and body (tested, skipped and job routes). BUT no tool in the repo resolves an id to a meeting: `alertIdFor` / `buildAttentionAlerts` appear only in `packages/meeting-bot/src/calendar/alerts/` (grep over ts, tsx, mjs). So an operator can tell alerts apart but cannot find the meeting from the alert alone. Filed as ISS-ALERTFIX-001 (medium; wiring unit must supply an id-to-key map in the operations view or a W8(b) identifier). No lookup tool invented here.

## Evidence
From `packages/meeting-bot` with node on PATH (toolchain note):
- `node --test --import tsx src/calendar/alerts/alert-title-policy.test.ts` -> tests 8 / pass 8 / fail 0
- `... alerts/attention-alerts.test.ts` -> tests 10 / pass 10 / fail 0; `... alert-text.test.ts` -> 15 / 15 / 0; `... alert-text.corpus.test.ts` -> 9 / 9 / 0
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0 (meeting-bot) and exit 0 (core)
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (112 dir(s) within budget)`

**D-015 per policy.** Cases are read from the ledger row at test time and asserted to be verbatim strings of it; the secret is searched in the WHOLE serialised result, on both routes.
- omit: `ISS-R1ALERTS-009: 15/15 refused`, `ISS-R1ALERTS-010: 12/12 refused`, `ISS-R1ALERTS-011: 5/5 refused`
- masked: `ISS-R1ALERTS-009: 0/15 refused` (left open, documented limit), `ISS-R1ALERTS-010: 0/12 refused` (left open, documented limit), `ISS-R1ALERTS-011: 5/5 refused`
- ISS-R1ALERTS-001..008 recorded reproductions, replayed under BOTH policies (corpus test loops both): 001 21/21, 002 1/1, 003 4/4, 004 2/2, 005 4/4, 006 37/37, 007 3/3, 008 2/2, verdict extras 5/5, each under masked and under omit.
- `ISS-T037W1-003: attention-alerts 14/14` core reasons pass through (not `other`); an unknown value, empty string and a string shaped like a label map to `other`. The row's other consumers (brain, telegram, run-pipeline) were verified 3/3 by the skip-reason-vocabularies lane; this closes its attention-alerts part (status not edited here).
**Generator.** Seeded (20261011), 400 arbitrary titles (Latin, Cyrillic, Devanagari with nukta, CJK, Arabic, digits, punctuation, invisibles, emoji, keyword/URL fragments; half single-script), 2 routes: the alert deep-equals the alert for a title-less input (so nothing, not even length, depends on the title) AND every 3-code-point window of the title (any longer substring contains one) that is absent from the title-less alert is absent from the alert: 61,923 windows checked, 789 exempt (coincide with fixed boilerplate or the id), 0 leaks. Also null, numbers, objects, a 100k string and a throwing toString change nothing.

**Example alert under omit (skipped, overlap-lost, start 2026-10-12T10:00Z, zone UTC):**
```
title: Session dropped: overlap: 2026-10-12 10:00 (UTC) [<20-hex id>]
This session overlaps another one and was dropped, so it will not be recorded.
Event ref: <20-hex id> (title not shown)
Starts: 2026-10-12 10:00 (UTC)
What to do: If you need both, record one manually or start a second capture.
```

## Mutations (timeout 170 s, per-mutation byte backup, restore in finally, `git hash-object` equals the pre-run blob after each; final check true for both files)
All run against the four test files. All killed:
- M1 default flipped to masked: killed by `policy resolution: omit by default...`
- M2 invalid value falls back to masked: killed by 7 tests incl. `policy resolution`, `masked -011`, `D-015 per policy`
- M9 absent/throwing option reads as masked: killed by `policy resolution`
- M3b omit leaks the title's first word (body): killed by `D-015 per policy`, `D-015 ledger corpus [omit]`, `omit: exact shape`, `omit generator`, `omit: non-string and hostile titles`, `policy resolution`
- M4 omit leaks title length: killed by `omit: exact shape`, `omit generator`, `omit: non-string and hostile titles`
- M5 masked hides only from the keyword onward (-011 bug): killed by `masked -011`, `ISS-R1ALERTS-006/-011 shape`, `D-015 per policy`
- M6 reasons set reverts to 11 values: killed by `W10 / ISS-T037W1-003`
- M7 job route ignores the policy: killed by 4 tests (`D-015 per policy`, `policy resolution`, `omit: exact shape`, `omit generator`)
- M8 skipped route ignores the policy: killed by 5 tests
An initial M3 (assign the first word to a variable that omit never reads) was an equivalent mutant (dead code) and was replaced by M3b. An initial M9 survived because its trap title contained a keyword; the test now uses a keyword-free title and kills it.

## Existing tests changed
The three existing test files now pass `titlePolicy: "masked"` in their helpers (they test the deny-list renderer); three `006 shape` expectations changed from `<topic> (hidden)` to `(hidden)` (the documented -011 change). The corpus D-015 test now runs under both policies.

## Unverified
Not run: full suite, wiring, anything outside `calendar/alerts/`. `@lkb/core` resolves to the main tree via junction; it already contains `SKIP_REASONS`, same blob as in this branch's base.

## Relocation (evidence)
`calendar/` would have exceeded its 30-file cap after merge, so the six alert files were `git mv`'d into `packages/meeting-bot/src/calendar/alerts/` (lint-dirsize counts files per directory, non-recursively, and `capture/browser` already nests; subfolders are allowed). The only path edit was the ledger URL in `alert-title-policy.test.ts` (one more `../`). No importer exists outside these six files (grep over packages, apps, scripts, ts/mjs/json), and no barrel, tsconfig (`src/**/*.ts`) or test glob (`src/**/*.test.ts`, matched the four test files at the new paths) names the old paths. Counts unchanged: policy 8, attention 10, alert-text 15, corpus 9. tsc exit 0; `lint-dirsize: OK (113 dir(s) within budget)`. `calendar/` now holds 24 files (main: 29; 29 - 5 moved = 24, since the new test file was never counted there); the other lane's +1 gives 25. `qa/contracts/`, `qa/verdicts/` and `qa/manifests/r1-attention-alerts.md` still cite the old `calendar/` paths and were not edited; the checker owns the contract.

## Fix cycle 1
**What failed (verdict, cycle 0: FAIL).** `readPolicy` read `titlePolicy` without an own-property check, so an inherited or prototype-polluted `"masked"` (`Object.create({titlePolicy:"masked"})`, `Object.prototype.titlePolicy = "masked"`) flipped both routes from `omit` to the leaky deny-list and `Weekly tiger` appeared in the alert (ISS-ALERTFIX-002, medium, security class). Also: the corpus echo audit had been weakened to `omit` only, and this manifest cited bare issue ids (tracker gate G4).

**The rule.** Only an OWN property of the options object whose value is exactly the string `"masked"` selects masked. Everything else, including every inherited value, yields `omit`. One helper, `opt(input, key)`, in `attention-alerts.ts`: non-object input gives `undefined`, otherwise `own(input, key)` (`Object.prototype.hasOwnProperty.call`). `readPolicy` reads the value once through it, inside the existing try (a throwing getter still gives `omit`).

**Option-read audit (every read of a caller-supplied options object in `attention-alerts.ts` and `alert-text.ts`).**
| Read | Own-checked before | Own-checked now | Can it change alert text |
|---|---|---|---|
| `titlePolicy` | no (the bug) | yes | yes: selects title shown or not. FIXED |
| `timeZone` | no | yes | only the zone label in `Starts:`, already regex- and Intl-validated; no title text. Fixed anyway |
| `now` | no | yes | no text; decides whether an alert is dropped as already-started. Fixed anyway |
| `startTimes` (container) | no | yes | start text via `canonicalStart` (re-formatted, never copied). Fixed anyway; the per-key read was already own-checked |
| `skipped` (container) | no | yes | which items exist. Fixed anyway |
| `jobs` (container) | no | yes | which rows exist. Fixed anyway |
| per item: `sessionKey`, `reason`, `title`; per row: `status`, `reason`, `startTime`, `title`; `jobs[id]` | yes (`own`) | yes | already covered |
| `alert-text.ts` exported functions | n/a | n/a | take positional arguments (title, passes, tz string), no options object; not security-relevant |
One shared `opt` helper, so no read can be missed on one route only. Source is 213 non-blank lines.

**Tests (alert-title-policy.test.ts, now 12 tests, 227 non-blank lines).** Both routes (skipped, job): the row's recorded reproduction (the test asserts the `Object.assign(Object.create({titlePolicy:"masked"}),{...})` string is verbatim in the ledger row), `Object.create({titlePolicy:"masked"})`, a class instance with the policy on its prototype, a polluted `Object.prototype.titlePolicy` (set and deleted in `try/finally`, restoration asserted with `hasOwnProperty` before and `"titlePolicy" in {}` after; an own `undefined` does not fall through to the prototype), an OWN `"masked"` still opts in (and beats an inherited `"omit"`), and an option audit (inherited `timeZone`, `now`, `startTimes`, `skipped`, `jobs` ignored). **D-015 count against the row's recorded reproduction: `ISS-ALERTFIX-002: 6/6 inherited-policy cases refused`** (3 shapes x 2 routes, including the recorded one) and `polluted Object.prototype 2/2 routes refused`. Nothing left open.

**Echo audit (alert-text.corpus.test.ts).** Now loops `["omit", "masked"]`, passing `titlePolicy` explicitly, with every assertion of the pre-cycle-0 test (`alerts.length === 2`, no `zmark` anywhere in the serialised result, the ignored-reasons set) applied under each policy (compared with `git show 9dae5d3:packages/meeting-bot/src/calendar/alert-text.corpus.test.ts`). Test count stays 9.

**G4.** Two unqualified references (the short form of the 009 id, and the 001..008 range) now carry the full R1ALERTS lane qualifier. `node scripts/tracker-audit.mjs --gate g4`: no finding names this manifest after the fix (the audit still reports the other manifests' findings, not touched). Other manifests untouched.

**Mutations (cycle 1; timeout 170 s per run; byte backup PER mutation; restore in `finally`; byte-equal to backup after each; then `git hash-object` vs `git rev-parse HEAD:` after commit, below). All killed:**
- M1 own-check removed (`input?.titlePolicy`): killed by `ISS-ALERTFIX-002: an INHERITED titlePolicy ...`, `ISS-ALERTFIX-002: a polluted Object.prototype ...`
- M2 own-check on the skipped route only (job inherits): killed by the same two
- M2b own-check on the job route only (skipped inherits): killed by those two and `policy resolution: omit by default ...`
- M3 inherited value honoured when own is absent (`own ?? inherited`): killed by the same two
- M5 every option read inherited (`opt` reads plainly): killed by those two and `ISS-ALERTFIX-002 option audit ...`
- M4 echo audit reverted to omit-only: the audit alone cannot see a masked-only leak. Source mutant M4a (masked body echoes the raw session key) run two ways: with the omit-only audit the `echo audit` test PASSES (mutant survives that audit; only the `D-015 ledger corpus [masked]` test fails); with the current both-policy audit `echo audit: no caller-controlled string reaches ANY field of the result` FAILS (also killed: `D-015 ledger corpus [masked]`, `property: 2400 seeded cases`, `masked -011`). That is the evidence that the both-policy audit is stricter.
The own-check on the policy and on the container reads is all in `opt`; there is no second read to mutate.

## Evidence (fix cycle 1)
From `packages/meeting-bot` with node from the toolchain note:
- `node --test --import tsx src/calendar/alerts/alert-title-policy.test.ts` -> tests 12 / pass 12 / fail 0 (was 8)
- `... attention-alerts.test.ts` -> tests 10 / pass 10 / fail 0; `... alert-text.test.ts` -> 15 / 15 / 0; `... alert-text.corpus.test.ts` -> 9 / 9 / 0
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0
- `node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (113 dir(s) within budget)`
- test output lines: `ISS-ALERTFIX-002: 6/6 inherited-policy cases refused`; `ISS-ALERTFIX-002: polluted Object.prototype 2/2 routes refused, prototype restored`
- Not changed: contracts, verdicts, ledger statuses, enforcement paths; nothing wired.

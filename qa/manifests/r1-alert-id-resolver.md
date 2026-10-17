# Manifest - r1-alert-id-resolver

**Status:** checked-PASS (Checked: qa/verdicts/r1-alert-id-resolver.md, cycle 1, ba6e891)
**Fix cycle:** 1
**Lane:** ALERTID (branch lane/alertid, base 33baf6f). **Security class:** credential handling (meeting passcodes must not reach operator alerts). Full ceremony.
**Backlog tier:** 2 (closes wiring precondition W9 behind open high ISS-R1ALERTS-009: the safe `omit` default is only usable if an operator can find the meeting). Round cap: security class, never capped.

## Scope
A local, read-only resolver so an operator can turn the `[<20-hex id>]` in an `omit`-policy alert back into a meeting, on their own machine, without the alert carrying that information.
- `calendar/alerts/alert-resolve.ts` (68 lines): PURE `resolveAlertId(id, candidates, hash = alertIdFor)` and `normaliseAlertId`. Imports the SAME `alertIdFor` (already exported; not modified). The `hash` parameter is a test seam only.
- `alert-who-command.ts` (166 lines): loader + `runAlertWho` + `defaultAlertWhoDeps`. Registered in `cli.ts` as one import and one `if (argv[0] === "alert-who")` line, same shape as `send-now`; no other command changed.
- Tests: `alert-resolve.test.ts` (77), `alert-who-command.test.ts` (219).
Id forms accepted (strict): bare, in ONE pair of `[ ]`, surrounding whitespace, upper case. Refused with a typed reason (`not-text|empty|wrong-length|not-hex`), never a throw: inner whitespace, prefixes (`id:`, `0x`), other brackets, other length or characters. Several matches are all returned (collision).

## Where candidates come from (read-only, shapes from schedule-state.ts)
1. `raw/webinars/schedule-state.json`: `{sessionKey,title,scheduledAt}` per scheduled session (not tenant-tagged).
2. `raw/webinars/scheduled/*.json`: `{sessionId,url,until,title}` (not tenant-tagged).
3. `data/webinar-release/operations.json`: `operations[sessionId]` with title/startTime/status; read through the existing `readWebinarOperationState`, which REFUSES a file whose tenantId differs. These are the same paths `send-now` and `schedule-tick` use.
Tenant: `captureTenant(--tenant | LKB_TENANT_ID | default)`, the host's own rule; the id never reaches tenant selection. Rows for one sessionKey are merged. Caps: 5 MiB per state file, 64 KiB per job file, 5000 job files, 20000 rows; symlinks and non-files refused; a missing file is silent, a corrupt file gives a `warning:` line and a "not proof of absence" note on a miss. Limitation: sources 1 and 2 carry no tenant tag, so tenant separation there rests on the state dir being per-machine/per-tenant as today (only source 3 is actively tenant-validated).

## What the CLI prints, and never prints
`lkb alert-who <id> [--tenant T] [--tz ZONE]` prints, per match, five lines: `record` (session key, cut to `[A-Za-z0-9:._ ,;-]`), `title` (through `neutralizeText`, the alerts' own allowlist renderer; a title containing a credential keyword prints `(hidden)`), `time` (start from operations, else `ends <until>`, rendered with `renderStart` in `--tz`, default UTC), `platform` (`detectPlatform`) with the bare https host, and `source`/`status`.
Never printed: the join URL path, query, fragment or userinfo (decision: host only; a passcode can sit in ANY parameter and the path can itself be a join capability, and title+time+platform+host suffice to find the meeting). ANSI/OSC/CSI, CR/LF, U+2028/9, bidi overrides and NUL cannot appear (allowlist output, one line per field, test-checked). Writes nothing: no file, log or network (tree snapshot test). Exit 0 = found, 1 = refused or not found, usage errors throw (as `send-now`).

## Residual (honest)
`alertIdFor` is the first 20 hex of an UNSALTED SHA-256 over the session key. Anyone holding an alert AND the tenant's schedule can resolve it: that is the feature. Anyone holding only the alert must guess session keys. A key is `cal:<Google event id>` (high entropy), `gmail:<ObjectId>` (24 hex, partly guessable), or `webinar-<24 hex of sha256(identity)>` with identity = https URL minus tk/token/access_token/pwd/password/utm_* plus ISO start. The start time is printed in the alert and a Zoom meeting id is 9-11 digits, so a webinar id is brute-forceable offline (about 1e10-1e11 candidates); what is recovered is the meeting URL/id, not a passcode, but a passcode under an unusual parameter name stays in the hash input and the id then confirms a guessed full URL. Filed as ISS-ALERTID-002 with recommendation: HMAC with a per-tenant secret. `alertIdFor` is NOT changed (it would change every existing id: contract matter for the checker and the Approver). Also ISS-ALERTID-001: skipped sessions (overlap, untrusted sender, no join link) are never persisted, so their alerts cannot be resolved by this tool.

## NOT done
No sender wiring (W8 stands). `alertIdFor`, `attention-alerts.ts`, `alert-text.ts` untouched. No contracts, verdicts, enforcement paths or ledger statuses touched. No D-119 reserved file touched.

## Evidence
Toolchain: node from the codex runtime, `node --test --import tsx`, in packages/meeting-bot.
- New tests: `alert-who-command.test.ts` + `alert-resolve.test.ts`: `tests 19 / pass 19 / fail 0`.
- Four existing alert test files, unchanged: alert-text.corpus 9/9, alert-text 15/15, alert-title-policy 12/12, attention-alerts 10/10 (all pass, 0 fail).
- `tsc --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0, no output.
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (115 dir(s) within budget)`.
- D-015: the ledger row's recorded reproduction is that no id from a real formatter call resolves. Re-run as: ids printed by real `buildAttentionAlerts` calls (omit policy; 6 session keys x 4 skip reasons x 3 pasted forms: title bracket, `[title bracket]`, body `Event ref`). Test output: `ISS-ALERTFIX-001: 72/72 resolved`. The row stays open until the checker confirms (ISS-ALERTID-001 names what the tool cannot cover).
- Hostile titles (ANSI CSI/OSC, CR/LF forged "title:" line, bidi RLO/isolates, 10,000 chars, C1 CSI, NUL, U+2028/9): 8/8 inert, exactly 6 output lines, no control/bidi characters, each line under 260 chars. Hostile session key and host: inert.
- Join URLs with `pwd=`, `token=`, `context=`, `passcode=`, `odd_param_name=`, fragment, userinfo: 14 secret substrings, 0 appear in output (4 URLs).
- Two tenants: tenant A refuses tenant B's operations.json (`belongs to a different tenant`), B's title absent; tenant B resolves it.
Mutations (harness inside the worktree, untracked and deleted before commit; byte backup per mutation, restore in `finally`, hard 280 s timeout; `git hash-object` equal before/after for every mutation, `restored: true`; SURVIVED: none):
| Mutation | Killed by |
|---|---|
| M1 second, differing hash implementation | resolves-from-three-sources; hostile titles; join URL; two tenants |
| M2 first-match-only | collision test |
| M3 title printed raw | hostile titles |
| M4 host returns raw URL with query | resolves-from-three-sources; join URL |
| M5 tenant taken from the id | three-sources; two tenants; tenant-from-host |
| M6 malformed-id refusal removed | both malformed-id tests |
| M7 key/status not reduced to plain charset | hostile session key |
| M8 upper case no longer accepted | accepted forms |
| M9 operations tenant tag not enforced | two tenants; tenant-from-host |
Not mutated: "env var the user did not set" has no code path (tenant only via `captureTenant`, which reads only LKB_TENANT_ID, the host's own rule). A one-off escaping script (esc.cjs, written by me in the shared scratchpad) rewrote non-ASCII characters in my own test file only; it is not a mutation harness. Unverified: the real `lkb alert-who` was not run end to end (no real state; `defaultAlertWhoDeps` is covered by tsc only).

## Issues filed (qa/issues.alertid.jsonl)
ISS-ALERTID-001 (medium, skipped sessions unresolvable), ISS-ALERTID-002 (medium, unsalted hash brute-forceable for webinar keys; HMAC recommended).

---

# Fix cycle 1 (answers verdict qa/verdicts/r1-alert-id-resolver.md, FAIL cycle 0)
Supersedes where it differs: the cycle-0 statements above on tenant tagging ("tenant separation there rests on the state dir"), on skipped sessions ("never persisted"), the miss message, and the `72/72` D-015 claim. Code commit ef8d1f8 (this section and two ledger rows are the follow-up commit).

## What failed
ISS-ALERTID-003 (high): `alert-who <B's job id> --tenant A` printed tenant B's title and the miss said "for tenant A". ISS-ALERTID-004 (medium): the 72/72 put the formatter's own keys in the candidate list. ISS-ALERTID-001 (high): two skipped kinds did not resolve. ISS-ALERTID-005 (low): junction followed; job size cap unpinned.

## What is true about tenant tagging, per source (read from the writers)
- `schedule-state.json`: written by `recordScheduled` (schedule-state.ts:247-251), record `{sessionKey,title,scheduledAt}`. NO tenant field. One path for the whole machine (`DEFAULT_STATE_DIR = <repo>/raw/webinars`, schedule-tick.ts:17).
- `scheduled/*.json`: written by `writeScheduledJob` (schedule-state.ts:273-283), record `{url,until,title,sessionId}`. NO tenant field, same shared dir.
- `operations.json`: carries `tenantId` on the file and every row; `readWebinarOperationState` refuses another tenant's file. The only tagged source.
So option (a) (filter by a field in each record) is impossible: there is no field. Option (b) applied. Root cause filed, not fixed: ISS-ALERTID-006.

## What the tool does now
- Default (any tenant, including the default one): only tenant-tagged `operations.json` is searched. The two untagged sources are read only to be COUNTED; the run prints `notice: N candidate(s) in schedule-state.json and scheduled/ were NOT searched: those files are shared by every tenant on this machine and carry no tenant tag ... Add --include-untagged ...`. Nothing from them is ever printed.
- `--include-untagged` (explicit opt-in): searches them; every match prints `source:   tenant unknown (shared schedule file): <source>`. A key that also has a tenant-tagged hit prints once, unlabelled.
- Every "for tenant X" phrasing is gone; the miss reads `no record in operations.json matches alert id <id>` (literally true) plus a limits line.
- Applied always, not conditional on how many tenants are configured (that cannot be detected from disk reliably).

## ISS-ALERTID-003 reproduction, verbatim (test `ISS-ALERTID-003 recorded reproduction, verbatim`)
scheduled/b.json `{sessionId:'cal:tenantB',title:'TENANT-B Board Review'}`, operations.json tagged B, `alert-who <alertIdFor('cal:tenantB')> --tenant A`: exit 1; output contains neither `TENANT-B` nor `Board Review` nor `for tenant`; it contains the NOT searched notice and `no record in operations.json matches alert id`. With `--include-untagged` the same id prints the title, labelled `tenant unknown (shared schedule file)`.

## Per-kind resolution table, from production-shaped state (replaces the 72/72 claim)
Built by: real `runScheduleTickOnce` (everyWebinar:true, injected clock, fake loaders/scheduler, no network) writing schedule-state.json and scheduled/*.json to a temp root; real `prepareWebinarSourceState` (reconcile + projectWebinarInventory) writing operations.json for the same inputs; real `buildAttentionAlerts` over the tick's skipped list and the operations rows; the resolver reads ONLY the temp root. The fixture covers all 14 values of core `SKIP_REASONS` (asserted equal to the list; the 3 veto reasons opted-out/rule-denied/rules-unevaluable come from join-rules-select, so they are fed as SkippedItems, and emit no alert). Test: `alert-who-production.test.ts`, expectations pinned.

| skip reason / kind | session key | alert emitted? | resolves | source |
|---|---|---|---|---|
| overlap-lost | webinar-<hash> | yes | yes | operations (row) |
| untrusted-sender | webinar-<hash> | yes | yes | operations (row) |
| no-join-link | cal:<id> | yes | yes (was NO) | operations source inventory |
| unsafe-join-link | cal:<id> | yes | yes (was NO) | operations source inventory |
| needs-registration | gmail:<id> | yes | yes (was NO) | operations source inventory |
| past, duplicate-session, not-webinar, needs-review, cancelled, invalid-time, opted-out, rule-denied, rules-unevaluable | - | NO alert | n/a | n/a |
| job alerts (operations rows at action_required; 7 in the fixture) | review keys | yes | 7/7 | operations (row) |

Default and `--include-untagged` give the same result for every skipped kind (none is resolved from an untagged file).

## cal:/gmail: kinds: what exists on disk
The tick itself persists nothing for skipped items (schedule-tick.ts:236-239 only logs `result.skipped`). But `operations.json` already carries the poller's source inventory (`source.reconciliation.occurrences[*]` = `{source:"calendar"|"gmail", snapshot:{id,title,startTime,...}}`, written by `prepareWebinarSourceState`, tenant-tagged, validated on read). Skipped sessions are keyed `cal:<event id>` / `gmail:<candidate id>`, so a READ of that existing block resolves them with no new write path. Added in `loadCandidates`. Limit, stated in the miss message: the inventory is filled by a different loader than the tick's, so an item the inventory has not seen misses; NOT verified end to end against the real poller. Filed as ISS-ALERTID-007 (the write-path follow-up that would make W9 unconditional: one record per skipped alertable item `{sessionKey,startTime,source,tenantId}`, never the join URL, written by `runScheduleTickOnce`).

## W9 and W11
W9: PARTLY met. On production-shaped state all 5 alert-emitting skip kinds and 7/7 job alerts resolve, from the tenant-tagged operations.json only. Still open: (1) the cal:/gmail: kinds (no-join-link, unsafe-join-link, needs-registration) depend on operations.json's source inventory having synced the same item (ISS-ALERTID-007; not verified against the real poller); (2) the untagged files stay off by default until the scheduler tags them (ISS-ALERTID-006). ISS-ALERTFIX-001 is not marked verified by this unit.
W11 (ISS-ALERTID-002: `alertIdFor` is an unsalted SHA-256 prefix) is a SENDER gate for the Approver and is NOT addressed here: `alertIdFor` unchanged, nothing wired to a sender.

## D-015 measurement
- ISS-ALERTID-003: 1/1 recorded reproduction refused (plus the two-tenant matrix: tenants A and B each see 0 of the other's untagged titles, 2/2 runs).
- ISS-ALERTID-004: per-kind table measured on real state (above); the old 72/72 test is renamed `hash agreement only (NOT W9 evidence ...)`.
- ISS-ALERTID-001: 5 of 5 alert-emitting skip kinds resolve on production-shaped state (was 2 of 5), 7 of 7 job alerts; open = the two W9 conditions above, with the three cal:/gmail: kinds named as the ones that depend on the inventory.
- ISS-ALERTID-005: a junction at scheduled/ and a junction in front of operations.json are both refused (`resolves outside the data root (link not followed; skipped)`); job cap pinned (70 KiB valid job refused, 60 KiB valid job accepted).

## Mutations
Harness `.alertid-mut.cjs`: untracked in the worktree, deleted; absolute paths inside this worktree; byte backup PER mutation; restore in `finally`; 200 s kill; `git hash-object` equals `git rev-parse HEAD:<file>` after each (`restored: true` x11). 11 run, 11 KILLED, 0 survived.

| Mutation | Killed by (named tests) |
|---|---|
| M1 untagged records added to the tagged bucket | ISS-ALERTID-003 recorded reproduction; two tenants' operations plus shared files; untagged opt-in labelled; scheduled webinar not searched by default; +3 |
| M2 untagged searched by default | ISS-ALERTID-003 recorded reproduction; two tenants' operations plus shared files |
| M3 "tenant unknown" label removed | untagged sources are opt-in and labelled; resolves from three sources |
| M4 "for tenant" restored on a miss | a miss never claims a tenant scope; ISS-ALERTID-003 reproduction; no-match test |
| M5 source-inventory path removed | per-kind table |
| M6 operations-row path removed | per-kind table; job alerts end to end; two tenants; +4 |
| M7a/b/c realpath check removed (all; scheduled/ only; operations.json only) | ISS-ALERTID-005 junction test (each) |
| M8 job size cap removed | ISS-ALERTID-005 size-cap test |
| M9 NOT searched notice removed | ISS-ALERTID-003 reproduction; two tenants' operations plus shared files |

## Evidence
Toolchain: node from the codex runtime; `node --test --import tsx` in packages/meeting-bot.
- Unit tests (`alert-who-production.test.ts`, `alert-who-command.test.ts`, `alert-resolve.test.ts`): `tests 29 / pass 29 / fail 0` (4 + 18 + 7).
- Four existing alert files unchanged: alert-text.corpus 9/9, alert-text 15/15, alert-title-policy 12/12, attention-alerts 10/10.
- `tsc --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0, no output.
- `node scripts/lint-dirsize.mjs`: `lint-dirsize: OK (115 dir(s) within budget)`. Non-blank lines: alert-who-command.ts 200, alert-who-command.test.ts 301, alert-who-production.test.ts 137 (budgets 300 / 400 / 400).
- The tests print `PER-KIND TABLE` and `JOB ALERTS: 7/7 resolve (operations)`.
- Kept: terminal safety (8 hostile payloads, 6 lines), host-only join URL, read-only snapshot test, imported hash, collisions, malformed ids. No `qa/contracts/`, verdicts, enforcement paths or ledger statuses edited; `alertIdFor` untouched.
- Unverified: not run end to end against the real poller or a real operations.json; the test's `resolveTenant` honours `--tenant` as the existing harness does (the real `captureTenant` is covered by tsc only).

## Issues filed this cycle
ISS-ALERTID-006 (high: scheduler state files carry no tenant tag; writers schedule-state.ts:251 and :283; multi-tenant task), ISS-ALERTID-007 (medium: persist skipped alertable items; writer runScheduleTickOnce).

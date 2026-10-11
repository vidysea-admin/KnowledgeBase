# Manifest - r1-alert-id-resolver

**Status:** ready-for-check
**Fix cycle:** 0
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

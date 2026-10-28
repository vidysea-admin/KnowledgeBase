# iss-alertid-006-state-file-tenant-tag

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 2 (open HIGH ledger issue ISS-ALERTID-006, security class: tenancy). Full ceremony.
Lane: lane/alerttenant (base 031b0e2). Ledger for this lane: qa/issues.alerttenant.jsonl, ids ISS-ALERTTENANT-NNN (001-003 filed).
Package: packages/meeting-bot only. Not touched: alert text / redaction code (attention-alerts.ts, alert-text.ts, lane alertredact), qa/contracts, DECISIONS, ARCHITECTURE, CLAUDE.md, .claude, contracts/, scripts/.

## Scope
The scheduler's two shared-path state files now carry a tenant tag and every reader refuses (throws, fail closed) a file whose tag is missing or different, BEFORE using any content.
- `calendar/state-tenant-tag.ts` (new, pure): `requireStateTenant`, `assertTenantTag`, `StateTenantRefusal` (reason `invalid-tenant|untagged|other-tenant`). Tenant must match the host's tenant regex `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$`; no default tenant. The refusal message never names the OTHER tenant and never prints file contents.
- `calendar/schedule-state.ts`: `schedule-state.json` is now `{version:2, tenantId, entries}`; job files get a `tenantId` field. `readScheduleState / readScheduledKeys / recordScheduled / writeScheduledJob / readScheduledJob` take a REQUIRED trailing/second `tenantId`; there is no untagged path. Writers read (and so tenant-check) the existing file first, so a foreign or untagged file is never overwritten. `readScheduledJob` does not leak the tag in its return value. `__proto__` keys are skipped.
- `calendar/schedule-tick.ts`: new `ScheduleTickDeps.stateTenantId` (production: `LKB_TENANT_ID`). `runScheduleTickOnce` calls `requireStateTenant` first (dry run too): no/invalid tenant, or an untagged / other-tenant `schedule-state.json`, throws before anything is scheduled. An untagged / other-tenant job file at a job key is logged as a refusal and that one item is skipped (existing per-item skip path).
- `alert-who-command.ts`: both schedule sources are now read as tenant-tagged for the requested tenant (they moved into the tagged bucket, as ISS-ALERTID-006's fix_direction says). The `--include-untagged` flag, the `untagged` list and the "tenant unknown (shared schedule file)" label are REMOVED (the flag is now a usage error). The miss message no longer says "operations.json" only and still makes no "for tenant X" claim.
- `send-now-command.ts` `readLiveJobs`: a job file with a missing/different tag throws ("cannot tell"), same as its other unreadable cases.

## How existing untagged state files on disk are treated
REFUSED, never read, migrated or deleted. Per reader:
- tick: throws `StateTenantRefusal` with: "refusing schedule-state.json: it has no tenant tag (written by an older version; the directory is shared by every tenant on this machine), so it cannot be shown to belong to tenant 'X'. It was not read, changed or deleted. Review it and move it aside yourself; no automatic migration is done." An untagged `scheduled/<key>.json` makes that one item skip with the same message in the log.
- alert-who: `warning:` line with the same text for schedule-state.json; one aggregate line for N untagged job files; exit stays 0/1 by match, and the "not proof of absence" note is printed on a miss.
- send-now: throws (cannot tell), so it will not guess "no live jobs".
No real state file on this machine was read, changed or deleted (all tests use temp dirs; `raw/webinars` was never opened). Consequence for the operator: on a machine that already has `raw/webinars/schedule-state.json`, the next real tick will REFUSE until that file is reviewed and moved aside (ISS-ALERTTENANT-003). No migration tool was built on purpose: tagging a file asserts ownership nobody verified.

## ISS-ALERTID-002 (unsalted alert id): NOT DONE
`alertIdFor` lives in `calendar/alerts/attention-alerts.ts`, which is alert text code owned concurrently by lane alertredact (ISS-R1ALERTS-009), and the fix (HMAC with a per-tenant secret) changes every existing alert id: a contract matter for the checker and the Approver (ledger fix_direction says so). It is not in the same files as the tenant-tag change. Where the per-tenant secret would live (a tenant-tagged file next to these) is undecided; fail-closed choice: change nothing. Row left open.

## Evidence (packages/meeting-bot, node v24.19.0 off PATH, `node --test --import tsx <file>`)
Per file (final run, after all edits):
```
state-tenant-tag.test.ts (new)             tests 9  pass 9  fail 0   ISS-ALERTID-006: 45/45 reproductions refused or tagged as required
alert-who-command.test.ts                  tests 19 pass 19 fail 0
alert-who-production.test.ts               tests 4  pass 4  fail 0
send-now-command.test.ts                   tests 10 pass 10 fail 0
schedule-tick.test.ts                      tests 14 pass 14 fail 0
schedule-state.test.ts                     tests 18 pass 18 fail 0
join-rules-enforce.test.ts                 tests 18 pass 18 fail 0
join-rules-enforce-preconditions.test.ts   tests 12 pass 12 fail 0
join-rules-wiring/key-tenant.test.ts       tests 8  pass 8  fail 0
```
Total 112 tests, 0 failing. `tsc --noEmit -p tsconfig.json` (packages/meeting-bot): exit 0, no output.
D-015 count by issue id (the ledger's own recorded cases, run verbatim):
- ISS-ALERTID-006: 45/45. Recorded reproduction = the two writers store no tenant field and the shapes `ScheduledEntry {sessionKey,title,scheduledAt}` / `ScheduledJob {url,until,title,sessionId}` sit at one shared path. Run as: (a) both writers now emit `tenantId` (2); (b) those verbatim legacy shapes written by hand are refused by readScheduleState, readScheduledKeys, readScheduledJob, recordScheduled, writeScheduledJob, for tenants A and B (10), and left byte-identical on disk; (c) two-tenant test: B's tagged files refused for A by 5 library calls + send-now `readLiveJobs` (6), B's bytes unchanged and B still reads its own; (d) invalid tenant values refused by requireStateTenant/readScheduleState/recordScheduled (10 values); body shapes and tag forms (9 refused + 1 exact accepted = 10); a session key named "tenantId" cannot spoof the tag (1); tick refusals: other-tenant state, untagged state, untagged job file (3) and missing/invalid tenant (3). Total 2+10+6+10+10+1+6 = 45. Two-tenant tick: A and B on separate dirs each tick and write files tagged with their own id.
- ISS-ALERTID-003 (verified issue, its recorded reproduction re-run because the code it exercises changed): 1/1 refused. `alert-who-command.test.ts` "ISS-ALERTID-003 recorded reproduction, verbatim": untagged `scheduled/b.json {sessionId:'cal:tenantB',title:'TENANT-B Board Review'}` plus tenant B operations.json, `alert-who <id> --tenant A`: exit 1, no "TENANT-B"/"Board Review" in the output, no "for tenant". The same untagged file is also refused under `--tenant B`.
- ISS-ALERTID-002: 0 reproductions run, not in scope (see above). The recorded reproduction (offline brute force of the webinar key) stays OPEN: `alertIdFor` unchanged.
Mutations (harness `packages/meeting-bot/alerttenant-mutate.cjs`, written in this run, untracked, deleted before commit; per-mutation byte backup restored in `finally`; 240 s timeout per run; `restored: true` = `git hash-object` equals the pre-mutation blob AND bytes equal): 10/10 KILLED, 0 survived, all `restored: true`:
M1 readScheduleState skips tag check; M2 readScheduledJob skips tag check; M3 recordScheduled does not read first; M4 tick falls back to a default tenant; M5 alert-who job tag check removed; M6 alert-who state tag check removed; M7 send-now job tag check removed; M8 other-tenant comparison removed; M9 tenant regex made permissive; M10 tick writes the job file with another tenant's tag. Suite per mutation: state-tenant-tag, alert-who-command, send-now-command, schedule-tick tests.
Final blobs (git hash-object): schedule-state.ts 1a74e9182c4371a33c6f3d812ff9dd22994ce265; schedule-tick.ts 37aa3779919aaf5c0c0ad43c8e258dc46caad04f; alert-who-command.ts 9dd9da704c6d15170eedf5a368878fbc38248f3a; send-now-command.ts 8ce19d15a28800b5018ee8a83bd615a86a079461.

## Existing tests changed (and why)
Signatures gained the tenant argument; fixtures now write tagged files (`alert-who-command.test.ts` helpers `putJob/putState` tag, `putJobLegacy/putStateLegacy` write the old shapes). Tests of the removed opt-in flag/label were replaced by the tagged-state and legacy-refusal tests. `join-rules-*` tests pass `stateTenantId` independently of `joinRulesTenantId` so the T-037 tenant-unset cases still exercise the rules path. Behavior change to be aware of: a tick with `LKB_TENANT_ID` unset used to run (join-rules then marked items unevaluable under fail-open); it now throws before reading state.

## NOT covered
- `scripts/webinar/start-record-detached.ps1` still reads `scheduled/<jobKey>.json` and ignores the tag (ISS-ALERTTENANT-001, other package).
- The tick's tenant is `LKB_TENANT_ID`, not verified against the API key's tenant (ISS-ALERTTENANT-002; ISS-TENANTSIG-001 / ISS-WIREPRE-001 untouched and still open). Two tenants still share one directory; the second now refuses rather than mixes.
- The tag is not an authentication mechanism: a local writer can forge it. It stops accidental and cross-tenant reuse, not a hostile local user.
- Corrupt (unparseable) `schedule-state.json` is still read as `{}` as before (carries no data; next write replaces it).
- No end-to-end run of the real `lkb schedule-tick` / `lkb alert-who` (no real state, no Windows tasks; `defaultAlertWhoDeps` covered by tsc only). No real alert was sent.
- Not re-run: the full meeting-bot suite and the other packages (CPU shared); only the 9 files above.
- ISS-ALERTID-001, -004, -005, -008 untouched.

## Issues filed (qa/issues.alerttenant.jsonl)
ISS-ALERTTENANT-001 (medium, launcher ignores tag), ISS-ALERTTENANT-002 (medium, tick tenant unverified vs key; shared dir), ISS-ALERTTENANT-003 (low, operator must move legacy files aside). Existing ledger rows' statuses unchanged.

## Assumptions (taken fail-closed, for the checker/Approver)
1. Tenant of the tick = `LKB_TENANT_ID` (same source as join rules); absent = refuse, not "default tenant".
2. Format change of `schedule-state.json` (v2 wrapper) is acceptable; legacy files are refused rather than migrated.
3. ISS-ALERTID-002 deferred (contract matter + other lane's files).

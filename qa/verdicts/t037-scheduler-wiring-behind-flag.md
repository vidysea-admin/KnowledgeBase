# Verdict: t037-scheduler-wiring-behind-flag

VERDICT: PASS
Cycle checked: 0
Commit checked: 936f87a (lane/t037wire, from 8520fa8)
Scope: wiring present, DISABLED by default; enabling is the Approver's decision; not validated on a live schedule.
ISSUES-WRITTEN: ISS-T037WIRE-002 (medium), ISS-T037WIRE-003 (low note); ISS-T037WIRE-001 (maker's) confirmed, severity ruling below.

## EXPLANATION

### 1. Default parity (the safety of this merge) - holds
The PRE-change tick (`git show 8520fa8:.../schedule-tick.ts`, copied into a temp module in the worktree, deleted afterwards) was run against the merged tick on 500 seeded selections (dry and real runs, every-webinar on/off, calendar + candidates mixed) x 18 values (unset, "", "off", "OFF", "Off ", "true", "1", "yes", "enabled", "fail", "failclosed", "fail_closed", "FAIL-CLOSED", " fail-closed", "fail-closed ", "fail-open\n", 7, {a:1}) = 9,000 comparisons (82 scheduled and 1,241 skipped items in the baselines). Outputs deep-equal on: result (scheduled, skipped with reasons), log lines, scheduler calls, and every file written under the state dir (names and contents); `join-rules` directory never created. Separately a spy store (`io.load`) and spy evaluator were called 0 times for 11 non-enabling values with an opt-out file present. Env reads: `buildRealScheduleTickDeps` reads two new variables (`LKB_JOIN_RULES_ENFORCE` and `LKB_TENANT_ID`), not one as the manifest says; harmless (reads only). Existing schedule-tick fixtures pass.

### Unrecognised-value ruling
Strict exact matching is the SAFE direction: lenient parsing would let `true`/`1`/`yes` flip a value that changes what is recorded. But strict plus SILENT is a false-assurance trap. Checked: an unrecognised non-empty value (`Fail-Closed`, ` fail-closed`, `fail-open\n`, `true`...) produces ZERO log lines; opt-outs are not honoured and nothing says so. That violates the minimum rule: filed ISS-T037WIRE-002 (medium). It cannot hurt today because nothing sets a value, so it is a condition before enabling (list B), not a merge blocker. Fix direction: keep strict parse, add one loud line per tick for non-empty unrecognised values.

### 2. Enforcement per policy through the REAL tick (real store files, temp root)
fail-closed / fail-open: opt-out by id removed `opted-out` (both); opt-out by stored identity hint with the opted-out record absent removed (both); id-only opt-out with record absent still schedules g1 (expected, W7); deny rule removed `rule-denied`; no file = no rules, nothing removed, no warning; empty file, invalid JSON, valid JSON invalid schema (version 2), EISDIR (not-a-file): fail-closed skips all items `rules-unevaluable` with exactly ONE warning line (validation message, no path, no other tenant name; other lines are the ordinary skip descriptions), fail-open leaves selection unchanged with one warning; `locked` (retried, then): same unevaluable handling, never "no rules"; evaluator throws: fail-closed skips `rules-unevaluable`, fail-open puts back the item, one warning; missing tenant id: unevaluable per policy. `optedOutMeetings` handled via the real store.
**Promise evaluator:** the wired tick reads it as KEEP under both policies, silently (0 warnings), matching contract clause 4/W5. Under fail-closed that is semantically wrong (rules were not evaluated). Not reachable in production (evaluator injected only by tests; the real one is synchronous), so recorded as low ISS-T037WIRE-003, not a block.
**Loudness:** fail-closed with an invalid rule set silently stops ALL recording for that tenant, signalled by a log line (plus per-item skip lines). The tick has NO alert hook (no notify/alert/webhook code in schedule-tick.ts). Ruling: acceptable for merge (nothing enabled); the Approver must accept "log only" or require an alert before choosing fail-closed (list B).

### 3. Veto-only property (my own, 1,000 seeds x 2 enabling values = 2,000 cases, 735 removals)
Rule kinds: opt-outs by id, deny, garbage file, invalid schema, no file, empty rules; items already skipped; mixed every-webinar. scheduled(wired) is always a subsequence (same objects, same order) of scheduled(unwired); skipped = unwired skipped (deep-equal prefix, original reasons kept) + exactly one new entry per removed item, reason in {opted-out, rule-denied, rules-unevaluable}; no item skipped twice; at most one log line per tick for the whole-tenant case. No violation.

### 4. Tenant (W4) - ISS-T037WIRE-001
Reproduced through the real tick: tenant A's file opts out g1; with `LKB_TENANT_ID=ten-b` (no file) g1 IS scheduled under fail-closed, with `ten-a` it is removed. So a mismatch silently UN-honours an opt-out (and could equally apply B's denies to A's meetings). Nothing in the current tick learns the key's tenant: the production loaders (`createHttpCandidateLoader`, calendar loader without `native`) read no tenant. The opt-in `native` calendar acquisition validates a `tenantId` field in the response body, which shows the API can echo a tenant for that path; whether /meeting-candidates does is unverified. Severity: medium while OFF is right; at enablement it is HIGH (silent, security-class, defeats the exact promise being made). Ruling: NOT a merge blocker (off by default), a MUST-HOLD condition before an enabling value is set: the wiring should treat "cannot establish the two agree" as unevaluable (policy applies), or the Approver signs an operator procedure. Written into the contract.

### 5. Every-webinar / ISS-376
Untouched. The call happens after `selectAutoRecordItems`, with the same inputs; the parity run includes every-webinar on and off (70% on). With enforcement on, items without an explicit refusal come back unchanged (property test: skipped prefix unchanged, only refused items removed). ISS-376 not decided or measured.

### 6. Scope
schedule-tick.ts diff: +3 optional deps fields, 2 env reads, the call; no behaviour change outside the flagged branch (every changed line read). `.env.example`: one variable, empty, one-line description says empty/anything else = off; truthful. Grep of the repo for the variable: only .env.example, the two source files and the lane's qa files; no config/script/start command sets a value. No edit to store/lock files, apps/web, qa/contracts by the maker. D-119: schedule-tick.ts not reserved. `lint-dirsize`: only the unrelated `packages/index/src/pipeline: 34 files`; `packages/meeting-bot/src/calendar` = 28/30 (other lanes in flight could add files there). Line counts: schedule-tick.ts 308, join-rules-enforce.ts 112. `tsc --noEmit -p tsconfig.json` (meeting-bot): clean. Targeted tests (schedule-tick, auto-join, join-rules-enforce, join-rules-select, join-rules, send-now): 128 tests, 128 pass. `git merge-tree --write-tree` against codex/machine-migration-2026-10-09 (now f73eca0): clean, no conflicts.

### 7. D-015 through the real tick
ISS-T037VETO-002: 2/2 (g1 removed `opted-out`, calendar calX present, both policies). ISS-T037VETO-003: 2/2 (fail-closed: every scheduled item skipped `rules-unevaluable` with one validation-bearing log line; fail-open: selection unchanged, one warning). ISS-T037W1-001: hinted form 2/2 refused; id-only form 0/2 refused (g1 stays; stays OPEN, expected under W7).

### 8. Mutations (own harness, in-worktree, per-mutation byte backup, restore in finally, 200 s kill, hash-object == HEAD blob after each: all OK; harness and temp tests deleted)
14/14 killed: default flipped; `true` accepted; locked degrades to fail-open; missing file as invalid; missing file as deny-all; removed items re-added; reason overwritten on already-skipped; rules loaded for another tenant; log per item; store opened when off; fail-open acting closed on evaluator error; tick ignores setting; tick passes another tenant; fail-closed leaving items scheduled on unreadable rules. (Each killed by my matrix, default or property tests.)

## (A) Merge conditions
None outstanding. Default path is byte-for-byte unchanged (9,000 old-vs-new comparisons), nothing enables it. Housekeeping the maker should note (non-blocking): manifest says "one env read", it is two; dirsize margin 28/30.

## (B) Conditions that must hold BEFORE ANYONE SETS AN ENABLING VALUE
1. Approver's W3 ruling recorded in DECISIONS: fail-closed vs fail-open, explicitly accepting that fail-closed + bad rules file stops all recording for the tenant, and whether a log line is enough or an alert is required (tick has no alert hook).
2. ISS-T037WIRE-002 fixed: loud line for unrecognised non-empty value (strict parse kept).
3. Tenant agreement (ISS-T037WIRE-001): a check that the key's tenant equals `LKB_TENANT_ID` (mismatch/unknown = unevaluable) or a signed operator procedure; severity is HIGH at enablement.
4. W6 recurring/series ids decided (exact-id matching only today).
5. W7: gate (b) (opt-out client sends meetingUrl/sessionKey; ISS-T037OPT-002 / ISS-WEBHINTS-001) or the Approver's written acceptance of the id-only gap; ISS-T037W1-001 stays open until then.
6. The web flag `JOIN_RULES_ENFORCED` flipped in the SAME change so UI copy and scheduler agree.
7. A live tick observed with enforcement on (real calendar + candidates, real rules file for the right tenant), including a deliberate opt-out and a deliberately broken file in a non-production tenant.
8. ISS-376 (every-webinar skips sender trust) is independent and remains the Approver's.

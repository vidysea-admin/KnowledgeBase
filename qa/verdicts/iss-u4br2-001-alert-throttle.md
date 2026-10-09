# Independent verdict — iss-u4br2-001-alert-throttle

VERDICT: PASS
Cycle checked: 0
Scope: ISS-U4BR2-001 repeated-probe transport backstop; checker contract C1-C5. Candidate manifest was ready-for-check cycle 0 before and after verification. Maker alone closes the manifest. Scheduling, live Telegram delivery, production heartbeat writes, provider/database operations, and whole-release acceptance remain separate gates.

## Evidence and ledger floor

Independent Node check: **35/35 passed, 0 failed/cancelled/skipped**, exit 0, 4.7914267s wall time (Node reports 4541.9917ms). The 33 affected standing/new tests and two checker probes ran once, sequential test concurrency 1. Full UTF-8 output: `qa/evidence/iss-u4br2-001-checker-run.log`; exact argv, UTC start/end, wall duration and child exit: `qa/evidence/iss-u4br2-001-checker-run.json`. Both artifacts were read independently after execution.

Exact launcher: `C:\Program Files\Python312\python.exe qa/evidence/iss-u4br2-001-checker-run.py`. It invokes:

```powershell
& 'C:\Users\product\AppData\Local\OpenAI\Codex\runtimes\cua_node\3dd31cfff853001c\bin\node.exe' --test --test-concurrency=1 --test-timeout=15000 --import tsx packages/core/src/alerts/alert-sink.test.ts apps/api/src/routes/health-alert-sink.test.ts apps/api/src/routes/health.test.ts qa/evidence/iss-u4br2-001-checker.test.ts
```

Launcher bounds the child with subprocess timeout=60s, prepends that Node bin to PATH and removes only TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID from its copied test environment. It does not read or print credential values. **Launcher exit was 1 after completed Node exit 0**, because Python's cp1252 console could not print the checkmark in already-saved UTF-8 output. Printing was subsequently changed to ASCII backslash escaping; no candidate change or redundant test rerun. This distinction is disclosed rather than silently treating the launcher as successful. Completed child execution and all assertions are directly preserved in the JSON/log.

ISS-U4BR2-001: **3/3 recorded reproductions replayed/inspected, none omitted**:

1. Original verbatim detector setup: one stale drive row, expectedSourceTypes:['drive'], two invocations and a recording notify fake produce **2 calls**. Checker independent probe and actual consumer regression both reproduce it. This remains deliberately true: every probe reports current silence. Wired to actual sink it produces **1 transport send**, not 2. The issue's additional default-three-type evidence also replays: fake **6 calls**, actual sink **3 sends**, because absent gmail/calendar rows are stale. No silence counts are hidden.
2. Original sink inspection: now contains private lastAttemptAt Map, independent tuple encoding JSON.stringify([tenantId,sourceType]), default 60,000ms, injected now/throttleMs. Tests prove suppression at 59,999ms and resend at exactly 60,000ms, including changed heartbeat content, delimiter-containing tuple independence and custom interval.
3. Original sibling inspection: notify-channels.ts's DEFAULT_THROTTLE_MS=60_000, lastSentAt Map and strict-less-than throttled gate reserve attempt before channel invocation. New sink preserves the same attempt-based behavior. The recorded reproduction is a source inspection, not an invented behavioral attack count.

Independent additional probe keeps transport promises unresolved while invoking the real detector repeatedly for two configured tenants and default source types: **6 sends**, still 6 at 59,999ms, **12 at 60,000ms**. Both detector invocations retain {silent:6,unreadable:0}. Reservation therefore prevents pending transport storms and one tenant cannot suppress the other's alert. The fixture releases its pending promise afterward.

Frozen-contract gate independently executed: `C:\Program Files\Python312\python.exe contracts/verify_contracts.py`, exit 0, measured command stopwatch **0.7763177s**, output: `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. contracts/contracts.json has empty stages; this does not certify absent production data. Scoped `git diff --check -- packages/core/src/alerts/alert-sink.ts packages/core/src/alerts/alert-sink.test.ts` exited 0 (line-ending warnings only); individual duration unknown, batched read/hash/check tool duration 2.5347225s.

## Source review and security

Read complete changed sink logic, complete affected tests/new consumer, actual detectSilentWatchers/createHealthRouter, and production.ts factory excerpt. Production constructs the sink once outside its delegate, retaining throttle state across probes. All new imports remain within existing dependency boundaries; no core workspace dependency was added. Public health remains aggregate-only, uses config-derived tenants and tenant-scoped injected reads, and preserves unreadable/read-failure behavior. Existing health privacy and failure tests passed.

Transport request, credential selection, message wording, timeout and token redaction remain unchanged. Missing credentials return before clock/state/transport. Failed/pending transport attempts remain throttled. Source review caught direct send(...).catch failing to contain a synchronous injected transport throw; maker changed it to Promise.resolve().then(send).catch before final submission. Independent standing test verifies void return, no throw, one attempted send despite repeated calls and redacted error text. No actual Telegram/provider/database call, no browser, no product mutation or broad suite.

Attributed maker evidence reused only for typechecks: final core tsc exit 0 /7.5327861s; API tsc exit 0 /48.3961727s before final sync containment/additive assertions, with unchanged public signatures and unchanged API production code. These are attributed manifest claims, not independently re-run commands. Behavioral evidence above is independent.

Checked final SHA256 before run at 10:42:01 and after run at 10:42:50 UTC:

| Path | SHA256 |
|---|---|
| packages/core/src/alerts/alert-sink.ts | 34A31FBF878654F3A49F3B16DE45A437F02FFCAE2CFF18A0D01005D8F880772B |
| packages/core/src/alerts/alert-sink.test.ts | 721C3B583F20B599E92D5458166F22054AF610DD2881E62B7DDBD87D799B7C8E |
| apps/api/src/routes/health-alert-sink.test.ts | 7DEC08D21B22FC129EFCE32C10DD2A2E3E5D54C230B55F23606B11E95AB59BEB |

## Measured phases and limitations

- First skill-read tool preceded recorded launch; precise dispatch/first-read time unknown. Recorded checker launch anchor: **2026-10-09 10:38:07 UTC**. Scope/source review began at that anchor; initial review and contract/probe preparation through approximately 10:40:21. No continuous per-phase stopwatch; exact active-review duration unknown.
- Candidate packet awaited while maker finalized necessary synchronous-failure correction and final evidence. READY message arrived before clock observation **10:42:01 UTC** (exact message receipt unknown); manifest/hash/packet scope validation began at that observation. Thus recorded launch-to-ready was **at most 234s**, including necessary scope reads/probe creation/packet waiting; not pure idle wait.
- Escalated test approval requested between 10:42:01 and child start; exact approval resolution timestamp unavailable. No rejection. Child started **10:42:33.260410 UTC**, ended **10:42:38.051565 UTC**, elapsed **4.7914267s**. Final output/hash/manifest recheck confirmed by **10:42:50 UTC**.
- Verdict drafting began after 10:42:50; harness print-only correction confirmed at 10:43:08. Persist completion confirmation is recorded below. Review and commands overlapped; unmeasured intervals are not attributed by subtraction.

The 120–180s launch-to-verdict target was exceeded. Required standing failure-boundary correction, readiness provenance and exact issue reproduction took priority. This is not evidence of routine fully optimized timing, and timing did not determine PASS.

ISSUES-WRITTEN: none
EXPLANATION: Complete scoped acceptance; issue-free check is creditable. One historical PASS on the alert-sink seam before this unit was below the non-security round cap. Unrelated owners' API/indexing/.env/TOC WIP was preserved. Ledger closure may reference this PASS; this checker did not flip the maker manifest or push.

Persisted verdict confirmed: 2026-10-09T10:44:39.8408147+00:00. Recorded launch-anchor-to-confirmation elapsed: 392.841s; ready-observation-to-confirmation elapsed: 158.841s. Exact pre-anchor launch and READY-receipt instants remain unknown.

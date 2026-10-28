# Focused checker packet — iss-u4br2-001-alert-throttle, cycle 0
Repo/cwd: C:/Users/product/Desktop/KnowledgeBase. Manifest: qa/manifests/iss-u4br2-001-alert-throttle.md. Verdict: qa/verdicts/iss-u4br2-001-alert-throttle.md. Contract: qa/contracts/iss-u4br2-001-alert-throttle.md C1-C5. Ledger: qa/issues.u4br2.jsonl:1, all three reproductions. Base commit3498a3f16401981545ce80ddd0a612457acc4bac.

| Changed path | Original git blob | Final SHA256 |
|---|---|---|
| packages/core/src/alerts/alert-sink.ts | 7fef43fd510b891a4c9d44c1e2e4e218b6c9fee9 | 34A31FBF878654F3A49F3B16DE45A437F02FFCAE2CFF18A0D01005D8F880772B |
| packages/core/src/alerts/alert-sink.test.ts | e8235ec7979729c512ec822df6087b914a63af0d | 721C3B583F20B599E92D5458166F22054AF610DD2881E62B7DDBD87D799B7C8E |
| apps/api/src/routes/health-alert-sink.test.ts | no base, untracked new file | 7DEC08D21B22FC129EFCE32C10DD2A2E3E5D54C230B55F23606B11E95AB59BEB |

Actual full tracked patch: git diff -- packages/core/src/alerts/alert-sink.ts packages/core/src/alerts/alert-sink.test.ts. New consumer logic: read complete apps/api/src/routes/health-alert-sink.test.ts (39lines). No other candidate source paths.

## Change/caller map
Sink deps now add throttleMs/now; DEFAULT_THROTTLE_MS=60_000. createTelegramAlertSink constructs one private Map per sink. notifyWatchSilent first preserves missing-credential early return, then computes JSON.stringify([tenantId,sourceType]); same tuple with time-lastAttempt<throttleMs returns. Timestamp reserved before transport. Existing text unchanged; Promise.resolve().then(()=>send(token,chatId,text)).catch retains redacted failures while also containing synchronous transport throws. Sink still returns void.

Immediate consumer: apps/api/src/routes/health.ts detectSilentWatchers lines150-175 iterates config tenantIds, tenant-scoped injected listHeartbeats, computes every expected stale source, increments count BEFORE notify; errors isolated. createHealthRouter lines185-199 returns counts only. No edits. Production composition apps/api/src/production.ts:69 creates alertSink ONCE outside notifyWatchSilent delegate at74-75, so throttling survives repeated probes. This source is unchanged. Sibling packages/meeting-bot/src/capture/notify-channels.ts:60-85 has60kdefault, private lastSentAt and identical attempt reservation/strict-less-than boundary. No cross-package core import added.

Security: credential handling adjacency (existing Telegram token redaction), private operator notification using tenant/source config. No auth/API boundary or data-write logic changed. Tuple encoding prevents delimiter collisions; tests preserve independent tenant and source counts. All transport functions and heartbeat reads fake; no secrets, credentials, provider/network/database calls. Public privacy checks inherited health.test.ts remain covered. No notification authorization implied.

## Ledger floor and tests
1. Exact recorded detector reproduction: expectedSourceTypes:['drive'], one stale row, recording notify fake twice=>2calls retained; consumer first verifies this, then actual sink=>1send. Default3sources, only stale drive row=>fake6calls/actual3sends. Tests assert every probe still returns silent1/3 and unreadable0; at59999no additional sends,60000additional1/3.
2. Sink inspection now proves attempt Map/tuple key/throttleMs+now/default60000. Existing unit tests check firstsend at t0, changed heartbeat cannot bypass, exact boundary, distinct keys including colon-containing pairs, failed sends stay suppressed, custom500ms interval, synchronousthrow contained/redacted.
3. Sibling inspection proves attempt reservation before transport/default60000/strictboundary. No sibling source edits. Additional asynchronous pending-send probes are checker-owned if needed, not substitutes for ledger floor.

## Exact reproducible commands
Node executable: C:/Users/product/AppData/Local/OpenAI/Codex/runtimes/cua_node/3dd31cfff853001c/bin/node.exe, v24.21.0. Prepend its bin to PATH per command for child tests. Repository dependencies already present. tsx/Node child test execution requires known approved sandbox escalation on this Windows host; direct tsc and Python need no escalation. No predictable failing sandbox attempt is prescribed.

```powershell
$env:PATH='C:\Users\product\AppData\Local\OpenAI\Codex\runtimes\cua_node\3dd31cfff853001c\bin;'+$env:PATH
& 'C:\Users\product\AppData\Local\OpenAI\Codex\runtimes\cua_node\3dd31cfff853001c\bin\node.exe' --test --test-concurrency=1 --import tsx packages/core/src/alerts/alert-sink.test.ts apps/api/src/routes/health-alert-sink.test.ts apps/api/src/routes/health.test.ts
& 'C:\Users\product\AppData\Local\OpenAI\Codex\runtimes\cua_node\3dd31cfff853001c\bin\node.exe' node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json
& 'C:\Users\product\AppData\Local\OpenAI\Codex\runtimes\cua_node\3dd31cfff853001c\bin\node.exe' node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json
& 'C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' contracts/verify_contracts.py
git diff --check -- packages/core/src/alerts/alert-sink.ts packages/core/src/alerts/alert-sink.test.ts
```

Maker evidence commands/counts/timing in manifest. Final source freeze now. Preserve other owners' ai provider/API/.env/TOC changes. Checker scope is this issue+C1-C5, affected tests/consumer, relevant security. No fullrepo tests, broad audits, expensive browsers, actual notifications, production operations or acceptance upgrades. No mutation needed; if chosen, timeout/bytebackup trap/cmp requirements remain mandatory. MissingCredentials test inherits process.env if injection undefined; maker environment has no Telegram vars, checker can explicitly clear those names temporarily without reading or reporting values.

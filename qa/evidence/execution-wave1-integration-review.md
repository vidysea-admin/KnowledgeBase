# Integration checker working notes — cycle 0

Not a verdict. Manifest remained BLOCKED at review time. Exact 13-file hash packet matched independently at first review. Maker later corrected the failed-save fixture's recursive directory creation and repinned before submission; final hashes must be rechecked.

- Measured checker launch: 2026-10-14 08:50:28 UTC (skill read immediately beforehand; its exact timestamp was not measured).
- Scope/packet began after integrator message supplied paths. Individual read phase timestamps were not measured; no estimated durations are attributed to these gaps.
- Reviewed changed diff, complete new scheduler integration fixture/type, complete SearchPage/SemanticResults, API answer-policy route, bot-event projection/UI consumer, App routes/auth placement, schedule-tick enforcement caller, tick-wiring real construction and alert/feed downstream excerpts, relevant T037 clauses 6–7, T055 C1/C7/C8/C9 and existing app-shell/auth criteria.
- `/knowledge` and `/answer-policy` remain nested in the actual AuthProvider/LoginGate/AppShell. API simulation mounts after requireAuth/rate-limiter/usage middleware and reuses existing `deps.ask`.
- SearchPage passes normalized URL query to SemanticResults, with no automatic semantic request. The semantic child keys itself on API key plus submitted query and discards late results after unmount.
- Scheduler forwards its one captured tick instant, dryRun readOnly flag and optional trusted callbacks. Default `off` still skips rule store access. New unit tests exercise no-meeting degradation, injected fallback time, snapshot-save recovery and failed-save nonrecovery.
- Real `buildAutojoinTickDeps` callbacks share trusted state directory and configured tenant; actual degraded alert writer enforces matching supplied tenant and writes a bounded dashboard feed with channels controlled by config. The feed reader scopes by tenant; API fixed projection drops tenant/unknown fields; UI uses plain text and `role=alert` for rules-degraded.
- Generated WhatsappCandidates reflects schema required/evidence/status fields and is exposed through core barrel. Runtime schema validation remains the authority for conditional approval/attachment invariants; this generated TypeScript shape does not encode all JSON Schema conditionals.
- No independently proven acceptance defect at this point. External delivery, production enabling, real Mongo/capture, entire roadmap tasks and each child maker's full acceptance remain outside this integration check.

Independent behavioral probe prepared: `qa/evidence/execution-wave1-integration-independent.mjs`. It creates only temporary isolated state and disables all external channels; checks actual tick/build sink/feed/API chain, no-write dryrun, off-store bypass, cross-tenant refusal and real recovery state.

Independent API typecheck command: `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json` wrapped in PowerShell Start-Process/WaitForExit(120000), killed on timeout. Start 2026-10-14T08:58:14.4432854Z, end 08:58:21.0340287Z, elapsed 6.5909396s, exit 2, no timeout. Seven diagnostics: gws-calendar.ts lines 80/196 overload/acquisition incompatibility and youtube-calendar.test.ts lines 55/56/58/59 unknown values. No integration-owned path diagnostic. Output: execution-wave1-integration-api-typecheck.stdout.txt, stderr file empty. Required affected-package typecheck gate remains red pending owner repair; absence of diagnostics in one scope is not package PASS.

Focused Node, web behavioral checks/build, typecheck repairs, gen drift check and contracts validator remain pending resource coordinator slots. Existing esbuild spawn EPERM restrictions have not been retried. No mutation test or product file change by this checker.

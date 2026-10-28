# T-051 operational release acceptance

Source: TASKS.md T-051, docs/webinar-release.md, existing accepted setup/recovery foundations, and the user-authorized remaining-task goal. This contract preserves the difference between a checked installer foundation and a completed operational release. No smaller unit PASS closes T-051.

## C1 — Ubuntu installer foundation (scoped unit)

- Preview is the default and creates/enables/starts nothing. Explicit install writes only a new private current-user unit; existing/unknown units or enablement state are refused. Installation stays disabled and does not start the runner.
- Separate explicit activation reloads, enables/starts and checks the exact verified unit. Non-root Linux identity, trusted systemctl, actual local graphical-session DISPLAY, fixed runner and physical user-owned path boundaries are verified before service mutation. Linked, wrong-owner/type, unexpected unit content and unknown service state fail closed.
- Installation/activation preserve the shared runner's work-database, connected-tenant and OS-specific live-proof requirements; no production opt-in is inferred from installation. Errors are reported without pretending the service is healthy; reinstall/activation cannot silently replace another service or bypass readiness.
- Focused injected/filesystem tests exercise preview, disabled install, activation success/failure and adversarial path/identity/unit/state boundaries. The immediate setup/runner consumer accepts the generated unit. Required frozen-contract validation remains recorded. Tests and source review can PASS this foundation only; actual Ubuntu activation and capture remain separate live evidence.

## C2 — Complete Windows webinar-to-Ask release

- Actual supported webinar capture runs for the required sustained session duration with usable audio/video, playable final media, bounded timestamp coverage, owned cleanup and explicit coverage-gap reporting. Synthetic AV or URL-recognition evidence alone is insufficient.
- Real provider-bound transcript/diarization and approved evidence/notes output validate against the accepted canonical schema and enter an explicitly authorized database/tenant. Provider fixture tests or incomplete knowledge rejected by strict indexing do not prove completion. Missing schema/provider approval is a named HUMAN_GATE.
- Immediate indexing consumes that session without errors; authenticated Ask retrieves its knowledge and returns citations that resolve to the same source, speakers/timestamps and playable evidence. Record actual sample/query, output, database/tenant identity and citation resolution. Preserve auth/tenant privacy; cross-tenant reads and unintended data writes are refused.

## C3 — Actual supervision and recovery on both operating systems

- Separately authorized current-user installation and activation are demonstrated on the real Windows target and a real Ubuntu graphical-session target. Preview XML/unit and simulated systemctl results are foundation evidence only.
- Actual interruption, supervised restart/reconnection and host/session restart recover the intended owned runner/session state without duplicate jobs, leaked processes, stale generation controls or silent media loss. Final persisted operations, playable media and downstream indexing/Ask evidence demonstrate consumption after recovery; explicit cancellation/deletion retains existing stop/cleanup behavior.
- Connected-tenant/operator health, alerts and recovery behavior are verified with real service/process state. An active service or container health status alone does not demonstrate useful capture/recovery.

## C4 — Seven-day unattended observation and portability

- Record seven actual elapsed days of unattended operation with timestamped host/OS identity, scheduled runs, heartbeats, failures/retries, observed recovery, media/transcript/index/Ask outcomes and operator interventions. Shortened, backdated, synthetic or proposed observation is not accepted.
- Windows operational release and separately verified Ubuntu portability each retain their own truthful actual evidence. Missing target hardware/session access, connected provider/database authorization or elapsed observation is an explicit remaining gate, never silently waived by foundation PASS.

## C5 — Checker provenance and closure

- A current-cycle maker packet specifies scope, exact changed paths/dependency consumers, hashes and attributed commands/results. Independent checker rechecks final bytes and directly reviews runtime/security boundaries; required checks need exact command/output, time bounds and restoration/cleanup.
- Scoped verdicts explicitly identify foundation acceptance and remaining C2-C4 gates. Full goal-t051 PASS requires complete actual C1-C4 evidence and approval boundaries, not just selected tests. Missing live/observation prerequisites yields HOLD for full-task acceptance; a proven violation yields FAIL. Only a matching-cycle full-task PASS authorizes T-051 to become done.

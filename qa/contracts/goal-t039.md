# Full-task contract — T-039: Send bot now (CLI/API/web)

Checker-owned ground truth. Maker must not edit this file. Priority tier: 3
(authorized roadmap completion, D-170). This is the full parent task, not a
planner, command, route, form, durable-state or process-polling foundation.

## Sources and scope

- Current human acceptance source:
  `C:/Users/product/.codex/attachments/db7dce52-5317-4ddc-acf6-e3965405c3ab/pasted-text-1.txt`.
  It includes T-039 in capture/transcription and requires full acceptance before
  task closure, actual output verification, and downstream consumption.
- `.goal/goal.json` T-039 and `TASKS.md` identify CLI/API/web Send bot now.
- `docs/meeting-bot-roadmap.md` T-039 supplies the concrete exit criterion:
  **bot joins a running meeting within 60 seconds**.
- AGENTS.md supplies maker/checker, tenant/security, sample/downstream and
  frozen-validator evidence requirements. D-126 records the approved dedicated
  `send-now` API scope. D-170 retains real-host/live/Windows/Ubuntu gates.
- Historical reconciliation only:
  `C:/Users/product/.codex/attachments/5b9890de-27a1-4700-9e7e-7f04f6050b5c/goal-objective.md`.
  Existing slice contracts/verdicts remain historical scoped evidence; this file
  neither rewrites them nor treats their PASS as full-parent completion.

## Required acceptance

1. **Shipped entrypoints and actual execution.** The supported CLI command,
   authenticated API endpoint and mounted web action accept a valid running-
   meeting URL and route to the actual recorder/join implementation. The web
   action uses the owning API key and consumes the real API response. Exported
   adapters, mocked recorder invocation and an unmounted page are insufficient.
   Record the precise supported host startup/configuration and platform/backend.
   Unsupported or unavailable execution is visible and never reported as joined.

2. **Observed admission within 60 seconds.** On an authorized real running
   meeting, capture the request/submission time and independent evidence of actual
   meeting admission, with an elapsed interval at most 60 seconds. A detached
   process, accepted HTTP 202, recorder lock, live PID, launching/running status or
   allocated job id is not admission. Evidence ties the request, job/session,
   meeting and checked candidate together; secrets/passcodes remain redacted.
   Identify which actual entrypoint was measured and independently establish the
   other shipped entrypoints use that same checked execution path.

3. **Authenticated, tenant-bound host.** The released host actually injects the
   send-now adapter rather than its unavailable stub. POST and any status/list/
   detail/cancel routes require the approved dedicated `send-now` scope and derive
   tenant from authentication. Client body/query/header tenant substitution,
   another tenant's job, traversal, missing auth and read-only calendar scope
   cannot launch, disclose or control a recording. A single-capture-tenant host
   refuses other tenants; topology/host selection must be explicit in evidence.

4. **Input and credential boundaries.** Existing approved meeting-URL safety and
   valid recording-window constraints apply at the real launcher seam. Invalid
   URLs/credentials/unsupported links cannot become shell code or arbitrary local
   paths. Commands use safe argv/control channels. API/UI/status/errors/evidence
   do not expose API keys, personal join secrets, passcodes or raw internal paths.
   Logs and any persistent metadata have an explicit safe disclosure boundary.

5. **Duplicate, concurrency and restart behavior.** Equivalent meeting links
   have a stable tenant-bound duplicate identity. Manual CLI, API/web, scheduler
   and poller launches consult the authoritative active-recording state. Two
   concurrent requests cannot create two admitted/recording bots for one meeting;
   distinct meetings are not falsely blocked. Restart cannot silently erase active
   ownership or permit a duplicate. Unreadable/corrupt/foreign state does not mean
   no active jobs. Independently check the actual process/claim boundary, including
   startup failure, stale state and completion/release.

6. **Honest status and UI lifecycle.** The mounted web consumer distinguishes
   launch acceptance, recorder process liveness and independently observed meeting
   admission. Unknown admission remains unknown. Failed/absent/unreadable status
   cannot claim success, and process exit cannot invent finished-versus-failed
   evidence. Polling is bounded and sequential; key/job replacement, submission
   races and unmount suppress obsolete responses and owned timers. Existing auth
   invalidation behavior remains intact.

7. **Exposed control safety.** If durable list/detail/cancel controls are added,
   test their authenticated ownership and actual consumer. Requested cancellation,
   recorder acknowledgement and terminal cancellation are distinct durable states;
   request alone cannot claim the recording stopped. Repeated requests are safe,
   crash/restart behavior is honest, and cancellation cannot target an arbitrary
   PID or another recorder. This is conditional safety for an exposed feature,
   not a new original T-039 cancellation requirement.

8. **Immediate downstream consumption.** The admitted bot produces an actual
   usable sample capture through the supported recorder/backend, and the immediate
   existing downstream stage consumes its output without error. Name the stage,
   command, sample, resulting paths and observed output; verify signal/media rather
   than merely file existence. Do not infer complete transcription/indexing/Ask
   acceptance belonging to other roadmap tasks from this sample.

9. **Independent reproducible evidence and closure.** Supply a ready-for-check
   manifest/packet with Fix cycle, changed files/final hashes, dependency/caller
   map, exact commands/results/durations and explicit omissions. Independent
   checker verifies the actual candidate, affected stage and downstream consumer,
   relevant security/write boundaries and `contracts/verify_contracts.py`.
   Filed issue fixes replay their own recorded reproductions verbatim, with counts
   by issue id and named unreplayed cases. Live/host evidence records the actual
   environment and authorization; Windows and Ubuntu evidence remain separately
   identified, and proof on one cannot certify the other. Mutation runs obey the
   timeout/backup/trap/byte-restore rules. No test CPU or live action is implied by
   this contract; orchestration leases and existing approval boundaries apply.

## Verdict boundary

Full T-039 PASS requires all applicable criteria, especially actual host mounting,
observed admission within 60 seconds, security and downstream capture evidence.
A scoped foundation may receive its own independent verdict without satisfying
this parent contract. Missing live/host prerequisites produce parent HOLD; a
reproduced acceptance violation produces FAIL. Trackers may close T-039 only after
matching full-parent independent PASS, never from new exports or slice test counts.

# T-038 canonical scheduler service

`scripts/webinar/run-pipeline.mjs --run --watch` owns one durable pipeline lane for its lifetime. It refreshes discovery every five minutes, while independent tab children capture and process earlier sessions. Active captures additionally refresh at the existing 30-second cancellation-monitor cadence. Refresh, source reconciliation and registration execution share one serialized queue.

The default preview stays read-only. A live single tick without `--watch` retains the previous one-capture overlap selection. No per-meeting Windows Scheduled Task is created by the canonical service.

## Activation prerequisites

The factory must supply actual `captureSlots` and `validateCaptureSlots(slots)` evidence. Two to eight distinct fixed slots are required; each is a tenant-owned physical workspace from T-034. Sign in using the same trusted tenant and `--capture-slot` identifier. A directory, preference file, environment flag or synthetic test is not proof of signed-in or usable capture readiness.

`captureSlotSupports(slot,item)` admits only accepted observations matching the actual meeting platform derived from `item.meetingUrl`. `validateCaptureSlot(slot,item)` revalidates that exact receipt immediately before capture. Unsupported coverage remains queued as `capture-slot-unavailable`; matching occupied slots produce `capacity-full`. `refreshSchedulerPolicy()` must reload persisted controls/topic/capabilities and return exactly true to admit discovery, registration or new captures. A disabled policy pauses admissions while existing owned work drains.

`createSchedulerRuntime(ROOT,env,log,verifiedTenant)` supplies these real callbacks. Set `LKB_CAPTURE_SLOTS` to a comma-separated pool and use local absolute profile/record roots (defaults are `data/bot-profile` and `raw/webinars`). It consumes T-034's private reviewed authority at `data/bot-profile/.capture-readiness-authority`, issued only by an authenticated operator review. Genuine browser observations and matching host/tenant/slot/platform/physical paths are required; missing, synthetic, revoked or failure-invalidated evidence refuses capability. No acceptance has been issued by this maker. The central API-tenant callback must clear authority when verification fails.

The factory now imports this runtime and resets its independently verified tenant before each HTTP owner check. The actual child control now supplies sealed privacy/status IPC methods. Active ownership verification failure requests cancellation through the already-owned control, records its exact generation and leaves coverage requiring attention. Ordinary feed failure retains the previously authorized active capture while rules continue to be monitored.

Automatic service also requires a verified API/configured tenant, the existing host-specific live audio/video proof, an isolated work database, explicit `last-valid` or `fail-closed` join-rule enforcement, and enabled discovery, automatic joining, career priority and test-data routing with a loaded topic classifier. Missing factory wiring or evidence refuses activation. Existing Google source, profile, registration and production-write boundaries remain in force.

## Dispatch and durable outcomes

Each slot remains reserved until its complete owned child/downstream task finishes. Career guidance receives available capacity first; remaining candidates use start time and canonical identity for deterministic ordering. Capacity overflow is saved as queued with `capacity-full`, then reconsidered on later cycles. Expired queued coverage becomes `action_required`, never a false successful recording.

Rules run on every cycle, including empty selections, immediately before a capture, and during active capture monitoring. Initial denied or unevaluable operations with no capture attempt can recover after an approved policy change. A partially captured stopped session retains its coverage outcome. Tags are written and read back before service launch so other webinars remain staged test data.

Operations are persisted before a child launches. Duplicate controllers are refused by the existing token-owned lock protocol; every state write checks ownership. Lock release removes only this controller's lock. A legacy plain-PID `poller.lock` remains an inspection/migration gate rather than being automatically deleted.

Restart recovery consumes a confined recording artifact with bounded attempts. Readiness requires the matching tenant/session/generation/index proof, not a child exit. With `LKB_PIPELINE_GRAPH=1`, fresh capture uses the graph callback and persists its source fingerprint for recovery; old incompatible graph checkpoints require explicit repair rather than silent replacement.

An autonomous partial recovery also requires its previously persisted configured capture slot. Legacy partial rows from the default workspace become `action_required/capture-slot-unavailable` for explicit owned migration or legacy-lane recovery; the parallel service does not finalize them in an unrelated slot or default workspace. Graph recovery requires durable graph acknowledgement as well as its actual index proof.

SIGINT/SIGTERM stops new discovery and drains owned captures and downstream work before releasing the lane. Abrupt controller death uses the existing private IPC disconnect boundary and durable coverage/recovery state. No broad process kill is introduced.

Shutdown is checked after asynchronous acquisition, registration, rules, preparation and ownership checks and immediately before child admission. Work stopped before launch remains queued without consuming a capture attempt.

When an explicit absolute `LKB_CAPTURE_CONTROL_DIR` is configured, the factory must publish the actual tenant/session/generation recording controller through T-011's authenticated private bridge. Publication challenges the actual child privacy listener; stdout and process identifiers do not establish capability. The scheduler retains pending publication, then awaits revocation after child exit even when publication completes late. Failed configured publication stops the owned controller and persists `action_required/privacy-controller-unavailable`, preventing marker recovery from creating a ready outcome. Missing configuration leaves cross-process privacy unavailable. Tokens and private locators never enter public operation output.

Canonical artifact-start, terminal, stopped, deferred and discovery transitions feed the configured email/dashboard sink directly; they use durable `operations.json`, not legacy scheduled-job files. Before enqueue, each owned operation/feed retains up to eight bounded pending snapshots. The producer has at most 50 queued events and visits at most 25 owned rows per cycle. Overflow is reported; pending snapshots survive status changes/restarts and replay independently of the recent-row lookback. Acquisition carries the discovery outbox before its first save. Failed/rate-limited/unavailable channel results retain pending snapshots; successful handoff still does not prove actual delivery. `flushSchedulerAlerts()` uses the existing bounded durable channel retries/digest. All lifecycle/rules/flush sink writes share one queue and current controls. The sink and API/UI now include `coverage-deferred` and `discovery-recovered` under the ordinary ceiling and `discovery-degraded` under the existing failure ceiling/hourly digest. No delivery is claimed without actual receipt and dashboard evidence.

## Acceptance still required

Focused fixture tests establish scheduling behavior only. Full T-038 requires real concurrent usable media, immediate downstream consumption, delivered authorized email and visible dashboard alerts, an actual interruption/restart, independently verified Windows and Ubuntu supervision, and seven actual elapsed unattended days. See checker-owned `qa/contracts/goal-t038.md`; none of those gates is replaced by this implementation or fixture evidence.

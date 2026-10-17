# T-039 durable manual send-now jobs

**Handshake status:** in_progress
Status: in_progress
Fix cycle: 1
Tier: 3 — authorized roadmap implementation under D-170.
Maker: /root/docker_docs_review. Checker: /root/docker_dependency_review/checker_t039.

## Authorized unit

Add durable per-tenant manual-job dispatch, history, process status and idempotent cancellation through the existing approved send-now scope. A detached owner worker retains the existing authenticated recorder IPC. API restart does not erase requests, cancel intent or progress. Unknown worker heartbeat stays unknown and continues duplicate blocking. Cancellation request, recorder ACK and terminal recorder exit remain separate.

Security/write class: full maker/checker ceremony. New source writes and new cancellation behavior, not another capped nonsecurity polish round. No filed issue repair claimed; existing ledger cases are not substituted or closed.

## Ground truth and scope

- `qa/contracts/goal-t039.md` criteria 3–7 apply to this conditional durable-control foundation; criteria 1–2, 8–9 remain required for whole T-039.
- `qa/contracts/t039-send-now-status-polling.md` remains unchanged. Existing process GET continues to emit only launching/running/not-running and joined unknown.
- Packet: `qa/packets/t039-manual-send-now-jobs.md`.
- Source base inspected: `ed542fd01c870e5d5b64e1d72b413062d595f675`; untracked added files had no base. Shared integration is owned by /root/docker_runtime.

## Evidence

The CPU broker /root/docker_checker executed the declared four-file Node batch on the pinned candidate: exit 0, 16/16 PASS, 0 skipped/cancelled; 14975.6696 ms TAP and 15066.9095 ms wall. UTC 2026-10-14T19:53:09.943Z → 19:53:25.014Z. Immutable receipt: `qa/evidence/goal-t051checker-broker-t039.json`, matching stdout/stderr paths, exact runtime/argv and before/after SHA256 for all 13 candidate files. Receipt reports hashesUnchanged true. This is broker-attributed affected-stage/immediate API/CLI fixture evidence, not a maker process run or independent full-task PASS.

Later legacy API, mounted web, typecheck and frozen-validator checks remain pending fresh CPU authorization. No browser/provider/production/live capture was performed. The root-directed T011 private-controller hook is implemented as cycle 1 below; the cycle-0 receipt remains historical evidence only.

## Cycle 1: actual private-controller ownership hook

Root-directed T011 integration changes `manual-jobs/worker.ts` and its test: when a real recorder handle and setup signal exist, initiate the single T011 `publishCapturePrivacyController` helper. The setup stdout line is only a trigger; helper readiness requires authenticated actual child privacy-status challenge/ACK. Default publication requires explicit absolute `LKB_CAPTURE_CONTROL_DIR`; absence claims no operational private controls. Private tenant/session/generation/endpoint/capability descriptor remains exclusively helper-owned and never enters public job metadata. Retain publication promise and await its disposer after actual recorder exit, including late publication. Configured publication failure requests the owned recorder stop and reports failed; a readiness failure caused by acknowledged operator cancellation does not misclassify that terminal cancellation. Four new lifecycle regressions are authored but not executed.

The immutable 16-test broker receipt belongs to cycle 0 and does not certify this new hook. T011 owns helper/client/transport and reusable real IPC fixture; `scripts/webinar/manual-jobs/worker-privacy.test.ts` now verifies worker→actual helper→sealed child IPC→fresh/restarted API connector→on-disk private receipt before ACK→actual exit→descriptor revocation. Managed host planner refusals additionally redact prior base reader paths/tokens, with its own regression. The fresh five-file Node batch is expected 22 tests, queued after T011 helper/receiver freeze and observed actual launcher private-method integration. Root runtime still owns shared CLI/supported API-host integration. Await fresh scoped regression and immediate consumer checks before ready-for-check.

The selected native host and shared CLI now consume the managed factory/HTTP command. A final owned integration fix replaces legacy ten-minute recent-launch memory only when the adapter explicitly provides atomic persistent dispatch ownership: in-flight/persisted active ownership still denies duplicates, but an acknowledged terminal cancellation can be immediately re-dispatched. The actual managed API fixture verifies terminal→202 new job→409 active duplicate; legacy adapters retain their original behavior. Broker confirmed HOLD/no C1 process before editing those bytes. Current snapshot has own14 and immediate20 dependency/consumer pins.

T011 private bridge now requires an existing, private native-ACL verified control root. The cross-process fixture creates only its named temp root (no ACL mutations), uses real inherited/native SID verification, and has a 60-second test timeout. Failure of that real privacy gate is not replaced by a fake mode-bit proof. Native ACL modules/scripts are included in dependency pins.

Resumed cycle-1 candidate additionally preserves actual worker recorder readiness separately from cancel intent. Queued/pre-ready cancellation reports process launching, observed readiness/ACK reports running, and actual terminal exit reports not-running. An exact API regression covers that progression. A second test invokes the actual shared CLI entry against the real loopback managed API to consume persisted job metadata without capture/provider activity. The refreshed five-file Node batch is expected 24 tests. These new tests are authored, not yet executed. The packet now contains actual own14 plus immediate20 dependency/consumer rows, with all hashes refreshed before execution.

## Explicit remaining gates

Current revalidation checkpoint: all40 packet paths checked; only both private-acl.ts helpers had changed to owner-final DB444C6DE16632AEC9CE8AA67AB367978688E5B6213B8D48EFBE1665B41AF5F0. Owner confirmed diagnostic classification only, with real native ACL checks and fixed five-second bound intact. QA dependency pins refreshed; no production/test source edits. Runtime global U24 source/test freeze remains active. New sole CPU broker is /root/docker_governance_review; Node24, actual cancellation IPC12, mounted web3files, legacy API and coherent types/validator remain queued for release. No new executed T039 receipt or checker PASS exists for this candidate; prior cycle0 sixteen-test receipt remains historical.

Latest resumed snapshot supersedes earlier provisional dependency pins: own14 plus immediate26 source/test/setup dependencies, 40 actual packet hash rows. Runtime confirmed no global input freeze before adapting only worker-privacy.test.ts: explicit broker `LKB_PRIVATE_ACL_PROBE_DIR` supplies a newly protected UUID-only test parent; the fixture makes/removes only its own exclusive child, retains real native ACL checks, and ordinary temp remains refused when unsafe. Native setup/cleanup helper is pinned. Production source is unchanged by this resumed adaptation. All current Node24, IPC12, mounted web, legacy API and types/validator stages still require fresh broker receipts and independent checker review.

Independent read-only review requested current exact evidence for immediate cancellation IPC → graceful flush. The twelve-case `capture/reconnect-gaps.test.ts` is now separately declared/pinned in the packet (own14/immediate21, 35 files). No duplicate inherited run is claimed. T011 native ACL identity changes are pending owner freeze; broker was explicitly told to hold T039 probes until fresh dependency pins are confirmed.

Native ACL owner freeze is now confirmed: both private-acl.ts helpers pinned 073BFA2DE3471CA812C1957C72D7EB0A0683F05344090D2293CBDEFE266C1239; both PS scripts remain 47047E4D914122A3ADA2313C457D13AE60F283333122B162E9E092F9BE4894DD. Pending T011 receipt-generation changes still gate the cross-process privacy fixture; no receipt/helper result is inherited from older bytes.

Central integration must mount createManagedSendNowDeps on the supported native capture API host and route the shared CLI manual-jobs command into its HTTP consumer. Existing MeetingBotPage already mounts SendNowForm, which exposes the new controls. Real meeting admission within 60 seconds, supported Windows/Ubuntu host proofs and actual media/downstream sample consumption are NOT demonstrated. Whole T-039 remains in_progress/HOLD.

The job directory is local to one capture host, not a distributed Mongo job queue. A stale heartbeat/abandoned dispatch lock cannot be automatically reclaimed without verifying capture ownership. Cancellation while joining is retained and delivered when the existing recorder reaches its managed-control readiness point; no bounded instantaneous pre-admission stop is claimed. No arbitrary PID signals or unrelated process cleanup is used.

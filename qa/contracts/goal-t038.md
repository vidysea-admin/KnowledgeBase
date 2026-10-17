# T-038 scheduler service — full parent acceptance

Checker-owned ground truth for the complete T-038 task. The root coordinator granted this checker exclusive ownership of this contract, its matching verdict and task evidence. Priority tier: 3, the explicitly authorized remaining-task implementation. Maker must not edit or narrow this contract.

## Acceptance sources and scope

- Current user attachment: `C:/Users/product/.codex/attachments/db7dce52-5317-4ddc-acf6-e3965405c3ab/pasted-text-1.txt`: T-038 is scheduler, polling and overlapping meetings; actual output and immediate downstream consumption must pass; a task closes only after its full acceptance, not a foundation or screen. The reliable webinar-to-answer release requires interruption recovery and unattended observation.
- Historical reconciliation: `C:/Users/product/.codex/attachments/5b9890de-27a1-4700-9e7e-7f04f6050b5c/goal-objective.md`: complete discovery/registration/joining/recording and reliable unattended operation remain required; existing code/screens do not establish accepted operation.
- `TASKS.md` T-038 and release-order note; `.goal/goal.json` T-038 and R1: five-minute poller, selection to recording, overlaps; T-034/T-036/T-037 dependencies; T-052 dependency for registration-required coverage; real invite/discovery to usable capture and actual alert, interruption recovery, Windows and independently verified Ubuntu.
- `docs/meeting-bot-roadmap.md` P3: service replaces one-off Windows tasks, handles overlaps through parallel tab capture, and completes a week of webinars without manual scheduling.
- `docs/DECISIONS.md` D-165 through D-167: automatic joining is authorized for this deployment; career counselling/guidance has highest scheduling priority; other webinars are staging test data; alerts use the authorized gws email recipient and web dashboard; last-valid rules retain verified tenant ownership, integrity and the exclusive one-hour expiry, plus deny/opt-out enforcement and existing safety gates.
- Applicable T-034/T-036/T-037/T-052 contracts, `qa/contracts/t038-durable-alert-retries.md`, and `qa/contracts/goal-t051.md` retain their existing security/live requirements. A smaller unit PASS is evidence only for its named seam.

## C1 — Autonomous service and canonical execution

1. A persistent service uses the existing canonical pipeline and recorder interfaces, rather than requiring an operator-created task for each meeting. Its normal discovery/selection cadence meets the five-minute poller requirement; a justified faster cadence is acceptable. Recording or post-processing of one session must not prevent timely acquisition and scheduling of another eligible session.
2. Actual connected discovery passes eligible events through the currently approved T-037 controls before scheduling or capture. The deployed service, flags and truthful API/UI agree on which controls are active. A disconnected pure selector, alternate preview path or disabled rules flag cannot satisfy this clause.
3. Starting, stopping, repeated polling and service restarts preserve explicit tenant-owned durable operation state, bounded retries and terminal outcomes. A second controller or stale generation cannot launch duplicate captures or corrupt the current operation. Failed feeds, exhausted retries and incomplete discovery are visible states, not healthy empty schedules.

## C2 — Selection, registration and safety

1. Trusted/approved positives are scheduled without a new click. Explicit rejection, denial, meeting/occurrence opt-out, cancellation and accepted reschedule/end-boundary changes remain effective at initial selection and while capture is active. Recurring/id-only identity and sender-policy requirements remain in force; no blanket approval bypasses them.
2. The configured tenant and authenticated API-key tenant are verified equal before relevant writes, discovery refresh and recording. Missing, foreign, ambiguous or unverifiable ownership refuses those actions. Existing credential, source/profile ownership, URL and production/work-database boundaries remain enforced; confidential links and credentials do not leak into state visible to another tenant or into alerts/logs.
3. Only a complete validated primary rules/state document refreshes the integrity-checked tenant-bound last-valid snapshot. On primary failure, fallback requires the currently verified equal tenant and snapshot age nonnegative and strictly less than one hour. Missing, foreign, corrupt, invalid, future or expired snapshots refuse joining. Repeated fallback never renews the timestamp or discards cached deny/opt-out rules. Degradation and recovery follow D-166, including actual producer-to-alert-to-API/UI integration on empty schedules.
4. Career counselling/guidance wins scheduling conflicts according to D-165. Other webinars are explicitly staged as test data and do not become production career knowledge through the scheduler. Registration-required events reach the accepted T-052 confirmation/link path before capture; uncertain registration is visible and cannot masquerade as a confirmed personal join link. A completed direct-link slice does not close full registration coverage.

## C3 — Real overlap coverage

1. Two eligible overlapping sessions execute actual concurrent tab capture through the accepted T-034 recorder, with separate verified owned tab/session identities, media, controls and downstream operation state. One session's stop/failure must not stop, overwrite or misattribute the other. Shared controller state must remain safe during concurrent updates and restarts.
2. Capacity is explicit and bounded. Above capacity, career priority and deterministic selection apply; skipped/deferred coverage and reasons are durably visible and alerted. A normal one-tab first release, a dropped second session, a serialized loop or concurrent mocked promises does not satisfy the required parallel capture clause.
3. Retain an actual overlap sample with measured simultaneous execution times, usable audio/video from each session and immediate downstream consumption. A concurrency setting or isolated unit test is insufficient evidence.

## C4 — Actual capture, immediate consumer and alerts

1. Real inbox/alias invites or discovered webinars autonomously reach actual joining and usable captured media. The affected recording stage is green on the accepted sample, including owned cleanup, truthful coverage gaps and valid media/session identity. Short synthetic media can test a boundary but cannot replace live webinar acceptance.
2. The immediate configured downstream processing stage consumes each scheduler output without errors. Transcription, validation, indexing and cited Ask evidence required by the connected release is attributed to the matching source/session/tenant; a child exit alone cannot set ready. Existing approved provider/schema/database boundaries remain respected.
3. Actual email delivery through the authorized gws channel to the configured Umesh recipient and tenant-scoped dashboard visibility are independently evidenced for relevant lifecycle, discovery/rules degradation, failure and recovery events. No additional recipient or organizer message is implied by this contract. Sent, failed, disabled, rate-limited and exhausted delivery remain truthful; durable bounded retries, channel deduplication and accepted email ceilings survive restart. A mocked transport or stored alert row does not prove delivery or visible dashboard rendering.

## C5 — Supervised interruption and host proof

1. Actual supervision starts/restarts the verified canonical runner on the real Windows target and on an independently tested Ubuntu graphical-session target. Preview XML/systemd unit, installer mocks, a container health check or source-only OS adapters are insufficient.
2. Exercise a real interruption and supervised restart/recovery. Tenant/session/media ownership, locks and generation controls are preserved; incomplete media is safely recovered or visibly reported, without duplicate capture, leaked owned processes or false complete coverage. Immediate downstream processing consumes the recovered output.
3. OS-specific live proof and actual host/media/browser prerequisites remain verified; a Windows proof cannot certify Ubuntu. Missing host access or provider authorization is recorded as a remaining gate, not waived by packaging or a foundation PASS. Related goal-t051 evidence may be reused only with its exact scope, commands, output, fixture, OS and checked provenance identified.

## C6 — One actual week without manual scheduling

1. Retain seven actual elapsed days of unattended scheduler operation covering real eligible webinars. Timestamped evidence records host/OS and configured cadence, discovery/selection/recording, overlaps, delivered alerts, failures/retries/recovery, downstream outcomes and any operator intervention. Retain enough evidence to establish that all eligible discovered events were handled or truthfully accounted for.
2. Manual per-meeting scheduling, shortened/backdated observation, synthetic clock advancement or a proposed monitoring plan cannot satisfy this clause. Missing elapsed time or connected real-event evidence leaves full T-038 acceptance incomplete. Windows operational evidence and Ubuntu portability remain separately attributable.

## C7 — Independent verdict and closure

1. A current-cycle maker manifest and packet identify exact scope, changed files and immediate consumers, final-file hashes, all acceptance mappings and attributed evidence. The independent checker directly reviews runtime/security boundaries, performs focused behavior/boundary verification under the root CPU lease, and rechecks candidate hashes before verdict. Required `contracts/verify_contracts.py` evidence is retained.
2. Exact command, output/artifact, measured duration, exit/counts, fixture and provenance are recorded. Issue-fix reproductions use the union ledger's own recorded cases verbatim and report counts by issue ID; omissions are named. Mutation probes require timeout, byte-backup restoration on timeout/interrupt/error and byte comparison, with no product mutation left behind.
3. Only complete C1-C6 actual evidence supports full `goal-t038` PASS and task closure. Source/foundation checks may be reported separately with their remaining parent gates, but cannot be recorded as parent PASS. Missing prerequisites/evidence produce HOLD; a reproducible acceptance violation produces FAIL. The checker never weakens this contract to fit a smaller implementation.

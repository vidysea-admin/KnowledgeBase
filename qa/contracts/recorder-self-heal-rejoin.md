# Contract — recorder-self-heal-rejoin (unit H1, plan Lane B, D-242 item 4, D-243 items 2 and 4)

> Status: adopted by /checker 2026-11-25. SOURCE: OWNER DIRECTION + CHECKER-DERIVED DETAIL. The direction is Umesh's own words, verbatim, in `qa/feedback-inbox.md` ("## 2026-11-25 - Umesh (Approver), in chat, answers to four defaults",
> item 1) and in D-242 item 4. The default put to him was "Recorder beech me crash ho jaye to? Agla capture apne aap shuru nahi hoga; pehle aapko alert jayega." His answer: "nhi apne aap heal ho jayee asap and alert bhi aa jaaye".
> That is: the recorder recovers by itself as soon as possible, and an alert is also sent. D-243 item 2 names the unit and item 4 sets the version-1 default (the interrupted partial recording is dropped and the alert says so).
> Everything below that is not that sentence (the criteria, the numbers, the outcome words) is checker-derived from the code read on 2026-11-25 and is not Umesh's words; each unstated input is tagged [ASSUMPTION].
> Code read at the head of `wave/b10-failure-alert-mail` (16a44f4c; the base of this unit, see "Base and order"): `scripts/webinar/scheduler/dispatch.mjs`, `lifecycle-alerts.mjs`, `scripts/webinar/run-pipeline.mjs`,
> `packages/meeting-bot/src/autojoin/alerts.ts`, `bot-events.ts`; and `docker/meeting-bot/entrypoint.sh` at the head of `wave/b4-recorder-state` (98198314). Nothing was run.
> Verified facts (checker read, file:line at the base): an interrupted capture is a row left at `status: recording` by a process that died. On the next cycle the recovery loop (`dispatch.mjs:24-64`) finds it. With no
> recording file on disk it writes `action_required`, reason `interrupted-no-recording-artifact` (:38-41); with a file on disk it finalizes that file (:49-60). At three attempts it writes `retry-limit` (:34).
> `action_required` rows are left out of re-selection (`run-pipeline.mjs:92-93`, `dispatch.mjs:76`), so a meeting that is still running is not rejoined. The reason names are listed at `run-pipeline.mjs:29-31`
> (`OPERATION_ONLY_REASONS`) and `lifecycle-alerts.mjs:9-11` (`REASONS`). The recording file path is stored on the row when the child prints "audio/video recording started" (`run-pipeline.mjs:151-155`), so after a crash
> of the capture child with the container alive the file usually exists, and after a container restart it does not (the recordings folder is not in the state tar, `recorder-live-proof-object.md`).
> Facts the design read had slightly wrong (no effect on the criteria): (1) the alert is not only "sent by the next healthy tick through an outbox replay": the next process's first recovery pass calls `update()`
> (`lifecycle-alerts.mjs:106-112`), which dispatches the alert at once; the replay (`tick()`) only re-sends what failed. (2) A graceful stop (`SCHEDULER_STOPPED`, `dispatch.mjs:121`) already re-queues the row as
> `service-stopped` with the attempts unchanged, and a queued row is re-selected; the gap is the ABRUPT death only. (3) The two intervals live in the entrypoint of `wave/b4-recorder-state` (`entrypoint.sh:70-79`:
> `LKB_LEASE_TTL_S` default 120, `LKB_ATTENDANCE_INTERVAL_S` default 300), not on the B10 branch. In that loop one tick is one `--run` child that lasts as long as its capture (`entrypoint.sh:770-779`); when it dies the loop
> starts the next tick at once if the interval is already used up.

## Base and order
- Base: branch `wave/b10-failure-alert-mail` at 16a44f4c (closed out, checked-PASS cycle 0, not yet merged to `docs/cloud-run-golive` or master). Reason: `lifecycle-alerts.mjs` there carries the B10 reason lookup (`reasonName`, :12-14) and the
  `admission_denied` name; the other branches have the older exact-match lookup, and a build on them would conflict. The builder starts a new branch from that head (suggested name `wave/h1-recorder-self-heal`, [ASSUMPTION]).
- Shared files and order (D-243 item 2): `scripts/webinar/run-pipeline.mjs` and `scripts/webinar/scheduler/lifecycle-alerts.mjs` are touched by H1 and by R1 (`webinar-registration-unattended`), and later by B9. Order: H1, then R1, then B9.
  One owner at a time on each file. R1 starts from H1's merged head, not from the B10 head.
- The live behaviour also needs unit B4 (`recorder-container-state.md`: restore, lease, the attendance loop in `entrypoint.sh`). H1's tests do not run the entrypoint, so H1 can be PASSed before B4 merges. The live proof cannot.

## Files and seam
- Edited, when needed: `scripts/webinar/scheduler/dispatch.mjs` (the recovery loop :24-64, mainly :38-43), `scripts/webinar/scheduler/lifecycle-alerts.mjs` (`REASONS` :9-11, `canonicalOperationAlert` :18-31),
  `scripts/webinar/run-pipeline.mjs` (`OPERATION_ONLY_REASONS` :29-31, `reconsider` :83-85, only if a new reason or status needs it), and their test files (`dispatch.test.mjs`, `lifecycle-alerts.test.mjs`,
  `alert-kinds.test.mjs`, `skip-reason-vocabulary.test.mjs`, `run-pipeline.test.mjs`). `packages/meeting-bot/src/autojoin/bot-events.ts` (`ALERT_KINDS` :10) and `alerts.ts` (the once-per-key rule :7 and :173; the failure cap :189-194)
  only as far as H1-C3 requires; if they are edited, `alerts.test.ts` and `alert-retries.test.ts` still pass unchanged (H1-I1).
- NOT edited: `docker/meeting-bot/*` (entrypoint, Dockerfile: unit B4/P1), anything under `packages/meeting-bot/src/capture/` (the launcher, `reconnect-gaps.ts`), the slot pool and slot readiness, the lease and snapshot code, any config value
  or cloud resource. A need to edit one of them is a STOP and a question, not a quiet edit.
- Runners [ASSUMPTION: the repo's own runner]: `node --test scripts/webinar/scheduler/dispatch.test.mjs scripts/webinar/scheduler/lifecycle-alerts.test.mjs scripts/webinar/scheduler/alert-kinds.test.mjs scripts/webinar/skip-reason-vocabulary.test.mjs scripts/webinar/run-pipeline.test.mjs`;
  from `packages/meeting-bot`: `node --test --import tsx src/autojoin/alerts.test.ts src/autojoin/alert-retries.test.ts`.
- Seam: the REAL `runSchedulerCycle`, the REAL `createCanonicalAlerts` and the REAL selection (`selectAutoRecordItems` and the attendance `select`), a temp state directory holding a real `operations.json`, a fake clock, and fake executors:
  the capture launcher (records its arguments and the moment it is called; can be told to stay alive, exit non-zero, or hold a capture lock) and the mail sender (`AutojoinGwsRunner`, as in `meeting-bot-failure-alert-mail.md`; the mail is read back by
  decoding the recorded `--json` argument). No real browser, `gws`, mail, bucket or network. "Crash" is built by writing the row a dead process leaves: `status: recording`, `attempts: n`, `artifact` absent or present, the old process absent from the pool.

## Criteria
- **[H1-C1]** Rejoin after a crash, no person acting. Row X: `status: recording`, `attempts: 1`, a meeting URL that the join rules allow, `startTime` in the past and `endTime` in the future by at least 10 minutes, the old process absent, no recording file on disk.
  The first scheduler cycle of the new process (real recovery loop, then real selection) re-queues X and the launcher is called ONCE with the same meeting URL, the same `--session-id`, the same `--until` (the meeting's own end) and a
  `--tenant` equal to the row's tenant. No input is supplied other than the state file, the clock and the stubs: no approval file, no flag, no environment switch that a person would set after the crash. The same holds in pool mode
  (watch) and in single-slot attendance mode (`pool` absent). The started-but-not-ended meeting must pass the REAL selection (a meeting already begun is not dropped as late or past); a selection that drops it is a finding, not a pass.
  Negative cases, each with zero launcher calls: `status` other than `recording` (`queued`, `ready`, `failed`, `action_required`, `processing`) behaves exactly as H1-C9 says; a row of another tenant (H1-I5).
- **[H1-C2]** "asap", measurable. [ASSUMPTION, the Approver owns the number, see "Needs the Approver"] The rejoin is attempted in the FIRST scheduler cycle after the recorder holds its lease and its state is restored: on a fake clock, the launcher call
  happens in that cycle, at a clock reading no later than the cycle's own start plus the time the stubs take, and NOT in a later attendance interval. In the live run (a separate live row, H1 live proof below) the rejoin attempt appears in the bot log within 180 seconds
  of the new process starting [ASSUMPTION: 120 s lease wait, `LKB_LEASE_TTL_S` default, plus 60 s]; a rejoin that waits for the next 300-second interval fails this criterion. The test names the interval it did not wait for.
- **[H1-C3]** One alert per interruption, and it says what happened. Every interruption of a meeting (a row found at `recording` with no live owner) produces exactly ONE alert mail to the one configured recipient, in the same recovery pass that decides the outcome
  (not only on a later replay). The decoded mail body differs by outcome and each carries its own stable token in the existing `Coverage: <name>.` shape (names are [ASSUMPTION]: `interrupted-rejoining`, `interrupted-ended`, and the existing `retry-limit`) plus one plain sentence:
  (a) rejoining: the recorder restarted and is rejoining the meeting; (b) meeting already ended: not rejoined; (c) attempt limit reached: stopped, no further rejoin. In (a), (b) and (c) the sentence also says that what was recorded before the interruption is lost / not kept. The
  three bodies are pairwise different. A SECOND interruption of the same meeting (rejoin crashes again) is mailed too; it is NOT reported as `duplicate`. Checker finding at the base: `alerts.ts:7,173` allows each (session, kind, channel) once and `lifecycle-alerts.mjs:53`
  forces the alert's `sessionKey` to equal the operation id, so reusing `capture-failed` alone cannot satisfy this; the builder must use a new kind or a per-interruption key and shows with a test that interruption 1 and 2 of one meeting give two mails. Failure cap: interruption mails stay under the existing
  3-per-hour rule, EXCEPT that the terminal alert (c) is never rolled into the hourly digest [ASSUMPTION; see "Needs the Approver"]; a burst beyond the cap rolls into the digest as today for the others. Email off or no valid recipient: zero sender calls, no throw, the row's state and the rejoin
  decision are unchanged.
- **[H1-C4]** A meeting that has already ended is not rejoined. Row X: `recording`, no recording file, `endTime` at or before the clock (the same boundary as `dispatch.mjs:77,102`: end less than or equal to now means ended): zero launcher calls; the row ends `action_required` with the interrupted reason;
  one alert of outcome (b). With `endTime` one second in the future the row is rejoined (C1); there is no minimum remaining time [ASSUMPTION; see "Needs the Approver"]. A row with a surviving recording file and an ended meeting keeps today's path (finalize, H1-C9).
- **[H1-C5]** A crash loop cannot rejoin for ever. The bound is the existing attempt limit of three [ASSUMPTION: confirmed by the Approver as the default], counted per meeting across restarts: the first capture is attempt 1, so at most two rejoins. Test: crash the same meeting five times in a row
  (fake process death after each launch): the launcher is called exactly 3 times in total, the 4th pass writes `action_required` with `retry-limit` and sends outcome (c), and the 5th pass sends nothing more and launches nothing (the row stays stopped; no alert storm). The attempt number is
  written to `operations.json` BEFORE the launcher is called (the test reads the file from inside the launcher stub). A graceful stop keeps its present rule: `service-stopped` restores `attempts` to its earlier value and does not use up an attempt.
  Known limit, recorded not built: the state tar is taken on an interval (`LKB_SNAPSHOT_INTERVAL_S`, default 300 s), so if the container itself dies in the window between the attempt being written locally and the next snapshot, the bucket copy can lag by one attempt. The builder states in the manifest whether the unit forces a
  snapshot (that is `entrypoint.sh`, not this unit) or accepts the limit; the Approver is asked (see "Needs the Approver"). It is never silently ignored.
- **[H1-C6]** The same meeting is never captured twice at once. (a) Over 4 consecutive cycles and 3 replays of `tick()`, with the first rejoin still running (launcher stub alive), the launcher is called once for X. (b) The recovery loop and the scheduling loop in the same cycle (`dispatch.mjs:24-64` then :68-128) do not
  both start X: one cycle, one call. (c) A row whose owner is alive (`pool.has(id)`, or the runner lock held by a live owner, `run-pipeline.mjs` `acquireLock`) is not re-queued by another process. (d) A rejoin that finds the capture lock held by a live process (stub) ends as a failed attempt that counts toward H1-C5, never
  starts a second recording beside it, and never kills the holder. (e) Two DIFFERENT meetings interrupted together (a clash) are each rejoined once; one does not suppress the other (the two-slot work itself is out of scope; this only forbids H1 from serialising or dropping them).
- **[H1-C7]** [SECURITY CLASS: privacy and opt-out (checker-tagged)] A rejoin is a join. It goes through the same gates as a first join and cannot get around any of them: tenant ownership validation (`validateTenant`), the join rules (`applyJoinRules`), opt-out and cancellation, the privacy controller, and
  `prepareCapture`. Test, each with zero launcher calls and an `action_required` row naming the existing reason: the meeting was cancelled or rescheduled after the crash; the organizer is now denied by a rule; the meeting is opted out; the privacy controller is unavailable; the join link is no longer safe. A crash never turns a refused meeting into
  a recorded one. (The reasons come from the existing vocabulary; none is invented to hide a refusal.)
- **[H1-C8]** Version 1 drops the interrupted partial and says so. When X is rejoined the unit does not finalize, transcribe, index or publish what the dead process recorded: no `finalize` call for it, no `processing` row from it. The old recording file, if it is on disk, is NOT deleted and NOT overwritten (the new capture writes a
  different file; a file-name collision is tested with the same session id) [ASSUMPTION, resolves the case "the capture child died, the container lived"; see "Needs the Approver"]. The alert says the part recorded before the interruption is not kept (H1-C3). Keeping the partial is unit H2 and is out of scope.
- **[H1-C9]** Everything else stays. The following behave exactly as before (existing assertions pass unchanged, and each case gets one explicit test in this unit): a capture row at `failed` (refused admission with its one B10 alert, a child that exited non-zero) is NOT rejoined, still reaches its existing state, and keeps its one alert; a row at `processing` or
  `recording` WITH a surviving recording file and an ENDED meeting is finalized as today; `ready` rows are left alone; the attempt limit rule at :34 for non-interrupted rows; `capture-slot-unavailable`; `service-stopped`; the `reconsider` rules (`run-pipeline.mjs:83-85`); the alert kinds `capture-started`, `capture-done`, `coverage-deferred`.
  Any new reason name is added to `OPERATION_ONLY_REASONS` (`run-pipeline.mjs:29-31`) and `REASONS` (`lifecycle-alerts.mjs:9-11`) and passes `skip-reason-vocabulary.test.mjs`; a new reason never falls to the neutral line "Coverage requires review.".
- **[H1-C10]** [SECURITY CLASS: credential handling (checker-tagged)] The three mails carry no join URL, passcode, token, recording path or other credential. A row whose title carries a join URL with `?pwd=...` and a fake passcode sentence yields a decoded mail in which none of those strings appears; the title is rendered as today (`[link removed]`,
  `cleanBotText`, `bot-events.ts:34`, `alerts.ts:116,197`). The assertion is on the decoded text, not on the sender's arguments.

## Invariants (what must not change)
- **[H1-I1]** B10 stands: `meeting-bot-failure-alert-mail.md` B10-C1 to C7 and B10-I1 to I5 still pass with their tests unchanged. One failure alert per refused capture; the `reasonName` lookup rule (:12-14, the hyphen is not a delimiter); `alerts.test.ts`, `alert-retries.test.ts`, `lifecycle-alerts.test.mjs`, `alert-kinds.test.mjs` pass with
  no existing assertion edited, removed or skipped (tests may be added). If `alerts.ts` or `bot-events.ts` is edited, the diff is limited to what H1-C3 needs and the once-per-key rule for every other kind is unchanged.
- **[H1-I2]** No file outside the list above is edited; no config value, cloud resource, slot setting, container setting or lease/snapshot setting changes.
- **[H1-I3]** The recipient comes only from `LKB_ALERT_EMAIL_TO` or `alerts.emailTo` through the existing address check; exactly one `To`; no address literal and no credential in the diff.
- **[H1-I4]** No test sends a real mail, starts a real browser or `gws`, opens a network connection, or reads a `.env` or credential file; every sender, launcher and clock is a fake.
- **[H1-I5]** Tenant boundary: only a row with `tenantId` equal to the runner's tenant is re-queued, rejoined or mailed (`lifecycle-alerts.mjs:53,85`). A row without a matching tenant is left exactly as found.
- **[H1-I6]** No recording file is ever deleted, truncated or overwritten by this unit (D-232: a non-empty partial recording is never deleted).

## Tier, check, live proof
- Tier L. Trigger: concurrency/timing/race ("the same meeting is never captured twice at once", H1-C6, `dispatch.mjs:24-64` and :68-128; policy tier table). The route floor is computed by the maker with `tick.mjs --route <base>..<head>` before it sets the tier; it may only raise it.
- Dual check: NO. No security/auth/tenancy/prod-write/student-data trigger is touched: the gates in H1-C7 are reused, not changed, and nothing is written to a database. One checker. If `--route` prints `dual: true`, the maker cites the `dual-trigger` line and the check becomes dual; the checker may raise it only by citing a concrete change in a security path.
  H1-C7 and H1-C10 are tagged security class, so findings against them are never capped by the round cap (project CLAUDE.md, D-014).
- Live proof (NOT part of this unit's check; one separate row, [ASSUMPTION] to be added under G07 of `go-live-acceptance.md` when the Approver agrees the bound in H1-C2): while a real Meet is running with at least 15 minutes left, the recorder process is killed (a PID the run started and recorded, never by image name); the bot rejoins the same
  meeting, and one alert mail arrives that names "rejoining" and states the loss. Joining a real meeting and sending a real mail are outward-facing and stay a human gate (GI6).

## Out of scope / ignore
- Keeping the interrupted partial recording (H2: needs a second change in `entrypoint.sh`, which unit B4B holds). Slot locks and container settings (P1). The two-slot recorder (D-243 item 1; B3, B9, P1, P2). Any Cloud Run change. Stale capture-lock clearing at container start (P1; H1-C6(d) only requires that a held lock is not a double capture).
- A capture child that fails with its own error (not an abrupt death) while the meeting is still running: H1-C9 keeps it unchanged. Whether such a failure should also rejoin is not decided here (see "Needs the Approver").
- Consent: out of scope for this project (D-210). No criterion here is about it.
- The forced state snapshot after an attempt is written (H1-C5 known limit): `entrypoint.sh`, not this unit.

## Needs the Approver
1. The number behind "asap" (H1-C2): is "the rejoin attempt is visible within 3 minutes of the new process starting" what he means? The 3 minutes is the lease wait (120 s) plus 60 s; a smaller number needs a change in the container, not here.
2. Is the attempt limit of three (the first capture plus two rejoins) enough for him, or should a long meeting get more? Three is the existing limit and the default put by D-243.
3. Should a capture that FAILS with its own error mid-meeting (Chrome closed, the child exited non-zero) also rejoin? The brief says unchanged; he said "recorder crash" and did not say which. Today such a row is `failed` and not rejoined.
4. Is a rejoin with very little of the meeting left worth a join and a mail? Default here: no minimum.
5. The terminal "stopped" alert (H1-C3 (c)) should not be hidden in the hourly digest, so it is exempted from the 3-per-hour cap. That is a change to a rule he did not discuss.
6. Accept the known limit of H1-C5 (the bucket copy of the state can lag one attempt behind), or have a later unit force a snapshot when a capture starts.

## Stop rule
Stop rule: one acceptance check per unit, fixed before the work. A finding outside H1-C1 to C10 and H1-I1 to I6 is filed in the ledger, not built. Two failed checks of this unit go to Umesh as a decision. Security findings (H1-C7, H1-C10) are never capped.

## Amendment log
- 2026-11-25 · routine · created from `qa/feedback-inbox.md` (owner answer 1 of the four, D-242 item 4) and D-243 items 2 and 4, by /checker as contract maintainer (D-243 Changes-authorized). Checker-found facts folded in: the once-per-(session, kind, channel) rule means a
  second interruption would be `duplicate` unless H1-C3 is built as written; the capture-child-crash case leaves a recording file on disk (`run-pipeline.mjs:151-155`), so H1-C8 forbids finalizing it and forbids deleting it; a `failed` row with no recording file is rewritten to `interrupted-no-recording-artifact` today (`dispatch.mjs:26,38-41`), so
  H1-C9 pins that `failed` rows are not rejoined. [ASSUMPTION] tags kept: the new reason names, the 180 s bound, the limit of three, the terminal-alert cap exemption, no minimum remaining time, the file-collision handling, the branch name. Cross-references, no second contract for the same behaviour:
  `meeting-bot-failure-alert-mail.md` (B10, the alert path and reason lookup), `recorder-container-state.md` (B4, the loop and the state tar), `go-live-acceptance.md` G07 and G08 (live rows; not edited).

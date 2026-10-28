# CONSENT gate — U6 `scripts/watch/install-tasks.ps1` (new file + machine-state install)

**Opened:** 2026-09-28 by the maker on a human-invoked tick. **Owner:** Umesh (Approver).
**Blocks:** plan unit U6 (vivid-donut capture wave) — the Windows Task Scheduler install that makes
recording unattended.

## What was being asked

Two things the maker is forbidden to decide for itself, both required before U6 can be built or run:

1. **A new file.** `scripts/watch/install-tasks.ps1` does not exist, and the edit-in-place discipline
   reserves new files for an explicit "create a new file" from Umesh. It cannot go in `scripts/`
   itself: that directory sits at exactly 32 of 32 entries against the C2 `lint-dirsize` contract
   (ISS-345), so a 33rd entry there fails the structure lint. Hence a new `scripts/watch/`
   subdirectory.
2. **Registering Windows Scheduled Tasks on this machine.** This is outward-facing — it changes
   machine state outside the repository, and its whole purpose is to cause recordings to start with
   no human present. An unattended recorder is precisely the kind of thing that must not appear on a
   machine because an autonomous loop judged it useful.

## Answer

**Answered:** 2026-09-28 — **BOTH GRANTED**, recorded as **D-045**. Umesh in chat (AskUserQuestion,
this session). He chose this over "write it, don't run it" (which would have kept every machine-state
change in his hands) and over holding U6 entirely (which would leave capture manual, so a webinar
could still be silently missed the way the Ashoka Educator Dialogues session was on 2026-09-27).

Four constraints are part of the consent, not implementation detail, and a checker should treat a
violation of any of them as a FAIL:

- **Dry-run by default.** The script prints every task it would register — name, trigger, command
  line, working directory, run-as account — and registers nothing without an explicit `-Apply`. The
  bare invocation is the preview, so the first time it runs its effect is legible before it is real.
- **Idempotent.** Re-running converges. An existing task of the same name is updated in place, never
  duplicated, and the script reports created / updated / unchanged per task.
- **Reversible by the script that created it.** A `-Remove` path unregisters exactly the tasks this
  script owns, identified by a fixed name prefix, and touches nothing else in Task Scheduler. The
  consent can therefore be withdrawn by running the same script.
- **No credential capture.** Tasks run as the current interactive user. The script never prompts for
  or stores a password, and never registers a task to run as SYSTEM.

## The sequencing constraint — read this before applying

**The `-Apply` install is NOT unblocked by this gate.** Two separate gates stand between here and a
live unattended recorder, and this one clears only the first:

- This gate clears **building** the script (new file) and **the machine-state change in principle**.
- `qa/gates/live-recording-proof-method.md`, answered the same day, defers ISS-324's live proof to the
  **next real webinar** — Umesh declined to stage a throwaway Zoom meeting. `docs/features/
  u4-watch-dashboard/plan.md` states that U6 should not ship before that proof exists, on the grounds
  that its entire purpose is to run unattended a path no human has yet watched succeed.

So the order is: build the script and test it in preview → the next real webinar is recorded
**manually, with instrumentation**, producing the progress-event chain and a non-empty file → then
Umesh runs `-Apply`. Until that proof lands, **the next webinar still needs a human to start the
recording.** That is an accepted cost of not staging a test meeting, and it is written here so no
later session reads D-045 alone and concludes the install is cleared.

**Verification of U6 itself:** a registered task that fires on a throwaway schedule and produces a
non-empty recording. Note that a green test suite is not evidence for this path — the meeting-bot
suite injects a fake node child (`obs-windows.test.ts:111`) and stayed 94/94 green throughout the
period when live capture was in fact broken.

**Gate status:** ANSWERED — 2026-09-28, both granted under D-045 (Approved-by: Umesh); `-Apply`
remains blocked by `qa/gates/live-recording-proof-method.md`

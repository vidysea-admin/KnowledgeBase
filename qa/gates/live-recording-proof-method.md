# GATE — how do we prove the live-recording fix actually records?

**Opened:** 2026-09-27 by the maker. **Owner:** Umesh (Approver). **Severity:** high (it is the
acceptance evidence for the two issues that cost a real recording).
**Blocks:** the only remaining claim on `live-record-repair` — that the launcher and capture path now
work end-to-end. It does NOT block the merge; that already happened (D-039, `3368454`).

## Why this file exists at all — it is itself a finding

This decision was put to Umesh three times in chat and recorded in D-036 and D-039 as a HUMAN_GATE,
and **no `qa/gates/` file was ever written for it.** The 2026-09-27 sweep (shard 2) caught that: a
gate that lives only in decisions-log prose and tick lines has no file to carry an `Answered:` line,
which is exactly the D-006 loop this repo's gate-record rule exists to stop. The maker's own rule
says *the moment you name a gate, write the file*; it named it and did not. Recorded here rather
than quietly fixed.

## The question

`live-record-repair` is checked-PASS cycle 1, reviewed Approve by a fresh senior engineer, and
merged: 251/251 meeting-bot tests, 4/4 launcher tests, 35 pytest, clean `tsc`. **None of that is
evidence the webinar would record.** The test suite injects a fake node child
(`packages/meeting-bot/src/capture/obs-windows.test.ts:111`), which is the structural reason 250
green tests missed the bug that lost the Ashoka Educator Dialogues session on 2026-09-27. A green
harness cannot be promoted into a live proof.

So: how do we get the one instrumented live run?

**(a) A throwaway Zoom meeting you start, ~10 minutes of your time.** You open a meeting, the bot
joins it, we capture the full progress-event chain (`starting` → `bootstrapping` → `opened`) and a
non-empty recording file, and attach both to the manifest. Fastest, fully under our control, and it
also settles the one thing the evidence on disk still cannot attribute: *which* step ate the
original 120 s — UC-mode chromedriver bootstrap, loading the fat signed-in `data/bot-profile`, or
Zoom's sign-in redirect.

**(b) Wait for the next real webinar.** No time from you, but the proof arrives only when it
arrives, and if it fails we have lost a second real session — which is the cost we are trying to
stop paying.

**(c) Something else** — e.g. you would rather we build a recorded-fixture replay path first, which
is more work but makes every future change testable without a human opening a meeting.

The maker recommends **(a)**, and specifically (a) *before* U6 installs the Windows Task Scheduler
entry, because U6's whole purpose is to run this path unattended. Shipping an unattended scheduler
over a path no human has ever watched succeed is how the Ashoka failure repeats itself silently.

**Answer format:** reply `live-proof: a` (or b / c). The maker appends
`Answered: <ISO> — <choice> — <where>` here before running anything.

**Answered:** (pending)

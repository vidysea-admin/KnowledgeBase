# Contract — meeting-bot-admission-denied (unit B2, plan Lane B, D-232)

> Status: adopted by /checker 2026-11-25. SOURCE: MAKER-DERIVED. The criteria were proposed by the maker from the owner-approved plan (D-227, section 4 row 8 and section 7 Lane B row B2) and the
> code read on 2026-11-25; they are not Umesh's words. The owner's words are only the plan's: "Catch a Meet refusal early. 'You can't join this video call' is detected nowhere, so a refusal runs to the
> 900 s timeout and leaves a zero-byte file", and the live check (launch row G08): "The host refuses the bot: the capture ends in under 30 s with `admission_denied`, no zero-byte file, one alert mail".
> Decision behind it: D-232 (also D-225 for the refused page: no leave button, no rendered media). The "held until the Lane B decision entries exist" condition of the inbox entry is lifted (D-230 to D-234 appended).
> Scope: `packages/meeting-bot/py/sb_join_detect.py`, `sb_join_loop.py` (and the `sb_join.py` re-exports the tests import), `packages/meeting-bot/src/capture/admission-gate.ts`, `record-commands.ts`, their existing
> tests, and one saved page fixture under `packages/meeting-bot/py/fixtures/`. The B10 alert (`run-pipeline-deps.mjs`, `lifecycle-alerts.mjs`) is NOT covered here, see Out of scope.
> Every criterion is provable on a laptop with no cloud resource, no Google sign-in, no real meeting and no deployed address.
> Runners. Python: `python -m pytest packages/meeting-bot/py/test_sb_join_admission.py packages/meeting-bot/py/test_sb_join_admission_platforms.py` from the project venv. TypeScript, from `packages/meeting-bot`:
> `node --test --import tsx src/capture/admission-gate.test.ts src/capture/admission-status.test.ts src/capture/record-commands.test.ts`. New tests go into those existing files.

## Criteria
- **[B2-C1] Pure classification.** A Meet page whose lowercased body text contains "you can't join this video call" (straight apostrophe and U+2019 both) classifies as a state `refused`, distinct from lobby, in-call and
  unknown; for text that also shows an in-call control, `refused` wins. A near-miss ("you can join this video call", the phrase without "video call") does not classify as refused. Pytest, string input only.
- **[B2-C2] Saved page.** `packages/meeting-bot/py/fixtures/meet_refused.html` carries the refusal text and, run through `BODY_TEXT_JS` and the Meet in-call script in the module-scoped headless Chrome of
  `test_sb_join_admission.py`, classifies refused. No Chrome installed = NOT-MEASURED, never PASS (GI8 rule). Local headless browser only; no sign-in, no network.
- **[B2-C3] Join loop on a fake clock.** With the `_run`/`_Clock` harness: (a) refusal text shown from t=0, (b) a lobby for 20 s and then the refusal text. Each emits exactly ONE `admission_denied` no later than 10
  fake seconds after the text first appears, never `admitted` or `admission_timeout`, and ends with `closed`. The event carries `seconds` since the admission wait began, as `admission_timeout` does (it is the bot-log
  timestamp go-live row G08 measures from). With no stop file the loop leaves within the existing 45 s `FLUSH_GRACE_S`; with a stop file written 5 fake seconds after the event it leaves within 5 fake seconds of that.
- **[B2-C4] Gate.** `createAdmissionGate().onEvent({event: "admission_denied", ...})` returns a failure message starting `admission_denied:` and sets `gate.state` to "failed"; an `admission_denied` after `admitted`
  changes nothing (the rule the file's `admission_timeout` test applies, `admission-status.test.ts:22-34`).
- **[B2-C5] End to end, fake join script.** With the `runRecord` pattern of `admission-gate.test.ts` (real tab receiver, fake join script, no browser) and `inject.wait` at its default of 5000 ms: the fake bot emits
  `admission_denied` right after start; `runRecord` rejects with a message starting `admission_denied`; the measured wall time is under 30 s.
- **[B2-C6] No zero-byte file, two fixtures.** After the rejection of C5: (a) in a run where the fake bot first wrote a ZERO-byte `.webm` into the record directory, no zero-byte `.webm` remains; (b) in a run where it wrote
  a non-empty partial, that file is byte-equal afterwards. A test with only one of the two is vacuous and does not satisfy this criterion (D-232 notes the zero-byte claim is not shown by D-225). The status file says
  failed, not stopped.
- **[B2-C7] Nothing else moves.** The four existing suites above pass unchanged; plus: a lobby of 120 fake seconds that then admits emits `admitted` once and no `admission_denied`; a lobby that never ends emits
  exactly one `admission_timeout` at the configured limit and no `admission_denied`; the refusal text on a Zoom or Teams URL does not emit `admission_denied` (Meet only).
- **[B2-C8] (checker-added) Refusal is a pre-admission signal only.** Once `admitted` has been emitted, the refusal phrase appearing in the body text (a caption line or a chat message by another participant) emits
  no `admission_denied`, no `closed`, and does not stop the loop or the capture. Fake-clock scenario: admitted at t=5 s, the phrase in body text at t=20 s, loop still running at t=60 s. Reason: body text includes
  captions and chat, and a typed phrase must never end a live recording (data loss); the dangerous direction is the one B2-C1's "refusal wins over a visible control" would otherwise open.

## Invariants
- **[B2-I1]** Default admission timeout stays 900 s; `LKB_ADMISSION_TIMEOUT_S` and `--admission-timeout` behave as today (`test_sb_join_admission.py:27-28`, `:195-205`).
- **[B2-I2]** Lobby and in-call classification for Meet, Zoom, Teams and other URLs is byte-for-byte unchanged for every body text that does not contain the refusal text.
- **[B2-I3]** The bot never auto-clicks or reloads in response to the refusal; the lobby reload suppression stays (`sb_join_loop.py:84-87`).
- **[B2-I4]** The `admission_timeout` event, its message text and the flush grace are unchanged.
- **[B2-I5]** No zero-byte cleanup is added on any path other than the refusal path, and a non-empty partial is never deleted on any path (D-232).

## Out of scope / ignore
- The alert mail (plan row B10: a `admission_denied` entry in the REASONS set of `scripts/webinar/scheduler/lifecycle-alerts.mjs`, and `notifyOperation` in `run-pipeline-deps.mjs`) is in D-232's Changes-authorized
  list but in none of the maker's B2 criteria. Go-live row G08 needs it ("one alert mail"). The maker files its own unit-level checks (inbox entry) for B10; until then G08 cannot pass.
- Operator steps (not builder criteria): a host really refuses the bot on the hosted recorder; the bucket holds no zero-byte file for that session; one mail arrives (needs Google sign-in, a real mailbox, B10 and the
  alert variables). The live check is `go-live-acceptance.md` [G08].

## Amendment log
- 2026-11-25 · routine · created from the maker-derived inbox entry "unit-level checks for Lane B units B2 and B4" (plan section 7 B2, D-232). Dispositions: B2-C1 accept (added near-miss negative control);
  B2-C2 accept; B2-C3 amend (event carries `seconds`, for G08 evidence); B2-C4 accept; B2-C5 accept; B2-C6 amend (two fixtures required, otherwise the zero-byte test is vacuous); B2-C7 accept;
  B2-I1..I5 accept (I5 adds "never delete a non-empty partial anywhere", from D-232). Added B2-C8 (refusal text after admission must not end a capture). Contradiction found with an existing contract line:
  go-live G08 said "no media object of any size" against D-232's "non-empty partial never deleted"; G08 amended in `go-live-acceptance.md`. Operator steps and the B10 gap recorded under Out of scope.

# Contract — go-live-acceptance (the 17 launch checks, D-227)

> Status: adopted by /checker 2026-11-25 from the owner's approved plan (D-227, Approved-by Umesh).
> Source: `qa/feedback-inbox.md` entry "2026-11-25 - Umesh (approved plan, D-227) - 17 acceptance checks for go-live"; plan section 4
> (`C:\Users\Lenovo\.claude\plans\meeting-bot-imperative-starfish-of-3fb8d78b-cac7-406e-9e13-fe76f3d5cd42.md`).
> Definition of "live" (D-227 fixed choice 6): the ONE named check per feature passed on the REAL deployment. One check per feature;
> a finding outside a row is filed, never built. A unit that fails its row twice goes to Umesh as a decision, not a third round.
> Each row's wording below is the owner's; text after "Tightened:" is the checker's clarification so the row can be judged, not a new demand.

## Scope rule — LIVE-ONLY (applies to every criterion G01-G17)
Every `[G..]` criterion is tagged `[LIVE-ONLY]`. Unit tests, fake providers, `127.0.0.1`/`localhost`, a docker-compose stack, an emulator, a laptop
bot run or a work-copy-only run can be PRE-evidence (deterministic before live, policy .15-1) and never satisfy a row.

- **[GI1] Evidence header (mandatory per row).** The evidence record names: target origin or resource (for Cloud Run the service, the revision name and the
  image digests of both containers), UTC start/end time, the exact command or scripted flow, the full output or a linked file, and who ran it. A row with no header is
  NOT-EVIDENCED, never PASS.
- **[GI2] Real-target test.** The target origin must be the deployed host named by the row (`https://kb.vidysea.com/knowledgebase` for web rows; the hosted Cloud Run
  service for bot, calendar and WhatsApp rows). A loopback, private-range, `*.local` or `host.docker.internal` target, or a host that does not serve the commit-pinned
  revision recorded in the header, makes the row INVALID. Rows 16 and 17 name a work copy / rehearsal in their own text: their header names that exact instance and the
  deployed build that drove it, and it must not be the production database (see G17).
- **[GI3] Checker-reproduced.** Only /checker can pass a row. It re-runs the scripted flow itself or re-reads fresh output the maker produced in this cycle against the same
  revision; evidence older than the current revision (any later deploy of either container) is stale and the row is re-run.
- **[GI4] Privacy of evidence.** Evidence for rows 1, 11, 12, 13, 15 records ids, counts, hashes and timestamps; no passwords, API keys, session cookies, QR contents,
  WhatsApp message bodies or private transcript text beyond the cited turn.
- **[GI5] No local-only green moves a row.** `.goal/goal.json` task states and TASKS.md rows for the plan's units move only on a PASS of the matching row (D-227 Changes-authorized).
- **[GI6] Outward-facing steps stay gated.** Joining a real meeting, registering for a real webinar, sending an alert mail, scanning a WhatsApp QR, changing the build
  trigger or pushing master are human-approved actions; a row cannot be passed by having skipped the approval.

## Criteria (one per launch row)
- **[G01] [LIVE-ONLY] Public web, sign-in, Ask.** From a phone on mobile data at `https://kb.vidysea.com/knowledgebase`: a new person signs up; the admin approves them as viewer;
  they sign in; they ask the pinned UC question; the answer carries a citation with speaker and start/end time; opening the cited turn lands on that turn; they sign out.
  The viewer cannot open admin, ingest, WhatsApp or meeting-bot pages. Scripted in `scripts/live-verify.mjs --base ...`.
  Tightened: (a) "mobile data" = a network outside the deployment's and the office network, recorded in the header; (b) "cannot open" = HTTP 401/403 on the API route and no
  data rendered on the page route, with the route proven to exist for an admin; (c) the signed-out session cookie gets 401 afterwards; (d) the script's own output states which
  steps it did NOT cover (phone network, sign-up, admin approval), so a green script alone is never read as G01; those steps are evidenced by the human or the checker.
  Script criteria: `live-verify-script.md`.
- **[G02] [LIVE-ONLY] Old link.** `www.vidysea.com/knowledgebase/...` redirects to the same path on the kb host.
  Tightened: an HTTP 3xx response with a `Location` on the kb host, for at least the root, one deep link and one link with a query string; no 200 shell, no meta/JS redirect; the
  final URL answers 200.
- **[G03] [LIVE-ONLY] Waiver defect.** The 14 archived UC probes and the checker's failing cases in `qa/verdicts/kb-ask-web-grounding-repair.md` pass; one live UC retest.
  Tightened: the offline corpus is `ask-condition-fidelity.md` [F1-C]; the live part is ONE UC question on the deployed revision, answered with the school-specific condition kept
  (or held), after a provider probe (policy .15-2).
- **[G04] [LIVE-ONLY] All 23 sessions.** 23 of 23 eligible; the 23 per-session controls and the 36 questions for the nine sessions pass (D-221).
  Tightened: "eligible" and "pass" are those of D-221's grading (direct evidence, correct named speaker, playable clock position); partial/unrelated passages are a fail. The
  manifest lists the nine sessions and the 36 questions by id before the run, and the 23 controls' ids. Measured on the deployed retrieval path, not a local replay.
- **[G05] [LIVE-ONLY] Retrieval.** `scripts/eval-recall.mjs` on `data/eval/golden-set.json`: above the new baseline, zero questions lost.
  Tightened: the "new baseline" is a number written to a committed file BEFORE the run, together with the list of questions answered at that baseline; "zero lost" = every
  question answered at baseline is still answered. No stored baseline = NOT-MEASURABLE, not PASS. The control and ceiling checks of `eval-baseline-control.md` still apply.
- **[G06] [LIVE-ONLY] Web fallback.** One live outside-knowledge question is answered, or returns an explicit "answered from our sessions only", never an error shown as "stale".
  Tightened: the response must carry either web-sourced citations or the explicit sessions-only statement in its `reason`/text; a response with empty sources and a stale/error reason
  fails (`ask-fast-rag.md` [C7]).
- **[G07] [LIVE-ONLY] Bot joins and records.** One real Meet joined by the Cloud Run bot with nobody clicking; a non-empty recording in the bucket; the session indexed into
  `MONGO_WORK_DB`. Then one calendar event starts a capture by itself.
  Tightened: (a) "nobody clicking" = no human action on the meeting's host/participant side after the invite beyond the pre-agreed admit policy, shown by the bot job log; (b) "non-empty" =
  `ffprobe` decodes it with duration greater than 0, not merely bytes greater than 0; (c) the session is read back from `MONGO_WORK_DB` (read-only query), never a production database;
  (d) the calendar-started capture is a second, separate event whose job record shows trigger = calendar, with no manual start command in the log.
- **[G08] [LIVE-ONLY] Bot refusal.** The host refuses the bot: the capture ends in under 30 s with `admission_denied`, no zero-byte file, one alert mail.
  Tightened: 30 s is measured from the bot's join attempt to the terminal state, both from job-record timestamps; no media object of any size is left in the bucket for that job; exactly one
  alert mail reaches the configured address (a duplicate is a fail).
- **[G09] [LIVE-ONLY] Calendar.** Hosted `GET /calendar/upcoming` returns 200 with Umesh's next meeting within 10 minutes; the Calendar page shows it.
  Tightened (the row is ambiguous on "within 10 minutes"; the checker holds the conjunction of both readings until the owner picks one, see HUMAN_GATE-REQUEST in the fold-in
  report): the 200 response lists the next real event of Umesh's calendar and states a sync time at most 10 minutes old, and the Calendar page renders the same event.
- **[G10] [LIVE-ONLY] Auto-registration.** The bot registers for one real public webinar; the confirmation mail arrives.
  Tightened: the webinar and the registering identity are named and approved by Umesh before the run (GI6); the confirmation mail is read by message id and timestamp, no body content in evidence.
- **[G11] [LIVE-ONLY] WhatsApp linking.** Umesh scans the QR on the hosted link screen; one group message appears in the archive database.
  Tightened: the scan is Umesh's action; the checker verifies by reading the existing separate archive database (D-227 fixed choice 3, read-only) for one message newer than the scan,
  recording its id and timestamp only.
- **[G12] [LIVE-ONLY] WhatsApp into the knowledge base.** A message sent in a tracked group shows on the hosted WhatsApp page without a manual run.
  Tightened: the header proves no manual ingest/run command was issued between the send and the appearance (scheduler or worker log, with timestamps); the page shows the message id sent.
- **[G13] [LIVE-ONLY] Speaker names.** 100 citations from the 92-question replay plus 30 claims, audited by a second reviewer: 0 wrong names; at least 85% of cited turns show a confirmed full name.
  Tightened: (a) the 100 citations and 30 claims are drawn and frozen (ids + hash) before the audit; (b) the second reviewer is independent of whoever produced the speaker resolution and of
  the first reviewer, and is recorded by name; (c) "confirmed full name" = the speaker mapping carries the confirmed state of the speaker-resolution contracts and the displayed name has a given and a
  family name; (d) any wrong name is a fail of the row, not a percentage.
- **[G14] [LIVE-ONLY] Claims.** At least 90% of claims cited in the 92-question replay are human-verified or machine-checked; the 300-claim audit meets the approved bar.
  Tightened: numerator and denominator are reported; "approved bar" = a thresholds file whose status is `approved` (see `extraction-scoring-harness.md` [D2H-B]); while the bar is `proposed`,
  the 300-claim half is NOT-MEASURABLE-PENDING-APPROVAL, never PASS.
- **[G15] [LIVE-ONLY] Counsellor page.** On the deployed build: 10 scripted questions, each with a named-speaker citation whose click lands on the cited turn, at least one real microphone turn
  spoken back. 10 of 10.
  Tightened: the questions are scripted in a committed file; "real microphone" = a person speaking into a real input device, not injected audio or a file upload; the spoken-back reply is
  heard/recorded; evidence stores no raw voice, only the transcript hash and a yes/no per turn.
- **[G16] [LIVE-ONLY] Championship rehearsal.** 92 of 92 questions frozen, answered, baselined and judged on a work copy.
  Tightened: "frozen" = the question list hash committed before any answer; "answered" = an answer record per question; "baselined" = a baseline answer per question; "judged" = a pairwise
  verdict per question from `pairwise-answer-judge.md` that is not `error`. The work copy is `MONGO_WORK_DB`; any write outside it fails the row.
- **[G17] [LIVE-ONLY] Database hardening.** Rehearsal: the check in row 1 passes through an authenticated connection; unauthenticated `listDatabases` is refused; the app user cannot read other databases.
  Tightened: the rehearsal instance is named in the header and is not the production Mongo server; probing the production server needs a separate human approval (hard boundary: production Mongo is
  read-only and shared). The G01 flow is re-run against the hardened rehearsal with the deployed build.

## Invariants
- **[GI7] One row, one check.** A row is not split into extra gating checks by the maker; a finding that belongs to no row is filed (`qa/issues.jsonl`) and not built (D-227).
- **[GI8] A row never passes on a skipped or not-measured step.** `NOT-MEASURABLE` and `NOT-EVIDENCED` are reported verbatim and keep the row open.

## Out of scope / ignore
Consent (D-210: backend team). Production hardening of the real Mongo server, DNS and load-balancer cutover steps (D-227 lanes; separate approvals). Row-by-row build work belongs to the units, not this contract.

## Amendment log
- 2026-11-25 · routine · created from the 17 approved rows, adding LIVE-ONLY scope (GI1-GI8) and "Tightened" clarifications; no row weakened · folds inbox entry "17 acceptance checks for go-live" (D-227)

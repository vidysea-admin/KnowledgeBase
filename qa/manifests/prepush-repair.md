# Manifest — prepush-repair

**Contract:** none (repair of RED pre-push step 6c; qa/verdicts/prepush-6c-2026-10-28.md items 2, 4, 5, 6-9)
**Goal task:** none
**Date:** 2026-10-28
**Status:** checked-PASS (qa/verdicts/prepush-repair.md, cycle 0, 2026-10-28)
**Fix cycle:** 0 of max 2
**Dual check:** not required
**Persona walk:** skip (no new screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Branch / worktree:** wave/prepush-repair at D:/KnowledgeBase/.worktrees/prepush-repair (base 0a26796a, baseline worktree b3eabbee removed after use)

## Criteria
- **A** lint-loc is green: `apps/api/src/knowledge-outputs/workbench.test.ts` was 402 non-blank lines against the 400 budget (claims-citable-needs-review, 6d2d9366). Split into cohesive files; no assertion removed or weakened; budget not raised.
- **B** apps/api `gws-gmail.test.ts` "actual Gmail acquisition requires source year ..." (3 !== 6 rows) is root-caused and fixed.
- **C** test:webinar reds root-caused: `source-discovery.test.mjs` (3 failures) and `session-inputs.test.mjs:126`.
- **D** `qa/checkpoints/baseline-reds.md` records only reds shown failing at b3eabbee with the same message.

## What changed
- **A** apps/api/src/knowledge-outputs/workbench.test.ts (402 -> 329 non-blank): shared fixtures (`turn`, `claim`, `input`, `fixture`, `refuses`) moved verbatim to the new apps/api/src/knowledge-outputs/workbench-fixture.ts (non-test helper, exported; 38 lines, under the 300 source budget); the five D-201 needs-review tests moved verbatim to apps/api/src/knowledge-outputs/workbench-needs-review.test.ts. Test count old vs new: 28 -> 23 + 5 = 28; `assert` call count unchanged by construction (blocks moved, not edited). Directory knowledge-outputs 14 -> 16 files (budget 30).
- **B** apps/api/src/gws/gws-gmail.test.ts, test at :304 only: event dates `October 27/28, 2026` -> `October 27/28, 2099` and expected `rows[0].startTime` `2026-10-27T19:00:00.000Z` -> `2099-10-27T19:00:00.000Z` (PDT, same 19:00Z). Product code untouched for B.
- **C1** apps/api/src/gws/gws-gmail.ts (two regexes, in place): `fetchOne` attachment-subject gate (:153) and `eventTopic` (:213) now include `educator dialogues|in[- ]focus`, the vocabulary already in MEETING_QUERY and `classifyWebinarInvite`.
- **C2** scripts/webinar/source-discovery.test.mjs (three tests aligned with the contract f6bf0597 deliberately changed, see Root cause C).
- **D** qa/checkpoints/baseline-reds.md (new).

## Root cause
**B (NOT a product regression; a time-bomb test).** The test hard-codes `October 27, 2026 at 12 PM PT`. `classifyMeetingKind` (gws-gmail.ts:~125, unchanged by this unit, covered by its own tests "a PAST startTime with no recognised recording signal means past-recording") returns `past-recording` for a past `startTime` and `fetchOne` then excludes the row. f6bf0597 landed 2026-10-27 20:27 IST when Oct 27 19:00Z was still the future; on 2026-10-28 the invite/reminder/different rows (Oct 27) became past and 3 of 6 rows vanished. Proof: (1) the test does not exist at b3eabbee (33 tests there, 42 at head; baseline run `node --test --import tsx src/gws/gws-gmail.test.ts` exit 0, 33/33), so it cannot be a baseline red; (2) at head, with the clock pinned to 2026-10-27T10:00Z (`NODE_OPTIONS=--import fakeclock.mjs`, a Date subclass; scratchpad only) the UNCHANGED test passes 42/42, and without the pin it fails 3 !== 6. D-192..D-198 do not govern Gmail timing semantics; the intended behaviour is the one pinned by the classifyMeetingKind tests, so only the fixture dates move (protected test change: expected value shifts by 73 years for the same wall-clock/zone, no weakening).

**C source-discovery (3 failures; f6bf0597 is the owner, mixed outcome).** Baseline b3eabbee: 10/10 pass; head: 3 fail.
1. "each classifier-positive vocabulary form is discoverable ..." — two causes. (a) Stale fixture: body `Details https://events.unknown.org/live` carries no join, registration or YouTube evidence, which f6bf0597's invitation filter now excludes (gws-gmail.test.ts was updated to the same contract: "Webinar invitation" subjects plus register links). Fixture body changed to `Register https://events.unknown.org/register`. (b) REAL PRODUCT REGRESSION: with (a) fixed, "Educator Dialogues", "In Focus" and "In-Focus" were still excluded because the new `eventTopic`/attachment-subject regexes omitted two series names that MEETING_QUERY and `classifyWebinarInvite` define as webinars (In Focus is the TOC series name). Fixed in gws-gmail.ts (C1). All 7 vocabulary forms now discoverable.
2. "discovery retains old invitations and unknown platforms ..." — "Gmail discovery unavailable" came from the mock's own `doesNotMatch(newer_than:)` assertion throwing inside the scan: f6bf0597 deliberately adds `newer_than:30d` (gws-gmail.test.ts asserts `/newer_than:7d$/` and `q === "newer_than:30d"`). Test now asserts the bounded lookback; "unknown" mail carries a registration link (retained, no meetingUrl, no startTime); "personal" (no recognised link) is now filtered, so the candidate list is `["old","unknown"]` and the selection assertion becomes "personal is absent". Launch-evidence assertions (no meetingUrl/startTime/endTime on the unknown row, `toSchedule.length === 0`) are kept.
3. "authenticated Calendar discovery retains tombstones while default UI excludes them" — default `/calendar/upcoming` now returns the full inventory (apps/api/src/routes/calendar.ts, f6bf0597; pinned by the new calendar.test.ts test "default Calendar inventory retains missing-link, cancelled and unanswered events"). Assertion changed from `["live"]` to `["deleted","registration","live"]`; the `discovery=` query-guard assertions and the 401 check are untouched.

**C session-inputs.test.mjs:126** ("captured media cannot bypass validation or exceed measured duration at sync", not the tombstone test): FAILS IDENTICALLY AT b3eabbee (`Known capture lacks durable consent/media proof; provider refused`, private-recording.mjs:70, hash e15b8e662e7d). Not a regression of this range; recorded as a baseline red, not fixed here (file and its modules untouched since baseline).

**D** Of the 8 candidate reds: start-record-detached, process-video, activity-health/router, lean-video-ffmpeg (7), controller-bridge (3), KnowledgeSpeakerProfilePage pin, session-inputs:126 fail at b3eabbee with the same normalized message, so they are baselined. start-calendar-attendance fails at baseline for the same environmental reason (pwsh absent) but with different messages, so it is NOT baselined (see the file's "Examined" section). ConnectorsPage PASSES alone at b3eabbee and at head: a load flake, not a baseline red and not a regression.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 6 files + 1 doc, 3 repairs, est 45 min, single builder, per-file node --test runs (multi-file stalls on this machine), no checker dispatch by the builder
slow-plan: baseline worktree install plus per-file runs at two trees on a loaded machine (single-file runs of 20-110 s each); the round cannot be smaller without skipping the b3eabbee proofs the brief requires
Tier: M (test split, one regex vocabulary edit in a non-tenancy filter; no auth, tenancy, write or schema change)
Base / checked state: base 0a26796a; code commits f0df8965, 6f045132, 6eff4909 on wave/prepush-repair (the manifest and baseline-reds commit follow and touch only qa/).
Affected tests: knowledge-outputs workbench x2; gws-gmail, public-webinars, meeting-candidates (apps/api); webinar source-discovery and scheduler/deps-runtime (consumers of gws-gmail). No full suite run.
Independent review: NOT run by the builder; the checker owns review (the writer never reviews its own output).
Known limits: the eventTopic regex still keys on a fixed vocabulary; any new series name must be added to MEETING_QUERY, classifyWebinarInvite and this filter together.

Tests[A]: apps/api/src/knowledge-outputs/workbench.test.ts (23 tests, was 28 with the 5 below); apps/api/src/knowledge-outputs/workbench-needs-review.test.ts (5 tests, moved verbatim: "[D-201] needs-review-only evidence ...", "verified citation is labelled verified ...", "stored citations without claimStatus ...", "verified claims rank before needs-review ...", "refuse policy refuses needs-review citations ..."); scripts/lint-loc.mjs
Tests[B]: apps/api/src/gws/gws-gmail.test.ts::"actual Gmail acquisition requires source year for scheduling identity and refuses receipt-inferred time" (42/42 in file); classifyMeetingKind tests in the same file (unchanged)
Tests[C]: scripts/webinar/source-discovery.test.mjs::"each classifier-positive vocabulary form is discoverable without a known host or sender" (all 7 forms incl. Educator Dialogues / In Focus / In-Focus), "discovery retains old invitations and unknown platforms without fabricating launch evidence", "authenticated Calendar discovery retains tombstones while default UI excludes them"; consumers apps/api/src/routes/meeting-candidates.test.ts, scripts/webinar/scheduler/deps-runtime.test.mjs
Tests[D]: none needed — documentation of measured baseline results; reproduction commands are in qa/checkpoints/baseline-reds.md

Pre-check[A]: 6eff4909 node scripts/lint-loc.mjs; node --test --import tsx apps/api/src/knowledge-outputs/workbench.test.ts; node --test --import tsx apps/api/src/knowledge-outputs/workbench-needs-review.test.ts -> exit 0, lint-loc OK (1812 files), 23 passed + 5 passed t=3 blobs=apps/api/src/knowledge-outputs/workbench.test.ts:24f8887a,apps/api/src/knowledge-outputs/workbench-needs-review.test.ts:9a21657d
Pre-check[B]: 6eff4909 node --test --import tsx apps/api/src/gws/gws-gmail.test.ts -> exit 0, 42 passed t=1 blobs=apps/api/src/gws/gws-gmail.test.ts:1e07aab4
Pre-check[C]: 6eff4909 node --test --import tsx scripts/webinar/source-discovery.test.mjs; node --test --import tsx apps/api/src/routes/meeting-candidates.test.ts; node --test --import tsx apps/api/src/gws/public-webinars.test.ts; node --test --import tsx scripts/webinar/scheduler/deps-runtime.test.mjs -> exit 0, 10 passed + 23 passed + 16 passed + 13 passed t=4 blobs=scripts/webinar/source-discovery.test.mjs:43928bed,apps/api/src/gws/gws-gmail.ts:330a5be6
Pre-check[D]: 6eff4909 git diff --stat b3eabbee HEAD -- qa/checkpoints -> exit 0, baseline-reds.md only in the manifest commit; every row backed by a b3eabbee run (see file) t=1
Metrics: builder_min=45 mutants=0 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Falsifications
- B: pinned clock (above) shows the unchanged test passes at 2026-10-27T10:00Z and fails at 2026-10-28; with the 2099 dates it passes at any clock.
- C1: before the gws-gmail.ts edit the vocabulary test failed at "Educator Dialogues" (0 !== 1) with every other fix in place; after it passes 10/10. No mutation harness run (mutants=0), so no mutant can be left on disk.

## Typecheck
`npx tsc --noEmit -p tsconfig.json` in apps/api: exit 0 (before and after the C1 commit).

## Not fixed here (named, with owner)
- lint-dirsize packages/ask/src 31 and apps/api/src/answer-policy 31 files: owned by ask-fast-rag, another unit (this branch has neither the files nor the fix).
- docs/SNAPSHOT.md stale: regenerated at integration after the merges, per brief.
- start-calendar-attendance (pwsh absent) and the baseline reds in qa/checkpoints/baseline-reds.md: environment, no owner in range.

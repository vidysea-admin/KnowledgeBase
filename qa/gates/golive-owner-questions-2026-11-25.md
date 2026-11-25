# Gate — owner questions raised by the contracts fold-in of 2026-11-25 (commit c32c8bbc)
**Opened:** 2026-11-25 · maker session 3fb8d78b · source: /checker fold-in report (HUMAN_GATE-REQUEST 1-5)
**Asked:** once, in chat, 2026-11-25. None of these blocks wave 1 (L1, L2, F0, F1, D4, D2).
**Answer format:** the maker appends `Answered: <ISO> — Q<n> — <answer> — <where it was said>`.

## Q1 — claims thresholds and their denominators (contract extraction-scoring-harness.md, go-live row G14)
**Question:** approve or amend the proposed thresholds (plan section 7, D2) and say what "machine-checked tier" and "fact coverage" divide by.
**Blocks:** G14's 300-claim half (NOT-MEASURABLE until a thresholds file marked `approved` exists). Already listed in plan section 9 (People).

## Q2 — go-live row G09 wording: "returns 200 with Umesh's next meeting within 10 minutes"
**Question:** does "within 10 minutes" mean (a) a meeting added or changed on the calendar shows on the hosted page within 10 minutes, or (b) the next meeting starts within 10 minutes? The checker holds both until one is picked.
**Maker note:** the plan author meant (a), data freshness.
**Blocks:** the B11 live check only.

## Q3 — go-live row G10 against the 2026-09-26 inbox line "registration forms stay human"
**Question:** confirm that row 10 (the bot registers for one real public webinar) replaces that older line, and name the webinar and the identity that registers.
**Maker note:** webinar auto-registration was chosen as scope on 2026-11-25 (D-227); the plan says Umesh picks the first webinar.
**Blocks:** B12 only.

## Q4 — go-live row G13: second reviewer
**Question:** name a second reviewer who is independent of the speaker-resolution author and of the first reviewer.
**Blocks:** D1's audit. Already listed in plan section 9 (People).

## Q5 — F0: pointing the Cloud Build trigger at cloudbuild.yaml, and the first master push
**Question:** approve repointing the trigger and the first master push when F0 has passed its check (outward-facing; shown as a dry run first).
**Blocks:** F0's live check (F0-C5) and every merge to master. Already a gate in plan section 3.

## Q6 — Ask cost at public launch (raised by the code review of golive-launch-prep, 2026-11-25)
**Question:** with the per-user rate-limit key (L2) each signed-in user gets 60 requests per minute, and `POST /ask` has no separate per-tenant, daily or spend cap (`apps/api/src/routes/ask/ask.ts:44`; `usageRecorder` at `server.ts:138` only records). Before L2 a whole tenant shared 60 per minute. Choose: (a) launch as is, relying on admin approval of every account plus a spend alert or cap on the model provider keys; (b) add a lower Ask-specific per-user cap before launch (one small unit with its own check); (c) add that cap right after launch, in wave 2 with F4.
**Maker note:** recommendation (c), with the provider spend alert set on launch day. Every account is admin-approved, so the number of users is in the owner's hands.
**Blocks:** nothing in wave 1. If (b) is chosen it blocks L3.

## Q1 detail — what "approve the thresholds" has to settle (from the evaluation-design review of d2-extraction-harness, 2026-11-25)
The scorer is built (branch `wave/d2-extraction-harness`); its bar file says `status: proposed`, so it cannot give acceptance yet. The review found that a "pass" would not yet be trustworthy evidence for row 14. Ten small decisions, each with the maker's recommendation. "Approve the recommendations" answers all ten.

| # | Decision | Recommendation |
|---|---|---|
| a | Which metrics can fail row 14 | Four: fabricated citations (0), claim support (at least 95%), machine-checked (at least 98%), and the share of replay-cited claims that are human-verified or machine-checked (at least 90%; this is the row's own text and no code computes it yet). Fact coverage, topics and decisions are reported with their numbers but cannot fail the row: 6 and 10 sessions are too few for a pass/fail |
| b | A reviewer's "uncertain" label | A second person settles each one first. Any that remain count against the claim |
| c | Pass on the measured value, or on the low end of its range | On the measured value, with the 95% range printed beside it. At 300 claims a measured 95% means "between about 92% and 97%". A stricter rule needs a bigger sample and more reviewer hours |
| d | Which claims are scored | The persisted ones (what is live). The machine check runs on all 1,768, since it costs nothing |
| e | What "machine-checked" means | The quoted excerpt is found in the cited turn, not only "the citation points at a real turn" |
| f | How the 300 are picked | At random, in proportion to each session's claim count, with the seed and the list recorded in the export. Every claim cited in the 92-question replay is reviewed as well |
| g | Two reviewers disagreeing | Agreement on the 60 shared claims is measured with Cohen's kappa. Under 0.6 the result is "not measurable" until a third person settles the disagreements |
| h | Smallest set that counts | 300 labelled claims, and every sampled claim must carry a label (a skipped claim cannot leave the count) |
| i | What makes the bar "approved" | The bar file names the approver, the decision id and the gold file's hash. A gold file that does not say `synthetic: false` is treated as a test file |
| j | Who labels | Two reviewers for claims (the second blind to the first), one named person to settle ties, and one person who reads each transcript before seeing the extractor's topics and decisions. Names needed |

**Code gaps the review found** (one follow-up unit after these answers; lines are in the worktree `.worktrees/d2-extraction-harness`): `scripts/eval-extraction.mjs:171` (a file with no `synthetic` flag counts as real), `:175` (`acceptanceForG14` ignores `humanGoldVerified`), `:137-142` (a bar with one metric or `min: 0` is accepted, and anyone can type `approved`); `packages/index/src/eval/extraction.ts:108` against `:214` (two different stage orders), `:120` (a claim labelled at two stages counts twice), `:241` (raw agreement only, and no bar can use it); no range is printed anywhere, no sampling record is checked, and the replay-share metric does not exist. The code review of the same unit (Warning, three high) adds: a bar that lists only one metric still gives verdict `pass` and acceptance (`scripts/eval-extraction.mjs:146-158`); a case with no persisted, filtered or parsed stage silently drops out of the pooled metrics, which still read as measured (`packages/index/src/eval/extraction.ts:214-215`); duplicate case ids are accepted and double the counts (`:205-207`); a no-decision session without `predictedDecisions` is skipped (`:228`); and the tests at `scripts/eval/gold/eval-extraction.test.mjs:74` and `:78` pin the first two behaviours as correct, so the fix changes those tests on purpose.
**Blocks:** nothing in wave 1 or the launch. Row 14 only.

## Q7 — Calendar auto-refresh (unit T1): waive the D-014 round cap for T1 only?
**Question:** the delivery gate counts 11 earlier PASSed units that changed `apps/web/src/pages/CalendarPage.tsx` and `CalendarPage.test.tsx`. D-014 caps a non-security seam at 2 PASSes, and a waiver needs a DECISIONS entry with `Approved-by: Umesh`. T1 (`calendar-page-freshness`) is a roadmap feature, not a findings round: the open Calendar page refreshes by itself (plan section 4 row 9; D-242 item 6; D-243 item 2). Do you waive the cap for unit T1 only: one check of the auto-refresh feature, and no further rounds on the Calendar page? Reply "T1 waiver haan" to waive, or "T1 roko" to withdraw T1.
**Maker note:** the check is not dispatched until the waiver is recorded. Without it the unit is withdrawn and filed file-don't-fix. A waiver changes nothing for security-class findings, which are never capped.
**Blocks:** the check of T1 only (manifest `qa/manifests/calendar-page-freshness.md`, line `Round cap`). Status: open.

Answered: 2026-11-25T13:07+05:30 — Q6 — option (c): launch as is; the Ask-specific per-user cap is built right after launch, in wave 2 with F4; a spend alert on the model provider keys is set on launch day — Umesh in chat ("approve for all", in reply to the maker's two open asks: the browser-tool prompt and this recommendation); recorded as D-229.

**Gate status:** OPEN — Q1..Q5 and Q7 unanswered; Q6 answered.

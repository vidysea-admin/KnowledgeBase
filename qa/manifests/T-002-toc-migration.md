# Manifest — T-002 toc-migration

**Contract:** `qa/contracts/toc-migration.md`
**Goal task:** T-002
**Date:** 2026-09-03
**Fix cycle:** 1 of max 3

## What changed

Migrated all 23 real TOC session transcripts (`raw/TOC/TOC-Materials/Transcripts/*.content.md`)
into schema-v2 JSON under `data/toc-migrated/<sessionId>/{source,session,turns,session_page,
claims}.json`.

**Mechanical part (turns/source/session):** the 23 raw transcripts use three different
timestamp/speaker markdown formats (`**[mm:ss] Speaker:**`, `[mm:ss] **Speaker:**`, and
`` `[mm:ss]` **Speaker**: ``). A one-off local generator (not committed — it's not one of the
two deliverable scripts) stripped markdown noise, split each transcript's `## Full Transcript`
section into paragraph-level turns on the timestamp marker, and wrote `turns.json` (2,925
turns across 23 sessions), `source.json` (`captureMode: "provided"` per D-008, sha256 of the
raw file as `hash`), and `session.json` (title/date parsed from filename, `tenantId: "toc"`
matching the `packages/db` typecheck-test convention). Per C3, every turn's `speakerRef` is the
literal string `"unknown"` — even though the transcript text itself often names a speaker
inline — because these transcripts carry no real diarization; that's deferred to T-003.

**Real extraction part (session_page/claims — done by me, the maker, per D-005):** I read each
transcript's own `## Summary`, `## Speakers`, and `## Key Topics & Takeaways` sections plus
spot-checked the `## Full Transcript` body directly (not `KNOWLEDGE-BANK.md`, though I
cross-checked against it for at least 3 sessions per C5), wrote an independent 3-6 sentence
summary and 3-6 key insights per session, and 3-6 atomic claims per session (72 claims total).
**Every claim's `evidence[].turnId` was verified before being written** — I grepped each
session's actual generated `turns.json` for the fact's real wording (see the confirmed hits
below) and only cited a `turnId` after seeing the fact's text at that turn; `claims.status` is
`"needs-review"` throughout (verification is a separate downstream step per the contract's
non-goals).

One filename (`UK-Beyond-Offer-Letters.content.md`) is a duplicate/re-upload of the
`03rd-August-UK-Beyond-Offer-Letters.content.md` session (same speakers/content, noted already
in `KNOWLEDGE-BANK.md` line 131) — its captured transcript is shorter (49 turns vs 154). Per
the contract's file count (23 files -> 23 output dirs), I kept it as its own session
(`2026-08-03-uk-beyond-offer-letters-reupload`) rather than silently dropping it, and said so
plainly in its `session_page.json` summary rather than pretending it's independent content.

### 3 full `session_page.json` examples (for the checker's C5 cross-check against KNOWLEDGE-BANK.md)

**1. `data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/session_page.json`**
— cross-checks against `KNOWLEDGE-BANK.md` lines 25-29 (New Zealand: "8,000 Indian student
applications approved recently (~76% approval rate), target 27,000 by 2030"; "no NBFC/unsecured
loans"; France "capped €5,500"; Italy "700+ English-taught degrees", "SDM stamps rejected
outright").

```json
{
  "_id": "2026-04-21-visa-blueprint-part2-italy-france-nz-page",
  "tenantId": "toc",
  "sessionId": "2026-04-21-visa-blueprint-part2-italy-france-nz",
  "summary": "TOC hosted three destination specialists to walk counselors through student-visa mechanics for New Zealand, France, and Italy. Kshitij Garg (Estero Education) covered New Zealand's fully online e-visa process, its 76% 2025 approval rate against a 27,000-by-2030 target, and the rule that only nationalized-bank secured loans (never NBFC or unsecured loans) satisfy Immigration New Zealand's proof-of-funds test. Shagun Handa (Campus France) explained the Classes Internationales pathway (capped at EUR 5,500) and the two-year APS post-study permit for Master's graduates. Ruby Thomas (Uni-Italia) detailed Italy's strict three-tier document legalization chain, where a Sub-Divisional Magistrate (SDM) stamp is explicitly rejected in favor of the university-to-state-HRD-to-MEA apostille sequence.",
  "keyInsights": [
    "New Zealand: 76% of 2025 visa applications approved, government target is 27,000 Indian students by 2030.",
    "New Zealand funds test accepts only 4 sponsor types: secured loans from 14 nationalized banks, 3-month bank statements, 6-month-old fixed deposits, or Provident Fund withdrawals — NBFC and unsecured loans are outright rejected.",
    "France: Classes Internationales 1-year foundation-year tuition is capped at EUR 5,500; Master's graduates get a 2-year APS stay-back permit.",
    "Italy: 700+ English-taught degree courses; document legalization must go university -> state HRD -> MEA apostille, and an SDM stamp is explicitly not accepted."
  ],
  "evidence": [
    { "turnId": "2026-04-21-visa-blueprint-part2-italy-france-nz-t011", "sessionId": "2026-04-21-visa-blueprint-part2-italy-france-nz" },
    { "turnId": "2026-04-21-visa-blueprint-part2-italy-france-nz-t022", "sessionId": "2026-04-21-visa-blueprint-part2-italy-france-nz" },
    { "turnId": "2026-04-21-visa-blueprint-part2-italy-france-nz-t044", "sessionId": "2026-04-21-visa-blueprint-part2-italy-france-nz" },
    { "turnId": "2026-04-21-visa-blueprint-part2-italy-france-nz-t064", "sessionId": "2026-04-21-visa-blueprint-part2-italy-france-nz" },
    { "turnId": "2026-04-21-visa-blueprint-part2-italy-france-nz-t025", "sessionId": "2026-04-21-visa-blueprint-part2-italy-france-nz" },
    { "turnId": "2026-04-21-visa-blueprint-part2-italy-france-nz-t072", "sessionId": "2026-04-21-visa-blueprint-part2-italy-france-nz" },
    { "turnId": "2026-04-21-visa-blueprint-part2-italy-france-nz-t083", "sessionId": "2026-04-21-visa-blueprint-part2-italy-france-nz" }
  ]
}
```

**2. `data/toc-migrated/2026-05-08-funding-dreams-loans-forex/session_page.json`**
— cross-checks against `KNOWLEDGE-BANK.md` lines 35-41 ("Banks/portals markup forex 2-2.5%;
... FRR Forex do ~1%"; "only blood relatives (parent/sibling/spouse) can remit"; "Section 80E:
100% of education-loan interest tax-deductible"; "unsecured loans up to ₹1.5Cr abroad ...
tenure up to 20 yrs").

```json
{
  "_id": "2026-05-08-funding-dreams-loans-forex-page",
  "tenantId": "toc",
  "sessionId": "2026-05-08-funding-dreams-loans-forex",
  "summary": "A TOC panel on education financing paired forex specialists (Dev Mehta and Payal Chawla of FRR Forex) with an education-loan lender (Shweta Jain of HDFC Credila), moderated by Nikhil Jain of ForeignAdmits. The forex side explained that banks and portals like Flywire mark up currency conversion 2-2.5% versus FRR's roughly 1%, and that FEMA rules restrict who can remit money for a student's education to parents, siblings, and spouse. Credila covered unsecured loan ceilings (up to INR 1.5 crore abroad), 20-year repayment tenures, and the Section 80E tax deduction on loan interest. Both speakers stressed planning financing in two parallel tracks -- sourcing funds and moving funds -- starting at the university-shortlisting stage, not after an offer arrives.",
  "keyInsights": [
    "RBI-authorized Category II forex dealers like FRR Forex charge ~1% markup versus 2-2.5% at banks/Flywire -- a real cost saving on large remittances.",
    "FEMA rules: only mother, father, sibling, or spouse can remit funds abroad for a student's education (not grandparents, aunts, or uncles).",
    "HDFC Credila offers unsecured loans up to INR 1.5 crore for study abroad with tenures up to 20 years and no foreclosure penalty.",
    "Section 80E allows 100% of education-loan interest to be tax-deducted."
  ],
  "evidence": [
    { "turnId": "2026-05-08-funding-dreams-loans-forex-t037", "sessionId": "2026-05-08-funding-dreams-loans-forex" },
    { "turnId": "2026-05-08-funding-dreams-loans-forex-t029", "sessionId": "2026-05-08-funding-dreams-loans-forex" },
    { "turnId": "2026-05-08-funding-dreams-loans-forex-t074", "sessionId": "2026-05-08-funding-dreams-loans-forex" },
    { "turnId": "2026-05-08-funding-dreams-loans-forex-t080", "sessionId": "2026-05-08-funding-dreams-loans-forex" },
    { "turnId": "2026-05-08-funding-dreams-loans-forex-t018", "sessionId": "2026-05-08-funding-dreams-loans-forex" },
    { "turnId": "2026-05-08-funding-dreams-loans-forex-t030", "sessionId": "2026-05-08-funding-dreams-loans-forex" }
  ]
}
```

**3. `data/toc-migrated/2026-06-19-entrance-exams-pathways-india-part1/session_page.json`**
— cross-checks against `KNOWLEDGE-BANK.md` lines 81-88 ("12-13 lakh sit JEE Main, but only
~40,000 govt-funded seats"; "2.2M appear, 1.23M qualify ... only ~58-60K govt MBBS seats
(~1:40 ratio)"; "30-mark swing = 14,000-18,000 AIR rank swing"; "Tie-break order: Biology ->
Chemistry -> Physics").

```json
{
  "_id": "2026-06-19-entrance-exams-pathways-india-part1-page",
  "tenantId": "toc",
  "sessionId": "2026-06-19-entrance-exams-pathways-india-part1",
  "summary": "Anurag Tiwari (Sparkle Edventure) and Chirag Khutia (ConsultCK), moderated by Ambika Vasudev, walked TOC counselors through the real scale of India's engineering and medical entrance competition. On engineering, Tiwari framed JEE as roughly 12 lakh candidates competing for about 40,000 government-funded NIT/IIT/IIIT/GFTI seats. On medicine, Khutia explained that NEET's roughly 58-60,000 government MBBS seats produce a 1:40 competition ratio, that the NEET tie-break order is Biology then Chemistry then Physics, and that a 30-mark swing can move a candidate's rank by tens of thousands. Both speakers pushed back on treating a repeat/drop year or a dummy school as a default choice, and gave counselors a due-diligence checklist for private medical colleges.",
  "keyInsights": [
    "JEE: roughly 12 lakh candidates compete for only about 40,000 government-funded engineering seats (NIT/IIT/IIIT/GFTI combined).",
    "NEET: government MBBS seats (~58-60,000) create a 1:40 competition ratio against qualified candidates.",
    "NEET tie-break order is Biology score, then Chemistry, then Physics.",
    "A 30-mark difference in NEET score can swing All India Rank by roughly 14,500+ places."
  ],
  "evidence": [
    { "turnId": "2026-06-19-entrance-exams-pathways-india-part1-t017", "sessionId": "2026-06-19-entrance-exams-pathways-india-part1" },
    { "turnId": "2026-06-19-entrance-exams-pathways-india-part1-t018", "sessionId": "2026-06-19-entrance-exams-pathways-india-part1" },
    { "turnId": "2026-06-19-entrance-exams-pathways-india-part1-t051", "sessionId": "2026-06-19-entrance-exams-pathways-india-part1" },
    { "turnId": "2026-06-19-entrance-exams-pathways-india-part1-t060", "sessionId": "2026-06-19-entrance-exams-pathways-india-part1" },
    { "turnId": "2026-06-19-entrance-exams-pathways-india-part1-t059", "sessionId": "2026-06-19-entrance-exams-pathways-india-part1" }
  ]
}
```

## How to verify

```bash
# C1 — 23 sessions
ls data/toc-migrated | wc -l                      # expect 23

# C2/C3/C4 — schema validation + turnId join, real generated docs (not fixtures)
python scripts/validate-toc-migration.py           # expect "PASS" at the end

# C5 — spot check the 3 sessions above against raw/TOC/TOC-Materials/KNOWLEDGE-BANK.md
#   (lines 25-29, 35-41, 81-88 respectively — see quotes above)

# C6 — seed script dry-run, no live Mongo
node scripts/seed-toc.mjs --dry-run

# C7 — no regression
python schema/validate.py                          # expect "PASS: 19 collection schema(s)..."
pnpm lint:structure                                 # expect all green, ends "no dependency violations found"
```

## Actual outputs (verbatim)

```
$ ls data/toc-migrated | wc -l
23

$ python scripts/validate-toc-migration.py
[... per-file checks omitted here, see full run below ...]
Checked 23 session(s), 2925 turn(s), 72 claim(s).
PASS: all toc-migrated documents validate and every evidence[].turnId joins to a real turn.

$ node scripts/seed-toc.mjs --dry-run
seed-toc --dry-run: 23 session(s) under data/toc-migrated/
  sources:       23
  sessions:      23
  turns:         2925
  session_pages: 23
  claims:        72
No Mongo connection attempted (--dry-run).

$ python schema/validate.py
OK: api_keys — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: chunks — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: claims — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: consent_policies — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: decisions — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: features_event — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: graph_edges — valid fixture passes, invalid fixture correctly rejected (2 error(s))
OK: jobs — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: media — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: orgs — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: programs — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: session_pages — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: sessions — valid fixture passes, invalid fixture correctly rejected (3 error(s))
OK: sources — valid fixture passes, invalid fixture correctly rejected (5 error(s))
OK: speakers — valid fixture passes, invalid fixture correctly rejected (2 error(s))
OK: tenants — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: topics — valid fixture passes, invalid fixture correctly rejected (1 error(s))
OK: tree_index — valid fixture passes, invalid fixture correctly rejected (2 error(s))
OK: turns — valid fixture passes, invalid fixture correctly rejected (3 error(s))

PASS: 19 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (89 file(s) within budget)
lint-dirsize: OK (53 dir(s) within budget)
lint-root: OK (13 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (145 unique export(s), 19 unique schema $id(s))
lint-migrations: OK (613 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (107 lines, budget 200)

✔ no dependency violations found (98 modules, 245 dependencies cruised)
```

(`docs/SNAPSHOT.md` was regenerated via `node scripts/snapshot.mjs` and staged alongside
`data/` — the committed structure snapshot has to reflect the new `data/toc-migrated/` tree
or `lint:structure`'s `snapshot.mjs --check` step fails on a clean checkout.)

## Known limitations (honest, not hidden)

- `turns.json` `tStart`/`tEnd` are derived from the transcript's own `[mm:ss]` markers in
  paragraph order — real timestamps from the source recording, but not independently
  re-verified against audio; the last turn in each session gets a synthetic `tEnd = tStart +
  45s` since there's no next-turn boundary to derive it from. Documented limitation per C3,
  closed later by real diarization (T-003).
- `speakerRef` is `"unknown"` on every one of the 2,925 turns, honestly, even where the turn's
  own `text` field contains an inline speaker name (the transcripts weren't diarized) — per C3
  this is deliberate, not an oversight.
- `scripts/seed-toc.mjs`'s live (non-`--dry-run`) path cannot insert `session_pages` documents
  yet — `packages/db/src/collections/` only has accessors for `sources`, `sessions`, `turns`,
  and `claims` (no `session_pages.ts`). The script says so in a comment and reports 0 inserted
  for that collection in live mode rather than silently guessing at a wrong collection name or
  bypassing tenant scoping with a raw driver call. `--dry-run` (the mode required to PASS C6)
  is unaffected — it reports the real count of 23 `session_pages` documents that exist on disk.
- `2026-08-03-uk-beyond-offer-letters-reupload` is a shorter-transcript duplicate of
  `2026-08-03-uk-beyond-offer-letters` (same live session, per `KNOWLEDGE-BANK.md`) — kept as
  its own session per the 23-file scope, and labeled as a duplicate in its own summary rather
  than presented as independent content.

## Status: checked-PASS
Verdict: qa/verdicts/T-002-toc-migration.md (Cycle checked: 1, commit b59e0ff) — 7/7 criteria met; content genuinely grounded, no fabrication found.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

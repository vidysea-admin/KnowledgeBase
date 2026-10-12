# Verdict: t042-self-introduction-fusion

VERDICT: FAIL
Cycle checked: 0
Commit checked: 8a1155f (lane/t042fusion)
Scope: new pure module `packages/index/src/pipeline/speaker-tile-fusion.ts` + test; unwired.

## EXPLANATION

The agreement logic and the reuse of the PH3 guards are sound. The unit fails on one point: a name taken from the meeting tile alone is trusted with no person-shape check, so organisation, role and device names ship as speaker names by default.

- Tile-only (FAIL, ISS-T042FUSION-001 high): through the REAL aligner (60 s single label, turn text with no introduction) the fusion returns `named ... tile-only` for "Vidysea", "Acme Corp", "Sales Team", "Admissions", "Marketing", "Support", "Office", "Student", "Parent", "Tablet", "Samsung S21", "Redmi Note 9", "User 1", "J", "Q&A", "Otter.ai", "hello@vidysea.com", "Rahul | Vidysea", "Priya (Vidysea)", "Priya Nair (she/her)", "Careers Counselor", "Dr. Priya", "Mr. Rahul Verma". Only the aligner's small non-person list filters: iPhone, Guest, Room 3, Zoom User, Admin, Unknown, Meeting Room, phone numbers, MacBook/Galaxy forms were refused. `fuseSpeakerNames` adds no name-shape check on the tile name and no test uses a junk tile. `allowTileOnly` defaults true. The manifest admits the exposure as an owner decision, but a quote attributed to "Sales Team" is a wrong name shipped by default.
- Agreement (correct, one test gap): "Raj" vs "Rajesh Kumar" false; "Raj Kumar" vs "Rajesh Kumar" false; "Ana" vs "Anaïs" false; tile "Priya Nair" + intro "I'm Priya Sharma" -> none `tile-intro-conflict`; tile "Raj" + intro "Rajesh Kumar" -> none. Whole-token containment holds ("Priya" in "Priya Nair", "Dr. Priya" ~ "Priya", fullwidth Ｐriya ~ Priya, STRASSE ~ straße; "Priya." and "Priya-Nair" do not agree: stricter, safe). Weak points (low, ISS-T042FUSION-003): single-token "Dr" or surname "Kumar" agrees with a fuller intro; a returned name may carry a title ("Dr. Priya"). Substring mutant survives (ISS-T042FUSION-002 medium).
- PH3-006 count: the ledger row records 17 forms x 5 names (Nikhil, Priya, Makrand Rajadhyaksha, Paris, Moderator) = 85, plus the Makrand case. The earlier 121 (17 x 7 + 2) used two extra names the earlier checker added; 85 is the row's own corpus. All 17 forms and the Makrand sentence are in the replay and a test asserts each literal appears in the ledger row. Re-run: PH3-004 98/98, PH3-006 85/85, Makrand: no names, no turn name. Nothing recorded is missing.
- Turn/label mapping: intro evidence comes only from turns whose `speakerRef` is the label; each turn judged alone; tile evidence is keyed by the same `speakerRef`. Two different introductions in one label -> `intro-names-conflict`; the same intro on two labels -> both refused. Residual (low): a merged label with a single introduction names all its turns. Moderator hand-overs ("Next up, this is Priya Nair.", "Hi Priya, this is Rahul Verma speaking.") yield no evidence. The fusion does not check that tile `turnIds` belong to the passed turns (caller contract).
- Counts: test file 14/14; `tsc --noEmit` in packages/index exit 0; depcruise `no dependency violations found (146 modules, 365 dependencies cruised)`.
- Mutations (own harness, per-mutation byte backup in `finally`, 240 s timeout, hash change verified): M1 substring agreement -> SURVIVED (14/14; gap, ISS-002); M2 tile wins on tile-intro conflict -> KILLED; M3 drop `citesNameAsSelfIdentification` guard -> KILLED (3 fail). "Accept tile-only junk" is not mutable: no filter exists to remove, which is the FAIL above.
- After: both files' blobs equal `git rev-parse HEAD:<file>`; harness and probes deleted; worktree clean apart from this verdict and the issue file.

Fix needed for PASS: gate tile-only on a person-shape check (or default `allowTileOnly` false), add the junk names as must-refuse tests, and pin Raj/Rajesh Kumar and Priya Nair/Priya Sharma.

ISSUES-WRITTEN: ISS-T042FUSION-001 (high), ISS-T042FUSION-002 (medium), ISS-T042FUSION-003 (low)

# Manifest — u1-toc-sept-catchup

**Contract:** none exists for an ad hoc catch-up ingest of already-downloaded TOC session
recordings. Closest precedent: `qa/manifests/webinar-bot-live.md` (D-027/D-028 — real Gemini
transcription + `indexSession` production binding for a recording-kind, self-transcribed
session) and `qa/manifests/T-002-toc-migration.md` / `toc-transcription-scale-up.md` (T-002/T-003
— the `data/toc-migrated/<id>/` folder shape + `transcribe-long-session.mjs` + `seed-toc.mjs`
chain the original 23 sessions went through).
**Goal task:** none (ad hoc unit; Umesh approved "fully automatic": download → Gemini transcribe
→ Mongo). `qa/.last-tick` (main tree, not part of this diff) records: "TOC Sept download DONE
(4/4 size-verified, 2.12 GB) → U1 toc-sept-catchup builder dispatched (lane
u1-toc-sept-catchup)".
**Date:** 2026-09-25
**Fix cycle:** 0 of max 3
**Dual check:** no
**Issues addressed:** none (found+fixed **ISS-U1-1** during this unit — see below)
**Executor:** claude-sonnet-subagent
**Executor rationale:** long-running real Gemini transcription (4× ~65–73 min recordings) +
Mongo writes to a live shared tenant; kept on the Claude lane per the delegation rule ("never
delegate to an Ollama lane: ... anything touching production").

## Which pipeline was reused, and why

Checked three candidates per the brief:

- **`scripts/seed-toc.mjs`** (T-002) — bulk-loads `data/toc-migrated/<id>/{source,session,turns,
  session_page,claims}.json` via `insertOne` (no upsert) for every directory. Used AS-IS for the
  final Mongo write, but **scoped**: the whole-directory scan is unsafe to re-run once 27 sessions
  are already live (a second `insertOne` on an existing `_id` throws). Extended in place with an
  additive `--sessions <id1,id2,...>` filter (backward-compatible — omitted, behavior is byte-
  identical to before) so this unit touches only its own 4 new directories. See "What changed".
- **`scripts/webinar/sync-session.mjs`** (D-027/D-028) — designed for BOT-captured, SILENTLY
  recorded sessions that need a hand-checked `meta.json` (people/org/country resolution) to build
  deterministic knowledge-graph edges. These 4 recordings are **organizer-provided** (TOC's own
  members Drive folder, `captureMode: "provided"` — H8's preferred capture mode), not silently
  captured, and no speaker/org roster exists to hand-author a `meta.json` for them. Not the right
  fit for the write step, but its **`--index` flag's binding is exactly right** and was reused
  directly (see next bullet) — `apps/api/src/production.ts`'s `buildIndexer(routing)`, the same
  production `indexSession` path `sync-session.mjs --index` calls.
- **`scripts/sync-real-turns.mjs`** (T-003 phase 3) — only replaces turns for sessions ALREADY
  seeded via `seed-toc.mjs`'s placeholder pass. Not needed here: these 4 sessions never had a
  placeholder pass (no provided transcript document exists to seed one from) — real diarized
  turns were written directly by `transcribe-long-session.mjs` before the first (and only)
  `seed-toc.mjs` insert.

**Net:** folder shape + `seed-toc.mjs` (T-002 lineage, `--sessions`-scoped) for the write, plus
the indexing step `sync-session.mjs --index` uses (`buildIndexer` from `apps/api/src/production.ts`)
invoked directly — the same production binding, no second implementation.

## What changed

- `scripts/seed-toc.mjs`:19-27,44-51,96 — additive `--sessions <id1,id2,...>` CLI filter. Absent,
  `loadSessionDocs()` scans every directory exactly as before (unchanged default). Present, it
  scopes to exactly the named session directories and throws naming any missing one, so a typo
  can never silently seed zero or the wrong set.
- `packages/ai/src/stt/gemini-file-upload.ts`:151 — one-character fix,
  `speakerRef.length > MAX_PLAUSIBLE_SPEAKER_LABEL_LENGTH` → `>=`. Real off-by-one found live in
  this unit's own freshly-transcribed data (**ISS-U1-1**, found+fixed, see below).
- `packages/ai/src/stt/gemini-file-upload.test.ts` — one new regression test for the exact
  60-char boundary (the existing test suite covered "way past 60" and "well under 60", never the
  boundary itself).
- `data/toc-migrated/2026-09-02-india-test-series-part2/{source,session,turns,session_page,
  claims}.json` (**new**) — India Test Series – Part II.
- `data/toc-migrated/2026-09-09-global-test-prep-pathways/{source,session,turns,session_page,
  claims}.json` (**new**) — Mastering Global Test Pathways.
- `data/toc-migrated/2026-09-16-pathways-in-psychology/{source,session,turns,session_page,
  claims}.json` (**new**) — Dear Psychology, What Can't You Do? (turns.json carries the
  ISS-U1-1 manual repair on turn `t280` — see below).
- `data/toc-migrated/2026-09-21-uniaccess-japan/{source,session,turns,session_page,claims}.json`
  (**new**) — UniAccess: Japan (identity determined from transcript content, not filename — see
  "Identifying video1968958572" below).
- `qa/issues.u1.jsonl` (**new**, this lane's ledger per D-019) — ISS-U1-1.
- `raw/TOC/TOC-Materials/Audio/{2nd-September-India-Test-Series-Part-2,
  9th-September-Global-Test-Prep-Pathways, 16th-September-Pathways-in-Psychology,
  21st-September-UniAccess-Japan}.m4a` — **gitignored** (`raw/TOC/TOC-Materials/Audio/` in
  `.gitignore`), extracted in the MAIN tree, never copied into this worktree, per the brief.
  `ffmpeg -vn -c:a aac -b:a 96k -ar 48000 -ac 2` (matched to an inspected existing file:
  `27th-August-In-Focus.m4a` is 48 kHz/stereo/AAC/~82–90 kbps; no committed extraction script
  exists to match exactly, so 96k VBR-ish AAC at the same sample rate/channel count was used —
  close enough that Gemini transcribed all 4 cleanly).
- **Not touched:** `contracts/`, `packages/db`, `apps/api` routes, `apps/web`, any OTHER session's
  files, `.goal/goal.json`, `qa/.last-tick`, `qa/feedback-inbox.md`, `qa/gates/*` — those showed as
  modified in `git status` at session start (concurrent lane activity, U0 zoom-browser-join
  running in a sibling worktree per `qa/.last-tick`'s own dispatch line) and are excluded by this
  commit's pathspec.

## ISS-U1-1 — found + fixed during this unit

**What:** `parseDiarizedTranscript`'s "implausible speaker capture" guard
(`packages/ai/src/stt/gemini-file-upload.ts`, real bug class from 2026-09-04) used
`speakerRef.length > 60`, so a garbled capture of **exactly** 60 characters slipped through as a
real `speakerRef` instead of being recovered as text. Found live: a routine spot-check of the
2026-09-16-pathways-in-psychology transcript (part of this unit's own quality verification, not a
checker) turned up turn `t280` with `speakerRef: "through any of the three intakes in a year.
[32:41] Anuradha"` — a 60-character sentence fragment, not a name.

**Fix.** `>` → `>=` (one character). Confirmed with the real 60-char string before and after
(D-020 falsification, byte-backup + trap on EXIT/INT/TERM/ERR):

```
$ node --import tsx -e "... parseDiarizedTranscript('[00:00] Anuradha: intro text here. [00:05] ' + garbled + ': Psychology would only have one intake.')"
# BEFORE fix:
{ "speakerRef": "through any of the three intakes in a year. [32:41] Anuradha", "text": "Psychology would only have one intake." }
# AFTER fix:
{ "speakerRef": "Anuradha", "text": "through any of the three intakes in a year. [32:41] Anuradha: Psychology would only have one intake." }
```

**Test.** New regression test at the exact boundary (existing tests covered "way past 60" and
"well under 60", never 60 itself). D-020 mutant proof:

```
# mutant applied (>= reverted to >):
✖ parseDiarizedTranscript real bug repro (u1-toc-sept-catchup, 2026-09-25): a speaker capture of
  EXACTLY MAX_PLAUSIBLE_SPEAKER_LABEL_LENGTH (60) chars is still recovered as text ... (4.7586ms)
  AssertionError: a 60-char capture must inherit the previous turn's real speaker
  + 'through any of the three intakes in a year. [32:41] Anuradha'
  - 'Anuradha'
# restored byte-identical (cmp)
# re-run green:
ℹ tests 19 / ℹ pass 19 / ℹ fail 0
```

Full package suite after the fix (not just the new test): `pnpm --filter @lkb/ai test` →
**75/75 pass**, `pnpm --filter @lkb/ai typecheck` → exit 0, no output.

**Data repair.** The already-written `data/toc-migrated/2026-09-16-pathways-in-psychology/
turns.json` turn `t280` was hand-patched to the exact shape the fixed parser would have produced
(same transformation, applied once since no raw Gemini response text was retained to
re-parse): `speakerRef` → `"Anuradha"`, `text` → the garbled capture prepended to the original
text. `session_page.json` was regenerated afterward so its speaker-label list (10, not 11) matches
the repaired data.

**Scope check.** Scanned every OTHER session's `turns.json` (all 27 pre-existing +
this unit's other 3) for any `speakerRef` ≥ 55 chars: **zero hits**. This was a one-time, one-turn
occurrence, fully contained to this unit's own new data — not a wider corpus repair.

**Ledger:** `qa/issues.u1.jsonl` — `ISS-U1-1`, severity medium, status `fixed`.

## Identifying `video1968958572.mp4`

**Evidence, not a guess.** Transcript keyword counts (553 real turns): `Japan` **160**, `Tokyo`
**22**, `Osaka` **3**; zero hits for `in focus`/`in-focus`, `neurodivergent`, `learning disabilit`,
`adhd`, `autism`, `dyslexia`. `scholarship` appears 47× but exclusively in the context of
Japanese-university scholarships (MEXT, etc.), part of the session's own stated agenda, not the
separate "Scholarships 101" calendar row. The session opens (turns 1–11, `spk:0`): *"we had a few
members of the TOC actually go to Japan... this entire session, we aim to take you through what
studying in Japan can actually look like — universities, programs, courses, language
requirements... I have also studied in Japan myself."* This matches
`raw/TOC/TOC-Materials/_csv/calendar1.csv` September row **`21.0, UniAccess : Japan`** — the only
remaining unmatched row consistent with the file's Drive `createdTime`
(`2026-09-22T11:33:54.275Z`, the day after the 2026-09-21 18:00 IST event). Renamed
`data/toc-migrated/2026-09-tbd-video1968958572/` → `2026-09-21-uniaccess-japan/` (all `_id` /
`sessionId` / `sourceId` fields rewritten to match) and
`raw/TOC/TOC-Materials/Audio/video1968958572.m4a` → `21st-September-UniAccess-Japan.m4a` before
seeding — no placeholder ids reached Mongo.

## How to verify (commands the checker can re-run cheaply)

| Check | Command | Expected |
|---|---|---|
| Schema-shape + evidence-join for the 4 new sessions | `python scripts/validate-toc-migration.py 2>&1 \| grep -E "2026-09-(02\|09\|16\|21)" \| grep -v "speakerRef must be 'unknown'"` | **No output** (the `speakerRef must be 'unknown'` line is pre-existing contract staleness — see "Known, disclosed, NOT this unit's" below; every real 2026-09-* line without that substring is a real defect) |
| Gap-free guard, all 4 | `python -c "import json;[print(s, len(json.load(open(f'data/toc-migrated/{s}/turns.json',encoding='utf-8')))) for s in ['2026-09-02-india-test-series-part2','2026-09-09-global-test-prep-pathways','2026-09-16-pathways-in-psychology','2026-09-21-uniaccess-japan']]"` | `150 257 396 553` |
| No garbled long speakerRef anywhere in the corpus (ISS-U1-1 scope check, re-runnable) | `python -c "import json,glob;print(sum(1 for f in glob.glob('data/toc-migrated/*/turns.json') for t in json.load(open(f,encoding='utf-8')) if len(t['speakerRef'])>=55))"` | `0` |
| `@lkb/ai` suite green after the fix | `pnpm --filter @lkb/ai test` | `75/75 pass` |
| `@lkb/ai` typecheck | `pnpm --filter @lkb/ai typecheck` | exit 0, no output |
| `seed-toc.mjs --sessions` is additive (default scan unaffected) | `node scripts/seed-toc.mjs --dry-run` (main tree, all 27+4 dirs present) | prints `31 session(s) under data/toc-migrated/` with real per-collection counts, no crash |
| `seed-toc.mjs --sessions` dry-run scoping | `node scripts/seed-toc.mjs --dry-run --sessions 2026-09-02-india-test-series-part2,2026-09-09-global-test-prep-pathways,2026-09-16-pathways-in-psychology,2026-09-21-uniaccess-japan` | `sources 4 · sessions 4 · turns 1356 · session_pages 4 · claims 0` |
| Mongo counts, before vs after (already happened — see "Actual outputs"; a checker re-read is read-only) | `countDocuments` on `sources/sessions/turns/session_pages/claims` scoped to the 4 `_id`s / `sessionId`s | sources 4, sessions 4, turns 1356, session_pages 4, claims 454 (via `evidence.sessionId`), chunks 687 (via `sourceRef`) |
| `tree_index` mentions all 4 | `db.collection('tree_index').findOne({tenantId:'toc'})`, stringify, `includes(<sessionId>)` for each | all 4 `true` |
| Search reachability — **NOT a re-transcription**, a live `askV2` call through the exact `apps/api/src/production.ts` binding (`buildRouting` + `createMongoTreeStore` + `treeSearch` + `createLlmScorer`), no HTTP server needed | one `askV2(query, tree, {...})` call per session (see "Actual outputs") | each session's own `sessionRef` appears in `result.sources.internal[].evidence.sessionRef` |
| Data boundary gate | `python D:/ai_os/.claude/skills/_shared_validation/data_boundary.py D:/KnowledgeBase-lanes/u1-toc-sept-catchup` | `data-boundary OK` |

## Actual outputs (real, from this unit's own runs)

**Per-session table:**

| sessionId | title | duration (real) | turns | last-turn tEnd | coverage | speaker labels |
|---|---|---|---|---|---|---|
| `2026-09-02-india-test-series-part2` | India Test Series – Part II: Navigating India's Top Entrance Exams | 72.4 min (4343s) | 150 | 4364s (72.7min) | 100.5% | spk:0, spk:1, spk:2, spk:3 |
| `2026-09-09-global-test-prep-pathways` | Mastering Global Test Pathways: Navigating GRE, GMAT & UK Admission Tests | 72.9 min (4373s) | 257 | 4399s (73.3min) | 100.6% | Bhakti, Sonia, spk:0, spk:1, spk:2 |
| `2026-09-16-pathways-in-psychology` | Dear Psychology, What Can't You Do? | 66.2 min (3975s) | 396 | 3996s (66.6min) | 100.5% | Anuradha, Kanchan, Nehal, Raksha, spk:0–5 |
| `2026-09-21-uniaccess-japan` | UniAccess: Japan | 72.0 min (4319s) | 553 | 4343s (72.4min) | 100.6% | Kandarp, Kanthar, Muskan, spk:0–4 |

All 4: `no internal gaps found -- transcript coverage is genuinely continuous` (the load-bearing
check `transcribe-long-session.mjs` itself enforces — it refuses to write a gapped result without
`--allow-partial`, which was never passed).

**Mongo before/after (tenant `toc`, whole-collection totals; concurrent lane activity elsewhere in
the tenant is possible but every scoped count below is filtered to exactly these 4 `_id`s/
`sessionId`s, never a collection-wide delta):**

| collection | before (whole toc) | after (whole toc) | this unit's 4 sessions (scoped) |
|---|---|---|---|
| sources | 27 | 31 | 4 |
| sessions | 27 | 31 | 4 |
| turns | 2198 | 3554 | 1356 (150+257+396+553) |
| session_pages | 25 | 29 | 4 |
| claims | 147 | 601 | 454 (91+99+128+136, via `indexSession`'s LLM `extractClaims`) |
| chunks | 1517 | 2204 | 687 (135+184+162+206, via `indexSession`'s embedding step) |
| tree_index | 1 doc | 1 doc | all 4 sessionIds present in the doc |

```
$ node scripts/seed-toc.mjs --sessions 2026-09-02-india-test-series-part2,2026-09-09-global-test-prep-pathways,2026-09-16-pathways-in-psychology,2026-09-21-uniaccess-japan
Connecting to Mongo for a live seed (no --dry-run flag given)...
Inserted: { sources: 4, sessions: 4, turns: 1356, session_pages: 4, claims: 0 }
```

`claims: 0` here is correct and expected — `claims.json` is `[]` for all 4 (no hand-written claims
this batch, same precedent as the 2026-09-24 webinar session's `buildSessionFiles`). Real claims
came from the indexing step below.

**Indexing (`buildIndexer(routing)` from `apps/api/src/production.ts`, the SAME binding
`scripts/webinar/sync-session.mjs --index` uses — invoked directly, no second implementation):**

```
indexed 2026-09-02-india-test-series-part2: chunks 135, entities {"topics":160,"orgs":2,"claimsTagged":91,"skipped":null}
indexed 2026-09-09-global-test-prep-pathways: chunks 184, entities {"topics":160,"orgs":2,"claimsTagged":99,"skipped":null}
indexSession(toc/2026-09-16-pathways-in-psychology): summary degraded — existing session_pages left unchanged: summarize response had no usable summary field
indexed 2026-09-16-pathways-in-psychology: chunks 162, entities {"topics":160,"orgs":2,"claimsTagged":128,"skipped":null}
indexed 2026-09-21-uniaccess-japan: chunks 206, entities {"topics":161,"orgs":2,"claimsTagged":136,"skipped":null}
```

The 2026-09-16 session's LLM summarize step degraded (no usable summary field in the response)
— `indexSession`'s own degrade-safe design (ISS-059) left the pre-written deterministic
`session_page.json` summary in place rather than overwriting it with a fallback or losing it; no
data was lost, and claims/chunks/tree/entities still wrote normally. Disclosed, not silently
absorbed — see "Known gaps" below for what this costs.

**Search reachability — real `askV2` calls, no HTTP server, exact production wiring
(`buildRouting` + `createMongoTreeStore().load("toc")` + `treeSearch` + `createLlmScorer`, the
same objects `apps/api/src/production.ts`'s `buildProductionDeps().ask` assembles):**

```
query: "What did speakers say about India's top entrance exams?"
verdict: correct · web_used: false · insufficient_coverage: false · internal sources: 4
sessionRefs cited: [..., "2026-09-02-india-test-series-part2"]  → HIT
answer: "Speakers discussed several of India's top entrance exams: JEE (engineering) ...
NEET (medicine) ..."

query: "What did speakers say about GRE and GMAT test prep pathways?"
verdict: ambiguous · web_used: false · insufficient_coverage: true · internal sources: 1
sessionRefs cited: ["2026-09-09-global-test-prep-pathways"]  → HIT (retrieval correct; answer
  quality thin — see Known gaps)

query: "Dear Psychology, what can't you do? What did Anuradha say about Pavlov and reinforcement
  in the psychology session?"
verdict: ambiguous · web_used: false · insufficient_coverage: true · internal sources: 1
sessionRefs cited: ["2026-09-16-pathways-in-psychology"]  → HIT (a shorter, more abstract first
  query — "What can psychology not do, according to the speakers?" — returned 0 internal sources;
  see Known gaps)

query: "What did speakers say about studying in Japan?"
verdict: correct · web_used: false · insufficient_coverage: false · internal sources: 1
sessionRefs cited: ["2026-09-21-uniaccess-japan"]  → HIT
answer: "Speakers provided a comprehensive overview of studying in Japan... Presenters from the
University of Tokyo, Tokyo International University, and Kyoto University of Advanced Science..."
```

**All 4 sessions were correctly cited by at least one real `askV2` call.** Two of four returned a
"correct" verdict with a substantive grounded answer on the first query tried; the other two
("ambiguous"/`insufficient_coverage`) still correctly retrieved and cited the target session — the
gap is answer richness, not reachability, and is disclosed below rather than re-tried until green.

**Gemini cost (real, measured token counts from the actual logs — not estimated):**
Transcription alone: session 1 ≈300K in / 83K out tokens (2 chunks, one chunk needed 4 real
attempts + a tail split before succeeding); session 2 ≈110K in / 19K out (both chunks first-try);
session 3 ≈340K in / 52K out (chunk 2 needed 3 attempts + 2 recursive tail splits before
succeeding — genuinely inconsistent per-call, not a silence/content-safety block: a raw diagnostic
call against the exact same span, run mid-stall to investigate, returned `finishReason: STOP`,
`blockReason: undefined`, a full clean 25,075-character transcript); session 4 ≈228K in / 45K out
(chunk 1 needed 3 attempts). Plus `indexSession`'s summarize/claims/embedding calls for 4 sessions
and 4 `askV2` verification calls (select-nodes + evaluator scoring + answer generation each,
modest token counts). **Approximate total: ~1.1–1.3M input tokens, ~230–260K output tokens** across
gemini-3.5-flash (transcription/indexing) and whichever provider `ask`/`evaluator` routed to
(`config/ai-routing.yaml`: gemini first for both). At typical Gemini Flash-tier pricing this is
roughly **$0.30–$1.00** — an order-of-magnitude estimate from real measured tokens, not a precise
figure (current exact per-token pricing wasn't verified against Anthropic/Google's live rate card
this session).

## Capability coverage

| # | Capability | Check | Falsifying edit | `observed` |
|---|---|---|---|---|
| 1 | `seed-toc.mjs --sessions` scopes the run to exactly the named directories, never the whole tree | `node scripts/seed-toc.mjs --dry-run --sessions 2026-08-27-in-focus-4` (existing session, main tree) | `if (ONLY_SESSIONS) {` → `if (false && ONLY_SESSIONS) {` (D-020: byte backup + trap on EXIT/INT/TERM/ERR, `cmp` after restore) | **COVERED.** Before (fixed code): `seed-toc --dry-run: 1 session(s) (--sessions scoped)` — exactly 1 session's counts (`turns: 51`). Mutant applied, same command: `seed-toc --dry-run: 28 session(s) (--sessions scoped)` with `turns: 3386` — the guard's disablement made `--sessions` a no-op while its own log line still (misleadingly) said "scoped", proving the fall-through path really executed rather than merely relabeling; main tree held 28 directories at mutant time (24 pre-existing + this unit's 4). Restored, `cmp` byte-identical, re-ran: `1 session(s) (--sessions scoped)`, `turns: 51` — back to the exact pre-mutant numbers. This mutant ran in the MAIN tree (where `--sessions` was authored and tested against the full 28-directory corpus); the worktree's committed copy of `scripts/seed-toc.mjs` was never touched. |
| 2 | ISS-U1-1: the 60-char boundary is treated as implausible, not kept as a fake speakerRef | `pnpm --filter @lkb/ai test` | `>=` → `>` (one character, D-020 backup+trap+cmp) | **COVERED.** See "ISS-U1-1" section above for the full before/after — mutant: `✖ ... EXACTLY MAX_PLAUSIBLE_SPEAKER_LABEL_LENGTH (60) ...`, `'through any of the three intakes in a year. [32:41] Anuradha' !== 'Anuradha'`. Restored, `cmp` byte-identical, re-run: `19/19` (file-scoped) and `75/75` (full package). |
| 3 | Gap-free guard: `transcribe-long-session.mjs` refuses to write a transcript with unresolved internal gaps | live runs (4×, real) + the corpus-wide re-runnable query in "How to verify" | `NO ISOLATING FALSIFICATION viable without a live Gemini call` — the guard (`GAP_THRESHOLD_SECONDS`, `findTimeGaps`) already has its own pre-existing test suite in `packages/ai/src/stt/chunk-audio.test.ts` (part of the 75/75 green run above, unmodified by this unit) and is not re-falsified here to avoid a redundant mutation pass on code this unit didn't change. Live evidence: all 4 sessions logged `no internal gaps found` before being written; session 3's own run visibly EXERCISED the refusal-and-retry path live (3 failed attempts + 2 recursive tail splits, real data in "Actual outputs" above) rather than being asserted. |
| 4 | Tenant scoping: every Mongo write for this unit goes through `coll(tenantId)`, touching only tenant `toc` and only these 4 `sessionId`s | read-only probe queries in "Actual outputs" (before/after scoped counts) | `NO ISOLATING FALSIFICATION` — `seed-toc.mjs` and `apps/api/src/indexing/session.ts` already delegate all scoping to `packages/db`'s pre-existing, pre-tested `scopedCollection`/`coll(tenantId)` accessors (unmodified by this unit); re-falsifying that mechanism here would be the same redundant-mutation case as row 3. The real check performed: every scoped `countDocuments` query above used `sessionId`/`_id`/`evidence.sessionId`/`sourceRef` `$in` the exact 4 ids, and the deltas (turns +1356, claims +454, chunks +687) match the per-session sums exactly (150+257+396+553=1356; 91+99+128+136=454; 135+184+162+206=687) — an accidental write to another session's rows would have broken at least one of these sums. |
| 5 | Search reachability: all 4 sessions are citable via the real production `askV2` binding | 4 live `askV2` calls, one per session (pasted above) | `UNVERIFIED by falsification` — this exercises pre-existing, unmodified `packages/ask`/`packages/index` code end-to-end against real data; no code in this unit's own diff sits on this path, so there is nothing here to mutate that this unit changed. The real check performed: 4 live calls, 4 correct `sessionRef` citations (2 "correct", 2 "ambiguous but retrieved" — pasted in full above, not summarized). |

## Live browser evidence
**Not UI-touching** — no `apps/web` or `apps/api` route file changed. Changed paths: `data/
toc-migrated/**` (data only), `scripts/seed-toc.mjs` (CLI flag, additive), `packages/ai/src/stt/
gemini-file-upload.ts` + its test (shared library bugfix, no UI surface).

## Known gaps (disclosed, not silently absorbed)

- **Session `2026-09-16-pathways-in-psychology`'s `session_page.json` summary stayed the
  deterministic fallback**, not a real LLM summary, because `indexSession`'s `summarize` call
  degraded ("no usable summary field" in the response). This is the likely reason a short/abstract
  `askV2` query ("What can psychology not do?") returned 0 internal sources on its first try — the
  tree node's own summary text carries no topical content (Pavlov, reinforcement, empathy, etc.)
  for the node-selection LLM step to match against, only title + turn-count. A content-matched
  query ("Dear Psychology, what can't you do? What did Anuradha say about Pavlov...") DID retrieve
  it correctly. Not fixed here — re-running `indexSession` for just this session (idempotent,
  cheap) is the natural next step whenever the summarize provider succeeds; the raw turns are
  fully present and searchable via lexical/tree paths regardless.
- **`2026-09-09-global-test-prep-pathways`'s `askV2` verdict was "ambiguous"/`insufficient_coverage`**
  even with a title-matched query, for the same underlying reason (deterministic, non-LLM
  `session_page` summary — its `summarize` step did NOT report degraded, but the resulting summary
  is still the plain "N transcript turns across M speaker labels" shape, not content-rich). The
  session IS correctly retrieved and cited; the answer just isn't detailed. Same fix path as above.
- **Audio extraction settings are a best match, not an exact reproduction** — no committed script
  extracted the original 23 sessions' audio, so `96k` AAC/48kHz/stereo was chosen by inspecting one
  existing file (`82–90kbps` observed) rather than copied from a known command. Functionally
  equivalent (Gemini transcribed all 4 cleanly, 100.5–100.6% coverage, zero internal gaps).
- **Gemini transcription needed real retries on 2 of 4 sessions** (session 1: one chunk needed 4
  attempts + a tail split; session 3: one chunk needed 3 attempts + 2 recursive tail splits before
  succeeding) — genuinely non-deterministic per-call behavior on this content, not a systematic
  block (confirmed via a live raw diagnostic call mid-stall: `finishReason: STOP`, no
  `blockReason`, a full valid transcript came back on that same span moments later). All 4 sessions
  ultimately transcribed with zero internal gaps; no `--allow-partial` was ever used.
- **Secondary item (CBSE Career Guidance webinar, 2026-09-16, Drive id
  `1kkLkskkrclvhNdRx1a84mTv_2CdcrWtA`):** NOT ingested (per the brief — it belongs to tenant
  `vidysea`, not `toc`). Checked whether a vidysea-tenant ingest path exists: `tenantId: "vidysea"`
  appears in `packages/meeting-bot/src/capture/record-commands.ts:126` and
  `record-finalize.ts:93` (the meeting-bot's own internal-capture tenant), but no ingest pipeline
  or `data/<...>/` folder shape exists for a *provided* Vidysea-tenant recording like this one.
  Nothing built here.

## Known, disclosed, NOT this unit's to fix

- **`scripts/validate-toc-migration.py`'s C3 check** (`speakerRef must be 'unknown' (no
  diarization)`) is stale against every REAL-diarized session in the corpus — confirmed it already
  fails identically for all 23 T-003 sessions and the 2026-09-24 webinar session (2,180 total
  failure lines across the whole corpus before this unit's 4 sessions are even counted; this
  unit's 4 sessions add their own share of that same pre-existing class, never a new one). The
  contract was written for T-002's placeholder-turn migration and never updated once T-003 shipped
  real diarization. Out of scope for a data-ingest unit to amend a `qa/contracts/`-adjacent
  validator; flagged here so a checker doesn't mistake it for a regression this unit caused.
- Several OTHER pre-existing sessions' `session_page.json`/`claims.json` evidence turnIds don't
  resolve against their own `turns.json` (`2026-06-19-*`, `2026-06-30-*`, `2026-08-03-*`,
  `2026-08-12-*`, `2026-08-27-*`) and the 2026-09-24 webinar's `captureMode: "silent"` fails the
  D-008 `"provided"` check — all pre-existing, none touching any file this unit changed.

## Status: checked-PASS — qa/verdicts/u1-toc-sept-catchup.md (Cycle checked: 0, 9c52a27); merged to master; @lkb/ai 75/75 on merged tree; debt ISS-U1-2 (main-tree breach, no damage), ISS-U1-3 (10 embedded timestamp fragments, cosmetic), ISS-U1-4 (retrieval miss on rephrased query)

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

# T-043 LIVE proof - 2026-10-12

Authority: D-143 (staging DB `lkb_staging`, never `lkb`), D-146 (live runs approved), D-149 (legacy-unbound seeding). Main tree HEAD d51b35fc. Approver: Umesh.

**Database written:** `lkb_staging` only, on the server in `.env` MONGODB_URL (URI not recorded). Every write path asserted the DB name `lkb_staging` first. No secrets in this file.

Env for every command: `LKB_ALLOW_STAGING=lkb_staging MONGO_WORK_DB=lkb_staging MONGODB_DB=lkb_staging`.

## 1. Seed (legacy-unbound)

21 of 32 `data/toc-migrated` dirs load under `--legacy-unbound` (8 fail "invalid derived evidence", 3 `synthetic-controlled-*` have no files); the 21 were passed with `--sessions`.

```
node scripts/seed-toc.mjs --legacy-unbound --sessions <21 ids> --dry-run   # 21 sessions
node scripts/seed-toc.mjs --legacy-unbound --sessions <21 ids>
Inserted: { sources: 21, sessions: 21, turns: 3114, session_pages: 21, claims: 50 }
```

Verification query on lkb_staging: provenance.status=legacy-unbound on sources 21/21, sessions 21/21, session_pages 21/21, turns 3114/3114, claims 50/50 (sample turn provenance: `{status:"legacy-unbound", reason:"D-149"}`).

## 2. Chunks + embeddings (Gemini, config/ai-routing.yaml `embedding: [gemini, ollama]`)

```
node scripts/backfill.mjs chunks --legacy-unbound --dry-run   # 21 sessions, 1905 chunks planned
node scripts/backfill.mjs chunks --legacy-unbound              # run via an untracked wrapper, see notes
```

**PARTIAL: 751 of 1905 planned chunks, 751 embeddings (3072 dims, gemini-embedding-001), 9 of 21 sessions.** All 751 chunks carry provenance legacy-unbound. The remaining 12 sessions (1154 chunks) are NOT embedded.

Why partial: the Gemini key is on the free tier: `embed_content_free_tier_requests` limit 100/min and **1000/day** (gemini-embedding-1.0). The daily 1000 was exhausted; later calls returned 429 RESOURCE_EXHAUSTED. The Ollama fallback fails (404, model `nomic-embed-text` not pulled; a different embedding model would also give mixed dimensions, so it was not pulled). Embedded sessions: visa-blueprint-part2, funding-dreams-loans-forex, uniaccess-xavier-university, uniaccess-atlas-skilltech, in-focus-1, in-focus-2, inside-the-uc-session, beyond-black-robes-law-careers, creative-futures. To finish: re-run the same command after the Gemini daily reset or on a billed key (whole corpus is ~397k tokens, about USD 0.06 at USD 0.15/M).

Cost: the jobs ledger records costUsd 0 for embeddings (free tier); full-corpus paid projection ~USD 0.06, far under the USD 5 cap.

Notes: (a) `scripts/backfill.mjs` run directly fails with "Mongo not connected" on the embedding job write: it connects `../packages/db/src/index.ts` while apps/api `createMongoJobWriter` uses a second module instance of `@lkb/db`. Worked around WITHOUT editing tracked source via a temporary untracked wrapper (asserts the DB name, pre-connects `@lkb/db` to lkb_staging, throttles Gemini batch calls to 100 items/min with 429 retry, then imports backfill.mjs). Wrapper deleted. Product bug to file. (b) Re-runs re-embedded already-written sessions (backfill replaces per session), so part of the 1000/day quota went on repeats.

## 3. Migrations (migrate-mongo, `-f migrate-mongo-config.cjs`, MONGODB_DB=lkb_staging)

`status` showed all 8 PENDING on lkb_staging; `up` applied all 8 (earlier ones are prerequisites):

```
MIGRATED UP: 20260903100000-baseline.cjs
MIGRATED UP: 20260904120000-meeting-candidates.cjs
MIGRATED UP: 20260907140000-tree-index-tenant-id.cjs
MIGRATED UP: 20260925090000-source-watcher.cjs
MIGRATED UP: 20260928120000-watch-heartbeat.cjs
MIGRATED UP: 20261012100000-usage-events.cjs
MIGRATED UP: 20261012150000-tenant-scoped-source-ids.cjs
MIGRATED UP: 20261013100000-speaker-suggestions.cjs
```

Post `status`: all 8 have Applied At timestamps (2026-10-12T19:40:46Z). The migrations print no row counts. tenant-scoped-source-ids was a no-op on this data: no `source_id_migration_journal` collection exists and sources use `<session>-src` ids (not 64-hex content hashes), which the migration deliberately leaves alone. Seeded counts were unchanged after migration.

## 4. Real /ask

Ran the real apps/api Express server (`startServer(buildProductionDeps())`, port 3391, then stopped) via a temporary untracked script that asserted DB = lkb_staging, built `tree_index` for tenant `toc` with the repo's deterministic `buildTree` (no LLM) from the seeded sessions/pages, minted a short-lived API key (hash only stored, deleted after the run), and POSTed `/ask` with Bearer auth. Generation: the `gemini` job failed with 429 on each call; `claude-code/sonnet` answered.

**Finding 1 (data defect, blocks /ask):** with all 21 sessions in the tree, every `/ask` returned 503 `source_context_unavailable: invalid scoped source row` (apps/api/src/ask/source-context.ts validTurn). Cause: two legacy turns have tEnd < tStart: `2026-04-21-visa-blueprint-part2-italy-france-nz-t141` (tStart 2008, tEnd 213) and `2026-08-10-ucas-what-changed-what-matters-t114` (tStart 1883, tEnd 1868). I did NOT repair data. The proof tree was built from the other 19 sessions. One bad turn disables /ask for the whole tenant tree.

**Finding 2:** all answers had verdict `ambiguous` / `insufficient_coverage: true` (top node score 0.45-0.62, below the 0.7 threshold); answers are grounded in cited quotes but the system rates its own coverage as incomplete. One UC attempt in run 1 was refused 503 "answer support or relevance refused" (LLM nondeterminism); the same question succeeded in run 2.

Questions, answers, citations:

### Q: What did the speakers say about education loans and forex for students studying abroad?

HTTP 200 (run file ask-out.json)

verdict: ambiguous (no candidate >= 0.7 but at least one >= 0.3); insufficient_coverage: true; web_used: false

Answer:

> Nikhil said that Dev and Shweta would cover remittances and education finance in more depth.
> On education loans, Nikhil said that a post-graduate education loan is a much simpler topic.
> Nikhil said he was focusing on undergraduate (UG) loans from his perspective, and that an education loan is a very long-term financial commitment.
> Dev said they are an RBI-licensed entity that is allowed to help students and parents transfer money overseas for education and living expenses.
> Dev said he would first show a two-minute video introducing who they are and what they offer. He would then cover what students and families need to look out for when transferring money abroad.

Citations (source quotes; each resolved in lkb_staging, see check section):

- session `2026-05-08-funding-dreams-loans-forex`, turn `2026-05-08-funding-dreams-loans-forex-t002`, speaker Dev, t=486-545s, chars 0-809: "Sure. So thanks a lot, Nikhil. Thanks a lot to TOC for organizing this session and having me as one of the speakers. Good evening, everyone. I am Dev Mehta and ..."
- session `2026-05-08-funding-dreams-loans-forex`, turn `2026-05-08-funding-dreams-loans-forex-t001`, speaker Nikhil, t=0-486s, chars 2048-3072: "tion, but it's not restricted to it. Uh, we just started off, and with me on the panel, uh, we have two, I would say, veterans, expert professionals of the indu..."

### Q: What career paths in law were discussed in the Beyond Black Robes session?

HTTP 200 (run file ask-out.json)

verdict: ambiguous (no candidate >= 0.7 but at least one >= 0.3); insufficient_coverage: true; web_used: false

Answer:

> The session opened by noting that many people picture a law career as courtrooms, black robes, or perhaps a corporate law firm.
> It then said that today's law careers extend well beyond traditional practice into areas like legal technology, policy, compliance, arbitration, consulting, and more.
> Another speaker gave admissions leadership as an example of a non-traditional path, citing the roles of Joint Director of Admission and Head of Admissions, both held by people with postgraduate law degrees.

Citations (source quotes; each resolved in lkb_staging, see check section):

- session `2026-07-08-beyond-black-robes-law-careers`, turn `2026-07-08-beyond-black-robes-law-careers-t010`, speaker Harshwardhan Tiwari, t=530-806s, chars 0-1024: "Uh, first and foremost, I completely agree with uh Professor Krishna. See, uh when I look into this session where we are today, so uh the title of the session i..."
- session `2026-07-08-beyond-black-robes-law-careers`, turn `2026-07-08-beyond-black-robes-law-careers-t001`, speaker Anchal, t=0-65s, chars 0-1024: "panel discussion today with a simple objective. Most people actually think of law as a career, which is still pictured in courtrooms, black robes, or even perha..."

### Q: What did the Inside the UC session explain about applying to the University of California?

HTTP 503 (run file ask-out.json)

Refused: `source_context_unavailable` - Ask could not validate a bounded source context: answer support or relevance refused

### Q: What did the UniAccess session with Xavier University cover about studying there?

HTTP 200 (run file ask-out2.json)

verdict: ambiguous (no candidate >= 0.7 but at least one >= 0.3); insufficient_coverage: true; web_used: false

Answer:

> The session said students at Xavier can benefit from merit scholarships ranging from $23,000 to $36,000 annually, along with additional grants and financial aid options.
> It presented this as making a high-quality US education at Xavier far more attainable, and said that for many students the annual tuition cost can sometimes come down to as low as $11,500.
> The session also covered the campus environment, not just financial support: students from over 53 countries are represented, and the community was described as global, welcoming and student-focused.
> It said both international and domestic students feel at home and supported from day one, and that students are not just another application number.
> On applying, the session described Xavier's application process as clear, supportive, and student and counselor friendly.
> Students submit the application online, either through Common App or directly through Xavier's own portal.
> They then share academic records and supporting documents, including marksheets, one recommendation letter, and English proficiency scores.
> After the application is reviewed, students receive an admission decision, which is also where scholarship opportunities come into the picture.
> Students are automatically considered for merit scholarships, and they can later request additional financial assistance or engagement-based scholarships.

Citations (source quotes; each resolved in lkb_staging, see check section):

- session `2026-05-22-uniaccess-xavier-university`, turn `2026-05-22-uniaccess-xavier-university-t048`, speaker Sandeep, t=1260-1715s, chars 5120-6144: "an actually benefit from merit scholarships ranging from $23,000 to $36,000 annually, along with additional grants and financial aid options. Making Xavier high..."
- session `2026-05-22-uniaccess-xavier-university`, turn `2026-05-22-uniaccess-xavier-university-t048`, speaker Sandeep, t=1260-1715s, chars 3072-4096: "ome. So, if we come to the next slide, the last bit would be that what I really appreciate about Xavier as the university is that the application process is des..."

### Q: What was the Creative Futures session about and what careers did the speakers discuss?

HTTP 200 (run file ask-out2.json)

verdict: ambiguous (no candidate >= 0.7 but at least one >= 0.3); insufficient_coverage: true; web_used: false

Answer:

> The Creative Futures session was meant to explore possibilities and enable futures for students, and was addressed to counselors.
> The speaker said counselors play pivotal roles in helping students through some of the biggest decisions of their lives, including choosing futures that fit their strengths and aspirations.
> The session aimed to broaden counselors' perspective on creative careers and give practical insights for guiding students toward these pathways.
> The speakers said they wanted to talk about creative careers that go beyond the traditional route.
> The careers they described power industries ranging from fashion, communication, digital media, and product innovation to sustainability.
> They noted that despite rapid growth, many students and families still associate creative careers with only a handful of familiar options.
> The session had two parts. The first, "explore," would broaden understanding of creative careers, the ecosystem, and building beyond conventional design.
> The second, "enable," would cover practical strategies to help students prepare for creative educational fields, including developing creative thinking and portfolios and understanding admissions and expectations. The available text cuts off while mentioning Indian and international expectations.
> The provided excerpts name industries but no specific job titles, and they do not identify the speakers.

Citations (source quotes; each resolved in lkb_staging, see check section):

- session `2026-07-15-creative-futures`, turn `2026-07-15-creative-futures-t001`, speaker spk:0, t=0-276s, chars 0-1024: "thing had a wonderful session today to explore possibilities and enable futures. First of all, thank you everyone for taking the time out to join us today. We'r..."
- session `2026-07-15-creative-futures`, turn `2026-07-15-creative-futures-t001`, speaker spk:0, t=0-276s, chars 2048-3072: "bout creative careers, we'd love to talk about the every career that goes beyond the traditional route. Uh we've spoken about careers that power industries rang..."
- session `2026-07-30-in-focus-3`, turn `2026-07-30-in-focus-3-t029`, speaker Shithij, t=1490-2240s, chars 5120-6142: "r within the field of law to tell the students what it takes to become a part of that particular area and what are the career objectives and the career prospect..."
- session `2026-07-30-in-focus-3`, turn `2026-07-30-in-focus-3-t069`, speaker spk:0, t=3026-3043s, chars 0-193: "will require and these are the, you know, future skills that everyone requires as well. So, helps in any career, honestly. So, whatever you do, it will help. In..."
- session `2026-07-30-in-focus-3`, turn `2026-07-30-in-focus-3-t028`, speaker Shithij, t=1463-1490s, chars 0-97: "The system is waiting for somebody to join back, somebody has logged off because of the internet...."
- session `2026-07-30-in-focus-3`, turn `2026-07-30-in-focus-3-t030`, speaker spk:1, t=2240-2254s, chars 0-182: "Thank you, Shithij. It was perfectly timed. Uh, thanks everyone for joining in. Yes, people. Questions? Astero is having a lot of questions. I'm pretty sure. Sh..."

### Q: What did the Inside the UC session explain about applying to the University of California?

HTTP 200 (run file ask-out2.json)

verdict: ambiguous (no candidate >= 0.7 but at least one >= 0.3); insufficient_coverage: true; web_used: false

Answer:

> The University of California system has 10 campuses spread across the state of California, with four in Northern California and five in Southern California.
> It was described as a public university system.
> The session covered what makes the UCs stand out and why students want to study at a UC campus, naming academic and research excellence as one of those reasons.
> The speaker then moved to the application side, which was the main focus of the session, beginning with the UC timeline that applicants must adhere to.
> The UC application and admission process was described as a year-long cycle.
> Unlike other US applications, UCs accept applications in one round, so there is just one deadline.
> The UC application opens on August 1st, and students can begin drafting each part of their application then.

Citations (source quotes; each resolved in lkb_staging, see check section):

- session `2026-07-03-inside-the-uc-session`, turn `2026-07-03-inside-the-uc-session-t022`, speaker Beauty, t=1008-1381s, chars 2048-3072: "rnational, special international students. And, uh, there are summer classes for enrolled students, not just high schoolers, we also offer high school, uh, summ..."
- session `2026-07-03-inside-the-uc-session`, turn `2026-07-03-inside-the-uc-session-t020`, speaker Aastha, t=352-893s, chars 0-1024: "Perfect, thank you all so much. Um, so taking us directly into, you know, the part of the presentation that has a lot of learning, you know, involved. So Univer..."


## Citation verification (against lkb_staging)

For every cited source quote: the turn `_id` exists in `turns`, `turn.sessionId` equals the cited session, the session exists in `sessions`, both carry `provenance.status = legacy-unbound`, sha256(turn.text) equals the quote's `turnTextSHA256`, and `turn.text.slice(charStart, charEnd)` equals the quote verbatim.

| Question | quotes | resolved | sessions |
|---|---|---|---|
| loans and forex | 2 | 2/2 | funding-dreams-loans-forex |
| law career paths (Beyond Black Robes) | 2 | 2/2 | beyond-black-robes-law-careers |
| Xavier University | 2 | 2/2 | uniaccess-xavier-university |
| Creative Futures | 6 | 6/6 | creative-futures, in-focus-3 |
| Inside the UC (run 2) | 2 | 2/2 | inside-the-uc-session |

Note: in-focus-3 (cited for Creative Futures) is not among the 9 embedded sessions. Retrieval here is the tree + bounded source path; the query could not be embedded (Gemini quota), so these answers do not prove the vector arm.

## Cost

- Embeddings: USD 0 recorded (Gemini free tier); full-corpus paid estimate ~USD 0.06.
- /ask: claude-code/sonnet. Per-question costUsd from the auditLog: 0.128, 0.130, 0.142, 0.156, 0.053 (sum 0.61 for the five answered). Jobs ledger total for ask + evaluator, including refused/retried attempts: about USD 0.82.
- Total about USD 0.82, under the USD 5 cap.

## Cleanup / state

- Server stopped; API key deleted (api_keys = 0); temp wrapper/driver scripts removed from apps/api; main tree `git status` clean; nothing pushed; no tracked source edited.
- A stray untenanted `tree_index` doc from my first attempt was deleted; lkb_staging holds one `tree_index` root (tenant:toc, 19 sessions).
- `lkb` was never connected to.

## Follow-up 2026-10-13: embedding retry (lane t043live2) - STILL 751 of 1905

Env: `LKB_ALLOW_STAGING=lkb_staging MONGO_WORK_DB=lkb_staging MONGODB_DB=lkb_staging`; DB name asserted `lkb_staging` (never `lkb`). No secrets recorded.

- State before: lkb_staging `chunks` = 751, all with vectors, in 9 sessions (visa-blueprint-part2 237, funding-dreams 54, xavier 40, atlas 4, in-focus-1 28, in-focus-2 39, inside-the-uc 35, beyond-black-robes 86, creative-futures 228). 12 sessions (1154 chunks) have none. Dry run again plans 1905.
- `node scripts/backfill.mjs chunks --legacy-unbound --session <id>` now connects with NO "Mongo not connected" error and no wrapper was needed. The only failure is the provider.
- Result: 3 attempts (2026-09-24-in-focus, 27 chunks; atlas-skilltech; repeat) all failed, 0 written, chunks unchanged at 751. Exact error: `gemini embed error 429 RESOURCE_EXHAUSTED: Quota exceeded for metric generativelanguage.googleapis.com/embed_content_free_tier_requests, limit: 1000 (quotaId EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier, model gemini-embedding-1.0). Please retry in 22h4m` (retryDelay about 79.5ks). The daily window has NOT reset; it resets roughly 22h after these calls. Ollama fallback: 404 `nomic-embed-text` not found.
- Side check: single/2-item raw `batchEmbedContents` calls with the same key succeeded (HTTP 200), so a few units of quota remain but not enough for a session batch; no further attempts made (stop-on-429 rule).
- Ollama Cloud (OLLAMA_API_KEY): `GET https://ollama.com/api/tags` returns 200 with 18 models, none an embedding model (mistral-large-3, nemotron-3-*, glm-5.2/5.3, kimi-k2.6/k2.7-code/k3, minimax-m2.7/m3, mistral-large-4, gemma4:31b, deepseek-v4-*, gpt-oss:20b/120b, glm-5.3-flash). `/api/embed` with `nomic-embed-text` or `embeddinggemma` returned "not found" / "unauthorized". So no Ollama Cloud embedding model is available with this key. Routing config not changed.
- Step 2 (vector-arm /ask rerun) NOT done: it needs all 1905 chunks embedded. Still to do: after reset, embed the 12 sessions (1154 chunks; fits under 1000/day only across two days, or use a billed key at about USD 0.06), then re-run 3-5 /ask questions excluding visa-blueprint t141 and ucas t114.
- Cost today: USD 0. Servers: none started. No temp wrapper needed; scratchpad helper scripts only.

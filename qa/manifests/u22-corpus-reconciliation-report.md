# u22-corpus-reconciliation-report

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap U2.2 remaining gate: corpus reconciliation). Read-only reporting; no data write, auth or tenancy surface. Verdict by the checker only.
Lane: lane/corpusreconcile. Lane ledger `qa/issues.corpusreconcile.jsonl`: ISS-CORPUSRECONCILE-001 (medium, owner decision), -002, -003 (low).

## Scope
New `packages/index/src/eval/corpus-reconcile.ts` (pure functions, no fs/Mongo/network) and `corpus-reconcile.test.ts` (8 tests). `scripts/eval-extraction.mjs` gains a `reconcile --input corpus.json [--out-dir dir]` subcommand (loader + writer; git read via `git log` with `shell:false`); no new file in scripts/. Outputs `data/eval/corpus-reconciliation-report.{json,md}` (data/eval artefacts are committed, matching the existing extraction-report.json convention). Not touched: corpus data, claims, labels, thresholds, speaker files, summarize.ts, t041 keyframes. Never connects to Mongo; reads files only (raw/ and data/ are tracked and present in the worktree, so read from there).

## What it reports
- Citations: every persisted citation whose turn is not in the cited session's current turns, with reason (session-missing, id-format, session-prefix-mismatch, turn-off-range, turn-gap-in-range) and detail. Proposed target: only (a) an independent reviewed mapping from `extraction-reconciliation-reviewed.json` that targets this exact original citation and whose `currentTurnsSha256` equals the current turns bytes, else (b) an UNREVIEWED lexical hint (>=60% of the claim's distinctive tokens in one turn, lead >=0.15), else none. Hints are explicitly not gold.
- Artifact-missing: expected path per declared artefact, directory state and what is there instead.
- Invalid time: turn id with the offending tStart/tEnd values.
- 23 vs 29: a session is an original iff its source.json path names a file in raw/TOC/TOC-Materials/Transcripts; additions carry kind, source path, createdAt and the commit that first added the directory.

## Real run (node scripts/eval-extraction.mjs reconcile --input data/eval/extraction-corpus.json, exit 0, two runs byte-identical sha256 51db793a...)
- Citations: 14 unresolved, 14/14 turn-off-range (overshoot 2 to 175 turns); list equals the corpus baseline's 14. Proposed target: 1 reviewed mapping (2026-08-12-uniaccess-ashoka-university-c01 -> t014), 7 unreviewed lexical hints, 6 none. (The other 6 reviewed mappings belong to claims whose cited turn exists; they are not unresolved citations.)
- Artifact-missing: 6. Three directories absent (synthetic-cli-20260930, synthetic-production-cli-20260930, synthetic-production-interrupt-20260930; no git history on any ref); three present with source.json + validation.json only (synthetic-controlled-1790797565149/-1790798758779/-1790799479728).
- Invalid time: 3 sessions, 1 turn each, all end-before-start: visa-blueprint t141 (2008 > 213), dual-enrollment t026 (1644 > 1629), ucas t114 (1883 > 1868).
- 23 vs 29: 23 raw transcripts, 23 originals, 0 raw files without a session, 6 additions: 2026-09-02-india-test-series-part2, 2026-09-09-global-test-prep-pathways, 2026-09-16-pathways-in-psychology, 2026-09-21-uniaccess-japan (recordings, source createdAt 2026-09-25, first commit 5760f5e u1-toc-sept-catchup); 2026-09-24-in-focus (m4a, 72c212f recovery commit, watcher-ingested); 2026-09-24-zoho-next-european-study-destinations (raw/webinars mkv, fd74864 live webinar bot). Matches HANDOFF's "23 originals plus 6 September additions".

## Evidence
- `node --test --import tsx src/eval/corpus-reconcile.test.ts` (packages/index): tests 8, pass 8, fail 0. Cases: reason per citation incl. a resolvable one not reported; reviewed mapping rejected when stale or for another citation; lexical hint unambiguous vs tied/short; bad-time values (reversed, negative, non-finite); missing artifacts; provenance; baseline mismatch and determinism; subcommand on a temp corpus with corpus bytes unchanged.
- `src/pipeline/claims.test.ts` (shares the script): tests 24, pass 24, fail 0.
- `tsc --noEmit -p tsconfig.json` in packages/index: exit 0. `lint-loc`: my files 263/148/140 lines; its 2 violations (youtube.ts, sb_join.py) are pre-existing.
- Mutations: none run.

## NOT covered / owner decisions
- Applying any citation correction, dropping the six synthetic cases, human gold labels, thresholds: owner/human.
- Lexical hints are weak (three entrance-exams claims hint the same turn); only the reviewed mapping is reviewed.
- `work/toc-recovery-v1` named in HANDOFF.md is not in the repo (ISS-CORPUSRECONCILE-003).

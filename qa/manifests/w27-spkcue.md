# w27-spkcue

Status: ready-for-check
Fix cycle: 0
Lane: lane/w27-spkcue (worktree KnowledgeBase-lanes/w27-spkcue) · Base: 4264418c (origin/master) · Candidate: the lane HEAD commit "w27-spkcue cycle 0" · Tier: critical (ISS-104), medium (ISS-110, ISS-104CC-3). Ledger rows NOT flipped.

## Changed paths
- packages/index/src/pipeline/speaker-name-rules.ts (hasNamingCue `speaking` branch; endsTheClause now delegates; honest cost wording on readsAsAPlaceOrOrg)
- packages/index/src/pipeline/speaker-rules/speaker-following-rules.ts (NEW: FUNCTION_FOLLOWERS moved, `followedByNoun`, `opensAClause`; re-exported from speaker-name-rules.ts)
- packages/index/src/pipeline/speaker-name-rules.test.ts, speaker-name-rules-place.test.ts (tests)

## Behaviour
1. ISS-104: the `speaking` after-cue binds only when the name OPENS its clause (start of turn or sentence, after greeting words only). Same discriminator production's allow-list already uses (ISS-282 c1b). "This is India speaking on the panel." was the last row still shipping `person:india` at the bare predicate (`citesNameAsAnIntroduction`, also reached by `hasNamingCueAt` in the relation rules). No place list, no policy change (D-052 ruling 2 stands). Recall cost: single-token "This is Ruby speaking on the panel." no longer cues through `speaking` (multi-token "This is Ruby Mehta speaking" is a separate, unchanged cue). Production extractSpeakers already refused it.
2. ISS-110: `speaking`/`here` follower is now a following-NOUN test: end of clause/punctuation, FUNCTION_FOLLOWERS, naming cues, -ly adverbs, and degree/sequencing adverbs (looked THROUGH, the next word is judged) all mean the idiom; any other word is a noun and refuses. The comment now says what the code does (unknown word = noun, refusal direction). Only the two recorded words (very, first) plus their closed classes were added; widening is pinned to recorded cases.
3. ISS-104CC-3: option (b): cost restated as construction-conditional in source and test comments (~0% outside a locative-mention-plus-weak-cue turn, ~100% inside, any name). Behaviour unchanged. Option (a) NOT possible: 16 of the manifest's 20 cases and the checker's 7 sentences were never recorded (names only).

## D-015 (replayed verbatim from the ledger / its manifest)
- ISS-104: 20/20 refused at the bare predicate (was 19/20: India shipped); 20/20 refused through extractSpeakers (existing corpus test, unchanged and green). None left open.
- ISS-110: its two recorded probes "Ruby speaking very briefly." / "Ruby speaking first, then Nilesh." resolve 2/2 at the predicate (were 0/2). Its two recorded companion corpora hold: ISS-093 20/20 refused (extractSpeakers) and ISS-098 10/10 still resolving (extractSpeakers test, and 10/10 at the predicate via a scratch probe).
- ISS-104CC-3: 4/4 manifest-quoted rows refused as documented (Asia is a pre-existing `over to` handover). OPEN: the checker's 7 sentences and the manifest's other 16 cases are not recorded anywhere, so they cannot be replayed verbatim; the per-name block (6 names x inside/outside the construction) is AUTHORED to the row's description and is labelled as illustration, not the floor.

## Checks a checker must run (packages/index)
- `node --test --import tsx` on the 9 speaker test files grepped by `speaker-name-rules|speakers-llm|speaker-relation|speaker-rules`: baseline 291 pass, after 338 pass / 0 fail (the baseline run overlapped the first edit, so treat 291 as approximate).
- Focused: speaker-name-rules.test.ts + speaker-name-rules-place.test.ts: 170 tests / 0 fail after the CC-3 predicate block.
- tsc --noEmit -p packages/index: exit 0.
- `lint-loc.mjs --all`: stages dirsize, root, dupes, migrations, codex-hooks, snapshot passed in the combined run; loc, lint-tests, tracker and dependencies hit the 120 s per-stage limit under load, so each was re-run alone with a longer timeout: loc OK (1725 files), lint-tests exit 0, tracker exit 0. dependencies exit 230 with 1254 errors, ALL `no-unresolvable-workspace-import` (the lane's `@lkb/*` junctions resolve to the main tree), none naming a changed file; not caused by this unit.

## Mutations (D-020 + 2026-09-28 amendment: per-mutation byte backup, trap EXIT/INT/TERM/ERR, timeout 300, hash-object check; scripts outside the repo)
| id | edit | result |
|---|---|---|
| M1 | drop `opensAClause(text, at) &&` | 155/157; India predicate row + construction test fail |
| M2 | skippable adverbs `return true` | 155/157; both ISS-110 recorded rows fail |
| M3 | noun test always `false` | 150/157; 7 fail (ISS-110 controls, Google, English) |
| M4 | `readsAsAPlaceOrOrg` always false | 157/157 SURVIVED at extractSpeakers level (production allow-list refuses these turns on its own: the place signal is not load-bearing there) -> predicate-level CC-3 tests added |
| M4b | same, after the predicate tests | 164/170; 6 inside-construction predicate rows fail |
All five restored; `git hash-object` before == after for every run.

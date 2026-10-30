# Verdict - w9-webinar-qa-items (dual check, coordinator A)

**Cycle checked:** 0
**Policy-Version judged under:** proportional-verification/2026-10-19.17
**Checked head:** 6aa0f9e7 (diff 021bdea0..HEAD; code commits ea39cc70, cab0e0c8)
**Coordinator:** A (blind; coordinator B's verdict, checkpoint and evidence not read)

VERDICT: PASS
SCOREBOARD: 6/6 criteria met (C1-C5 + C6 floor), 1/1 invariants hold (I1 structural budget)
TIER: L (dual-trigger prod-write scripts/webinar/sync-session.mjs:237; additive notes shape into a MONGO_WORK_DB sessions write; no auth/tenancy/consent code touched)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (no capability matrix; issue-driven unit)
LIVE-BROWSER: not-applicable (changed paths are scripts/webinar/*.mjs only)
ISSUES-WRITTEN: none (dual coordinator; PROPOSED-ISSUE lines below)
EXECUTOR: claude-opus-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The recorded ISS-WEBINARRELEASE-001 observation-1 reproduction now yields non-empty decisions, actionItems and qa with per-item literal-quote evidence resolving to exactly one real turn. Observations 2-4 are verified closed on the strict webinar path (unchanged files, green). Surviving mutants and the legacy-path leftover are non-blocking and listed as proposals.

## Check plan and evidence (independent runs, this checker)
- Identity: read diff 021bdea0..HEAD (5 files: process-video.mjs, process-video.test.mjs, slide-knowledge.mjs, qa/issues.w9.jsonl, manifest). summarize.ts and session.ts unchanged, confirmed by `git diff --stat`.
- C1-C5: `node --test --import tsx scripts/webinar/process-video.test.mjs` -> pass 21 / fail 1; the 9 new tests all pass; the 1 red is the baseline "exhausted provider failure is a counted safe gap" (2 !== 3, ISS-W9-001). Read the red's code path: the frame-dedupe loop (process-video.mjs ~line 207-216) is outside the diff, so the red is unrelated to buildNotes (baseline run at 021bdea0 not reproduced by me; reasoned from the diff, maker evidence matches).
- Adjacent: slides/slide-knowledge.test.mjs 11/0, process-video-slides.test.mjs 7/0, session-rows.test.mjs 3/0, session-inputs.test.mjs 10 pass / 1 fail ("captured media cannot bypass validation", consent proof from scripts/lib/transcription/private-recording.mjs:70, untouched by the diff; ISS-W9-002).
- C6 floor (strict path, unchanged files): packages/index summarize.test.ts 10/0, grounded-notes.test.ts 15/0; apps/api session-grounded-wire 11/0, session-grounded-notes 3/0, session-strict 4/0.
- I1: `node scripts/lint-loc.mjs --all` -> `lint:structure: OK (10 stages, 0 failed)`. extractSpeechItems/buildNotes are pure: no provider, network, fs or env import added (read in full).
- Reuse path (C5) read: `!state.ocrErrors?.length` is required to reach the stale-notes rebuild, so passing `[]` as ocrErrors drops no recorded gap; the rebuilt notes.json digest is re-pinned in video-stage.json, so session-rows.mjs:85-88 hash check (`screen artifact hash mismatch`) still holds. A crash between the two atomic writes fails closed (digest mismatch -> full reprocess), not silent.
- Adversarial probes (scratch script, no product writes): 1 MB pathological turns (`we word*200000 decided`, `a *500000 ?`, `we we ...*50000`) complete in 140 ms, no ReDoS; a turn whose sessionId differs from the session is dropped and counted as gap `unresolvable-evidence`; "We decided not to proceed. We have not decided. We decided to proceed." yields only the last sentence; quote equals the literal sentence and evidence points at exactly one turnId; Q&A answer evidence is a separate turn (t2) from the question evidence (t1). No tenant/auth surface is added: all turns are the session's own, already tenant-validated at processVideo (turns.some(t.tenantId/sessionId mismatch) throws).

## Falsification (copy under .chk-copy/, one mutation at a time, per-mutation byte backup restored immediately, timeout 120, no trap; `git hash-object` == `git rev-parse HEAD:<file>` after each: 8/8 OK)
| id | criterion | mutation | result |
|---|---|---|---|
| M1 | C1 | action cue branch `-> false` | KILLED (repro + reuse test fail) |
| M5 | C4 | interrogative skip removed | KILLED (negated/conditional test) |
| M4 | C4 | `MODAL_MAY` guard removed | KILLED (May test) |
| M8 | C3 | `_id` resolvability check removed | KILLED (unresolvable test) |
| M6 | C5 | digest re-pin removed | KILLED (upgrade-on-reuse test) |
| M2 | C2 | 3-turn answer window -> 39 | SURVIVED (bound untested) |
| M3 | C3 | session-scope check in resolvableTurn -> true | SURVIVED (cross-session drop untested) |
| M7 | C2 | answer leading-slice (280) removed | SURVIVED (answer length cap untested) |
Survivors do not break a stated criterion (C2 asserts separate evidence and the different-speaker rule; C3 asserts own-turn literal quote and unresolvable drop), so they are PROPOSED-ISSUE, not FAIL.

## PROPOSED-ISSUE
PROPOSED-ISSUE: {"feature":"w9-webinar-qa-items","severity":"low","title":"extractSpeechItems guards survive mutation: the 3-turn answer window (slide-knowledge.mjs ordered.slice(position + 1, position + 4)), the 280-char leadingSlice cap on answers, and the t.sessionId === sessionId scope drop in resolvableTurn are not asserted by any test; widening or removing them leaves process-video.test.mjs unchanged","fix_direction":"add 3 assertions: a reply 4 turns away stays unanswered; a >280-char answer is cut at a sentence boundary; a turn with a foreign sessionId yields a gap and no item","source":"checker A mutation M2/M3/M7"}
PROPOSED-ISSUE: {"feature":"w9-webinar-qa-items","severity":"low","title":"stale-notes rebuild in processVideo reuse path (process-video.mjs ~176-178) runs before and outside the .video-stage.lock check and writes notes.json then video-stage.json as two separate atomics; a concurrent video-stage run could interleave. Fail-closed (digest mismatch -> reprocess) so no corruption, but it can waste a vision run","fix_direction":"take the stage lock around the rebuild or write both under one lock; low priority","source":"checker A code read"}
PROPOSED-ISSUE: {"feature":"w9-webinar-qa-items","severity":"low","title":"checker A left untracked scratch in the worktree: .chk-copy/ (scripts copy, no junctions, no node_modules) and a stray file '.chk-copy$d' from a failed mklink; the sandbox denied the rm -rf, so the maker should delete them (plain files only) before merge","fix_direction":"delete .chk-copy/ and '.chk-copy$d' from the worktree; never commit them","source":"checker A housekeeping"}

Open from the manifest and not re-litigated: ISS-W9-001/002 (baseline reds), ISS-W9-003 (legacy non-strict path, 0 webinar callers; medium, correctly filed rather than fixed), ISS-W9-004 (adjacency Q&A), ISS-W9-005 (brain.ts does not yet display arrays).

Metrics: start=2026-10-28T15:50Z end=2026-10-28T16:20Z wall_min=30 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable builder_min=40 check_min=27 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1620 mutants=8 defects_unit=0 defects_6c=0

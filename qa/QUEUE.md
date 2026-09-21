# QUEUE — checker Mode B sweep 2026-09-21T23:50+05:30

> Range: `fb57a81..HEAD` (25 commits; prior sweep stopped at HEAD `91d7ed2`, BLOCKED).
> Bound root `D:/KnowledgeBase`. **Terminal state: FINDINGS: 5** — ISS-260 (high,
> bypass), ISS-261/262/263 (medium), ISS-264 (low). ISS-245 flipped open→fixed after
> on-disk verification. The 2026-09-19 sweep's five-commit bypass finding (ISS-260's
> subject) is now filed and its gap is covered retroactively. Cycle-number anomaly
> (verdicts at `Cycle checked: 1` vs manifests at `Fix cycle: 0`) measured and
> **closed-at-6**: the maker's close-outs were verified on disk this sweep.

## Current top 3 (backlog-priority order)

1. **Tier 1 — lint-loc split of `packages/index/src/pipeline/speakers-llm.test.ts`**
   (ISS-262). The structure gate is red at HEAD; the file crossed the 400-line budget in
   the `speaker-run-agreement` unit whose checker never re-ran lint. Split the two
   agreement tests into a sibling test file. Cheap, unblocks `lint:structure` for every
   later unit's manifest evidence.
2. **Tier 2 — U2.4 phase-3 precision re-gate, the phase-4 write unit's precondition**
   (roadmap tier 3; gate speaker-segment-identity A requires a hand-labelled corpus run at
   100% accepted precision + zero wrong links before any model-derived speaker write).
   ISS-255 is fixed (handover rule + 2-of-3 agreement) but the re-gate itself has not
   been run; the write unit stays blocked until it passes.
3. **Tier 3 — e31065a scope addendum + Dockerfile/compose diff-review** (ISS-263).
   Manifest addendum naming the extra files with verify evidence, or a DECISIONS/compound
   note covering the AGENTS.md landing; diff-review the Dockerfile and docker-compose
   hunks once. Unblocks nothing else, keeps the aggregate-landing precedent honest
   (ISS-260's fix direction).

**NOT re-filed (already covered):** lint-root 16>15 (ISS-248, Approver budget entry
pending); delivery-gate-stamp-adoption cycle-1 FAIL (ISS-227/228/229 maker fix gap);
`.last-tick` staleness (see note below); mc-sessionstart union hook (ledger-shard-union-hook
gate, open with the Approver). Gate answers legitimately on disk as of 2026-09-21:
speaker-segment-identity A, github-export-internal-qa A, external-eval-data-egress A,
iss-245-multifile-plan A.

## `.last-tick` note (fresh ruling)

`qa/.last-tick` file mtime is 21-09-2026 18:34:47 — 5 h 15 m old at sweep time — but its
last line records work at 2026-09-21T20:35:00+05:30 (~2 h 45 m before the sweep), and the
git log shows U2.4 commits up to 4c62df7 (17:21) with verdicts committed by checkers after
that. Work is recent, no `qa/.paused` exists, and the maker held its next build unit for
this sweep per the dispatch (ISS-221). **Ruled: not asleep; the mtime-vs-content offset is
recorded as a close-out hygiene note (see ISS-261), not a fresh ISS-054.** Next tick should
append a fresh stamp line (mtime refresh) when it resumes.

## State summary

- Union ledger: 262 rows (main 240 + c-unrun-writers shard 22), 262 distinct ids, 0 parse
  errors, 0 duplicate ids. Open: 1 critical (ISS-104) / 23 high / 38 medium / 24 low.
  Fixed 130, verified 64 (unchanged — verification debt stands).
- Goal: 62 tasks, 43 done, 2 in_progress (U2.4, U3.1), 17 pending. North star unchanged
  since the last contract amendment. No `.regrill-due`. T-021/U0.10 semantic leg
  checker-PASSed; both `in_progress` tasks await their closure units (U2.4's phase-4 write
  unit is gate-blocked; U3.1's remaining sub-items are U3.2-dependent).
- Handshake: 8 recent manifests all `checked-PASS` (0 pending); sole ready-for-check gap is
  the known delivery-gate-stamp-adoption cycle-1 FAIL. Working-tree diffs at sweep time
  (goal tracker heartbeat files + the maker's golden-set-semantic-leg status flip) were
  read as evidence and left unstaged.
- Bypass: 25 commits in range, 3 code-bearing gaps filed (ISS-260/263/264); the 20
  qa/verdicts+manifests+heartbeats and 2 probe-file commits are process-surface. ISS-104
  re-derivation probe (0c50eb6) is a read-only checker-support artifact (17/20 stable).
- Gates needing the Approver (pre-existing, not re-filed): d015-generalisation-scope,
  d023-supersede, delivery-gate-c4-heading-form (premise re-verified: the exact heading
  form appears in 4 verdict files, 5 occurrences), mc-hooks-manifest-blindness,
  handshake-liveness-contract-start, ledger-shard-union-hook,
  ui-surfaces-test-file-exclusion (Answered line carries no date/choice), plus ISS-215's
  gate-queue triage and ISS-221 (atomic issue-id allocation).

## Historical sweep — 2026-09-19T06:43+05:30 (superseded as routing; see git history)

Prior sweep routing (the 2026-09-10 and 2026-09-09 sweep sections and the 2026-09-21
maker landing note) was replaced in this refresh; read it at
`git show 5fab76e:qa/QUEUE.md`. Nothing in it was contradicted except items resolved
above (the five-commit bypass gap, ISS-245's fix verification, the U2.2/T-021 routing).
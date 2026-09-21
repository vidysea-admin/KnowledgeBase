# Manifest — T-021/U0.10 semantic embedding leg (2026-09-21)

Status: checked-PASS (qa/verdicts/golden-set-semantic-leg.md, Cycle checked: 0, commit 5fab76e)
Fix cycle: 0

**Unit:** run the golden-set semantic embedding leg under the ANSWERED egress gate (Option A,
2026-09-21), re-run the leakage diagnostics, and run the condition-4 semantic sibling pass.
Tier: 3 (roadmap — T-021/U0.10, deps done).

## Authorization trail
- `qa/gates/external-eval-data-egress.md` ANSWERED A (2026-09-21): the exact 92-question payload
  (preflight 2026-09-09: 9,920 bytes, SHA-256 0e00f2...) may go to Gemini embeddings; runs must
  use an explicit work DB.
- `qa/gates/golden-set-redesign.md` Option C acceptance conditions 1-4 are the binding contract.

## What ran (all work-DB `lkb_codex_work_20260909`, jobs writer disabled, production untouched)

1. **Semantic vector recall** (`pnpm exec tsx scripts/eval-recall.mjs --retriever vector`,
   `MONGODB_DB=lkb_codex_work_20260909`): embeds all 92 questions in ONE batched call
   (purpose=query, gemini-embedding-001) and scores brute-force cosine against the 1,452 real
   work-DB chunk rows.
   - **recall@5 = 0.935 (86/92 hits)** — condition 2: strictly between 0.217 and 1.000,
     6 non-zero misses. NOT 1.000, so no Option B escalation.
   - question-blind control cited beside the score: **0.217** (condition 1) — same-run output,
     `data/eval/recall-report-vector.json` records it in `control`.
   - `assessBaseline` verdict: INFORMATIVE (+0.717 over control).
   - Pre/post write checks: work jobs 0→0, chunks 1,452→1,452. No production/default-DB write.
   - Filter bias: none — 0 rejected candidates (kept === combined).
2. **Leakage diagnostics re-run** (`node qa/probes/golden-set-condition3.mjs --write`):
   turns-corpus unique-token pin rate **10.9% (10/92)** vs leaky-46 baseline 63% (condition 3's
   own threshold: well below 63%); verbatim overlap mean 0.161 / max 0.3125; near-verbatim
   (≥0.8) **0 page / 0 turns**. `data/eval/golden-set-diagnostics.json` refreshed.
3. **Condition-4 semantic sibling pass** (NEW probe `qa/probes/golden-set-sibling-semantic.mjs`):
   the step the lexical ambiguity probe explicitly named as missing ("question-to-session
   embedding pass"). Embeds the same authorized 92-question payload once (purpose=query), scores
   each question against every session's best chunk cosine in the work DB, and reports the
   margin expected-vs-best-rival per question (`data/eval/golden-set-sibling-semantic.json`).
   - The gate's own known-positive ("city or secluded campus", gq02) is DETECTED semantically:
     margin −0.0297, rival 2026-05-22-uniaccess-xavier (0.6919 vs 0.6622) — the lexical probe
     missed this question entirely (ISS-234).
   - All 6 vector-report misses have NEGATIVE margins (expected session's best chunk scores
     BELOW the best rival's): −0.0386…−0.0849. Reading: these are substantially
     sibling-ambiguity cases (uniaccess-* family and near-format sessions), not pure retriever
     failures. The margin distribution is continuous (p50 0.005), so no hard ambiguity cut is
     claimed; the per-question margins are published for human adjudication instead.

## Evidence (commands + outputs)
- recall line: `recall@5 = 0.935 (86/92 hits)` / `control (question-blind) = 0.217 |
  chance floor = 0.217` / `VERDICT: INFORMATIVE`.
- diagnostics line: `unique-token pin 10/92 = 10.9% (leaky 46-set 63.0%, prior 75-set 9.3%)`.
- sibling probe: `ambiguous (margin<0.03): 61/92` + per-question rows in the JSON; the six
  vector misses all carry negative margins (printed above).
- Mongo state: work jobs 0 before/after; chunks 1,452 unchanged; sessions 23.

## Honest scope statement
- The egress preflight SHA (0e00f2...) covered the 92 question strings as a JSON payload; this
  run embeds the same 92 strings, one batched call, purpose=query. No other text leaves.
- The margin threshold 0.03 is reported as a LENS, not a verdict: the distribution is
  continuous, so "ambiguous count 61" is not a claim that 61 questions are broken — the
  per-question rows are the deliverable.
- U1.4/U1.5 gate re-pointing (condition 4) may now cite this evidence; the >=0.85 exit criterion
  for hybrid remains NOT claimed (hybrid measured 0.870 vs vector 0.935 earlier; this unit did
  not re-run hybrid).

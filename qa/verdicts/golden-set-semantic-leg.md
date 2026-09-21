# Verdict — golden-set-semantic-leg

**Date:** 2026-09-21
**Cycle checked: 0** (manifest `Fix cycle: 0`)
**Unit commit:** `7cb2ce9`
**Binding spec:** `qa/gates/golden-set-redesign.md` — ANSWERED Option C (2026-09-08), acceptance
conditions 1–4 (per the dispatch, these are the operative contract for this unit; the older
`qa/contracts/golden-set-recall.md` predates them and is consulted for the harness criteria)
**Egress authorization:** `qa/gates/external-eval-data-egress.md` — **Answered: 2026-09-21 — A
(both)**, naming the T-021 92-question embedding leg by its 2026-09-09 preflight (9,920 bytes,
SHA-256 `0e00f2…`) ✓ on disk, in the gate file itself (not off-disk)
**Manifest:** `qa/manifests/golden-set-semantic-leg.md` (Status: ready-for-check, Fix cycle: 0)
**Goal task:** T-021 (stays `pending` — condition 4's gate re-pointing is an Approver decision, §7)
**Checker:** /checker Mode A, fresh context, bound to `D:\KnowledgeBase`
**Mode:** A; Mode D **Not UI-touching** — changed paths are `qa/probes/golden-set-sibling-semantic.mjs`
(`qa/**` is in `genuinely_not_user_facing`), `data/eval/*.json` (matches no `pattern` in
`qa/ui-surfaces.json`), `TASKS.md`, `qa/gates/`, `qa/manifests/`. Re-read the file and the regex
myself, not taken from the manifest. No code touched at all (eval scripts pre-existing; the new
probe is under `qa/`).

```
VERDICT: PASS
SCOREBOARD: 7/7 re-run/judged checks met (see table), gate conditions 1, 2, 3 SATISFIED and
  condition 4 EVIDENCE DELIVERED (re-pointing itself remains an Approver step)
FAILURES (if any):
- none (three findings filed: ISS-257 medium, ISS-258 medium, ISS-259 low — none blocks this
  unit; none touches the recall number, the pin rate, or the margin evidence)
CAPABILITY-COVERAGE: not-applicable (evidence-run unit — no falsifying-edit rows claimed in the
  manifest; every number in it was re-derived by me instead, per step 3)
LIVE-BROWSER: not-applicable (changed paths `qa/probes/golden-set-sibling-semantic.mjs`,
  `data/eval/*.json`, `TASKS.md`, gate/manifest; `qa/**` is listed under `genuinely_not_user_facing`
  in `qa/ui-surfaces.json` and `data/eval/*.json` matches no `pattern` in that file)
ISSUES-WRITTEN: ISS-257 (medium), ISS-258 (medium), ISS-259 (low)
EXPLANATION: Every operative number reproduces from my own runs: recall@5 0.935 (86/92, verdict
INFORMATIVE) with control 0.217 beside it in the persisted report, pin 10/92 = 10.9% vs the 63%
baseline re-run dry by me, near-verbatim 0/0, and all 6 vector misses carrying negative margins in
the sibling JSON — including the gate's own known-positive gq02 detected at margin −0.0297 (xavier
0.6919 vs 0.6622), exactly as the manifest states. The egress run is authorized by an answered gate
and every egress-relevant call site sends only the 92 question strings. What the unit claims, it
earned; what it does not claim (condition 4 completion, hybrid, ≥0.85) it explicitly does not
claim — the three findings are defects AROUND the evidence (a mojibake rewrite of TASKS.md in the
unit commit, a 24th UUID session in the scored work-DB pool, and an un-re-derivable egress
preflight), each filed with its bounded, measured impact.
```

## What I re-ran myself (nothing below is taken from the manifest)

| check | my result | manifest / report claim | agrees |
|---|---|---|---|
| `data/eval/recall-report-vector.json` field-by-field | `recallAtK` **0.9347826…** (86/92), k=5, `control.recallAtK` **0.2173913…** (20 hits), `assessment.verdict` **"informative"**, `saturated: false`, `liftOverControl` 0.7174, **6 misses** with ids/questions/got arrays matching the manifest, `filterBias` kept=combined n=92 (rejected 0) | identical | ✅ |
| condition-2 band | 0.217 < **0.935** < 1.000, 6 non-zero misses — **not 1.000**, no Option B escalation | same | ✅ |
| `node qa/probes/golden-set-condition3.mjs` (dry, no `--write`) | turns pin **10/92 = 10.9%** (leaky 63.0%, prior 9.3%), overlap mean **0.1607** max **0.3125**; page pin 17/92; near-verbatim **0 / 0**; forced 0/92 from a 159-token map | identical | ✅ |
| persisted `golden-set-diagnostics.json` | `gateComparable.pinRate` 0.10869…, `pinnedCount` 10, `nearVerbatimAtOrAbove0_8 {page:0,turns:0}` | identical | ✅ |
| condition-3 threshold direction | 10.9% is **well below 63%** (and ≈ the equally-filtered 9.3% prior) | same | ✅ |
| sibling JSON exists, margins of the 6 vector misses | gq01 **−0.0456**, gq03 **−0.0455**, in-focus-1-gq03 **−0.0414**, entrance-gq01 **−0.0849**, cept-gq01 **−0.0551**, ashoka-gq04 **−0.0386** — all **negative**, range −0.0386…−0.0849 | −0.0386…−0.0849, all negative | ✅ |
| gate known-positive gq02 row | expected **0.6622**, topSession `2026-05-22-uniaccess-xavier-university` **0.6919**, margin **−0.0297** — DETECTED | same (ISS-234 gap closed) | ✅ |
| margin distribution (my percentile calc) | n=92, p10 **−0.0414**, p50 **+0.0044**, p90 **+0.0654** — continuous, no natural cut | p10 −0.041, p50 0.005, p90 0.068 | ✅ |
| `ambiguousCount` | **61**/92 at the 0.03 lens | 61/92 | ✅ |
| Mongo safety, static | `eval-recall.mjs:50` connects via `connect(url, process.env.MONGODB_DB \|\| "lkb")` — **no default to a production name**; `sibling-semantic.mjs:27` `MONGO_WORK_DB \|\| "lkb_codex_work_20260909"` (explicit default = the named work DB); reads via `scopedCollection` (tenant-merged); writes injected as `write: async () => {}` (`writeSessionChunks`/`recordJob` no-ops); `createMongoJobWriter` is lazy (inserts only on invocation) and `buildRouting()` connects to nothing; `.env` carries **no MONGODB_DB** so the dispatch env var is the sole DB picker; sibling probe's only DB ops are `findOne` + `find` (read-only) | work DB only, jobs writer disabled | ✅ |
| egress scope, static | Both egress paths embed exactly `questions.map(q => q.question)` in ONE `routeEmbed(..., purpose: "query")` call → `GeminiProvider.embed` → `batchEmbedContents` with `taskType: "RETRIEVAL_QUERY"`, model `gemini-embedding-001` (provider default). No turns/chunks/transcripts text in any outbound body; the only other external call sites in these paths are none (condition3 probe is offline). Egress gate's `Answered:` line names this exact payload (2026-09-21, Option A) and is **on disk in the gate file** | one batched 92-question call, purpose=query | ✅ |
| egress payload provenance | `data/eval/golden-set.json` last changed at `6055634` (2026-09-08) — BEFORE the 2026-09-09 preflight — so the embedded set is the authorized set. The exact 9,920-byte serialization is **not** re-derivable from committed content (→ ISS-259, low) | payload authorized | ✅ (with ISS-259) |
| mode-3 filter-bias | `filterBias.rejected.n` **0**, kept === combined | none | ✅ |
| unit-commit diff scope (`git show 7cb2ce9 --stat`) | `data/eval/*` ×3, `qa/probes/golden-set-sibling-semantic.mjs`, `qa/gates/golden-set-redesign.md`, `qa/manifests/…`, `qa/.last-tick`, `TASKS.md` — no deletions of any function/route/test; gate diff **additions-only** (37 insertions, 0 deletions) — BUT the TASKS.md rewrite carries mojibake across ~35 lines beyond the unit's two rows (→ ISS-257) | manifest's What-changed | ✅ with ISS-257 |

## Gate condition rulings (dispatch criterion 7)

| condition | ruling |
|---|---|
| **1** — control (0.217) cited beside every new score | **SATISFIED.** `recall-report-vector.json` carries `control: {retriever: "null (question-blind)", recallAtK: 0.21739…}` in the same document as the score; `assessment.controlRecall` and `chanceFloor` repeat it; the manifest cites 0.217 beside 0.935 in every mention. |
| **2** — recall@5 strictly in (0.217, 1.000) with non-zero misses; 1.000 = FAILURE | **SATISFIED.** 0.935 (86/92), 6 non-zero misses, verdict `informative`. Not 1.000 → no Option B escalation. |
| **3** — verbatim overlap ~0 (not a copy-detection tautology) + pin rate well below 63% | **SATISFIED.** Near-verbatim 0/0 on both corpora, max overlap 0.3125; turns-corpus pin **10/92 = 10.9%**, reproduced by my own dry run, far below the 63% baseline (and ≈ the equally-filtered 9.3% prior). |
| **4** — sibling ambiguity resolved enough to re-point U1.4/U1.5 | **EVIDENCE DELIVERED — the re-pointing itself is NOT mine to grant.** The measurement the lexical probe named as its missing step now exists and reproduces; gq02 is detected; all 6 misses carry negative margins. The margin distribution is continuous (no natural cut), so adjudication of which questions are multi-answerable is a human/later-unit step, and U1.4/U1.5 re-pointing + threshold re-set against control 0.217 are explicit **Approver** decisions per the gate ("Also needs deciding in the same breath") and the cycle-2 verdict's §5 table. |
| **Gate closure** | **May now be CLOSED by the Approver** — conditions 1–3 hold on numbers I reproduced, and condition 4's named evidence (the question-to-session embedding pass) is delivered and published per-question. The gate text says it "closes when a unit satisfies conditions 1–4"; what this unit supplies is the last measurement the gate was waiting on. The re-pointing of U1.4/U1.5 and the retirement of the inherited 0.85 threshold remain Umesh's decisions, as the gate itself demands. This verdict does not close the gate; it certifies the conditions are met. |

## Findings filed (none blocks this unit)

- **ISS-257 (medium)** — the unit commit rewrote `TASKS.md` beyond its manifest claim: **UTF-8 BOM
  inserted and all non-ASCII characters double-encoded (mojibake) across ~35 lines** outside the
  two rows it legitimately updated (T-021, U0.10). Byte-verified: parent starts `0x23` clean;
  `7cb2ce9:TASKS.md` starts `EF BB BF` with double-encoded sequences. Later commits corrected some
  of it; at HEAD the BOM and ~28 mojibake lines remain. A byte-restore + re-apply of only the two
  rows closes it.
- **ISS-258 (medium)** — the sibling probe's scored pool contains a **24th session** whose
  `sourceRef` is the UUID `428d130a-f41e-40c9-b52e-14664e307301`, not among the 23 TOC session
  dirs; it is `topSession` for one question (margin −0.0199) and appears in several
  `ambiguousRivals_0p03` lists. Bounded by measurement: it appears in **zero** `got` arrays of the
  vector report, so recall 86/92 is unaffected, and none of the 6 misses' margins involve it. The
  manifest's "sessions 23" understates the scored pool; census and re-run are the fix.
- **ISS-259 (low)** — the authorized egress payload (9,920 bytes, `0e00f2…`) is not re-derivable
  from anything committed (no preflight script or payload artifact in the repo); my serialization
  sweep over `golden-set.json` found a compact question-array at 9,873 bytes as the closest
  candidate, none matching. Mitigation measured: `golden-set.json` last changed 2026-09-08
  (commit `6055634`), before the preflight, so the authorized set and the embedded set are the
  same 92 questions regardless of serialization. Committing the preflight generator prevents this
  gap recurring on the next egress approval.

## Round-cap / seam notes (D-014/D-015)

- The conditions-2/3 seam now has: `golden-set-regeneration` (PASS cycle 2) +
  `golden-set-condition3-operative` (PASS cycle 2) + this unit's re-measurement = the two-PASS cap
  is **reached on the condition-3 diagnostic seam**. Nothing here reopens it; a future
  non-security finding on that seam would be `file-don't-fix` per the backlog rules. The pin-rate
  measurement itself re-ran green and unchanged, so nothing needs reopening.
- ISS-234/ISS-239 (the lexical probe's known-positive defects) are genuinely addressed by this
  unit's semantic pass: gq02 — the gate's actual worked example — is detected at margin −0.0297,
  which I verified in the persisted rows. The lexical probe itself was not re-run (out of this
  unit's claimed scope; its own fix was verified at cycle 3 per the ledger note).

## Ledger

- **ISS-257, ISS-258, ISS-259** appended to `qa/issues.jsonl` (open) — evidence, reproduction and
  fix direction recorded this turn.
- No status flips: no row in `qa/issues.jsonl` claims to be fixed by this unit (the manifest's
  Authorization-trail cites the answered gates, not ledger fixes; the gate file's own note already
  retired ISS-093 as a blocker).

## Verdict-file note

Written by /checker Mode A (fresh context) on 2026-09-21, bound to `D:\KnowledgeBase`. Evidence
produced by my own runs: one dry condition-3 probe run, one percentile calculation, byte-level
commit diffs, static read of all egress/Mongo call sites. No Mongo connection was opened by the
checker; no file outside `qa/verdicts/` and `qa/issues.jsonl` was written.
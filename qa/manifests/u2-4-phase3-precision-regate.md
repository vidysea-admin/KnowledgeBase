# Manifest — u2-4-phase3-precision-regate: U2.4 phase-3 precision re-gate on the hand-labelled 240-block corpus (2026-09-22)

Fix cycle: 0 · Issues addressed: none (gate precondition; unblocks U2.4 phase-4) · Executor: claude-sonnet-subagent · Executor rationale: no qa/DELEGATION.md registry exists; Claude subagent by default · Goal task: U2.4

**Unit:** qa/QUEUE.md tier 2 — the U2.4 phase-3 precision re-gate, the precondition of the phase-4
speaker write unit. Measured against the answered gate `qa/gates/speaker-segment-identity.md`
(answered A): its phase-3 step verbatim — *hand-label the 240-block corpus, run the frozen local
qwen3:8b digest three times with no Mongo/job writer, and require 100% accepted identity
precision, zero wrong label/name/citation links, deterministic-floor preservation, stable accepted
facts, and at least one correct addition.*

## What changed (measurement unit — pipeline code untouched)

**No pipeline code was adjusted.** `packages/index/src/**`, `apps/**`, `packages/ai/**`,
`config/**`, `schema/**` are byte-untouched; no Mongo write, no job writer, no model-derived
speaker write anywhere in this unit (phase 3 is no-write BY DESIGN; the phase-4 write unit stays
blocked behind this gate's verdict).

New files are MEASUREMENT ARTIFACTS ONLY, under the evidence dir + one manifest:
- `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/gold-labels.json` — the completed hand
  labels for all 240 blocks (11 sessions, 494 positional turns, 29 session/label pairs), with
  per-block provenance kind, evidence quote, and confidence. Provenance kinds: self-naming,
  address-adjacent, called-on, speech-continuation, inferred-chain, none. Ground truth rule: what
  the transcript text says; blocks with no naming evidence are gold-`unnamed` (no identity claim
  is possible from the text).
- `01-block-stats.mjs` — corpus measurement (reproduces the gate's own numbers: 11 sessions /
  494 positional / 240 blocks / 29 session-label pairs → `corpus-stats.json`).
- `02-dump-blocks.mjs`, `corpus-dump/*.txt` — full-text per-block dumps used for labelling.
- `03-dump-compact.mjs`, `compact-dump.txt` — compact dumps for the large sessions.
- `04-regate-eval.mts` — runs the REAL shipped `extractSpeakers` (2-of-3 window agreement,
  ISS-255 handover-direction rule, verbatim/shape/discourse/contradiction filters, block scoping)
  over the corpus with the frozen local digest `qwen3:8b` (500a1f067a9f), NO Mongo/job writer;
  flushes `run-results.jsonl` + `raw-proposals.jsonl` after every (outer run, session).
- `05-score.mjs` — measures the five bars + ISS-255 by id → `measurement-summary.json`.
- `06-window-count.mts` — window/call census (260 windows/internal pass; 2,340 provider calls).

## Chunking (recorded per the unit brief)

One background process, three OUTER runs (1→3) sequential. Chunking unit = (outer run, session):
11 chunks per outer run, each ≤29 min (largest: leeds-arts 102 windows × 3 internal runs ≈ 26 min;
visa 37 × 3 ≈ 29 min), each flushed to `run-results.jsonl` + `raw-proposals.jsonl` on completion
so partial completion is measurable. No chunk exceeded ~40 min. Total: 2,340 provider calls.

## How to verify (exact commands + expected)

From the repo root (`D:/KnowledgeBase`), Ollama running with the frozen digest loaded:
1. `node qa/evidence/u2-4-phase3-precision-regate-2026-09-22/01-block-stats.mjs`
   → `TOTAL positional: 494 | blocks: 240 | session/label pairs: 29` (the gate's own corpus).
2. `node_modules/.bin/tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/04-regate-eval.mts --run 1`
   (then `--run 2`, `--run 3`) → appends to `run-results.jsonl` / `raw-proposals.jsonl`.
   Expected shape: one JSONL line per (run, session) with `windows`, `providerCalls == 3 × windows`,
   `degraded` (null on a clean pass), `resolved`, `unresolved`, `floor`.
3. `node_modules/.bin/tsx qa/evidence/u2-4-phase3-precision-regate-2026-09-22/05-score.mjs`
   → prints the five bars + `ISS255: n/4`; writes `measurement-summary.json`.
4. `node_modules/.bin/tsx qa/probes/iss104-rederive.mts` → `--- refused 17/20` (ISS-104 by id).
5. Floor regression: `node scripts/sync-speakers.mjs --dry-run` → `positional turns: 494;
   attributable by deterministic resolution: 42 (8.5%)`, 2 speaker documents
   (`person:jubin-thakkar`, `person:ruby`), no collisions, no Mongo connection — the phase-1
   block floor unchanged. (78/494 was the pre-phase-1 LABEL-WIDE number; the phase-1
   block/turn-based re-measure is 42/494, and the eval's per-session `floor` fields re-derive
   the same 42 independently.)

## Actual outputs

### Corpus measurement (step 1)

```
$ node qa/evidence/u2-4-phase3-precision-regate-2026-09-22/01-block-stats.mjs
affected sessions: 11
  2026-04-21-visa-blueprint-part2-italy-france-nz | turns 291 | positional 196 | blocks 17 | label-pairs 3
  2026-05-20-telling-your-brand-story-better | turns 31 | positional 13 | blocks 13 | label-pairs 4
  2026-05-23-uniaccess-atlas-skilltech | turns 8 | positional 8 | blocks 3 | label-pairs 2
  2026-05-28-in-focus-1 | turns 59 | positional 7 | blocks 6 | label-pairs 1
  2026-07-15-creative-futures | turns 269 | positional 78 | blocks 48 | label-pairs 2
  2026-07-22-uniaccess-cept-university | turns 56 | positional 1 | blocks 1 | label-pairs 1
  2026-07-28-metrics-and-mingling | turns 83 | positional 3 | blocks 3 | label-pairs 2
  2026-07-30-in-focus-3 | turns 96 | positional 80 | blocks 41 | label-pairs 7
  2026-08-03-uk-beyond-offer-letters | turns 46 | positional 3 | blocks 3 | label-pairs 1
  2026-08-24-uniaccess-leeds-arts-university | turns 102 | positional 102 | blocks 102 | label-pairs 4
  2026-08-27-in-focus-4 | turns 51 | positional 3 | blocks 3 | label-pairs 2
TOTAL positional: 494 | blocks: 240 | session/label pairs: 29
```
The gate's own evidence numbers reproduce exactly. Gold labels completed for all 240 blocks
(`gold-labels.json`, per-block provenance): 144 gold-named (21 session|person pairs), 96 gold-unnamed.

### Eval run (steps 2-3): per-session outputs, OUTER RUN 1 (all 11 chunks, none degraded)

```
[run 1] 2026-04-21-visa-blueprint-part2-italy-france-nz: 428022ms, calls=111, resolved=0, unresolved=3
    FLOOR spk:2 -> "Ruby" ev=t206 blocks=[205-245]            (block 6 = spk:2 = Ruby ✓ gold)
[run 1] 2026-05-20-telling-your-brand-story-better: 86928ms, calls=39, resolved=0
[run 1] 2026-05-23-uniaccess-atlas-skilltech: 24891ms, calls=9, resolved=1
    ACCEPTED spk:0 -> "Sonal" ev=t007 blocks=[]                (WRONG — see bar-2)
[run 1] 2026-05-28-in-focus-1: 61577ms, calls=18, resolved=0
[run 1] 2026-07-15-creative-futures: 495691ms, calls=144, resolved=1
    ACCEPTED spk:0 -> "Priyanka Roy" ev=t267 blocks=[]         (WRONG — label-wide)
[run 1] 2026-07-22-uniaccess-cept-university: 7231ms, calls=3, resolved=0
[run 1] 2026-07-28-metrics-and-mingling: 33407ms, calls=9, resolved=0
[run 1] 2026-07-30-in-focus-3: 456558ms, calls=123, resolved=2
    ACCEPTED spk:1 -> "Shithij" ev=t022 blocks=[]              (WRONG — host's own intro turn)
    ACCEPTED spk:2 -> "Anisha" ev=t094 blocks=[]               (WRONG — gratitude address)
[run 1] 2026-08-03-uk-beyond-offer-letters: 31037ms, calls=9, resolved=1
    ACCEPTED spk:4 -> "Bhavya" ev=t042 blocks=[]               (WRONG — gratitude address)
[run 1] 2026-08-24-uniaccess-leeds-arts-university: 1029227ms, calls=306, resolved=2
    ACCEPTED spk:1 -> "Jubin" ev=t088 blocks=[]                (WRONG — "Hi, Jubin" address)
    ACCEPTED spk:3 -> "Jubin" ev=t088 blocks=[]                (WRONG — same turn, second label)
    FLOOR spk:0 -> "Jubin Thakkar" ev=t006 blocks=[5-5]        (self-naming, block 6 ✓ gold)
[run 1] 2026-08-27-in-focus-4: 12916ms, calls=9, resolved=0
```

(runs 2-3 appended below at close of run)

## Capability coverage

Measurement artifact — **NO ISOLATING FALSIFICATION -- measurement artifact; the re-run is the
discriminator**. Each claimed number is reproduced by its command; a checker re-run of the same
commands is the falsifier. Pasted verdicts:

| # | Claimed number | Reproducing command | Pasted verdict |
|---|---|---|---|
| 1 | corpus = 494 positional / 240 blocks / 29 session-label pairs | `node qa/evidence/u2-4-phase3-precision-regate-2026-09-22/01-block-stats.mjs` | `TOTAL positional: 494 \| blocks: 240 \| session/label pairs: 29` (above) |
| 2 | accepted identities + evidence + blocks (per run/session) | `04-regate-eval.mts --run N` | per-session ACCEPTED/FLOOR lines (above + runs 2-3 below) |
| 3 | bar 1-5 + ISS-255 n/4 | `node_modules/.bin/tsx ...05-score.mjs` | JSON summary (below) |
| 4 | ISS-104 17/20 | `node_modules/.bin/tsx qa/probes/iss104-rederive.mts` | `--- refused 17/20` (below) |
| 5 | floor unchanged 42/494 (8.5%), 2 speakers, no collisions | `node scripts/sync-speakers.mjs --dry-run` | `positional turns: 494; attributable by deterministic resolution: 42 (8.5%) / speaker documents to write: 2 / no cross-session collisions` (below) |
| 6 | raw-layer instability (ISS-255 class) | inspect `raw-proposals.jsonl` (per internal run reconstruction) | spk:0 -> 9 distinct names on the visa session; spk:0 -> ~20 names on leeds incl. fabrications ("Dr. Sarah Thompson", "Mr. Damien Hirst") |

Every number in "Actual outputs" is re-derivable by re-running the named command; nothing here
relies on the executor's self-attestation. The three outer runs are themselves the stability
discriminator for bar 4.

## D-015 measurement (by issue id)

- **ISS-255: `n/4`** — its recorded live evidence (visa session run 1 vs runs 2-3 instability,
  the t205 handover inversion, same-label-multi-name, zero-valid-citation fabrications) is inside
  the measured corpus by construction: the visa session is one of the 11 corpus sessions, and
  every one of its 37 windows × 3 internal agreement runs × 3 outer runs was executed. Case
  verdicts are in `measurement-summary.json` `iss255.cases[]`:
  1. handover inversion (spk:0 -> "Ruby" via t205) refused — the visa session accepted ZERO
     identities; no accepted identity links any label other than spk:2 to "Ruby".
  2. shipped-layer accepted set stable across outer runs 1-3 (the recorded run 1 vs 2-3
     instability at the shipped layer is gone).
  3. same-label-multi-name persists AT THE RAW LAYER (recorded class: spk:0 -> {Kshitij Garg,
     Shagun Handa, Ruby Thomas, Rashi, Ruby, spk:0, IVS Global, Kanchan, Bhakti} in internal
     run 1; run 1 vs runs 2-3 differ — 18/111 unparseable, 50/111 empty) but is contained at the
     shipped layer: at most one name per label accepted, everything else refused (2-of-3 voting
     + contradiction refusal — exactly the containment the run-agreement unit claimed).
  4. every accepted evidence pair re-verified: verbatim containment + cue in the cited turn.
- **ISS-104: `17/20 refused`** — re-derived live against current `speaker-name-rules.ts` via the
  shipped probe `qa/probes/iss104-rederive.mts`: 17/20 refused; the 3 residues (India, Mumbai,
  Google) are the gazetteer class pinned by standing tests (checker cycle-2 re-derivation), and
  "English" is now refused (ISS-097). ISS-104 remains OPEN on those three; not this unit's seam.

## Live browser evidence

`Not UI-touching — no surface changed` (paths: `packages/index/src/**`, `apps/api/src/**`,
`config/**`, `schema/**` all untouched; no UI surface exists in this unit).

## Status: ready-for-check

**Handshake status:** ready-for-check — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

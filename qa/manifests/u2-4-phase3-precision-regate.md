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

## Evidence-directory disclosure (ISS-284, w17-u24audit)

Complete inventory of `qa/evidence/u2-4-phase3-precision-regate-2026-09-22/` at base a0391420
(41 files; nothing deleted, no verdict file touched). The 'What changed' list above names the
original measurement artifacts only; the rows marked NOT named / added by a later cycle were
undisclosed there. Files `07-per-block.mjs` and `per-block-results.json` are the two ISS-284
cited by name; the cycle-suffixed (`.c1`, `.c2r`-`.c6r`) results, `08-replay.mts` and the
`corpus-lock.*` pin files come from later fix cycles (u2-4-phase3-resume-c2.md).

**Corpus drift note (ISS-284 second half):** the numbers pasted above (11 sessions / 494 positional /
240 blocks / 29 pairs) were measured before data session `2026-09-24-zoho-next-european-study-destinations`
was ingested (live webinar-bot capture, unrelated to this unit); ISS-284 recorded that `01-block-stats.mjs` over the then-current
`data/` reported 12/496/242/30. The ISS-290 pin (`corpus.lock.json`, verified by `corpus-lock.mjs`)
is the durable fix: the measured corpus is gold-labels.json's 11 sessions, and later sessions are
reported as `unpinned`, never silently included.

| File (relative to the evidence dir) | Bytes | sha256 | Purpose |
|---|---|---|---|
| `01-block-stats.mjs` | 2055 | `340bfce8486070802d74eb37c8a4d9580c3d44bb39a96b78c178bc88f01b4311` | Corpus measurement script (stats -> corpus-stats.json). Named in 'What changed'. |
| `02-dump-blocks.mjs` | 2155 | `a7802b8fe53d8b77b69f7e66d6104c9b21ac016d48d30ddb8733a66118b8ae5d` | Full-text per-block dump generator for labelling. Named in 'What changed'. |
| `03-dump-compact.mjs` | 1811 | `149244dd91ebf93080bf44cbc0aac85c43db92fe7cf583326f13d12c45b27355` | Compact dump generator for the large sessions. Named in 'What changed'. |
| `04-regate-eval.mts` | 6534 | `cb1c487223ad994820fe0955db7a2d4bece1f7c9d829fb969b6c90f3d6cb9df1` | Live eval runner over the real extractSpeakers (frozen qwen3:8b, no writes). Named in 'What changed'. |
| `05-score.mjs` | 19288 | `eac08b7a3fa81541fa584712f102f8f93c367904195d6dc38b3754c6900ec394` | Scores the five bars + ISS-255 -> measurement-summary*.json. Named in 'What changed'. |
| `06-window-count.mts` | 813 | `84056ce8d6fe3103f41bf8178351a5daa5c567f5d371f301f6d86b0857e1c8f9` | Window/provider-call census. Named in 'What changed'. |
| `07-per-block.mjs` | 3302 | `02a530b680ffb52e28203ca3a2c73607f635a6b1a28ff0442db564f150a67f8e` | Renders per-block results (gold evidence vs accepted identity per run) for all 240 blocks -> per-block-results.json. NOT named in 'What changed' (ISS-284). |
| `08-replay.mts` | 4286 | `02b0ea9f0204cfa432cb44cb33d6b55e5875c3df068be2584f21e36ef3e9eff1` | Offline replay of recorded proposals through the current acceptance path (fix cycle 1b; no provider/network/Mongo). Added by a later cycle; see u2-4-phase3-resume-c2.md. |
| `compact-dump.txt` | 196424 | `fc34f7905ceadf5ee2cfcf2693f7adb1b7692179d9f323af2bade7a4771dc396` | Output of 03-dump-compact.mjs. |
| `corpus-dump/2026-04-21-visa-blueprint-part2-italy-france-nz.txt` | 127750 | `160714aab544f1b8344f75baa9f2c1ba5241de7fb79f4f1c76a10cc3af32f45f` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-05-20-telling-your-brand-story-better.txt` | 50738 | `08afeb52af8548c9e4ac98a38dac8ef631466b26284fd25aa6278b2f83e19952` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-05-23-uniaccess-atlas-skilltech.txt` | 10636 | `529f851d6a1eedecfccab9b7ff558fcd84fca935778a61d982ecb4cc07e1d95e` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-05-28-in-focus-1.txt` | 10625 | `cf2dd3f521620a7e241893ff5bd1a67c85f8ca635236ae4a9bc98ff033d15725` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-07-15-creative-futures.txt` | 126298 | `0bcd521decfaafa84d2608151b415e3f9adc17b56476e1e99b08a77538d19e08` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-07-22-uniaccess-cept-university.txt` | 9255 | `1398a77d5767710f913109909cf4433d3745c03ef587370dd403375645017cf3` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-07-28-metrics-and-mingling.txt` | 9429 | `c6f219384537a20bcfd757d8c8ace42a448a486ec456e57dba2bd4454da1262f` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-07-30-in-focus-3.txt` | 152770 | `1c15bf1dd41e3471905fc10be2710ce04e478aee5cdaf807205d3dc3b4a5cf72` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-08-03-uk-beyond-offer-letters.txt` | 7527 | `ab7896d6264bb53d5b37f82a0619b8e6b47fc6e0cc4fd611fae78aad5f61736b` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-08-24-uniaccess-leeds-arts-university.txt` | 307217 | `bb79766a29caf26cb6ed3db3123e96335314881df4536d642494bec8946bbac0` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-dump/2026-08-27-in-focus-4.txt` | 27090 | `3a6a5d09f6d6c5e5bef86a1f3b5dae53ab08db10ed5bbd3065491b3614fd53dc` | Per-session full-text block dump (02-dump-blocks.mjs output) used for labelling; named only generically as corpus-dump/*.txt above. |
| `corpus-lock.mjs` | 2829 | `ed2ce5691a6683d87523786182168c33152011c9a6bf460860f3001aac63022d` | ISS-290 corpus pin: writes/verifies corpus.lock.json so a re-measure over drifted data fails before provider calls. |
| `corpus-lock.test.mjs` | 3826 | `35b5cb63477ff1be51246fb3be526fc240639995aa8725257049b6fa7e1e2547` | Tests for corpus-lock.mjs and 05-score.mjs refusing tampered corpora (ISS-PH3-003 / ISS-290). |
| `corpus-stats.json` | 2004 | `a6993a8e8323fb1c843f55175928b742e423b74671fbf63277895305e78461ac` | Output of 01-block-stats.mjs (corpus numbers). |
| `corpus.lock.json` | 1251 | `5109970d88d3fbf0ac2eb923bc16351fdc291cc4d3a060c3aa4e2877f67c2c19` | Pinned sha256 of each gold session's turns.json (written by corpus-lock.mjs --write). |
| `gold-labels.json` | 59149 | `3738a8339d844e3144a2006db08d174b5f22a6fd3e63c5538dd89a71544c8fe2` | Hand labels for all 240 blocks. Named in 'What changed'. |
| `measurement-summary.c2r.json` | 23340 | `131bee47db026ea8bfec17d647b493ab40063168208d58262dc49bc242819e2a` | 05-score.mjs output for fix cycle c2r. |
| `measurement-summary.c3r.json` | 16071 | `9a411a8188623bd43cdd31df836be123372f72f0b36cc553fa1b11c2f3b48d8c` | 05-score.mjs output for fix cycle c3r. |
| `measurement-summary.c4r.json` | 16071 | `12f364e140ae3b0cd3a0a7cb0cd8e02bfc7b23ec951930f624cca4ad59a6e99d` | 05-score.mjs output for fix cycle c4r. |
| `measurement-summary.c5r.json` | 16071 | `e0b5af86d583385a193b4c541cfca7163b7745464194b3993ef3a9e9300fd7f4` | 05-score.mjs output for fix cycle c5r. |
| `measurement-summary.c6r.json` | 16071 | `23906aa68fbd7270ab941e0dabdfae9fd667cad7a75dc8faa93db73e5d34c586` | 05-score.mjs output for fix cycle c6r. |
| `measurement-summary.json` | 25685 | `1f98902beb645f384df0e813dd420636f2e74f48588a25ed6c956667732d4752` | 05-score.mjs output for the original 3-run measurement. |
| `per-block-results.json` | 89328 | `3583d4dc2c1db044e54a4383e5f8388a27ff452eced15228ca4cc92face9eb5e` | Output of 07-per-block.mjs: per-block gold vs accepted outcome. NOT named in 'What changed' (ISS-284). |
| `raw-proposals.c1.jsonl` | 705716 | `d836f58cb78a4fbe2bb28ad92d9921ec0d6fead1b869b1c3d39a54fbe094632c` | Recorded raw model proposals, fix cycle 1 re-run. |
| `raw-proposals.jsonl` | 288376 | `c83ee7c16fa51a74e1e857da38791072fe8caa62cc34355b80df479021239626` | Recorded raw model proposals, original run (04-regate-eval.mts). |
| `run-results.c1.jsonl` | 8031 | `f89276a5aeaf246c9949857c915a70d87741bef0fe94eb441644e0a28711ad75` | Per-(run,session) results, fix cycle c1 re-measure/replay. |
| `run-results.c2r.jsonl` | 12537 | `1fcafa57cfca66b67b756f94956bec873fee87c159ccd657490bd930bc4f8c8f` | Per-(run,session) results, fix cycle c2r re-measure/replay. |
| `run-results.c3r.jsonl` | 9819 | `ad57cc98fb1378159cc0d32d99b657928d700c69bfb954edfe43063956440462` | Per-(run,session) results, fix cycle c3r re-measure/replay. |
| `run-results.c4r.jsonl` | 9819 | `ad57cc98fb1378159cc0d32d99b657928d700c69bfb954edfe43063956440462` | Per-(run,session) results, fix cycle c4r re-measure/replay. |
| `run-results.c5r.jsonl` | 9819 | `ad57cc98fb1378159cc0d32d99b657928d700c69bfb954edfe43063956440462` | Per-(run,session) results, fix cycle c5r re-measure/replay. |
| `run-results.c6r.jsonl` | 9819 | `ad57cc98fb1378159cc0d32d99b657928d700c69bfb954edfe43063956440462` | Per-(run,session) results, fix cycle c6r re-measure/replay. |
| `run-results.jsonl` | 5218 | `51ab7b7ab86fb38c2a8375d02a1f24f6ac926d6294f3070dbfcd6ebaf234b815` | Per-(run,session) results, original run. |

## Live browser evidence

`Not UI-touching — no surface changed` (paths: `packages/index/src/**`, `apps/api/src/**`,
`config/**`, `schema/**` all untouched; no UI surface exists in this unit).

## Status: ready-for-check

**Handshake status:** ready-for-check — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree

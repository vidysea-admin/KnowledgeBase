# Checker packet — goal-u010, cycle 1

Repository: `C:\Users\product\Desktop\KnowledgeBase`.
Skill: `skills/maker/SKILL.md`; checker uses `skills/checker/SKILL.md`.
Manifest: `qa/manifests/goal-u010.md`; independent verdict `qa/verdicts/goal-u010.md`.
Contract: `qa/contracts/goal-u010.md` A1–A16, SHA-256
`8bb7c459f93885c05f42b6667929e87757422f3c54f98aa13f7a57733ab35ee8`.
Source-scope candidate only; whole U0.10 stays HOLD for actual full ordered model
runs and genuine thirty-pair human agreement. Active user ALL40 scope is preserved.

## Source/caller map and security boundaries

All changed implementation logic lives in the five complete new source files listed
below; no old implementation file is modified. The actual source is authoritative.

| Path/symbol | Callers/consumers and critical behavior |
|---|---|
| u010-corpus.mjs `freezeCorpus` | Runner CLI before dotenv/provider imports. Binds golden/provenance/diagnostics/semantic data, production source and session/page bytes. Identity/tenant/duplicate/missing references refuse. Five directories without either session/page are explicitly excluded; half-present pairs refuse. Current default judge nodes use exact title+summary, review-style session IDs. Real human mode reuses T022 `validateHumanCalibrationInputs`: stored export +30confirmations +independent checked receipt bound by existing operator-configured digest. Plain typed approval fields cannot authorize real scoring. |
| u010-provider.mjs `productionScorer` | Runner calls actual apps/api/src/score.ts createLlmScorer plus existing Ollama/Gemini adapters. Direct explicit adapter prevents ambient router telemetry/jobs from performing additional uncapped I/O. Same production prompt/parser; exhaustive relevance ranking is explicitly not selectNodes traversal, embeddings, hybrid or /ask. Persist reason classification/hash only. |
| u010-provider.mjs `boundedHttp` | Runner transport receives explicit official request; fetch uses composed run/call abort signal, redirect:error and bounded one-MiB streaming response. Redirects cannot forward keys/private prompts or create unbudgeted calls. No CLI transport. |
| u010-state.mjs | Exclusive checkpoint directory, atomically PID-named acquisition guard, exact dead-PID recovery without age expiration. Immutable first snapshot then small hash-checked deltas; fsync temporary file before atomic rename. Exact uncommitted temp cleanup only inside owned checkpoint. Monotonic reserved attempts/completed cells cannot be rewritten; live/unknown/corrupt owners refuse. Legacy unowned .acquire-lock or corrupt owner metadata requires verified operator cleanup; no unknown lock is stolen. |
| u010-baseline-run.mjs `runBounded` | Real exported paid entry re-freezes actualROOT inputs and independently validates human proof against current process-owned operator digest; typed corpus hashes/approval flags cannot substitute. Bound source bytes are rechecked before/after dynamic imports and at completion. Source drift persists invalid provenance and blocks predecessor acceptance/resume. Validated lifetime call ceiling, finite total/per-HTTP deadlines, official HTTPS origin/path/POST and no URL user/password. Each actual transport attempt is reserved BEFORE HTTP; partial candidates never become scored questions. |
| u010-baseline-run.mjs `validatePredecessors` | DeepSeek requires a complete corpus-bound GLM predecessor; Gemini requires both full Ollama predecessors, matching kind and real/synthetic evidence class. Synthetic checkpoints cannot authorize real model ordering. |
| u010-baseline-audit.mjs `auditRun` | Revalidates checkpoint identities, corpus/config hashes and receipts; recomputes top-k/hits/misses/control on identical full/scored/pure populations. Fallback contamination excludes entire ranked question from pure metrics. Empty scored population is null/unavailable. Reports all selected/scored/unscored/partial IDs, counts and unknown spend. |
| u010-baseline-run.mjs calibration consumer | Validated exact thirty approved references flow through per-pair actual scorer; existing packages/ask/src/eval/calibration.ts computeMAE consumes those exact inputs and audited predictions. No MAE threshold or production tuning is invented. |
| u010-baseline-audit.mjs `auditHistorical` | Consumes four historical files, verifies available arithmetic, marks partial/DERIVED/unavailable/inferred evidence. Never invents missing hit ranks, input hashes, unscored IDs or historical stitching. |

Production context excerpts: `createLlmScorer` sends `{kind:"evaluator",messages:[system
prompt,user Query/Document title/Document summary]}`; provider errors/unparseable
responses return the existing named heuristic fallback. The new factory supplies
`provider.complete(job)` after requiring evaluator jobKind. Ollama config passes the
existing `env.OLLAMA_API_KEY` only to this explicit eval instance; Gemini analogously
uses `env.GEMINI_API_KEY`. Neither key, auth header, full URL or raw exception is
persisted. All actual request/response content is hash-bound; provider reasons are
hash/classified. Existing local-speaker/default routing is untouched.

## Acceptance/gap matrix

| Clauses | Engineering evidence / whole-task gap |
|---|---|
| A1–A2 | Exact algorithm, tenant, ordered question/candidate IDs, source bytes/hashes and production prompt hash frozen before paid scoring; real current-input test. |
| A3/A5 | Existing Option C lineage/diagnostics bound and limitations retained; generation corpus23 is distinct from evaluated29. No new independent question generation, pin measurement or human adjudication claimed. D-156 remains binding. |
| A4/A7/A9 | Report arithmetic, per-ID full rankings, subset/pure controls, null empty metrics, partial/unknown/fallback distinctions covered by focused tests. |
| A6/A10 | Full runner implemented. Actual Ollama and Gemini adapters use fake HTTP in scoped tests. Actual full ordered paid baseline runs remain NOT RUN by this maker; historical75/92 is partial and cannot be stitched. |
| A8/A14/A15 | Pre-I/O cap/time/official-host constraints, explicit keys, no ambient telemetry/jobs; atomic delta checkpoints, owner/refusal/recovery and drift/corruption probes. Cost0 is unpriced/unknown, never free. |
| A11–A13 | Existing30-pair legacy MAEs remain DERIVED proxy. Actual neutral review packet is pending; genuine human review/live agreement and independent operator-bound T022 receipt/config remain HUMAN gate. Synthetic fractional30-pair export and actual computeMAE verify only engineering; plain asserted-reference real runs refuse. No real approval or threshold is invented. |
| A16 | Focused affected-stage→checkpoint→audit downstream evidence plus current corpus and actual computeMAE fixtures. Final central thirteen-case command passed; all nine source/dependency pins unchanged. Attributed frozen-validator evidence remains vacuous. No broad check claim. |

## Commands, runtime and execution facts

Exact focused command and hard outer60s controller: maker evidence
`qa/evidence/goal-u010-maker/verification.md`. Run in repository root, serial one
process, under a NEW broker `/root/docker_checker` CPU lease. Do not run suites,
providers, browsers, DB, duplicate central validator or arbitrary shared verification.
In-process Node tests, tsx/esbuild and actual scorer/provider imports succeeded in
the default sandbox; no escalation was needed in the recorded twelve-case run.
All fake checkpoint/report fixtures use unique verified temporary directories and
are deleted after downstream audit. Synthetic assertions remain visibly labeled.

The independent checker owns only `qa/contracts/goal-u010.md`,
`qa/verdicts/goal-u010.md`, and `qa/evidence/goal-u010-checker*`. Maker owns these
new implementation/manifest/packet/evidence files. Shared integration/trackers/git
writes remain exclusively `/root/docker_runtime`.

Future real command shape (NOT EXECUTED; requires root provider/config/CPU lease):

```powershell
node scripts/eval/u010-baseline-run.mjs --tenant toc --provider ollama --model glm-5.3-flash --kind recall --max-calls 2700 --max-seconds 14400 --call-timeout-ms 300000 --checkpoint <NEW-owned-directory>
```

DeepSeek adds `--predecessor <full-GLM-snapshot-file>`; Gemini is LAST with both
full Ollama predecessor snapshot files, explicit root-verified model and existing
GEMINI_API_KEY. No key values belong in commands/packets. Resume adds `--resume`
on the exact owned directory with an explicitly approved ceiling/time budget.
Calibration adds the authoritative `--review-export <repo-relative-file>`,
`--human-confirmations <repo-relative-file>` and `--verified-receipt <repo-relative-file>`
plus existing operator-configured `T022_VERIFIED_CONFIRMATIONS_SHA256`, kind calibration
and30+call ceiling. Genuine reviews/proof/config are not available now; this maker
never creates them. These gates validate before provider modules/keys load.
Audit consumption is `node scripts/eval/u010-baseline-audit.mjs <snapshot-or-historical.json> <NEW-output.json>`.

## Final candidate pins and attributed execution

Historical cycle-0 pins and execution below remain immutable evidence of that
maker run; independent cycle-0 verdict is FAIL. Current cycle 1 is building.
No source PASS or whole-task completion is claimed.

| Path | SHA-256 |
|---|---|
| scripts/eval/u010-corpus.mjs | 02f6dfab40717e9a2c2aeabad4aea7afaa78218f8308fedb22f2dc54ef8d54cf |
| scripts/eval/u010-state.mjs | e62940d0e602dc612da3f2fae5f43104fb1937fb0c2dd7a58430aeb92d8d4abe |
| scripts/eval/u010-provider.mjs | 37ef3377b2c84e59e9fe82cdefc44e1a987420f437155028aa3133f53e32f391 |
| scripts/eval/u010-baseline-run.mjs | 9e5050ce64ee4aa2b13725f497e7f9895e1f144bee41ee01d1a13e90713b232f |
| scripts/eval/u010-baseline-audit.mjs | aaebeea07f09f1dc9aff31fcd61af930a1f00a6426dad996d351991f94b2d6ca |
| scripts/eval/u010-baseline-run.test.mjs | dcba30c285e7ef6dc2d6c3e98547268dc1dcd9bcf01b297e423cfc6add5924b0 |
| scripts/eval/human-calibration.mjs (unchanged dependency) | 58359234135f080f19e7647c3aade7659e606ee3cddc27a4731ffcc187550ecf |
| apps/api/src/score.ts (unchanged dependency) | ca1992ebbc963c6b18a05f7ca42aeea7a4fc313d6b014acec3394406cbbc6d78 |
| packages/ask/src/eval/calibration.ts (unchanged dependency) | d020cea126f1be037034c6cf7228958371defe2fa2ecf53985fbc4a167fa57d4 |

Broker `/root/docker_checker` executed the final source bytes centrally:

```powershell
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/eval/u010-baseline-run.test.mjs
```

Outer timeout 60000 ms; UTC 2026-10-14T20:11:28.228Z–20:11:32.645Z;
exit 0, thirteen pass, zero fail/skip/cancel/todo. TAP duration 4298.0939 ms;
wall 4413.3813 ms. All nine pins match before/after and the maker's current read.
Receipt `qa/evidence/goal-t051checker-broker-u010-final.json` SHA-256
`76315611d0f4a84b290de98cd4115f1e8c07c06acfc840efb23d9a4a18b7e786`;
stdout `.stdout.txt` SHA-256
`3f9148a030e3a9b35ee9d12f3be865fe0114e66036eba9b64e21e93856712b22`;
empty stderr `.stderr.txt` SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
The maker did not execute a duplicate run. Earlier twelve-case evidence applies
only to older bytes. Fake HTTP and synthetic human approvals prove engineering;
actual full baselines and genuine human agreement are still not available.

## Cycle 1 candidate — ready-for-check

ISS-U010CHECKPOINT-001 is an actual independently reproduced security/data-write
finding, not capped. Prior13PASS covers the preceding bytes only. State source now
uses UUID owner identity, successful-creation and descriptor/current-file identity
checks before cleanup/release; foreign/replacement lock files remain untouched.
Guard cleanup verifies directory identity; PID liveness requires positive valid PID.
Standing suite embeds the ledger frozen-clock recipe verbatim and adds meaningful
ownership failure/replacement cases. It now has fifteen cases, all passed in
central broker execution below. Status: ready-for-check; Fix cycle: 1.

Changed cycle-1 pins:

- scripts/eval/u010-state.mjs: 04354bb707f57421a01568eab195418ed9178fe2be4ec9ed815e43f85b1d14d2
- scripts/eval/u010-baseline-run.test.mjs: 3a175a8704ac737d848c2721d7aaf0afae9e22c14871fd72f1091d9762c23fde

All other cycle-0 implementation files are unchanged; the current maker read
matches all nine pins in the cycle-1 receipt. Independent cycle-1 verdict is
required before close-out. The preceding source/caller map and A1–A16 scope apply;
A14 now also binds owned descriptor/current file identity and exact ledger floor.

Central broker executed the exact standing command shown above, outer 60000 ms,
UTC 2026-10-14T20:43:13.243Z–20:43:17.053Z: exit 0, 15/15 PASS, no skip/cancel/todo;
TAP 3701.7637 ms, wall 3805.5458 ms; all nine before/after pins unchanged.
Receipt `qa/evidence/goal-t051checker-broker-u010-cycle1-standing.json` SHA-256
`f23785a296bcbe004476d3de1c2df088ea03f557e34540d882b1f4ad3bd17e62`.

Exact ledger reproduction command, unchanged independent corpus:

```powershell
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --test-name-pattern="A14 PID acquisition guards" qa/evidence/goal-u010-checker.test.mjs
```

Outer 60000 ms; UTC 2026-10-14T20:43:20.002Z–20:43:20.172Z; exit 0, 1/1 PASS;
TAP 69.8137 ms, wall 166.0382 ms; all ten before/after pins unchanged including
checker script `db57b68d32ceddec06be25d4dde72e38da90080ab8cd95e80d4919ba0f96048d`.
**ISS-U010CHECKPOINT-001: 1/1 owner preserved**. Receipt
`qa/evidence/goal-t051checker-broker-u010-cycle1-ledger.json` SHA-256
`cebb29c98d7db61d81dd07db45a61cbb51a26a916aa6e57d3ba628b669179b70`.
Raw stdout/stderr paths are recorded in each immutable receipt. Prior red and
fixture-harness-failure artifacts remain intact. These are attributed broker
executions; the maker ran no duplicate.

## Matching source close-out

Status: checked-PASS; Fix cycle: 1. Independent checker verdict SHA-256
`78ef98bc9c586cdd78094c789f784e831cf832d3a480d1d4a42c2c23b127eebd`,
cycle checked 1, source utility PASS only. Its full six independent probes passed
6/6, exit 0, TAP 931.0867 ms, wall 1043.8314 ms, UTC 20:55:25.818Z–20:55:26.867Z
on 2026-10-14. Actual receipt
`qa/evidence/goal-t051checker-broker-u010-cycle1-independent.json` SHA-256
`a4dce95b22dbe2ba74c70b56bc13ab21962c2874544d2e1f86d604fd521cff4d`.
Maker read matching verdict and current ten source/dependency/probe pins; all match
actual before/after receipt. Only manifest/packet/evidence lifecycle text changes.
Whole U0.10 still HOLD; no task tracker closes and no provider/human evidence is
invented. Dispatch-only next-stage plan: `qa/packets/goal-u010-provider-plan.md`.

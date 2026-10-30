# w17-champproof manifest
Status: superseded-by w17-wireapi (79571b92 PASS; F1 fixed, mongo-store.ts verifyEvidence)
Fix cycle: 1
Base: 9e55b642. Lane: lane/w17-champproof.

## Change
GET /championship/:id now recomputes each trial's quote proof (answerEvidence(trial.aiAnswer) through createMongoEvidenceVerifier, tenant-scoped). Failure strips aiAnswer.sources to {internal:[],web:[]}, sets aiAnswer.reason (answer-workflow stale text) and trial.state="stale". Cited trials with no verifier on the store fail closed. Trials with no sources are untouched.
Wiring: optional `verifyEvidence` on ChampionshipStore, supplied by createMongoChampionshipStore (no composition change). No web/native verifier is wired, so web- or native-sourced trials are stripped on read.

## Paths
apps/api/src/routes/championship/championship.ts, apps/api/src/championship/mongo-store.ts, apps/api/src/routes/championship/championship-proof.test.ts

## Checker runs
node --test --import tsx (from apps/api): championship-proof, championship.test, mongo-store.test, runtime.test, stale-citation-refusal, native-answer-evidence; tsc --noEmit -p tsconfig.json.

## Evidence
proof test 5/5; championship 1, mongo-store 3, runtime 5, stale-citation 3, native-answer-evidence 7, all pass; tsc clean.
D-020 mutation (skip verifier, ok = true): 4 of 5 fail (killed), restored.

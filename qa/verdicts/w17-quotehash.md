# Checker verdict: w17-quotehash

VERDICT: PASS
Status: PASS
Cycle checked: 1
Reviewed SHA: 236f74dcb1bc533c93479dab9a4221199f61596f
Base SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-quotehash (lane/w17-quotehash)
Checked at: 2026-10-17T17:19Z
ISSUES-WRITTEN: none (two follow-ups recommended below; this checker commits only this file)

## Identity
- `git rev-parse HEAD` = c0359029... (the candidate), base resolves to 9e55b642..., worktree clean apart from checker evidence.
- Diff base..candidate: packages/ask/src/source-context.ts (+36/-1), packages/ask/src/quote-proof-live.test.ts (new, 8 tests), qa/manifests/w17-quotehash.md (new). Matches the manifest.
- Final blob packages/ask/src/source-context.ts = 0cb7a5e0c37b9439b8100745a87d77cd20ac8dab (worktree `-c core.autocrlf=true hash-object` == `HEAD:` blob after mutations).

## Checks (run independently, one at a time, `timeout 600`, from packages/ask, node v24.19.0)
Evidence directory: qa/evidence/w17-quotehash-checker/ (logs + `.exit` files; not committed)
| # | Command | Exit | Result |
|---|---|---|---|
| t1 | node --test --test-force-exit --import tsx src/quote-proof-live.test.ts | 0 | 8/8 |
| t2 | node --test --test-force-exit --import tsx src/source-context.test.ts | 0 | 18/18 |
| t3 | node --test --test-force-exit --import tsx src/ask-graph.test.ts | 0 | 59/59 |
| t4 | node_modules/.bin/tsc --noEmit -p tsconfig.json | 0 | clean |
| t5 | checker probe qa/evidence/w17-quotehash-checker/probe.test.ts | 0 | 5/5 |

Environment note: packages/ask/node_modules is a junction into the main tree, so @lkb/core resolves from main. That is acceptable because the diff touches only packages/ask, and the source under test is imported relatively from the lane.

## Brief items
1. **Canonicalisation matches the producer.** apps/api/src/ask/source-context.ts:47-63 `quote()` uses `turn.text.slice(charStart,charEnd)`, `sha256(update(text,"utf8"))` with no normalisation, and `Buffer.byteLength(prefix,"utf8")` for byte offsets. packages/ask/src/source-context.ts:94-106 `staleQuoteProof` uses the identical expressions. The probe (t5 test 1) builds proofs with a verbatim copy of the producer arithmetic. It covers NFD combining marks, astral emoji, Devanagari, CJK and a JSON-round-tripped lone surrogate, and every proof is accepted. t5 test 2 shows that NFC-normalised live text is refused, so the guard performs no normalisation. answer-evidence.ts:79-84 uses the same canonicalisation too.
2. **The summary rewrite cannot leak dropped text.** The validator already requires `node.summary === JSON.stringify(quotes)` (line 194). The rewrite sets `summary: JSON.stringify(good)` and `evidence.sourceQuotes: good` (line 206). The hydrator's evidence has only sessionRef, sourceQuotes, sourceSnapshotSHA256 and sourceMode, so it carries no other quote text. t5 test 4 confirms that the dropped quote's unique text is absent from the serialised output.
3. **No path cites a dropped quote.** ask-graph.ts:103 uses the return value. Its later reads of `hydrated` are only degraded, excludedTurns, snapshotSHA256 and sourceBytes. In the mixed transcript+native path (apps/api source-context.ts:293-297), the composed result is built from the filtered `proven` list, and the second validateHydration in ask-graph re-checks those nodes. A stale turn appended to excludedTurns makes any re-cite of that turn throw "excluded turn cited", which is fail-closed.
4. **The no-`liveTurns` path is unchanged.** It returns a new array holding the same node objects. Output JSON and input JSON are byte-identical, and excludedTurns is untouched (t5 test 5, and the maker's test 2).
5. **"Consistent by construction": TRUE for the live hydrator, but the claim is incomplete.** Proofs are built from `snapshot.rows` in the same request, so passing `liveTurns: snapshot.rows` there would be tautological and adds no protection. Persisted answers on /answer-history, get, queue and conflicts are recomputed through `published()`/`snapshotFreshness()` and then `createMongoEvidenceVerifier` (answer-evidence.ts:73-84). **There is one gap:** `GET /championship/:id` (apps/api/src/routes/championship/championship.ts:22-25, then championship/runtime.ts:64 `trials: structuredClone(event.trials)`) serves persisted `aiAnswer.sources.internal[].evidence.sourceQuotes`. Those were written at ask time by compete.ts:99-105 and evaluation-flywheel/workflow.ts:184, and they are served with no recomputation. The route is tenant-scoped, under the `compete` scope, and labelled "References are unverified assertions". It is not a cross-tenant leak, but it does serve stale citations. **Required follow-up (apps/api unit):** in `championshipReport`, or in the GET handler, run `createMongoEvidenceVerifier(db)(tenantId, answerEvidence(trial.aiAnswer))` for each trial. When that returns false, strip `aiAnswer.sources`/`scored` and mark the trial `evidenceStale: true`, mirroring `published()`. Wiring `liveTurns` into createSourceHydrator does NOT close this gap. The manifest's "activates the guard in production" overstates what that change would do.
6. **Checks:** see the table above. All exits are 0.
7. **D-020 mutation (checker-owned).** Harness: qa/evidence/w17-quotehash-checker/mutate-byteoffset-whole.sh, with a per-mutation `mktemp` backup taken immediately before the mutation, `trap restore EXIT INT TERM ERR`, `timeout 600` per test, `cmp` after restore, and the HEAD-fidelity check `git -c core.autocrlf=true hash-object` == `git rev-parse HEAD:packages/ask/src/source-context.ts` = 0cb7a5e0... (equal).
   - Mutation m1 (`false && <byteStart check>`) was ineffective: operator precedence left the byteEnd half active, so the probe still passed. It is recorded, not counted.
   - Mutation m2 (the whole byte-offset condition disabled) **survived the maker suite at 8/8** and **was killed by the checker probe** (t5 test 3 failed with "byte offsets shifted consistently"). The ERR trap restored the file, cmp passed, and the hash equals HEAD.

## Findings
- **F1 (medium, test gap, non-blocking): source-context.ts:103-104.** The byte-offset branch has no test in quote-proof-live.test.ts, so a proof with byteStart and byteEnd shifted consistently passes the precheck at line 186, and only line 103 rejects it. Fix: add the checker probe's "byte offsets shifted consistently" case (probe.test.ts test 3) to quote-proof-live.test.ts. Verify it in the next unit that touches this file.
- **F2 (medium, pre-existing, outside the diff): the championship serve path described in item 5.** Required follow-up as stated there.
- Notes (low, EXPLANATION only):
  - (a) `liveTurns: null`, a non-array, or a null element throws TypeError instead of BoundedAskError (lines 153-154). It still fails closed.
  - (b) Within one call, `excludedKeys` is not updated with newly stale turns. A sibling quote of the same turn that is internally consistent stays cited in that call, and a re-validation then refuses with "excluded turn cited". This is only reachable through a forged proof whose turn hash matches.
  - (c) The byte-budget check still measures the unfiltered `result.nodes`, which is conservative.

## Ledger
There are no qa/issues*.jsonl rows for this unit. No rows to flip. Recommend filing F1 and F2 as medium rows.

## Not verified
- Live Mongo or apps/api runtime: no DB, no network. Item 5 was verified by code reading only.
- The full package suite was not run (per the brief). bounded-ask.test.ts (the maker's 88/88 claim) was not re-run.
- review_budget.py assess was not run. Maker usage was not supplied (null), so this is BOOTSTRAP_REVIEW with the ratio unverified. Checker active time was about 370 s (1792257180 to 1792257548, before the verdict was written). Checker tokens are unknown (null).

## Cycle 1 re-check (F1), 2026-10-17

VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 236f74dcb1bc533c93479dab9a4221199f61596f

- Identity: HEAD = 236f74dc..., which descends from c0359029 (through checker commit 134f532f). The c0359029..236f74dc diff touches only packages/ask/src/quote-proof-live.test.ts (+6, a new test for shifted byte offsets) and the manifest. source-context.ts is unchanged (blob 0cb7a5e0...).
- `timeout 600 node --test --test-force-exit --import tsx src/quote-proof-live.test.ts`: exit 0, 9/9 (log: qa/evidence/w17-quotehash-checker/c1-t1-quote-proof-live.log).
- D-020 mutation m3 (the whole byte-offset condition at source-context.ts:103-104 disabled), harness qa/evidence/w17-quotehash-checker/mutate-byteoffset-c1.sh. It uses a per-mutation backup, an idempotent `trap restore EXIT INT TERM ERR` and `timeout 600`. The mutant was applied (count 1). **KILLED** by the maker suite: 8 pass, 1 fail, and the failing test is "consistently shifted byte offsets with correct char offsets and hashes are refused". The file was restored and `cmp` passed. HEAD fidelity: `git -c core.autocrlf=true hash-object` = 0cb7a5e0c37b9439b8100745a87d77cd20ac8dab = `HEAD:` blob.
- F1: CLOSED.
- F2 (the championship serve path): still open. Per the coordinator it is tracked in a separate lane and does not block this unit.
- Low notes (a)-(c) from cycle 0 are unchanged.
- ISSUES-WRITTEN: none. There are no ledger rows to flip.

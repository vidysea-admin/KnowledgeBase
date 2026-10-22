# w27-recover: explicit recovery command for stuck index attempts

Status: ready-for-check
Fix cycle: 0
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w27-recover  Branch: lane/w27-recover
Base: 2ff2b7f3 (origin/master)  Candidate: see git log (this commit)
Approved by Umesh 2026-10-22: "Also build the explicit recovery command for stuck index attempts."

## Changed paths
- scripts/operations/recover-index-attempt.mjs (new)
- scripts/operations/recover-index-attempt.test.mjs (new)
- docs/GO-LIVE-UBUNTU.md (operations section)
- qa/manifests/w27-recover.md

## Behaviour
- `--tenant T --session S` required; one session, no bulk. Dry run default: state, generation, age, artifact counts (total / tagged with the abandoned generation) for session_pages, chunks, claims.
- `--apply --reason R`: one conditional updateOne on {_id, tenantId, sourceId, indexAttempt.generation, .state, .phase} as read. Sets indexAttempt to failed/preflight (the state acquireIndexAttempt claims), status.index=failed, and sessions.indexRecovery {at, by, reason, generation, previousState, previousPhase, forced}. Miss -> status conflict, no write.
- `running` younger than 30 min (or unknown age) refused unless --force-running (warning + forced:true recorded).
- DB guard: requireScriptDatabase (staging opt-in; production only with --i-know-this-is-production + MONGODB_DB=lkb). Tenant via scopedCollection plus explicit tenantId in the update predicate.
- Nothing deleted. No GC helper exists, so none runs. Pinned test (standalone-publication.test.ts "needs explicit recovery") asserts only the refusal; unchanged. A new test shows acquireIndexAttempt succeeds after recovery.
- indexAttempt schema is additionalProperties:false, so recovery metadata lives in top-level sessions.indexRecovery (sessions schema allows extras); no schema edit.

## Checks a checker must run
- timeout 600 node --test --import tsx scripts/operations/recover-index-attempt.test.mjs  (11 pass)
- node scripts/lint-loc.mjs --all (10 stages OK)
- D-020: remove generation from update filter -> 2 fail; remove state -> 2 fail; tenant arg "toc" -> 1 fail. Restored, cmp OK.

## Evidence
Live dry run, lkb_staging, tenant toc (no --apply): both sessions state=uncertain phase=writing, ~290 min old, status.index=failed; artifacts tagged with the abandoned generation: 0 on every collection (funding: pages 1 chunks 54 claims 5; uniaccess: pages 1 chunks 40 claims 3, all from other generations).

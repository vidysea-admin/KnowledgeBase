# Verdict — u25decisions

**Cycle checked:** 0
**Commit under check:** 8268529b (lane/u25decisions)
**Contract:** none for U2.5; graded against the manifest, TASKS.md U2.5, schema/decisions.schema.json and the data-write ceremony.

## VERDICT: PASS

## EXPLANATION
- Flag-off identity: LKB_EXTRACT_DECISIONS defaults OFF (only "1"/"true"). session.ts gates on `deps.extractDecisions ?? decisionsEnabled()`; off reaches no decisions job, collection op or result key (test compares the db call sequence). Mutation flipping the default to on was killed.
- Provenance: cited turn ids are filtered against the session's own turns; a decision with zero real ids is dropped; tStart/tEnd are min/max of the cited turns, never model-supplied; owner kept only if it equals a speakerRef of a cited turn. A model-returned nonexistent id cannot reach persistence. A span cannot exceed the real cited turns.
- Never throws: provider error, unparseable or non-array output returns degraded; session.ts additionally try/catches persistence.
- Data write: scopedCollection forces tenantId on deleteMany/insertMany; the delete is further limited to evidence.sessionId; docs are stamped status "proposed". A degraded run issues zero decisions-collection ops (tested and mutation-killed). A cross-tenant write is impossible through this path.
- No quality claim, no gold invented (manifest says unmeasured).
- Suites: packages/index 647/647 pass; apps/api 808/808 pass (D2_FIXTURE_PYTHON set, TSX paths mapped to lane sources); tsc packages/index exit 0; lint-loc OK; lint:structure fails only on the pre-existing stale docs/SNAPSHOT.md stage (regenerate after merge).
- Mutations (hash-verified, restored, blobs equal HEAD): 10/10 killed (fabricated ids kept, empty evidence kept, tEnd narrowed, owner unchecked, decisionsEnabled default, degraded-still-deletes, status verified, delete not session-scoped, tenant scoping bypassed, session flag default on).
- Merge: judge.test.ts conflicts with lane u23topic (same pinned-map line); ai-routing.yaml and index.ts auto-merge. Resolution: keep `decisions` in the map line and add `&& k !== "topics"` to the filter (or add topics to the map).
- Notes (not backlog): a model citing two far-apart real turns yields a wide but real span; a clean empty answer deletes prior proposed decisions (by design, as claims).

ISSUES-WRITTEN: ISS-U25DECISIONS-001 (medium, file-dont-fix: delete-then-insert is not status-aware or atomic; no verified-status writer exists yet)

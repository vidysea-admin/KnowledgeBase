VERDICT: FAIL
Cycle checked: 0
Unit: t046-retention-sweep-planner, commit c947689, branch lane/t046. Security class (tenancy + data destruction); not round-capped.
Scope / remaining gates: planner must never list a media item purge-eligible wrongly. Two inputs do. Web half of T-046, wiring, and Q6 retention values remain open (out of scope).
Date: 2026-10-10. Timing not measured per phase.

## Commands (all run from the lane worktree, node from the codex runtime, each under `timeout`)
- `timeout 120 node --test --import tsx src/retention-sweep.test.ts` (packages/ingest): tests 16, pass 16, fail 0.
- `timeout 120 node --test --import tsx src/domain/purge-policy.test.ts` (packages/core): tests 7, pass 7, fail 0.
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (packages/ingest): exit 0, 16.7 s.
- Independent probe: scratchpad t046check/probe.ts (fail-closed table) and probe2.ts (seeded LCG generator written by checker, 6000 random cases, ~26 purge-eligible ids reached; every one verified against isPurgeEligible, tenant, processedAt age, purgedAt, resolved turns of citing claims; list equality and no duplicates): 0 violations. Density of eligible cases is low, so this is supporting, not primary, evidence.

## Points
1. Scope/purity: `git show --stat c947689` = retention-sweep.ts, retention-sweep.test.ts, manifest only. Only import is `@lkb/core` (no fs, net, db, child_process). Deep-frozen inputs run without throwing, so no input mutation. PASS.
2. Soundness: see probe2 above; 0 violations. PASS for generated space (generator does not produce prototype tenantIds or lenient date strings; those are in the table).
3. Fail-closed table (K = keep/excluded, E = ok:false, P = listed purge-eligible):
| Input | Result |
|---|---|
| other-tenant media | excluded to tenancyViolations |
| media tenantId "TOC" / "toc " | excluded (violation) |
| request tenantId "TOC" | media K |
| media tenantId undefined/null/""/5 | K |
| request tenantId undefined/null/""/5 | E |
| **media tenantId on prototype** | **P (ISS-T046-001)** |
| duplicate _id (same or cross tenant) | both K |
| processedAt undefined/null/""/number/array/object | K |
| processedAt "garbage"/"tomorrow"/"2026-09-26x" | K |
| **processedAt "1" / "0" / "12" / "2020"** | **P (ISS-T046-002)** |
| processedAt future; now before processedAt; now 0/-5 | K |
| now undefined/NaN/null/Infinity/string | E |
| each threshold undefined/0/-1/NaN/Infinity/"100"/null; params undefined | E |
| claims undefined / null | E (not treated as none) |
| claims [] | K ("no claim has cited this media yet") |
| turns undefined | E |
| claim cites turn not in turns; turns empty | K |
| turn other tenant / other session / start>end / negative start / string times | K (unresolvable) |
| unverified claim; one verified + one disputed; status "Verified" | K |
| null / no-evidence / bad-evidence claim anywhere | K for every media (blockAll) |
| other-tenant unverified claim citing t1 | ignored, media P (correct: not this tenant's claim; claim ids are tenant-scoped) |
| claim without tenantId/_id citing t1 | K |
| purgedAt "2020-01-01" / "" / 0 / false | K |
| evidence-clip kind; empty turnRefs | K |
Malformed-claim scope: an unreadable claim (not an object, no/empty evidence, bad evidence entry) blocks ALL media in that call; a claim malformed only in tenantId/_id/status blocks just media citing its turns. Conservative and sensible for a destructive plan, though one corrupt claim stalls the whole sweep. Note only.
4. Windows: fixture turns t1 [5,12], t2 [20,30], padding 10 gave t1 [0,22], t2 [10,40]: padding both sides, clamped to 0, overlapping windows kept separately (not merged, none lost), multi-turn claim keeps all. Windows are NOT clamped to media duration (media has optional tStart/tEnd only); retaining a longer window is safe. Note only.
5. `processedAt` is absent from schema/media.schema.json and generated Media type (grep of schema/ and packages/*/src finds it only in the new files). Production media carries no such field, so as built the planner KEEPS everything ("not processed: processedAt missing"): safe. It cannot treat absence as processed, and must not. Needs an owner schema decision (Q6), not a defect.
6. Dependency: `.dependency-cruiser.cjs` rule "ask-index-ingest-only-ai-db-core" allows ingest to core. depcruise not run (not available). PASS by reading.
7. Mutations (per-mutation byte backup, restore in finally, timeout 90 s, cmp + `git hash-object` vs HEAD after each):
| Mutation | Result |
|---|---|
| M1 skip tenant check | killed (2 fail) |
| M2 missing claims treated as none | killed (1 fail) |
| M3 ignore purgedAt | **SURVIVED** (ISS-T046-003) |
| M4 invert age comparison | killed (7 fail) |
| M5 drop unresolved-turn guard | killed (1 fail) |
| M6 skip isPurgeEligible | killed (2 fail) |
All restores cmp-identical and hash-equal to HEAD.
8. Manifest: 16 tests, tsc exit 0, 7 core tests all reproduced. "Not delivered" matches (no deletion, not exported from index.ts, processedAt not in schema). Manifest does not mention the two fail-open inputs.

## Wrong-purge inputs (verbatim in qa/issues.t046.jsonl)
Base: tenantId "toc"; claim {_id:"c1",tenantId:"toc",text:"x",status:"verified",evidence:[{turnId:"t1",sessionId:"s1"}]}; turn {_id:"t1",tenantId:"toc",sessionId:"s1",speakerRef:"a",tStart:100,tEnd:110,text:"x"}; now 1791633600000 (2026-10-10T12:00Z); params {minAgeAfterProcessedMs:604800000, clipPaddingSeconds:15}.
- Media with tenantId only on prototype (Object.create({tenantId:"toc"}) plus own fields, processedAt "2026-10-03T11:59:59.000Z") gives purgeEligibleIds ["m1"].
- Media {_id:"m1",tenantId:"toc",sourceRef:"s",kind:"recording",turnRefs:["t1"],retention:{purgeAfterVerified:false},processedAt:"1"} (also "0", "12", "2020") gives purgeEligibleIds ["m1"].

HEAD-fidelity: retention-sweep.ts 89dc2a4cdf3a6c061a9197ddd18f8cf105f4dd8a = HEAD blob; retention-sweep.test.ts d3522d04e6d100dbbfd43d873a7794eccb34b5e1 = HEAD blob.

ISSUES-WRITTEN: ISS-T046-001 (high), ISS-T046-002 (high), ISS-T046-003 (medium) in qa/issues.t046.jsonl

EXPLANATION: FAIL is driven by the brief's rule that no input may produce a wrong purge-eligible answer. Both defects are one-line fixes (own-property reads; strict ISO check). Neither is likely from JSON-decoded Mongo data (prototype tenantId) but lenient-date acceptance of a truncated timestamp is a plausible corruption path. Everything else (tenant scoping, missing claims, thresholds, now, unresolved turns, duplicates, purgedAt in code) fails closed. Fix cycle 1 should also add a purgedAt test (ISS-T046-003). No contract was authored: the checker skill does not require one and no qa/contracts file exists for T-046.

# goal-t015 — independent cycle 0 verdict

VERDICT: FAIL
Cycle checked: 0
Checker: `/root/roadmap_status/checker_t015`
ISSUES-WRITTEN: ISS-GOALT015-001 (`qa/issues.goal-t015.jsonl`)

## Scope and finding

Checked the complete named metadata-preparation, canonical-approval, local-export and private-runner **source/guard interfaces**, including the CLI consumers and all new source/docs/tests. No whole-task PASS is issued. Contract `qa/contracts/goal-t015.md` P6 fails: declared related-session transitivity disappears when an intermediate session is excluded.

Exact independent synthetic input selects a,b,c,d,e, supplies eligible generations a,c,d,e with distinct source/content identities, excludes b for `derivation-proof-missing`, and declares `relatedGroups: [[a,b],[b,c]]`. Seeds `independent-0` through `independent-19` are recorded verbatim in the issue. The current parent/union map contains only accepted IDs; filtering each relation first removes b and disconnects a/c. Both sessions remain separate leakage groups for all twenty seeds; they cross splits in **14/20**. For `independent-0`, a is evaluation and c validation while `splitReady` is true. The other six seeds accidentally put both in train and do not repair their disconnected groups.

The executed probe uses only in-memory synthetic rows; no corpus export, provenance binding, trainer process, network/provider call, browser or DB action occurs. `qa/evidence/goal-t015-checker-probe.mjs` is the exact reproduction, SHA256 `3e4d9197a28fa0cae4ad477a31e1a782bbc2a08a3f714e2bdd3618b0d54a442d`. All twenty inputs and their actual results are retained in the ledger and `goal-t015-checker-probe.json`. The repair must replay all twenty cases, preserve absent b as a relation bridge without adding b's rows, and cannot substitute an easier corpus.

## Independent and attributed evidence

Fresh sole ROOTCPU broker `/root/docker_checker` ran the checker-authored probe:

`C:\Program Files\nodejs\node.exe qa/evidence/goal-t015-checker-probe.mjs`

CWD `C:\Users\product\Desktop\KnowledgeBase`; outer timeout 30000ms; **exit 1**, no signal/error; 150.3268ms; 2026-10-14T20:55:30.363Z–20:55:30.519Z. Receipt `qa/evidence/goal-t051checker-broker-t015-independent.json`, referenced stdout/stderr files, and checker JSON establish the actual failure. Stdout: `{"crossSplitViolations":14,"cases":20,"privatePathsRefused":12,"foreignRefused":true,"permissionRefused":true}`; stderr empty. Probe-internal runtime 26.3717ms is distinct from process elapsed. The broker verifies all eleven source/probe pins unchanged before/after execution.

Additional independent probe boundaries pass: **12/12** pure UNC/SMB/device/ADS/nonabsolute/network-URL paths refused, foreign-tenant source refused, revoked training-use source refused. The earlier UNC concern was corrected before this candidate freeze; no network share was contacted. These positive boundaries do not negate P6.

The following broker evidence is attributed and reused after matching source/receipt hashes; it is not represented as a repeated checker suite:

- `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/training/prepare.test.mjs`: exit 0, 8/8 pass, 4691.7098ms process elapsed (4566.4775ms Node duration), UTC20:14:48.899–20:14:53.596. Receipt `goal-t051checker-broker-t015-tests.json` and stdout confirm deterministic metadata, exclusions, approved synthetic export/consumer, injected trainer outcomes and canonical guard refusals. This suite omitted the excluded bridge.
- `node scripts/training/prepare.mjs --config qa/evidence/goal-t015-real-config.json --out qa/evidence/goal-t015-real-plan.json`: exit0,179.5254ms, UTC20:14:56.939–20:14:57.123. Exactly three selected sessions, three missing-proof exclusions, zero eligible rows/groups, `splitReady:false`; no real dataset created.
- Immediate consumer `node scripts/training/validate.mjs --plan qa/evidence/goal-t015-real-plan.json`: exit0,152.1629ms, UTC20:15:02.462–20:15:02.620. Reproduces blocked metadata fingerprint `030f231bc13f0014df6592c3d18b025f19ef1d239634853ef35bfd64a3632de2`. Corresponding broker receipts/logs and real plan read directly.
- `python contracts/verify_contracts.py`: reused `qa/evidence/goal-t051checker-validator.json`, exit0, no frozen contracts/PASS by vacuity; batch UTC18:39:31.7184876–18:39:33.1459082, individual command duration unknown. Current validator hash `1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3` and registry hash `d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940` match. This is not a T015 correctness measurement.

## Bytes, dependency drift and remaining gates

Manifest is `ready-for-check`, Fix cycle0. All ten candidate pins matched at initial final review, broker execution and final recheck 2026-10-14T20:57:51.7523627Z. Exact checked file hashes are retained in `qa/evidence/goal-t015-checker-final-pins.json`; source inventory `goal-t015-source-pins.json` SHA256 `8d3aba653ddeddecf54d0f4b1184991082918de0d08c87e2fe33ea5187e6a6fd`. Failed `plan.mjs` SHA256 `9022a92c6ca1bdbf9bb9f03464a6e415fdea0603c1b5ede882fc29ecdad73871`. Review included complete new files and targeted unchanged provenance/timing/combined-turn loader consumers. Maker source and governance files were not edited by checker.

The current transitive dependency `scripts/webinar/session-rows.mjs` drifted from packet hash `3cc4de004a670f00683fa63a81627c2bde94c8c5416102cb66dc5995ba695401` to `3b70e6e8bd06da6747abe856ae5a37c998c190d5b8714d9b5d1e2e965f0ed053`. Current review identifies additional transcript/QA-generation and v3 slide attachment checks plus its `slide-knowledge.mjs` import. `assertDerivedArtifactsCurrent` reaches this loader only for `knowledge-turns.json` combined generations; ordinary synthetic `turns.json` fixtures and missing-proof real examples do not enter it. The isolated failing plan probe imports neither loader nor provenance module, so the failure is candidate-specific despite that drift. Prior 8/8 is historical attributed execution, not certification of changed combined-generation acceptance. Cycle1 must refresh the dependency map/pins and provide required current affected-path evidence.

Human/corpus/private-host/model/full-task gates remain **HOLD** independently of this source FAIL: exact Umesh-bound real export/run approval and current private-storage evidence; eligible independently reconciled corpus; audited trainer/dependency/host isolation including ACL/network/heldout/descendant termination; actual authorized training/checkpoint loading/inference/evaluation; honest baseline results; authorized reversible promotion. No synthetic storage proof or injected trainer is real model evidence. G10 remains retained/deferred. T015 remains open; no tracker completion is authorized.

## Timing and explanation

Final-candidate checker launch/scope read began **2026-10-14T20:40:24Z**; initial full source/receipt/hash review and queued probe drafting were performed before the human HOLD. Probe draft clock checkpoint20:41:52Z; manifest/source recheck checkpoint20:52:02Z after resume. Root paused and resumed execution; exact pause boundaries and broker request/grant response instants were not measured and are **unknown**. Checker did not execute locally or reuse a suspended grant. Broker independent command boundaries are measured above. Final evidence read started20:56:49Z; final pins/issue persisted20:57:51.7523627Z; verdict drafting checkpoint20:57:58Z. Actual verdict persistence completion is recorded by the adjacent checker persistence receipt; no completion time is guessed here.

Launch-to-draft wall interval17m34s includes broker waiting and a user HOLD; active-work/pause/wait phase totals are unknown and are not inferred by subtraction. The focused target was exceeded to obtain required independent execution under the sole CPU broker and honor the explicit pause. No broader suite was run: the extra probe was required by concrete P6 boundary evidence. Issue-fix corpus reporting for this initial discovery is14/20 cross-split violations; next cycle must report20/20 recorded cases against the same inputs. No source PASS is supportable until this defect is repaired and independently checked.

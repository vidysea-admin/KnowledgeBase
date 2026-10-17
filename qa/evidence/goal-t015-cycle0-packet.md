# goal-t015 checker packet — cycle 0

Maker /root/roadmap_status/maker_t015; checker /root/roadmap_status/checker_t015.
Absolute repository C:\Users\product\Desktop\KnowledgeBase.
Contract qa/contracts/goal-t015.md P1–P7/Q1 and implemented X/R interface guard/refusal boundaries;
real X1/X2/R1–R4 execution/full T-015 remains human/host HOLD. Status ready-for-check; matching
manifest cycle 0. Independent checker owns verdict; maker has no PASS claim.

Frozen source candidate pins: qa/evidence/goal-t015-source-pins.json (ten source/docs/config
files with bytes and SHA256; new at initial base ed542fd01c870e5d5b64e1d72b413062d595f675).
All ten source byte pins match the broker's actual before/after receipts. Source includes the independently raised
UNC/device fix and exact host/private-volume approval binding; no further source edits are planned
before the completed broker-run proof. NONE active; old suspended queue/grants were not reused.
Source-pins file SHA256 8d3aba653ddeddecf54d0f4b1184991082918de0d08c87e2fe33ea5187e6a6fd.
Complete changed logic is attached as qa/evidence/goal-t015-candidate.patch, SHA256
1d38606bcfe0ffb4eb16293538d154f3d6ae5fd06827effd487697d7fa23b41a;
LF-normalized full new-file patch for navigation, actual file hashes remain authoritative.
New files had no base at initial commit ed542fd01c870e5d5b64e1d72b413062d595f675.

## Source map

- scripts/training/plan.mjs: groundedTrainingRows validates verified claim tenant, source link,
  capture permission/revocation/expiry, source-owner training restriction, exact cited turn/speaker/
  time and optional quote; buildTrainingPlan emits only hashes/counts/identity/membership metadata.
  Groups whole sessions by source identity/hash, normalized identical claims/turns and explicit
  related groups; no semantically paraphrased duplicate guarantee. Zero/partial counts explicit.
- scripts/training/prepare.mjs: loadTrainingGenerations resolves contained real files, checks
  source tenant before detailed load, reuses snapshotted current derivation buffers. Existing
  scripts/lib/transcript-provenance.mjs assertDerivedArtifactsCurrent is read-only consumer;
  its current/legacy provenance behavior is preserved. Bound CLI root uses module location.
- scripts/training/validate.mjs: validateTrainingPlan fully regenerates the metadata snapshot;
  trainingApproval reads canonical docs/DECISIONS.md only, requires unique ACTIVE unsuperseded
  decision, Approved-by Umesh, explicit structured scope, effective canonical dates/private local
  grant, exact fingerprints/tenant/destination/purpose. Preparation never mints a grant.
- scripts/training/private-path.mjs: pure lexical path rejection before filesystem operations:
  UNC/SMB/device namespaces and Windows device names/streams cannot masquerade as local outputs.
  Canonical approval additionally binds effective host/private-volume proof; mapped/redirected
  storage remains host HOLD without actual operator-reviewed local/private evidence.
- scripts/training/export.mjs: exportTrainingDataset requires all guards before serializing or
  writing corpus; reread snapshot matches plan; restrictive temporary sibling bundle becomes a new
  destination only after complete output. validateTrainingExport is the actual immediate training
  consumer and verifies current sources, still-effective export approval, bytes/membership/counts.
- scripts/training/train.mjs: validateLocalTrainingRecipe hashes existing local model/executable;
  runPrivateTraining validates actual exporter consumer and recipe/run grant before output/process,
  no shell/API credentials; bounded direct process; stdout/stderr byte counts+hashes only; no raw
  log contents. Completion is unverified checkpoint, never inference/evaluation/promotion success.
- scripts/training/file-hash.mjs: bounded-memory local asset SHA256; supports model/checkpoint
  files larger than a single in-memory Buffer, closes descriptors on success/error. No model load.
- docs/own-model-training.md: real CLI recipe and concrete canonical approval line shapes;
  existing export human boundary plus private host/network/descendant isolation limitations.
- scripts/training/prepare.test.mjs: synthetic fixtures only; actual bindDerivedArtifacts confined
  to disposable synthetic temp tree, no real provenance binding. Fake runner injection does not
  launch a model process. No mutation harness, source edits or model/provider calls in tests.

## Security and remaining integration

Tenant, capture/source restrictions, intended export/training use and local data writes are
security boundaries; full handshake required. No credential store/new dependencies/HTTP mounts.
CLI is the application path and real exporter→training consumer is wired; no web/API integration
or provider adapter is claimed. Internal in-memory builders are implementation primitives, not
supported approval-free corpus-returning preparation APIs. Operator canonical decision authority
is not authenticated through request JSON; append_decision.ps1/governance remains unchanged.

Actual real source sample is qa/evidence/goal-t015-real-config.json (three explicit toc sessions,
related reupload grouped), config SHA256 feeacf2108125c304c53267066477d5e03209f2289f36cb8247af4ecd82f7f84.
It emitted metadata only in qa/evidence/goal-t015-real-plan.json, file SHA256
c6f643273dd4fda4d1067ce003c98907028ff32e660bdd14cb4a9b669d48bec1.
All three excluded with `derivation-proof-missing`; acceptedSessions/rows/groups/split counts 0,
splitReady false; status `blocked-no-current-eligible-examples`; exported/trained/evaluated/promoted
false. Internal fingerprint 030f231bc13f0014df6592c3d18b025f19ef1d239634853ef35bfd64a3632de2.
No real provenance repair/binding/export took place.

## Actual immutable execution receipts

ROOTCPU broker /root/docker_checker executed the following using C:\Program Files\nodejs\node.exe,
cwd C:\Users\product\Desktop\KnowledgeBase, outer timeout 60000 ms, no duplicate process.
All receipt before/after source hashes match the frozen ten-file inventory.

| Evidence | Exact result | Immutable receipt |
|---|---|---|
| `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/training/prepare.test.mjs` | exit 0; 8/8 PASS; 0 failed/skipped/cancelled; broker 4691.7098 ms, Node 4566.4775 ms; UTC 2026-10-14T20:14:48.899Z..20:14:53.596Z | qa/evidence/goal-t051checker-broker-t015-tests.json |
| Metadata prepare below | exit 0; 179.5254 ms; UTC 20:14:56.939Z..20:14:57.123Z; three selected, zero eligible | qa/evidence/goal-t051checker-broker-t015-plan.json |
| Immediate metadata validator below | exit 0; 152.1629 ms; UTC 20:15:02.462Z..20:15:02.620Z; exact same blocked fingerprint/counts | qa/evidence/goal-t051checker-broker-t015-validate.json |

Real sample `node scripts/training/prepare.mjs --config qa/evidence/goal-t015-real-config.json --out qa/evidence/goal-t015-real-plan.json`;
downstream `node scripts/training/validate.mjs --plan qa/evidence/goal-t015-real-plan.json`;
Receipts name exact stdout/stderr files; stderr empty, no secrets/corpus text. The 8 tests cover
deterministic metadata/no source mutation, tenant/provenance/capture/source restriction exclusions,
whole-session/source/turn/related grouping, canonical approval/expiry/revocation/supersession and
UNC/device/network-volume refusal, approved synthetic local export→real export consumer, bad
evidence/empty split refusal, simulated killed-process/missing-artifact failure states and approved injected runner
with exact model/executable/dependency hashes, no heldout argument/inherited API credentials and
raw stdout suppression. Synthetic host assertions/injected runner artifacts are not real proof.
No actual trainer process or timeout/descendant-termination host proof was run or inferred.

qa/evidence/goal-t015-receipt-dependency-pins.json records the immutable receipts/plan/source-pins
and current immediate dependency bytes: transcript-provenance.mjs, turn-timing.mjs,
session-rows.mjs and process-video.mjs. They are read-only dependencies, not maker edits;
recorded after broker execution for independent candidate review. The broker ten-file before/after
inventory is the exact execution pin evidence; dependency record is not a false historical pin.

Frozen verifier is reused per ROOTCPU broker from qa/evidence/goal-t051checker-validator.json
SHA256 53ef35f5204aea32db0a4701dd60ebeee10cbbf24ae5af9287f16eb7eed0d6db:
`python contracts/verify_contracts.py`, exit 0, no frozen contracts yet — PASS by vacuity.
Current validator SHA1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3
and registry SHAd31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940 match
that proof. This is no T-015 correctness evidence; no unnecessary repeat command is scheduled.
No environment secret values or provider accounts required. Prior repo test subprocess EPERM is
avoided with plain Node test-isolation=none; real runner subprocess host proof remains HOLD.

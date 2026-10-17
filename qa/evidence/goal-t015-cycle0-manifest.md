# T-015 private own-model preparation, guarded local export and training interface

Status: ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Task:** T-015 (E7; T-002 dependency marked done)
**Priority tier:** 3 — user-directed ALL40 roadmap capability, D-170.
**Base commit:** ed542fd01c870e5d5b64e1d72b413062d595f675
**Packet:** qa/packets/goal-t015.md
**Contract:** qa/contracts/goal-t015.md (independent checker owned)
**Verdict:** qa/verdicts/goal-t015.md (independent checker owned; absent)
**Maker:** /root/roadmap_status/maker_t015
**Checker:** /root/roadmap_status/checker_t015

## Scope

Complete source interfaces: metadata-only current-provenance preparation/validation,
session/source/duplicate isolation, explicit corpus-bound canonical approval validation,
atomic local export and real export consumer, bounded local audited-trainer orchestration.
No real corpus export or actual model process is executed by this unit. Test success paths
use disposable explicitly synthetic data and injected fake trainers only. Private production
data, source media, historical evaluation and current derived corpus remain unchanged.

G10 remains retained/deferred activation. This source scope is not whole T-015 delivery:
exact real export/training approval, eligible reconciled corpus, private audited host/trainer,
actual model inference/evaluation, improvement assessment and promotion remain open.
No previous goal-t015/own-model seam PASS found. Security approval/tenancy/data writes
remain uncapped; this is the first roadmap capability on this seam.

## Changed paths

All newly created, no tracked base:
scripts/training/{plan,prepare,validate,export,train,private-path,file-hash,prepare.test}.mjs;
docs/own-model-training.md; qa/evidence/goal-t015-real-config.json;
qa/evidence/goal-t015-{source-pins,real-plan,receipt-dependency-pins}.json and candidate.patch;
this manifest and qa/packets/goal-t015.md. Broker-owned immutable goal-t051checker-broker-t015
receipts/logs are consumed, never edited by maker. No shared composition/schema/package/lock,
governance/contracts, trackers or Git changes by maker.

## Evidence

ROOTCPU broker /root/docker_checker executed the frozen candidate serially on 2026-10-14:

- `C:\Program Files\nodejs\node.exe --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/training/prepare.test.mjs`
  exit 0; 8/8 PASS; broker elapsed 4691.7098 ms (Node duration 4566.4775 ms), UTC
  20:14:48.899–20:14:53.596. Only disposable synthetic corpora and injected trainers.
- `node scripts/training/prepare.mjs --config qa/evidence/goal-t015-real-config.json --out qa/evidence/goal-t015-real-plan.json`
  exit 0; 179.5254 ms; three selected, zero accepted/rows/groups: all three lack derivation proof.
  Status `blocked-no-current-eligible-examples`, splitReady false. No actual dataset exported.
- Immediate consumer `node scripts/training/validate.mjs --plan qa/evidence/goal-t015-real-plan.json`
  exit 0; 152.1629 ms; reproduces the same blocked metadata state and fingerprint.
- Frozen `python contracts/verify_contracts.py` proof reused from
  qa/evidence/goal-t051checker-validator.json: exit 0, no frozen contracts — PASS by vacuity.
  Current validator/registry bytes match its pins; this is no T-015 correctness assertion.

Exact commands, timestamps, outputs and before/after source fingerprints are retained in
qa/evidence/goal-t051checker-broker-t015-{tests,plan,validate}.json and referenced logs;
all ten source/docs/config hashes are unchanged. Full source patch (LF-normalized for navigation)
qa/evidence/goal-t015-candidate.patch SHA256
1d38606bcfe0ffb4eb16293538d154f3d6ae5fd06827effd487697d7fa23b41a.
Exact source byte pins are authoritative: qa/evidence/goal-t015-source-pins.json.
Plan file SHA256 c6f643273dd4fda4d1067ce003c98907028ff32e660bdd14cb4a9b669d48bec1;
internal proposal fingerprint 030f231bc13f0014df6592c3d18b025f19ef1d239634853ef35bfd64a3632de2.

READY applies only to the complete named source/guard interface scope. No actual corpus export,
trainer process, model, inference, evaluation or promotion proof exists. Independent checker
verdict is still required; maker does not PASS or close whole T-015. NONE active.

# U0.10 maker verification receipts

These are source-scoped synthetic/fake-provider checks, never actual paid model runs
or genuine human approvals. Existing historical provider files remain untouched.

## Authorized CPU execution

CPU broker `/root/docker_checker` granted the focused suite only, with an outer
60-second bound; no browser, database, provider network, broad suite or duplicate
frozen-validator execution was authorized or performed.

Approved test command:

```powershell
node --test --test-isolation=none --test-timeout=30000 scripts/eval/u010-baseline-run.test.mjs
```

The bounded repeat used the exact test worker inside this controller:

```powershell
node -e "const {spawnSync}=require('node:child_process'); const start=Date.now(); const result=spawnSync(process.execPath,['--test','--test-isolation=none','--test-timeout=30000','scripts/eval/u010-baseline-run.test.mjs'],{stdio:'inherit',timeout:60000,killSignal:'SIGKILL'}); console.log('U010_EXIT='+result.status+' U010_SECONDS='+((Date.now()-start)/1000)); if(result.error) console.log('U010_FAILURE_CLASS='+result.error.code); process.exit(result.status===null?2:result.status);"
```

1. Initial eleven-case run: exit 1; 10 pass / 1 fail; shell elapsed 5.1577797 s;
   Node duration 3647.4682 ms. The failure was the inferred historical candidate
   reciprocal `28.999999999999996` compared with integer 29. The auditor now rounds
   that explicitly inferred count; historical IDs/hashes remain unavailable.
2. Corrected eleven-case run: exit 0; 11 pass / 0 fail; bounded-controller elapsed
   2.95 s; Node duration 2861.8285 ms.
3. After the root's official-host/URL-credential advisory, twelve-case run: exit 0;
   12 pass / 0 fail; bounded-controller elapsed 4.093 s; Node duration 3977.3958 ms.
   The CPU slot was explicitly released afterward.

Twelve-case terminal output:

```text
tests 12
suites 0
pass 12
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 3977.3958
U010_EXIT=0 U010_SECONDS=4.093
```

The source test cases verify actual production Ollama adapter + createLlmScorer
behind fake HTTP (14 returned, 0 fallback, no key persistence); complete duplicate
query-text IDs; cap stops and per-cell resume; fallback-contaminated pure/control
subsets; deadline/cancellation; corrupt/drifted/conflicting checkpoint refusal;
unknown interrupted call recovery and uncommitted-temp cleanup; pending human
intake refusal before paid I/O; official origin/path/POST and URL-credential refusal;
four historical report audits; and actual current corpus freezing (92 questions,
29 candidate sessions, five explicitly excluded non-session directories, 2668 calls
for complete exhaustive ranking).

Synthetic fractional approval fixtures export thirty exact pairs and are consumed
by the actual `packages/ask/src/eval/calibration.ts` computeMAE: n=30, MAE=0.25.
Those approvals exist only in the test's cloned in-memory packet. They never alter
the actual neutral human packet and never count as genuine human gold.

Generated sample checkpoints/reports are consumed by `loadSnapshot` + `auditRun`
inside the tests, then their verified unique temporary directories are removed.
No persistent fake report is presented as live-provider evidence.

## Shared frozen-validator evidence reused, not rerun

`qa/evidence/goal-t051checker-validator.json` is attributed central checker evidence,
SHA-256 `53ef35f5204aea32db0a4701dd60ebeee10cbbf24ae5af9287f16eb7eed0d6db`.
Its actual command is `python contracts/verify_contracts.py`, exit 0, output:

```text
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

Observed combined batch: 2026-10-14T18:39:31.7184876Z through
2026-10-14T18:39:33.1459082Z; individual command duration is unknown.
Maker read current file hashes and matched the receipt exactly:

- verifier: `1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3`
- registry: `d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940`

This vacuous result is not correctness evidence for the new utility.

## Final candidate — attributed central execution

A thirteenth test was added after the twelve-case receipt: full verified synthetic
GLM/DeepSeek predecessors followed by the actual Gemini adapter behind fake HTTP,
checking Gemini-LAST order, official endpoint, complete ranks and key nonpersistence.
Latest security changes also enforce redirect:error, T022 operator-bound
human proof, actualROOT re-freezing at the exported paid entry, pre/post-import and
completion source-byte verification with invalid drift disposition, and atomically
PID-named acquisition recovery. Existing test cases were extended for these concrete
A2/A8/A12/A14/A15 findings; the suite has thirteen cases. Earlier twelve-case PASS
applies to older bytes.

The sole CPU broker `/root/docker_checker` executed the final command centrally:

```powershell
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/eval/u010-baseline-run.test.mjs
```

Actual outer timeout: 60000 ms. UTC 2026-10-14T20:11:28.228Z through
2026-10-14T20:11:32.645Z. Exit 0, no signal/error; wall 4413.3813 ms.

```text
tests 13
suites 0
pass 13
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 4298.0939
```

Immutable receipt: `qa/evidence/goal-t051checker-broker-u010-final.json`, SHA-256
`76315611d0f4a84b290de98cd4115f1e8c07c06acfc840efb23d9a4a18b7e786`.
Stdout: `.stdout.txt`, SHA-256
`3f9148a030e3a9b35ee9d12f3be865fe0114e66036eba9b64e21e93856712b22`.
Empty stderr: `.stderr.txt`, SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Before/after all nine new source/test and immediate production/calibration dependency
pins are unchanged, matching current maker read; full table in checker packet.
The maker ran no duplicate command. No actual provider calls or genuine human
approvals were executed/created by this maker. Source-scope checker verdict pending;
whole U0.10 remains HOLD.

## Cycle 1 — actual independent failure and repair pending execution

The independent checker actually reproduced ISS-U010CHECKPOINT-001 on cycle-0
source: same-PID/same-millisecond contender refused, then deleted the first caller's
owner lock. Receipt `qa/evidence/goal-t051checker-broker-u010-checkpoint-repro.json`:
exit 1, one test failed, wall 183.561 ms. The source-scoped cycle-0 verdict is FAIL;
the earlier thirteen-case maker PASS did not exercise this ownership collision.

Root authorized cycle-1 security/data-write repair. Owner identity now uses UUID;
owned cleanup/release requires this call's successful creation, exact descriptor
identity, current physical file identity and exact owner token bytes. Foreign equal-
byte replacement files are preserved. PID liveness checks reject nonpositive/invalid
PID; acquisition-directory cleanup verifies its identity.

The standing maker suite now contains fifteen cases. The ledger's exact frozen-clock
recipe is embedded verbatim; added cases check repeated refused contenders, equal-
byte replacement files, corrupt owner preservation, failure after successful lock
creation, safe repeat release and invalid PID refusal. Broker is requested to run
the standing fifteen then the ledger's exact independent recorded command, each
with hard outer 60000 ms. Their actual central executions are recorded below.

Current state source SHA-256:
`04354bb707f57421a01568eab195418ed9178fe2be4ec9ed815e43f85b1d14d2`.
Current test SHA-256:
`3a175a8704ac737d848c2721d7aaf0afae9e22c14871fd72f1091d9762c23fde`.
No active maker process. Actual provider runs and actual human calibration remain HOLD.

Central standing execution: UTC 2026-10-14T20:43:13.243Z–20:43:17.053Z; exit 0,
15/15 PASS, no skip/cancel/todo; TAP 3701.7637 ms, wall 3805.5458 ms.
Receipt `qa/evidence/goal-t051checker-broker-u010-cycle1-standing.json` SHA-256
`f23785a296bcbe004476d3de1c2df088ea03f557e34540d882b1f4ad3bd17e62`.
All nine before/after source and immediate dependency pins match current maker read.

Exact independent ledger command:

```powershell
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --test-name-pattern="A14 PID acquisition guards" qa/evidence/goal-u010-checker.test.mjs
```

UTC 2026-10-14T20:43:20.002Z–20:43:20.172Z; exit 0, 1/1 PASS, no skip/cancel/todo;
TAP 69.8137 ms, wall 166.0382 ms. **ISS-U010CHECKPOINT-001: 1/1 owner preserved**.
Receipt `qa/evidence/goal-t051checker-broker-u010-cycle1-ledger.json` SHA-256
`cebb29c98d7db61d81dd07db45a61cbb51a26a916aa6e57d3ba628b669179b70`.
All ten before/after pins match, including unchanged independent checker corpus
`db57b68d32ceddec06be25d4dde72e38da90080ab8cd95e80d4919ba0f96048d`.
Both executions were by sole broker `/root/docker_checker`, hard outer 60000 ms;
no maker duplicate execution.

Matching independent cycle1 source PASS was read before source close-out, verdict
SHA-256 `78ef98bc9c586cdd78094c789f784e831cf832d3a480d1d4a42c2c23b127eebd`.
Full six-probe receipt `qa/evidence/goal-t051checker-broker-u010-cycle1-independent.json`
SHA-256 `a4dce95b22dbe2ba74c70b56bc13ab21962c2874544d2e1f86d604fd521cff4d`:
exit 0, 6/6 PASS, no skip/cancel/todo, UTC 2026-10-14T20:55:25.818Z–20:55:26.867Z,
TAP 931.0867 ms, wall 1043.8314 ms. Maker freshly checked all ten source/dependency/
probe pins; all match actual receipt. No repeat test/provider execution.
Source manifest is checked-PASS Fixcycle1; full U0.10 human/provider gates remain HOLD.

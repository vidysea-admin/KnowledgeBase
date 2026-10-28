# Independent verdict — goal-u010

**VERDICT: PASS**
**Cycle checked: 1**
**Scope: source utility only. Whole U0.10: HOLD.**
The historical cycle-0 FAIL below is preserved. The current cycle-1 acceptance,
commands, pins and outstanding whole-task gates are recorded in the final section.

## Historical cycle 0

**VERDICT: FAIL**
**Cycle checked: 0**
**Checker:** `/root/roadmap_status/checker_u010`
**Manifest / packet:** `qa/manifests/goal-u010.md` / `qa/packets/goal-u010.md`
**Contract:** `qa/contracts/goal-u010.md` A1–A16,
SHA-256 `8bb7c459f93885c05f42b6667929e87757422f3c54f98aa13f7a57733ab35ee8`.

## Scoped acceptance and whole-task gates

Cycle-0 source acceptance fails A14's exclusive checkpoint ownership.
The independently authored same-PID/same-millisecond contender probe actually
removed the first caller's active owner lock. The paid-call checkpoint relies on
exclusive ownership; this finding is security/data-write class and is not capped.
No actual provider calls or observed spend overshoot are claimed.

Whole U0.10 remains **HOLD** separately: complete ordered real-provider baselines
and thirty genuinely Umesh-approved human-reference pairs consumed by the live
judge are still missing. Historical 75/92 recall runs are partial, GLM includes a
fallback, and derived-reference MAE and Gemini embedding recall do not close these
gates. A future scoped source PASS cannot mark this task done.

## Actual independent finding and reproduction

`scripts/eval/u010-state.mjs:14` builds owner identity from PID and `Date.now()`.
Two exported callers in the same PID/millisecond receive identical owner tokens.
The second caller correctly detects a live owner and throws. Its catch at line 37
then deletes the first caller's matching lock even though the contender never
created that lock. The acquisition path's UUID does not make the owner token unique.

The checker fixes only `Date.now()` inside an owned disposable fixture, acquires
the first lock, attempts a second acquisition, and requires the original lock to
remain. This executes the actual `acquireCheckpoint` source without product mutation,
provider I/O, new approvals or synthetic human-gold claims.

Exact command, repository cwd, outer timeout **60000 ms**:

```powershell
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --test-name-pattern="A14 PID acquisition guards" qa/evidence/goal-u010-checker.test.mjs
```

Broker `/root/docker_checker` executed this independently authored corpus at
**2026-10-14T20:33:50.412Z–20:33:50.600Z**, wall **183.561 ms**, exit **1**.
Actual Node output: **1 test, 0 pass, 1 fail, 0 skipped/cancelled/todo**;
TAP duration **65.2464 ms**; selected case duration **24.7772 ms**.

```text
AssertionError [ERR_ASSERTION]: refused same-process contender deleted another caller owner lock
false !== true
at qa/evidence/goal-u010-checker.test.mjs:133:12
```

Ledger floor: **ISS-U010CHECKPOINT-001: 0/1 owner preserved**.
Exact frozen-clock recipe and command live in `qa/issues.U010CHECKPOINT.jsonl`.
Post-fix verification must replay that recorded reproduction verbatim and report
its own count; additional ownership tests cannot substitute for it.

Actual receipt and raw output:
`qa/evidence/goal-t051checker-broker-u010-checkpoint-repro.json`,
`.stdout.txt`, `.stderr.txt`. All ten source/dependency/probe pins match before,
after, and the checker's final independent hash read at 20:34:55 UTC.

The earlier **20:28:55.029Z–20:28:55.229Z**, **193.6768 ms**, exit-1 run stopped
inside the checker fixture's `rmSync` on an empty directory (`ERR_FS_EISDIR`) before
the product assertion. Only that disposable cleanup changed to `rmdirSync`; the
earlier receipt `goal-t051checker-broker-u010-checkpoint-red.json` is preserved and
is **not** product reproduction evidence.

## Checked final bytes and attributed reused evidence

| File | SHA-256 |
|---|---|
| scripts/eval/u010-corpus.mjs | 02f6dfab40717e9a2c2aeabad4aea7afaa78218f8308fedb22f2dc54ef8d54cf |
| scripts/eval/u010-state.mjs | e62940d0e602dc612da3f2fae5f43104fb1937fb0c2dd7a58430aeb92d8d4abe |
| scripts/eval/u010-provider.mjs | 37ef3377b2c84e59e9fe82cdefc44e1a987420f437155028aa3133f53e32f391 |
| scripts/eval/u010-baseline-run.mjs | 9e5050ce64ee4aa2b13725f497e7f9895e1f144bee41ee01d1a13e90713b232f |
| scripts/eval/u010-baseline-audit.mjs | aaebeea07f09f1dc9aff31fcd61af930a1f00a6426dad996d351991f94b2d6ca |
| scripts/eval/u010-baseline-run.test.mjs | dcba30c285e7ef6dc2d6c3e98547268dc1dcd9bcf01b297e423cfc6add5924b0 |
| scripts/eval/human-calibration.mjs | 58359234135f080f19e7647c3aade7659e606ee3cddc27a4731ffcc187550ecf |
| apps/api/src/score.ts | ca1992ebbc963c6b18a05f7ca42aeea7a4fc313d6b014acec3394406cbbc6d78 |
| packages/ask/src/eval/calibration.ts | d020cea126f1be037034c6cf7228958371defe2fa2ecf53985fbc4a167fa57d4 |
| qa/evidence/goal-u010-checker.test.mjs | db57b68d32ceddec06be25d4dde72e38da90080ab8cd95e80d4919ba0f96048d |

Reused central final suite evidence, not independently repeated:

```powershell
node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/eval/u010-baseline-run.test.mjs
```

`qa/evidence/goal-t051checker-broker-u010-final.json`, SHA-256
`76315611d0f4a84b290de98cd4115f1e8c07c06acfc840efb23d9a4a18b7e786`:
UTC **20:11:28.228Z–20:11:32.645Z**, exit **0**, **13/13 pass**,
wall **4413.3813 ms**, TAP **4298.0939 ms**, outer 60000 ms, nine pins unchanged.
This supplies affected-stage→checkpoint→audit and actual production adapters behind
fake HTTP, synthetic fractional approval export→actual `computeMAE`, cap/fallback,
input binding and order evidence. The successful original suite missed this lock case.

Reused central frozen validator: `python contracts/verify_contracts.py`, exit **0**,
"no frozen contracts yet ... PASS by vacuity", receipt
`qa/evidence/goal-t051checker-validator.json` SHA-256
`53ef35f5204aea32db0a4701dd60ebeee10cbbf24ae5af9287f16eb7eed0d6db`.
Validator pin `1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3`;
registry pin `d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940`.
Combined central batch 18:39:31.7184876Z–18:39:33.1459082Z; individual duration
unknown. Pins match; this vacuous check does not prove new-utility correctness.

## Phase timestamps and limits

- Current READY-cycle checker launch/scope-read start measured:
  **2026-10-14T20:17:02.2415990Z**. Earlier provisional review and paused session
  are outside this current READY-cycle elapsed measurement.
- Complete changed source, original consumers and corrected source boundaries were
  reviewed. Exact review-end timestamp was not captured; the prepared probe file's
  last-write timestamp was 20:18:40.4843254Z before later recorded probe edits.
- No sandbox approval was requested. CPU lease requests and multiple bounded mailbox
  waits preceded central execution; exact queue/dispatch intervals are unknown.
  No delay is attributed to an unmeasured phase by subtraction.
- Actual two command start/end/durations are recorded above. Initial fixture repair
  duration is unknown. Other five independently authored cases were not executed;
  the broker's targeted selection is reported exactly, not as six-case coverage.
- Evidence/final-hash review measured 20:34:55.2715456Z; verdict draft/persist phase
  began by measured **20:35:29 UTC**. First supported verdict saved at
  **2026-10-14T20:36:45.2700562Z**, confirmed by a filesystem read at
  **2026-10-14T20:36:46.3426833Z**. Total launch-to-confirmed-verdict elapsed:
  **1184.1011 seconds (19 minutes 44.1011 seconds)**. This later annotation does
  not replace that measured first-verdict completion interval.

The 120–180-second target was exceeded while waiting for the shared CPU broker and
correcting the first fixture. No full suite, browser, DB, actual external provider,
production mutation or unrelated check was run. Widening stopped once the actual
acceptance violation was confirmed. Necessary cycle-1 checks remain outstanding.

**ISSUES-WRITTEN:** ISS-U010CHECKPOINT-001 (high), `qa/issues.U010CHECKPOINT.jsonl`.

**EXPLANATION:** Source acceptance FAIL is independently established on matching
cycle-0 bytes. Use a per-acquisition unique owner identity and remove only a lock
this caller actually created and still owns; preserve dead-owner recovery and
refusal for live/ambiguous owners. Maker repair requires a new READY fix cycle and
fresh root-broker execution of the exact ledger floor, standing tests and necessary
independent boundaries. Shared integration/tracker writes remain docker_runtime's.

---

## Cycle 1 — repaired source-scoped utility

**VERDICT: PASS**
**Cycle checked: 1**
**Checker:** `/root/roadmap_status/checker_u010`.
**Manifest:** `qa/manifests/goal-u010.md`, read at ready-for-check, Fix cycle 1.
**Whole U0.10: HOLD** for complete ordered actual-provider baselines and genuine
thirty-pair human-reference live calibration. This PASS certifies the implemented
bounded corpus/checkpoint/scorer/audit utility and its verified engineering
boundaries; it does not certify model quality, actual paid runs, human gold,
production `/ask` traversal, deployment or task completion.

### Independent repair assessment and acceptance

The owner token now carries a per-acquisition UUID. A caller records identity only
after successful exclusive creation of the lock. Cleanup/release requires the same
file device/inode/birth identity and exact token, confirmed through a descriptor and
current path; refusal cannot delete another caller's owner. Verified-dead guards and
legacy dead owners retain bounded recovery; live, ambiguous and invalid-PID owners
refuse. Replacement files with identical bytes are preserved. Source review covered
the complete changed state module and changed standing tests; other seven candidate
implementation/dependency files retain their previously reviewed hashes.

**ISS-U010CHECKPOINT-001: 1/1 owner preserved.** The original ledger reproduction
command and frozen-clock recipe were replayed unchanged. The standing maker test
embeds the ledger script verbatim and adds replacement-identity, failed-acquisition,
corrupt-owner and repeated same-process contention boundaries. No recorded case was
omitted, substituted or deliberately left open.

Independent probes also verify durable pre-HTTP reservation and cumulative resume,
actual production scorer per-HTTP abort through fake fetch and disclosed fallback,
source drift before scoring plus persistent resume refusal after restoring bytes,
real exported entry refusal of a SHA-valid current corpus with fabricated human
proof paths/typed approval flags before HTTP or checkpoint creation, and rejection
of unknown/foreign/failed-as-pure/duplicate receipt evidence by the downstream audit.
All test responses/approvals are synthetic; none establishes actual human identity.

Scoped coverage: A1/A2 input and algorithm identity; A4/A7/A9 honest arithmetic,
denominators and fallback distinctions; A8/A14/A15 cap/time/credential/ownership
boundaries; A11–A13 intake/refusal and synthetic export→actual MAE interface;
A16 affected-stage→persisted checkpoint→audit consumption. A3/A5 retain accepted
Option-C provenance/D-156 and disclose historical/current population differences.
A6/A10's actual full model execution and A12/A13's genuine human agreement remain
whole-task gates. No threshold or routing change is accepted by this scoped PASS.

### Actual independent and attributed commands

All commands ran in `C:\Users\product\Desktop\KnowledgeBase`, serial via the sole
CPU broker `/root/docker_checker`, per-test timeout 30000 ms, outer timeout 60000 ms.
The checker independently authored/reviewed the six-probe corpus; the broker ran it
centrally under its fresh lease. No duplicate worker or external provider ran.

| Evidence | Exact command | Actual UTC / wall / result |
|---|---|---|
| Independent full boundary corpus | `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 qa/evidence/goal-u010-checker.test.mjs` | 20:55:25.818Z–20:55:26.867Z; 1043.8314 ms; exit 0; 6/6 pass, zero fail/skip/cancel/todo; TAP 931.0867 ms |
| Original ledger floor, attributed central replay | `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --test-name-pattern="A14 PID acquisition guards" qa/evidence/goal-u010-checker.test.mjs` | 20:43:20.002Z–20:43:20.172Z; 166.0382 ms; exit 0; 1/1 pass; TAP 69.8137 ms |
| Standing stage/downstream suite, attributed central evidence | `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 scripts/eval/u010-baseline-run.test.mjs` | 20:43:13.243Z–20:43:17.053Z; 3805.5458 ms; exit 0; 15/15 pass; TAP 3701.7637 ms |

Date for all rows: 2026-10-14. Individual independent test durations, ms:
reservation/resume 274.7906; real scorer timeout/fallback 244.6504; source drift
47.6456; forged human proof 153.5133; ownership including exact ledger floor
31.6753; downstream receipt refusal 140.0943.

Receipt paths and SHA-256:

- `qa/evidence/goal-t051checker-broker-u010-cycle1-independent.json`:
  `a4dce95b22dbe2ba74c70b56bc13ab21962c2874544d2e1f86d604fd521cff4d`.
- `qa/evidence/goal-t051checker-broker-u010-cycle1-ledger.json`:
  `cebb29c98d7db61d81dd07db45a61cbb51a26a916aa6e57d3ba628b669179b70`.
- `qa/evidence/goal-t051checker-broker-u010-cycle1-standing.json`:
  `f23785a296bcbe004476d3de1c2df088ea03f557e34540d882b1f4ad3bd17e62`.

Each receipt records raw `.stdout.txt` and `.stderr.txt` paths, exact argv, limits,
before/after hashes and measured duration. Independently read actual full-six output
and rechecked all ten current pins at **20:56:52.0127271Z**. All match before/after
and the cycle-1 packet. The contract hash and unchanged central frozen-validator
and registry hashes still match the cycle-0 table; its vacuous PASS is reused with
the same explicit limitations, not rerun or presented as utility correctness.

Changed cycle-1 final hashes:

- `scripts/eval/u010-state.mjs`:
  `04354bb707f57421a01568eab195418ed9178fe2be4ec9ed815e43f85b1d14d2`.
- `scripts/eval/u010-baseline-run.test.mjs`:
  `3a175a8704ac737d848c2721d7aaf0afae9e22c14871fd72f1091d9762c23fde`.

All other eight source/dependency/probe pins remain the cycle-0 table values.
No source or test mutation was performed by the checker. Temp fixtures were
contained and cleaned under the explicitly verified checker/temp roots.

### Cycle-1 timing and disposition

Current resumed cycle-1 checker launch/scope-read start:
**2026-10-14T20:50:33.8747162Z**. Packet/source review and initial nine-pin check
finished by measured **20:51:07.6872163Z**; exact individual read intervals unknown.
Fresh CPU request followed launch; exact request/grant interval is unknown. There
was no sandbox approval. Actual command timestamps are above; multiple bounded
mailbox waits preceded receipt delivery. Final evidence/hash review and verdict
draft start were measured at **20:56:52.0127271Z**. First cycle-1 PASS saved at
**2026-10-14T20:58:57.2555724Z**, confirmed at
**2026-10-14T20:58:58.5259350Z**: launch-to-confirmed-verdict **504.6512 seconds
(8 minutes 24.6512 seconds)**. This later timing annotation does not replace that
first supported PASS completion interval. Unknown queue/review gaps are not assigned
to phases by subtraction. The 120–180-second target was exceeded while the fresh
sole CPU slot was queued; necessary verification was completed.

**ISSUES-WRITTEN: none new.** ISS-U010CHECKPOINT-001 is verified fixed by its exact
1/1 ledger corpus and independent source/boundary review; its original red evidence
and reproduction remain permanent. Maker may close out only this matching cycle-1
source manifest. Shared trackers/git remain docker_runtime-owned. Actual full
provider and human-reference task gates remain HOLD and must not be upgraded.

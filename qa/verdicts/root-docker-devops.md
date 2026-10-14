# Verdict: root-docker-devops

VERDICT: FAIL
Cycle checked: 0
Commit checked: 9b02375356ef88c966a58c83cde01ffa7bb8c614
Scope: root Docker packaging, Compose/docs/CI consumers, root allowance and its focused regression fixtures; qa/contracts/root-docker-devops.md C1-C4. T-051 operational release and unrelated general-platform CI are separate gates.

## Finding

C3 is not satisfied on the current candidate. Docker workflow [38609031571](https://github.com/vidysea-admin/KnowledgeBase/actions/runs/38609031571) failed its clean-checkout root step. The root linter itself passed at 16 files, but the focused root regression command imported scripts/lint.test.mjs, whose top-level scripts/gen-types.mjs dependency requires json-schema-to-typescript. Host dependencies were not installed. The test process exited 1 before the two selected tests ran; frozen-validator and image-smoke steps were skipped. Install the required host dependencies or execute these unchanged focused fixtures in an environment containing them; preserve the actual root tests and enforcement.

Exact failed command:

```sh
node --test --test-timeout=30000 --test-name-pattern='^lint-root:' scripts/lint.test.mjs
```

Actual log output:

```text
lint-root: OK (16 loose root file(s), 0 gitignored excluded)
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'json-schema-to-typescript' imported from /home/runner/work/KnowledgeBase/KnowledgeBase/scripts/gen-types.mjs
Process completed with exit code 1.
```

Evidence artifact: C:/Users/product/AppData/Local/Temp/root-docker-38609031571.log. The selected test process reports one module-load failure, not 2/2 exercised fixtures. The remote root step starts 17:43:19.9245481Z and ends 17:43:20.0921717Z (~0.168 seconds); test-reported module duration 40.20922ms.

## Independent checks and provenance

- Source review established C1/C2 build targets/default, pinned versions/frozen installs, existing esbuild bundle/runtime layout, production dependencies, non-root API, nginx SPA and preserved migration/environment boundaries. No image behavior is inferred from source alone.
- Independent source/hash probe on the final cycle-0 packet at 17:43:40.5155916Z-17:43:40.6817769Z, exit 0 (~0.167 seconds), verified all eight manifest pins and self-hash af3c741e38a45b6eaceb4f5238951abad26c8b270cf6b3235bad6a1c9b87fa4c. Exact probe compares each manifest table SHA256 with Get-FileHash and throws on any mismatch.
- Rechecked current HEAD and manifest/workflow hashes at 17:45:36.6850435Z: HEAD remains 9b023753; manifest remains af3c741e...; workflow remains c38a7310.... Read the actual remote failure log independently and confirmed the direct top-level import chain in scripts/lint.test.mjs.
- Earlier candidate 0bdf3572 had an executed successful Docker run 38607933307. Independently read its actual job/artifact logs: clean root 16, frozen-validator PASS by vacuity, image targets/CLI/assets/user/exclusions, missing-db refusal, health/auth and SPA PASS. Downloaded index/settings matched SHA256 f4cb424f481d4b311aab7d0355dfa9099be9e689a2646b0f40b8d4306c640cdc. This is prior-candidate evidence, not acceptance of the changed current workflow.
- Maker's local focused 2/2 result is attributed evidence only. It does not cure the current clean-checkout import failure.

Checked raw SHA256 pins:

| Path | SHA256 |
| --- | --- |
| Dockerfile | c5e1ba0859c763d2b4534fc6a19a183d29994022c1e02caf0910c898a2b8019b |
| docker-compose.yml | fb262e68eb9127bdd73785a91b34e34bdf07b2cbc9c43af57a54158db1336e24 |
| docs/docker-deployment.md | 016db881b6d4b4fe0103c78e72c46b92a7b01772d47f5194058c7af4e8cc84e3 |
| .github/workflows/docker.yml | c38a7310f0d0a37e531a4359a82dd305806984a4f5f7c95278858c867c3c8f28 |
| scripts/lint.test.mjs | c1603b60d7b96961d9c8ad542d12ffd0f963409e04c881cce66df107a03a78a3 |
| structure.config.json | e1e3ccbdd32fb6be246a022256fd8f1ae88d2ead99746f36853154a51d59ae23 |
| docs/DECISIONS.md | 9e3ab1d1f4630956b1ec2d3a7803a55a20065d435b0d3e9977539bf044964ad5 |
| qa/contracts/root-docker-devops.md | 4e07d1b6426e010d06722648f6e3f524da76664047410b85848f80fb64aa5e6c |

## Timing and limits

Initial checker dispatch/read-start timestamp unknown; first recorded review timestamp 17:24:10.4686070Z. Multiple pre-verdict candidates were explicitly withdrawn/resubmitted. Latest candidate hash review 17:43:40; actual failure review 17:45:36.6850435Z; draft/persist started 2026-10-14 17:46:50 UTC. Total launch-to-verdict is unknown because the initial launch was not measured; recorded span exceeds 21 minutes. Necessary elapsed work included real remote CI, documentation correction, root-fixture regression correction and publication/resubmission waits; per-phase waits and original source-read durations are unmeasured. No approval was requested by this checker. No local Docker, browser, full suite, production database or provider request ran.

ISSUES-WRITTEN: none by this checker; the medium CI-dependency finding is recorded above and routed to the maker/QA owner for the existing unit, not a new backlog unit.

EXPLANATION: A proven clean-checkout acceptance failure requires FAIL, not HOLD. Submit a repaired cycle 1 packet with unchanged-or-repinned source, exact new publication commit and actual successful full Docker workflow evidence. Do not close the manifest as checked-PASS on this verdict. General-platform tracker/CI failures remain separately reported and do not establish or block this scoped Docker contract unless they involve an affected consumer.

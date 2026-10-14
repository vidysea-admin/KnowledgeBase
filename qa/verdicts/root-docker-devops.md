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

---

# Verdict: root-docker-devops — cycle 1

VERDICT: PASS
Cycle checked: 1
Commit checked: c7b4c60157e9b03642ea964df15192e7eeb0ccf7
Scope: complete qa/contracts/root-docker-devops.md C1-C4 acceptance for the root container entrypoint and its immediate consumers, including the induced root-budget fixture regression. This scoped PASS supersedes the cycle-0 verdict for the repaired candidate; the history above remains evidence.

## Executed acceptance

[Docker run 38609853426](https://github.com/vidysea-admin/KnowledgeBase/actions/runs/38609853426) completed SUCCESS on the exact checked commit; publisher retrieved GitHub run/job metadata and authenticated artifact without exposing credentials. All eight workflow steps succeeded. Job 17:49:02Z-17:50:10Z (68 seconds); image build/smoke step 17:49:12Z-17:50:07Z (55 seconds). Run creation 17:48:58Z; final update 17:50:11Z. Those metadata and downloads are attributed publisher evidence, then the actual logs/files were independently read by this checker.

Exact focused host commands:

```sh
timeout 300 pnpm install --frozen-lockfile --ignore-scripts
node scripts/lint-root.mjs
node --test --test-timeout=30000 --test-name-pattern='^lint-root:' scripts/lint.test.mjs
python3 contracts/verify_contracts.py
```

Actual outputs:

```text
Done in 3.6s using pnpm v10.33.0
lint-root: OK (16 loose root file(s), 0 gitignored excluded)
lint-root: passes on a clean fixture (44.788215ms)
lint-root: fails on a violating fixture (41.453968ms)
tests 2; pass 2; fail 0; cancelled 0; skipped 0
duration_ms 239.158117
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
Opt-in migration build target dependencies: PASS
API user, runtime assets and exclusions: PASS
Missing database name startup refusal: PASS
API health and unauthenticated refusal: PASS
Web root and settings SPA fallback: PASS
Docker image smoke: PASS
```

The exact image commands, environment fixtures, Node assertions, bounded waits and cleanup are the complete run block in .github/workflows/docker.yml, SHA256 2683d96953d0df7c081554abc1c2d0180232e9e286ac6a28878500540d97c27d. Principal build commands executed:

```sh
timeout 900 docker build --progress plain -t "$api_image" .
timeout 900 docker build --progress plain --target web --build-arg VITE_API_BASE_URL=http://localhost:3300 -t "$web_image" .
timeout 120 docker build --progress plain --target build -t "$build_image" .
```

The default API image booted with plain Node against only ephemeral Mongo in lkb_work_docker_smoke. Its actual health probe returned 200 with db=ok, unauthenticated POST /ask returned 401/error=unauthorized, and the missing-database container exited 1 with the required guard message. API user=node and required bundle/schema/routing files were asserted; prohibited secret/data/raw/source/development dependency paths were absent. The builder's migration CLI/dependencies resolved without executing a migration. The compiled nginx root and /settings returned the same SPA. Dummy key, private Docker network and empty watcher tenants kept provider/production requests out of the smoke. No migrations, seed, persistent volumes or published Mongo ports were used.

Evidence: C:/Users/product/AppData/Local/Temp/root-docker-38609853426/job.log and evidence/smoke.log, missing-db.log, index.html, settings.html and service logs. [Artifact 11917248485](https://github.com/vidysea-admin/KnowledgeBase/actions/runs/38609853426/artifacts/11917248485), downloaded zip SHA256 fab9267979c0279d45de8fbd563ce403510bbebed746360a64bc4d4127b1837b.

## Independent review, probes and final bytes

- Independently reviewed the full root Dockerfile, Compose target/profile/environment changes, deployment instructions, workflow shell/runtime assertions, root allowance, append-only decision and the exact changed root-fixture expectation. API/web/build targets, API default, Node 24/pnpm 10.33.0/frozen lock, esbuild/runtime layout, production externals, assets, user/healthchecks, nginx URL/SPA and migration compatibility satisfy C1/C2.
- Diagnosed and verified correction of the unauthenticated response assertion; documented Compose's required MONGODB_DB interpolation even with the migration profile inactive. The new root budget is exactly 16; no enforcement or frozen-contract logic changed.
- Cycle-1 dependency bootstrap is Node 24, pinned pnpm 10.33.0 and bounded frozen host install with lifecycle scripts disabled. The root fixture expectation derives allowance plus one; tests/enforcement are preserved. Remote 2/2 fixtures demonstrate the cycle-0 module-load failure is repaired.
- At 17:48:53.8196092Z-17:48:53.9641939Z (~0.145 seconds, exit 0), independently verified eight packet hashes and manifest self-hash before relying on maker evidence.
- At 17:51:50.0620441Z-17:51:50.3135768Z (~0.252 seconds, exit 0), independently read the final real job/smoke outputs, compared downloaded root/settings SHA256, revalidated every source pin/self-hash, and confirmed HEAD matches the successful run's checked commit. Both SPA files equal f4cb424f481d4b311aab7d0355dfa9099be9e689a2646b0f40b8d4306c640cdc. This content-level probe is independent of the workflow's own cmp assertion.

Final raw SHA256 pins:

| Path | SHA256 |
| --- | --- |
| Dockerfile | c5e1ba0859c763d2b4534fc6a19a183d29994022c1e02caf0910c898a2b8019b |
| docker-compose.yml | fb262e68eb9127bdd73785a91b34e34bdf07b2cbc9c43af57a54158db1336e24 |
| docs/docker-deployment.md | 016db881b6d4b4fe0103c78e72c46b92a7b01772d47f5194058c7af4e8cc84e3 |
| .github/workflows/docker.yml | 2683d96953d0df7c081554abc1c2d0180232e9e286ac6a28878500540d97c27d |
| scripts/lint.test.mjs | c1603b60d7b96961d9c8ad542d12ffd0f963409e04c881cce66df107a03a78a3 |
| structure.config.json | e1e3ccbdd32fb6be246a022256fd8f1ae88d2ead99746f36853154a51d59ae23 |
| docs/DECISIONS.md | 9e3ab1d1f4630956b1ec2d3a7803a55a20065d435b0d3e9977539bf044964ad5 |
| qa/contracts/root-docker-devops.md | 4e07d1b6426e010d06722648f6e3f524da76664047410b85848f80fb64aa5e6c |
| qa/manifests/root-docker-devops.md | 631b606addc3ef1190edfd27d870b73db7327f8b6c64a4c93c03100dc34a8ef8 |

## Timing, close-out and limits

Cycle-1 observed checker review launch 17:48:53.8196092Z; source/hash review ended 17:48:53.9641939Z; remote run/job timestamps above. Required publication/run/artifact wait occurred between that review and final artifact read, with individual wait/download intervals unknown. Final artifact/hash command started/ended 17:51:50.0620441Z/17:51:50.3135768Z. Draft/persist started 2026-10-14 17:53:04 UTC; measured observed cycle-1 span to this timestamp approximately 250.2 seconds. Initial overall dispatch launch remains unknown as disclosed in cycle 0. The 120-180-second target was exceeded to obtain required actual fresh-commit remote CI and artifact evidence; no additional broad suite ran. No checker approval request, browser, local Docker, production connection or provider call occurred.

ISSUES-WRITTEN: none.

EXPLANATION: Complete scoped acceptance is established on unchanged candidate bytes. Maker may close the cycle-1 manifest to checked-PASS and publish the verdict/close-out. Preserve unrelated local evaluation/recording edits. Frozen-contract validation is vacuous because contracts are empty; whole T-051 operational release, real deployment and broader platform/tracker acceptance remain unclaimed. The independently identified pre-existing tracker/general-CI failures are a separate readiness report, not evidence of failed Docker packaging.

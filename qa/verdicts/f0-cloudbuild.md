# Verdict — f0-cloudbuild
Policy-Version: proportional-verification/2026-11-22.19
Cycle checked: 0
Checked head: 54abe1fa (code 8bda9a45 + 791b8ffa); base a9bbeb98 (= merge-base with release/kb-golive)
VERDICT: PASS (F0-C1..C4, C6, I1, I2 evidenced offline; F0-C5 is the owner's operator step, OPERATOR-GATED, not judged offline)
TIER: L (floor from `tick.mjs --route a9bbeb98..HEAD --root <worktree>` = L, dual false; rule fired: qa/contracts file in diff). CI/deploy config. Single checker; no security/auth/tenancy/prod-write line in the diff, so no `full-suite trigger`.
HUMAN_GATE-REQUEST: Approve and run the F0-C5 throwaway tagged deploy (manifest "Operator steps", steps 1-5) AFTER step 0 and step 6 are corrected per ISS-F0CLOUDBUILD-002. Pointing the real trigger at cloudbuild.yaml and pushing master stay separate approvals (F0-I1).
ISSUES-WRITTEN: ISS-F0CLOUDBUILD-001 (C5 operator gate), ISS-F0CLOUDBUILD-002 (operator step 6 hazard) in qa/issues.F0CLOUDBUILD.jsonl
LIVE-BROWSER: n/a (no UI surface)

## 1. Check plan
Signals: config/CI changed (L), logic in a structural test (affected test + falsification floor). No UI, no prompt/LLM, no data artifact, no auth/tenancy code. No spawn needed: every check is built-in and under a minute. `SERIAL: no spawn needed; checks were cheap and run in one scratch tree.` Plan: (a) contract byte-identity vs c32c8bbc; (b) floor recompute; (c) re-run the unit test; (d) read the diff (step 4c) incl. semantics of the Deploy script; (e) capability-coverage falsification in throwaway copies outside the bound root; (f) lint-root / lint-dirsize; (g) read-only gcloud (names, images, labels, traffic) to corroborate C1 repositories and the inline config; (h) judge the F0-C5 operator steps.

## 2. Evidence
- Contract: `git rev-parse af47b991:qa/contracts/cloud-build-deploy.md` = `c32c8bbc:...` = f0cd6efe; worktree file hashes to the same blob (`git hash-object`). Bytes differ from `git show` only by the worktree's CRLF autocrlf (`tr -d '\r' | cmp` identical). Not edited by the maker.
- `node --test scripts/operations/cloudbuild.test.mjs` (my run): 5 tests, 5 pass, 0 fail, 0 skipped (the stub-gcloud test really ran bash).
- `node scripts/lint-root.mjs` -> OK 17 loose root files (budget 17); `node scripts/lint-dirsize.mjs` -> OK 307 dirs. Diff of structure.config.json is the single number `maxLooseFiles 16 -> 17`; no linter logic changed (F0-C6). The allowance is named in the manifest. It is a root-budget decision; flagged for Umesh below, not a defect.
- Diff scope (4c): 5 files, all named in the manifest (cloudbuild.yaml, cloudbuild.test.mjs, structure.config.json, the contract copy, the manifest). Nothing touches the trigger, `.github`, Dockerfile or compose (F0-I1). No secret value or `secretEnv`/`availableSecrets` in the file (F0-I2).
- Read-only gcloud (names/images/labels/traffic only): live service containers `web;api`; images `.../vidysea-admin-knowledgebase/vidysea-knowledgebase-web@sha256:15b3cef9...` and `.../vidysea-knowledgebase@sha256:facb909e...` = the two repository paths the file pushes with the default substitutions. Trigger 8db33765 `build.images` = `<api>:$COMMIT_SHA`, `<api>:latest`; tags `gcp-cloud-build-deploy-cloud-run;vidysea-knowledgebase`; steps = docker x3 + cloud-sdk:slim; service labels (managed-by, gcb-trigger-id, gcb-trigger-region, commit-sha, gcb-build-id) = the `--update-labels` keys in the Deploy step. The inline step args themselves were NOT re-read (project rule limits projections), so the line-by-line args mapping is the manifest's paste, consistent with every item I could project.

## 3. Criteria
- F0-C1 PASS: two builds (`--target web`, `--target api`), two `push --all-tags` to the two live repository paths, both tagged `$COMMIT_SHA`; web gets no other tag; api keeps the inline `:latest` (the only non-sha tag, also in the inline config); `TARGETARCH=amd64`, `-f Dockerfile .`, api `--cache-from`, best-effort Pull, `images:`/`options:`/`tags:` kept; labels kept in Deploy. No new mutable tag.
- F0-C2 PASS (offline scope): one `gcloud run services update`, `--container=web --image=<web>:$COMMIT_SHA --container=api --image=<api>:$COMMIT_SHA`, non-container flags (`--region`, `--update-labels`, `--quiet`, optional `--tag`/`--no-traffic`) before the first `--container`; 27 forbidden flags (env, secrets, traffic, scaling, resources, port, ingress, service account) absent; stub-gcloud run executes the real script and checks argv. The `$${extra[@]+...}` form is Cloud Build-escaped and safe under `set -eu`. The before/after `describe` comparison itself is part of F0-C5. Note: `--update-labels` changes service labels exactly as the inline config does today; I read that as revision/deploy metadata.
- F0-C3 PASS: eight substitutions, all with defaults; the seven the trigger supplies plus `_REVISION_TAG` ('') and `_NO_TRAFFIC` ('false'), which default to today's behaviour; only built-ins (`REPO_NAME`, `COMMIT_SHA`, `LOCATION`, `BUILD_ID`) otherwise. A tagged no-traffic run needs only a throwaway trigger carrying those two substitutions, not an edit of the real trigger.
- F0-C4 PASS: test asserts two builds, two pushes, exactly one deploy with both containers, substitution defaults, no single-container deploy; falsification below goes red when either container is dropped.
- F0-C5 OPERATOR-GATED: cannot run offline (a deploy is outward-facing and the owner's check). Operator steps 0-7 are otherwise complete (before/after snapshots with hashed env, throwaway manual trigger, tag + no-traffic run, diff, traffic check, cleanup, separate trigger step) but have one defect, ISS-F0CLOUDBUILD-002 (step 0/6 `--to-latest`). Reported as an operator HUMAN_GATE, not an offline finding.
- F0-C6 PASS (see lint evidence above).
- F0-I1 PASS (no trigger or master action in the diff). F0-I2 PASS.

## 4. Capability coverage (re-run in throwaway copies outside the bound root, `<scratch>/row-*`, 60 s timeout each, copy green before every edit)
| criterion | edit (single hunk, cloudbuild.yaml unless noted) | before | after: assertion that fired |
|---|---|---|---|
| F0-C1 | web tag `:$COMMIT_SHA` -> `:latest` | exit 0 | `web build is not tagged ...-web:$COMMIT_SHA`, `web build applies a tag the inline config does not: ...-web:latest` |
| F0-C1 | delete api `--cache-from` pair | exit 0 | `api build lost --cache-from <api>:latest` |
| F0-C2 | add `--set-env-vars=A=B` to deploy | exit 0 | `deploy touches --set-env-vars (F0-C2: nothing but the two images)` |
| F0-C3 | delete `_REVISION_TAG: ''` | exit 0 | `substitution _REVISION_TAG has no default in the file ...` (and the stub-gcloud test also red) |
| F0-C4 | drop api container+image | exit 0 | `deploy must set containers web then api in one update; found web`; the "not vacuous" test red |
| F0-C4 | drop web container+image | exit 0 | `... found api`; "not vacuous" test red |
| F0-I2 | add `availableSecrets:` | exit 0 | `file looks like it carries a secret value or secret wiring` |
| stub claim | `_NO_TRAFFIC = "true"` -> `"false"` in deploy script | exit 0 | `AssertionError: defaults must not add tag or no-traffic` |
| F0-C6 | structure.config.json `maxLooseFiles` 17 -> 16 (lint-root, copy with the 17 loose root files) | exit 0 | `lint-root: FAIL ... root has 17 loose files (budget 16)` |
No row survived. Every manifest row has an admissible single-hunk edit to a file named in "What changed". F0-C5 row is the enumerated operator debt (ISS-F0CLOUDBUILD-001).

## 5. Explanation and notes (not filed)
- The new test is not registered in the root `test:lint` script (package.json outside the unit); the manifest says so. Low, noted.
- The manifest's own claim "UNVERIFIED ... to be filed by the checker" is honoured by ISS-F0CLOUDBUILD-001.
- No `Fan-out:` line in the manifest, nothing to verify. Consent: not examined (out of scope).

Metrics: start=2026-11-25T07:22:49Z end=2026-11-25T07:33:00Z wall_min=10 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=611 mutants=0 defects_unit=0 defects_6c=0

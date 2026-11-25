# Manifest — f0-cloudbuild
**Contract:** qa/contracts/cloud-build-deploy.md
**Goal task:** none (wave 1, lane A F0 of the D-227 plan)
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no   ← CI/deploy config only; no auth, tenancy or production data write in this diff (no `dual-trigger:` line applies)
**Persona walk:** skip (infra config and a test; no UI surface changed)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one new YAML plus one structural test and a one-number budget allowance; no external model was worthy.

## What changed
- cloudbuild.yaml:1-104 (NEW, authorized by D-227) — six steps: Pull (best-effort api `:latest` cache source), BuildWeb (`--target web`), BuildAPI (`--target api`), PushWeb, PushAPI, Deploy (ONE `gcloud run services update` that sets `--container=web --image=<web>:$COMMIT_SHA` and `--container=api --image=<api>:$COMMIT_SHA`); `images:`, `options:`, `tags:` kept from the inline config; 8 substitutions, all with defaults.
- scripts/operations/cloudbuild.test.mjs:1-238 (NEW) — structural test, 5 tests (see "How to verify").
- structure.config.json:13 — `root.maxLooseFiles` 16 -> 17. F0-C6 allowance entry; the root already held 16 loose files so the new root file is the 17th. Config value only, no linter logic changed. NOTE: the brief said "Nothing else", the contract (C6) says "any allowance entry that was needed is named in the manifest"; the contract wins, this is that naming. Needs the checker's / Umesh's eye since a root-budget bump is a decision.
- qa/contracts/cloud-build-deploy.md (brought in by commit af47b991 from c32c8bbc, byte for byte, not edited).

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: L (CI / deploy config), one checker
Round: 3 files, 6 criteria, est 40 min — one config file, one test file, one budget number; operator proof (C5) cannot run offline
Base / checked state: base a9bbeb98; code HEAD 791b8ffa (af47b991 contract, 8bda9a45 code, 791b8ffa CRLF fix to the test); worktree clean before the manifest commit.
Gate answers: none apply — read qa/gates/*.md (82 files); the deploy-related ones (master-merge-deploy-2026-10-30.md, master-merge-pr34-2026-11-01.md, d-entry-golive-batch4.md) concern earlier merges/deploys and do not mention cloudbuild.yaml, the trigger or the web/api build targets.
Affected tests / full-suite trigger: scripts/operations/cloudbuild.test.mjs only; no full-suite trigger. NOTE: the test is not listed in the root `test:lint` script (package.json is outside this unit's ownership); run it directly. A follow-up edit of package.json `test:lint` would register it.
Tests[F0-C1]: scripts/operations/cloudbuild.test.mjs::"cloudbuild.yaml has the contract shape" — two `--target` builds, sha tags on both, api-only `:latest` (the inline config's), `TARGETARCH=amd64`, `-f Dockerfile .`, api `--cache-from`, Pull step, two `push --all-tags` of the web and api repositories, `images:` list
Tests[F0-C2]: scripts/operations/cloudbuild.test.mjs::"cloudbuild.yaml has the contract shape" and "deploy script, run against a stub gcloud ..." — one `run services update`, containers web then api each paired with its own sha image, 27 forbidden flags absent (env, secrets, traffic, scaling, resources, service account, ports, ingress), non-container flags precede `--container`; the stub-gcloud test executes the real deploy script and checks the argv
Tests[F0-C3]: scripts/operations/cloudbuild.test.mjs::"cloudbuild.yaml has the contract shape" and the stub-gcloud test — every `$_X` used is declared with a default, no non-underscore substitution beyond the built-ins (REPO_NAME, COMMIT_SHA, LOCATION, BUILD_ID, PROJECT_ID), optional `_REVISION_TAG` ('') and `_NO_TRAFFIC` ('false') default to today's behaviour and, set, add `--tag=` / `--no-traffic`
Tests[F0-C4]: scripts/operations/cloudbuild.test.mjs::"the test is not vacuous: dropping either container ..." and "each rule has a mutation that turns it red" — 2 container-drop cases and 10 rule mutations, each must produce violations
Tests[F0-C5]: none — operator step, cannot run offline (a deploy is outward-facing); exact commands under "Operator steps (not run)"
Tests[F0-C6]: node scripts/lint-root.mjs and node scripts/lint-dirsize.mjs (existing linters, unchanged) — root count 17 vs budget 17; scripts/operations holds 11 files
Tests[F0-I2]: scripts/operations/cloudbuild.test.mjs::"cloudbuild.yaml has the contract shape" — no secretEnv/availableSecrets/key-looking literal/connection string
Sibling: scripts/operations/compose-t028-env.test.mjs:1 — not affected, it reads docker-compose.yml only; Dockerfile and docker-compose.yml are untouched (root-docker-devops.md governs them)
Pre-check[F0-C1]: 791b8ffa node --test scripts/operations/cloudbuild.test.mjs -> green: 5 passed, 0 failed t=1 blobs=scripts/operations/cloudbuild.test.mjs:28a6774
Pre-check[F0-C2]: 791b8ffa node --test scripts/operations/cloudbuild.test.mjs -> green: 5 passed, 0 failed t=1 blobs=scripts/operations/cloudbuild.test.mjs:28a6774
Pre-check[F0-C3]: 791b8ffa node --test scripts/operations/cloudbuild.test.mjs -> green: 5 passed, 0 failed t=1 blobs=scripts/operations/cloudbuild.test.mjs:28a6774
Pre-check[F0-C4]: 791b8ffa node --test scripts/operations/cloudbuild.test.mjs -> green: 5 passed, 0 failed t=1 blobs=scripts/operations/cloudbuild.test.mjs:28a6774
Pre-check-note[F0-C5]: no Pre-check line on purpose; the throwaway deploy is operator-only and cannot be green offline (see "Operator steps (not run)")
Pre-check[F0-C6]: 791b8ffa node scripts/lint-root.mjs; node scripts/lint-dirsize.mjs -> OK: 17 loose root file(s); OK: 307 dir(s) within budget t=1
Pre-check[F0-I2]: 791b8ffa node --test scripts/operations/cloudbuild.test.mjs -> green: 5 passed, 0 failed t=1 blobs=scripts/operations/cloudbuild.test.mjs:28a6774
Metrics: start=2026-11-25T06:50:00Z end=2026-11-25T07:25:00Z wall_min=35 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=1 mutants=9 defects_unit=0 defects_6c=0

## How to verify (commands + expected)
- `node --test scripts/operations/cloudbuild.test.mjs` -> expected: 5 tests pass (shape; parser; container-drop falsification; 10 rule mutations; stub-gcloud run of the deploy script).
- `node scripts/lint-root.mjs && node scripts/lint-dirsize.mjs` -> expected: both OK (17 loose root files, budget 17).
- `node scripts/lint-loc.mjs --all` -> expected: loc stage reports one violation, `apps/api/src/answer-policy/answer-evidence.ts:509 (budget 300)`, which is in base a9bbeb98 and not in this diff; the `dependencies` stage fails because the fresh worktree has no node_modules. Neither is caused by this unit; neither new file is listed.
- `python -I -c "import yaml;yaml.safe_load(open('cloudbuild.yaml'))"` -> expected: parses (PyYAML 6.0.3 agrees with the test's own parser on the 6 steps and 8 substitutions).

## Actual outputs (from maker's own run)
```
✔ cloudbuild.yaml has the contract shape (F0-C1..C4, I2)
✔ parser reads the file into the expected top-level structure
✔ the test is not vacuous: dropping either container from the deploy goes red (F0-C4 falsification)
✔ each rule has a mutation that turns it red
✔ deploy script, run against a stub gcloud, passes both images and only the optional flags requested
ℹ tests 5   ℹ pass 5   ℹ fail 0
lint-root: OK (17 loose root file(s), 0 gitignored excluded)
lint-dirsize: OK (307 dir(s) within budget)
```
Red-first: before the file existed, `CLOUDBUILD_FILE=nonexistent.yaml node --test scripts/operations/cloudbuild.test.mjs` failed with `ENOENT` (the test was authored before cloudbuild.yaml).

### F0-C1 evidence: the inline trigger config, read-only (`gcloud builds triggers describe 8db33765-f3e2-4c1f-bf15-03ef5c1f511f`), and the line-by-line mapping
Inline config (substitutions REPO_NAME=vidysea-admin-knowledgebase, _AR_HOSTNAME=asia-south1-docker.pkg.dev, _AR_PROJECT_ID=vidysea-prod, _AR_REPOSITORY=cloud-run-source-deploy, _DEPLOY_REGION=asia-south1, _SERVICE_NAME=vidysea-knowledgebase, _TRIGGER_ID=8db33765-...; `I`=`$_AR_HOSTNAME/$_AR_PROJECT_ID/$_AR_REPOSITORY/$REPO_NAME/$_SERVICE_NAME`):
```
images: [I:$COMMIT_SHA, I:latest]
options: {logging: CLOUD_LOGGING_ONLY, requestedVerifyOption: VERIFIED, substitutionOption: ALLOW_LOOSE}
steps:
  Pull   gcr.io/cloud-builders/docker  /bin/bash -c "docker pull I:latest || exit 0"
  Build  docker build --build-arg TARGETARCH=amd64 --cache-from I:latest -t I:$COMMIT_SHA -t I:latest -f Dockerfile .
  Push   docker push --all-tags I
  Deploy gcloud run services update $_SERVICE_NAME --image=I:$COMMIT_SHA
         --update-labels=managed-by=gcp-cloud-build-deploy-cloud-run,gcb-trigger-id=$_TRIGGER_ID,gcb-trigger-region=$LOCATION,commit-sha=$COMMIT_SHA,gcb-build-id=$BUILD_ID
         --region=$_DEPLOY_REGION --quiet        (cloud-sdk:slim)
tags: [gcp-cloud-build-deploy-cloud-run, vidysea-knowledgebase]
```
| inline | cloudbuild.yaml |
|---|---|
| Pull `docker pull I:latest \|\| exit 0` | Pull step, same command |
| Build `--build-arg TARGETARCH=amd64` | both builds carry `--build-arg TARGETARCH=amd64` |
| Build `--cache-from I:latest` | BuildAPI keeps it. BuildWeb has none: the web image has no `:latest` today and the unit may not add a mutable tag (contract C1); the shared base/deps layers are cached by the same build host's second build |
| Build `-t I:$COMMIT_SHA -t I:latest -f Dockerfile .` (api, the Dockerfile default target) | BuildAPI `--target api -t I:$COMMIT_SHA -t I:latest -f Dockerfile .`; BuildWeb `--target web -t <I>-web:$COMMIT_SHA -f Dockerfile .` (no `:latest`) |
| no labels on the build | none added |
| Push `--all-tags I` | PushAPI same; PushWeb `--all-tags <I>-web` |
| Deploy `--image=I:$COMMIT_SHA` (single, container-less) | one update, `--container=web --image=<I>-web:$COMMIT_SHA --container=api --image=I:$COMMIT_SHA` |
| Deploy `--update-labels=...`, `--region`, `--quiet` | identical flags and values, placed before `--container` |
| `images:`, `options:`, `tags:` | `images:` plus the web sha image; `options:` and `tags:` identical |
| 7 trigger substitutions | all 7 are used or tolerated (ALLOW_LOOSE); 6 `_*` have defaults equal to the trigger's values; `_TRIGGER_ID` defaults to `manual`; `REPO_NAME` is built in on triggered builds |
New mutable tags added by this unit: none. The api `:latest` is the inline config's own tag (cache source only; never deployed). Image repositories match the live revision vidysea-knowledgebase-00020-7ss (read-only projection `value(spec.containers[].name,spec.containers[].image)`): container `web` = `.../vidysea-admin-knowledgebase/vidysea-knowledgebase-web@sha256:15b3cef9...`, container `api` = `.../vidysea-admin-knowledgebase/vidysea-knowledgebase@sha256:facb909e...`. Manual build 02eae3b2 used the same two `--target` builds with the same two repositories and had no build-arg or cache flags (this unit adds TARGETARCH=amd64 to both, as the inline config has it; the web stage does not consume it, harmless).

### F0-C2: gcloud help lines relied on (`gcloud run services update --help`, quoted)
- `--container=CONTAINER  Specifies a container by name. Flags following --container will apply to the specified container.`
- `Flags that are not container-specific must be specified before --container.`
- synopsis lists `--image=IMAGE` inside the per-container flag group (with `--cpu`, `--memory`, `--port`, ...), while `--update-labels`, `--region`, `--tag`, `--no-traffic` are outside it.
- `--tag=TAG  Traffic tag to assign to the newly created revision.`
- `--no-traffic  True to avoid sending traffic to the revision being deployed. Setting this flag assigns any traffic assigned to the LATEST revision to the specific revision bound to LATEST before the deployment.`
- `gcloud builds submit --substitutions`: "all keys must begin with an underscore" (so a manual `submit` cannot supply COMMIT_SHA or REPO_NAME; see operator steps).
One `services update` call = one new revision with both images. The deploy sets only the two images, the existing `--update-labels` (service metadata, same as today), and the optional tag/no-traffic flags. Container names `web;api` read from revision 00020-7ss.

## Capability coverage (each new claim -> its isolating falsification)
Falsifications ran against throwaway copies of cloudbuild.yaml in `C:/Users/Lenovo/AppData/Local/Temp/claude/6e9d41101c3c5a5b/3fb8d78b-cac7-406e-9e13-fe76f3d5cd42/scratchpad/f0-falsify/` (script `falsify.mjs`, 60 s timeout per run, the worktree was never mutated; the test reads the copy through `CLOUDBUILD_FILE`). Baseline on the copy: `baseline exit=0`. Each row's "after" is the named test `cloudbuild.yaml has the contract shape (F0-C1..C4, I2)` going `✖` for the quoted violation (the assertion that fired); before, the same node was `✔`.
| Criterion | capability | check | falsifying edit | observed |
|---|---|---|---|---|
| F0-C1 | web image tagged with the commit sha and no new mutable tag | cloudbuild.test.mjs `analyze` build/tag rules | web `-t` tag `:$COMMIT_SHA` -> `:latest` | before `✔ cloudbuild.yaml has the contract shape`; after `✖` with `web build is not tagged .../$_SERVICE_NAME-web:$COMMIT_SHA` and `web build applies a tag the inline config does not: ...-web:latest` |
| F0-C1 | api build keeps the inline cache setting | same | delete `--cache-from <api>:latest` | after `✖` with `api build lost --cache-from <api>:latest` |
| F0-C2 | deploy changes only the two images | same, forbidden-flag list | add `--set-env-vars=A=B` to the deploy | after `✖` with `deploy touches --set-env-vars (F0-C2: nothing but the two images)` |
| F0-C3 | optional substitutions have defaults | same, substitution rule | delete `_REVISION_TAG: ''` from `substitutions:` | after `✖` with `substitution _REVISION_TAG has no default in the file (needed for a trigger-less throwaway run)` |
| F0-C4 | the test goes red when a container is dropped | "dropping either container" + same | delete the api container and its `--image` line | after `✖` with `deploy must set containers web then api in one update; found web`, `deploy container/image pairing wrong: web=...`, `deploy must pass --image exactly twice`; deleting the web container gives the mirror violations (`found api`) |
| F0-C5 | operator throwaway deploy | none offline | n/a | `UNVERIFIED -- throwaway tagged deploy ships without offline coverage because a deploy is outward-facing and is the owner's check; carried by the operator steps below (to be filed by the checker as an operator HUMAN_GATE, not an offline finding)` |
| F0-C6 | root allowance is the only budget change | lint-root.mjs on a scratch root with the 17 tracked-root names | config budget 17 -> 16 | budget 17: `lint-root: OK (17 loose root file(s), 0 gitignored excluded)`; budget 16: `lint-root: FAIL — 1 violation(s) ... root has 17 loose files (budget 16)` |
| F0-I2 | no secret wiring in the file | same, secret rule | add `availableSecrets:` | after `✖` with `file looks like it carries a secret value or secret wiring` |
Also in the committed test itself (so it re-proves on every run): 10 in-memory mutations (single build, web target lost, new `latest` on web, env flag, missing default, second deploy, secret wiring, single-container deploy, non-container flag after `--container`, unfamiliar substitution) and a stub-`gcloud` run of the real deploy script (default argv has no `--tag` / `--no-traffic`; `_REVISION_TAG=f0-probe _NO_TRAFFIC=true` adds both before `--container=web`).

## Live browser evidence
Not UI-touching — no surface changed. Changed paths: cloudbuild.yaml, scripts/operations/cloudbuild.test.mjs, structure.config.json, qa/contracts/cloud-build-deploy.md, qa/manifests/f0-cloudbuild.md.

## Operator steps (not run)
Nothing below was run; forbidden for this unit (F0-I1). Needs Umesh's yes before the first mutating command. Region `asia-south1`, project `vidysea-prod`, service `vidysea-knowledgebase`, trigger `8db33765-f3e2-4c1f-bf15-03ef5c1f511f`. Run from a checkout at the commit under test (on `wave/f0-cloudbuild` merged or pushed, the commit must be reachable by the Developer Connect repo link).

0. Heads-up on traffic mode. `--no-traffic` pins traffic (help line above). Record the mode first:
   `gcloud run services describe vidysea-knowledgebase --region asia-south1 --project vidysea-prod --format "value(spec.traffic)"`
   If it shows `latestRevision: true`, the throwaway leaves the service pinned to the previous revision, and a later master push would not take traffic. Cleanup step 6 restores it.
1. Before-snapshot with env values hashed (never printed). Save as `snap.mjs`:
   ```
   import {createHash} from "node:crypto";
   const d=JSON.parse(await new Promise(r=>{let s="";process.stdin.on("data",c=>s+=c).on("end",()=>r(s))}));
   const h=v=>createHash("sha256").update(String(v)).digest("hex").slice(0,12);
   const cs=(d.spec.template.spec.containers||[]).map(c=>({...c,image:"<IMAGE>",env:(c.env||[]).map(e=>e.value===undefined?e:{...e,value:"sha:"+h(e.value)})}));
   console.log(JSON.stringify({labels:d.metadata.labels,ingress:d.metadata.annotations?.["run.googleapis.com/ingress"],tplAnnotations:d.spec.template.metadata?.annotations,serviceAccount:d.spec.template.spec.serviceAccountName,timeout:d.spec.template.spec.timeoutSeconds,concurrency:d.spec.template.spec.containerConcurrency,volumes:d.spec.template.spec.volumes,containers:cs,traffic:d.spec.traffic},null,1));
   ```
   `gcloud run services describe vidysea-knowledgebase --region asia-south1 --project vidysea-prod --format json | node snap.mjs > before.json` and, for the images only: `gcloud run services describe vidysea-knowledgebase --region asia-south1 --project vidysea-prod --format "value(spec.template.spec.containers[].name,spec.template.spec.containers[].image)" > before-images.txt` (the live-traffic revision name: `--format "value(status.traffic[].revisionName,status.traffic[].percent,status.traffic[].tag)" > before-traffic.txt`).
2. Create a THROWAWAY trigger (do not edit the real one): `gcloud builds triggers describe 8db33765-f3e2-4c1f-bf15-03ef5c1f511f --region asia-south1 --project vidysea-prod --format yaml > t.yaml`; edit `t.yaml` into a manual trigger named `f0-throwaway-<date>` (remove `id`, `createTime`, `resourceName` and the `developerConnectEventConfig.push` event; point it at `cloudbuild.yaml` in the repo; add substitutions `_REVISION_TAG: f0-probe` and `_NO_TRAFFIC: "true"`), then `gcloud builds triggers create manual --trigger-config=t.yaml --region asia-south1 --project vidysea-prod` (or `triggers import --source=t.yaml`). UNVERIFIED: the exact field names for a Developer Connect manual trigger; check against the `triggers create manual --help` and `--trigger-config` schema before use. Why a trigger and not `gcloud builds submit`: `submit --substitutions` only accepts keys beginning with an underscore, so COMMIT_SHA and REPO_NAME (supplied by triggers) would be empty and the images would be tagged with nothing.
3. Run it: `gcloud builds triggers run f0-throwaway-<date> --sha=<commit> --region asia-south1 --project vidysea-prod` (or `--branch=`); read the build id from the output.
4. After-snapshot, same commands as step 1 into `after.json`, `after-images.txt`, `after-traffic.txt`.
5. Evidence (F0-C2 + F0-C5; header per `go-live-acceptance.md` GI1: date, commit sha, build id, revision names, operator):
   - `diff before.json after.json` -> expected: empty, apart from `labels` (the managed-by/commit-sha/gcb-build-id labels, which the inline config also changes on every deploy) and the `traffic` list gaining one `tag: f0-probe` entry (plus, if step 0 showed `latestRevision: true`, that entry pinned to the previous revision, as the `--no-traffic` help says).
   - `after-images.txt` -> expected: both containers (`web;api`) at `...-web:<commit>` and `...vidysea-knowledgebase:<commit>` digests, different from `before-images.txt`; revision list: `gcloud run revisions list --service vidysea-knowledgebase --region asia-south1 --project vidysea-prod` shows ONE new revision.
   - `diff before-traffic.txt after-traffic.txt` -> expected: the live traffic revision is unchanged (still 100 percent to the previous revision); the new revision has tag `f0-probe` and 0 percent.
6. Cleanup (each needs Umesh's yes): `gcloud run services update-traffic vidysea-knowledgebase --remove-tags=f0-probe --region asia-south1 --project vidysea-prod`; if step 0 showed `latestRevision: true`, `gcloud run services update-traffic vidysea-knowledgebase --to-latest --region asia-south1 --project vidysea-prod` (help: `$ gcloud run services update-traffic myservice --to-latest`) and re-check `value(spec.traffic)`; `gcloud builds triggers delete f0-throwaway-<date> --region asia-south1 --project vidysea-prod`. The throwaway also moves the shared api `:latest` tag (cache source only, as every master push does today).
7. Only then, as a separate approved step (F0-I1): point the real trigger at `cloudbuild.yaml` (`gcloud builds triggers update ...` per its help; not drafted here) before any master push.

## Status: ready-for-check

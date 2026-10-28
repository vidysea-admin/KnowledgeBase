# Container workflow candidate packet

Date: 2026-10-14
Base observed: ed542fd01c870e5d5b64e1d72b413062d595f675
Status: in_progress; remote CI and independent verdict pending
Maker: /root/docker_governance_review

## Review boundaries

Production configuration is unchanged. The CI preload is a readonly-mounted explicit fixture transport blocker; it does not mint request identity, roles, approval, tenant facts or source acceptance. Four public disposable keys are stored hashed in ephemeral Mongo; production verification supplies req.auth and private HostingJournal permissions. Exact trusted bootstrap binds only those verified fixture key ids. No client tenant claim is accepted as authority.

The isolated internal replica-set endpoint is mongodb://docker-smoke-mongo:27017/?replicaSet=rs0, with no credentials or host publication. DB names are restricted lkb_work_container_<numeric_run_suffix>, t054_test_<suffix>, lkb_work_automation_<suffix>. CI helpers refuse other hostnames/credentials/database prefixes. Build-stage migration application is explicit to scratch only; default API startup never migrates or captures.

## Proposed executed evidence

run.sh will emit final-image runtime-assets.json (actual import of all authoritative externals), native-tools.json (real version plus synthetic local playable media), worker-config.json (actual compiled entry pure config/no requests), source-jobs.tap (ten real filesystem deterministic receipt fixtures), scratch-migration.json (real index receipt), seed.json (synthetic actors), mounted-api.json (actual production routes and raw tenant Mongo readback), provider-boundary.json (zero transports for unauthorized Ask), reloaded-api.json (actual process restart), transcript-mongo.tap (existing T054 real transaction/index/downstream fixture proof), automation-mongo.json (existing T061 real scoped persistence/reconstruction), SPA bytes and bounded cleanup logs. All are UNRUN in this maker session.

Default/final api remains last and USER node, Node24, pnpm10.33.0 frozen, port3300 health and explicit bundle/schema/config assets. Web retains VITE build arg/nginx80 SPA. Optional worker-tools CMD is node apps/api/dist/source-worker.js, and native tools are present in both images. API direct SDK intake is gated; real work requires queued immutable jobs and this separately configured process. No live capture/provider runs at API startup. The separate worker entry/config factory are authored and bundled output configured, with execution/restart/live provider proof still pending.

## Exact provisioning

Official immutable yt-dlp release 2026.08.19 assets: Linux amd64 yt-dlp_linux SHA256 58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a; Linux arm64 yt-dlp_linux_aarch64 b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc. Release https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19; rendered official digests https://github.com/yt-dlp/yt-dlp/releases/expanded_assets/2026.08.19. Fixed URL/hash verified during image build; no binary downloaded locally. ffmpeg/ca-certificates are distro packages under Node24-slim; they are not reproducibly version-pinned. Native CI records actual ffmpeg/ffprobe versions.

## Honest remaining gates

Configured retention writer is not currently installed by the production factory: smoke expects truthful unavailable state, sets configuredRetentionWriterProven:false, and cannot close retention acceptance. All OnAir/YouTube/Meet/Teams/Zoom live acquisition, authorization/admission/media/STT/persistence/index/cited Ask gates remain pending. Fixture provider outputs and locally synthesized audio are expressly not live receipts. Full T051 operator/platform/capture supervisor acceptance remains pending. Older packaging PASS has different bytes and is not transferable.

## Maker validation

Only git diff --check and raw hashes were executed. No local Docker/providers/database/native tool commands/tests. No Git publication by maker. Shared build.mjs owner wrote authoritative runtime-externals.json emission; no edits to shared composition/package/lock/schema/generated/migrations by this maker.

## Raw SHA256 candidate pins

| Path | SHA256 |
| --- | --- |
| Dockerfile | a393a18530b3529a889d1de8f4088946f83b3f79ad67ce2920ac786e38a3c4e1 |
| .github/workflows/docker.yml | 0f3d4c57f6b27c43cd096ddaffe8896995985ebafca455f3c6d2a8e3c264c96f |
| scripts/qa/container-workflows/migrate-scratch.mjs | 3228b42ff7606f9557840844d3d1eba3e970836675dd30555b6ccf6c889b5c4e |
| scripts/qa/container-workflows/mongo-proofs.mjs | cbdd0b8d8f0b4f4549e359f2f320fa885583022174eec5c764eb8f19885fdef7 |
| scripts/qa/container-workflows/mounted-smoke.mjs | 4464098c0c56c52d498ce95d7b42d4eea25413b2187e646a350b61ad0bd7ba69 |
| scripts/qa/container-workflows/native-tools.mjs | 3fc6fae84c243e22ac9bc007728d692bfbbeac1c56be025c615b9eb6516da254 |
| scripts/qa/container-workflows/provider-guard.mjs | 8453028707bcbf2bb016cb8ab40ac6768b9b615d17764320795298e05221fb83 |
| scripts/qa/container-workflows/reload-smoke.mjs | d32b06d1944e2d3cf677ea206be2cf28042d2f5b57ae77cee6638d566a75f781 |
| scripts/qa/container-workflows/run.sh | b263c4e2ecfbf7e010b3d73562f6ceaac2e2d4b05dd854073deecc7ce7158eb0 |
| scripts/qa/container-workflows/runtime-assets.mjs | 4d907aac2956e42bed65cf4263468a4de2e0b290732ee2635d9a5505d918e1c6 |
| scripts/qa/container-workflows/scratch.mjs | cd0c2727abbdb05aa20d4bfa246cdf59cfa7cfe057bf88848268128d49406824 |
| scripts/qa/container-workflows/seed.mjs | 4fe7b2fd4e02edf9f171b1a8fe29a9d73c08bfe8bf1229bc094734c3513d5a9f |

## Reused central build checkpoint

Central API types attempt3 exit0/14239ms and API build attempt1 exit0/1845ms were read/hash verified (receipts qa/goal-2026-10-14); actual outputs server.js1094357 bytes/source-worker.js412045 bytes plus7 authoritative npm externals observed. Worker actual guard retains real import.meta.url. Two newer own source paths (jobs/input.ts duplicate-v guard and jobs.test.ts concurrent/duplicate cases) differ from checkpoint pins; shared runtime owns next required final integration checkpoint. No current whole-candidate build/image/live PASS is inferred and no maker test/compiler run occurred.

## New security corpus consumer

Container run.sh now readonly-mounts only qa/issues.T045WORKER.jsonl into the build-stage fixture runner to execute exact privacy.test.ts ledger corpus alongside jobs.test.ts. Final-image QA/raw exclusion stays unchanged. Windows ACL native acceptance remains separate from deterministic snapshot model/Linux CI, and OnAir protected-source live proof remains pending. No tests were executed by maker.

### Bundled ACL asset and report-format update

Shared bundler emits static PowerShell assets into dist/runtime-assets, with source/worker URLs rewritten relative to actual bundles. Docker copies dist recursively; final source/QA/raw exclusions stay intact. runtime-assets.mjs checks API ACL script SHA256 47047e4d914122a3ada2313c457d13ae60f283333122b162e9e092f9be4894dd. New bundler source is UNBUILT and actual Windows native private-directory proof remains pending. Both fixture TAP commands explicitly select reporter=tap so pass/fail count assertions consume their actual format.

### Current diagnostics and cleanup bounds

Central api-types-current-freeze.json records exit 2 after 18.553 seconds. No diagnostic names this maker's source-intake/source-jobs/acquisition paths; the overall build remains failing. Earlier successful build receipts do not certify the current candidate. All owned container removal/logging/network/volume cleanup caps total 145 seconds, within the outer 180-second TERM-to-KILL grace. Removal is restricted to this run's explicitly named containers and matching owned volume label, including anonymous Mongo volumes. Remote CI remains unrun.

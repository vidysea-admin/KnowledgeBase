# Manifest - root-docker-devops

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 1
Date: 2026-10-14
Goal task: T-051 (packaging foundation only; parent operational release remains incomplete)
Priority: Explicit user-requested root Docker/DevOps packaging, ahead of unrelated backlog.
Maker: Root packaging team; independent checker owns the contract and verdict.
Authorization: D-169 (append through scripts/append_decision.ps1 only).
Contract: qa/contracts/root-docker-devops.md, C1 build interface/default, C2 immediate consumers/safety, C3 actual executed container/clean-checkout acceptance, C4 independent provenance/publication (checker-owned).
Base: 305c856e799a0f99d74a60d2a86822e317d3edfa

## Authorized behavior and changed paths

- Dockerfile: eight named stages; final/default api target uses Node 24, production external dependencies, bundled server.js and schema/config runtime assets. Explicit web target preserves nginx SPA behavior; build target preserves migration CLI availability.
- docker-compose.yml: consume the root image and preserve the existing Mongo/migration/API/web service boundary.
- docs/docker-deployment.md: reproducible operator commands and packaging limits.
- .github/workflows/docker.yml: complete remote Docker-workflow validation. General platform CI is reported separately; it is not this scoped contract's acceptance gate.
- structure.config.json: root.maxLooseFiles 15 -> 16, solely to accommodate the root Dockerfile.
- scripts/lint.test.mjs: existing root-budget failure fixture derives its expected count from root.maxLooseFiles + 1 instead of assuming the former 15-file budget; no enforcement implementation change.
- docs/DECISIONS.md: one append-only D-169 authorization entry.
- qa/manifests/root-docker-devops.md: this maker packet.

Maker owns no qa/contracts changes or checker verdict. No production promotion, real Mongo data write, credential printing, enforcement changes, browser work, full local suite, commit or push is performed by this agent. Source packaging does not establish capture, provider, supervisor, Ubuntu-host, or whole T-051 acceptance.

## Boundaries and consumers

Root structure budget is consumed by scripts/lint-root.mjs check() through scripts/lib/walk.mjs loadConfig(); allowance changes from 15 to 16 with all other budgets unchanged. Existing service runtime commands and migration dependencies are consumed by docker-compose.yml; independent checker must review final security/environment behavior. Source packaging touches credential transport and persisted-volume configuration, so environment and exclusion boundaries require review. No secret values belong in this packet.

Root-budget immediate regression consumer: scripts/lint.test.mjs uses configured r.maxLooseFiles to build a boundary-pass fixture at the exact allowance and a violation fixture with allowance + 1. The old expected-error regex hardcoded 16 and failed after the authorized allowance became 16, because the fixture now correctly creates 17. The assertion now interpolates r.maxLooseFiles + 1 and preserves its exact architecture/notes/readme over-budget checks. qa/contracts/root-docker-devops.md C3 adds the checker-owned consumer requirement; Docker CI's clean-root step executes only the existing lint-root test pair. D-169 covers root-budget verification in this authorized packaging scope; no lint implementation, thresholds beyond the authorized allowance, enforcement or extra decision changes.

Dockerfile build calls packages/apps workspace manifests and @lkb/api build; API bundle consumer is node /app/apps/api/dist/server.js. Production bundle runtime consumers include schema/index.json and config/ai-routing.yaml. Compose service api consumes target api, web consumes target web, and opt-in migrate consumes build with three existing read-only mounts. Migration remains behind its profile and is not an API dependency. Web nginx consumer is apps/web/nginx.conf; build-time VITE_API_BASE_URL stays browser-reachable rather than Compose-private, with CORS_ORIGINS documented separately.

Pre-verdict documentation correction: docs/docker-deployment.md now requires MONGODB_URL, MONGODB_DB and GEMINI_API_KEY before every Compose command, including build/up with the migration profile inactive. Compose still interpolates that inactive service's required MONGODB_DB. The API's explicit lkb database remains unchanged. Documentation-only correction changes no Docker, Compose, workflow or runtime source bytes.

Remote workflow uses an ephemeral Docker network/Mongo and dummy credentials, no persistent volume or production URI, no schema migration or provider request. Smoke health/auth consumers are GET /health (200) and unauthenticated POST /ask (401); frontend consumers are / and /settings (same SPA). Missing MONGODB_DB must fail before connecting; non-root user and required/excluded runtime paths are asserted. Build, loop and job waits are bounded; EXIT/INT/TERM cleanup removes containers/network and preserves artifacts. Packaging does not supply Python/capture workers, Claude or gws binaries/auth, or Ollama service.

## Baseline and unrelated work

Baseline git status --short at HEAD 305c856e799a0f99d74a60d2a86822e317d3edfa:
```text
 M data/eval/results/calibration-ollama-deepseek-v4.1-flash-2026-10-13-smoke.json
 M data/eval/results/calibration-ollama-glm-5.3-flash-2026-10-13-smoke.json
?? data/eval/results/calibration-ollama-deepseek-v4.1-flash-2026-10-13.json
?? data/eval/results/calibration-ollama-glm-5.3-flash-2026-10-13.json
?? data/eval/results/recall-ollama-deepseek-v4.1-flash-2026-10-14.json
?? data/eval/results/recall-ollama-glm-5.3-flash-2026-10-13.json
?? data/toc-migrated/2026-10-13-zoom-webinar-p1/
?? data/toc-migrated/2026-10-13-zoom-webinar-p2/
```
Git warned about two unreadable pytest-cache-files directories. Unrelated eval/media state is preserved and excluded from this unit.

## Evidence and remaining gates

- Read repo-local skills/maker/SKILL.md and skills/checker/SKILL.md, AGENTS.md, ARCHITECTURE.md, current decision tail and T-051 tracker row. Existing pending units are separate; no unrelated auto-continue or acceptance claim is made.
- Canonical pending read: node --input-type=module -e importing sweep() from scripts/qa/dispatch-state.mjs: exit 0, 15 existing ready-for-check units; codexwave1 cycle 1 lacks same-slug current verdict, 14 have a matching-cycle verdict. This packaging slug did not exist.
- Initial node scripts/lint-root.mjs: exit 1; concurrent Dockerfile already present; 17 counted root files against budget 15, including local .env. Authorized budget 16 alone cannot clear this. Packaging root owner notified to diagnose the existing ignored-file boundary; no extra allowance inferred.
- Final budget node scripts/lint-root.mjs: exit 1; 17 counted against 16, including local .env. git check-ignore .env: exit 0, output .env. The local Node spawnSync git restriction prevents its ignore probe from reading Git exclusions; clean Ubuntu CI checkout must prove the budget. Neither .env nor the lint implementation was changed.
- A direct node --input-type=module check that called execFileSync(git show ...) hit spawnSync git EPERM; this is incomplete evidence. Corrected PowerShell comparison using native git show 305c856e799a0f99d74a60d2a86822e317d3edfa:structure.config.json, ConvertFrom-Json and deep JSON equality after changing only the expected old root.maxLooseFiles to 16: exit 0; PASS: only root.maxLooseFiles changed, 15 -> 16; all other config unchanged.
- powershell -NoProfile -ExecutionPolicy Bypass -File scripts/append_decision.ps1 -EntryFile <temporary root-docker-devops-D169-entry.md> -RepoRoot C:\Users\product\Desktop\KnowledgeBase: exit 0, APPENDED D-169. SHA256 of the old-byte prefix matched all 350590 prior bytes; 1702 bytes appended. No prior decision bytes changed.
- git diff --check -- structure.config.json docs/DECISIONS.md: exit 0, no whitespace violations; Git emitted its existing LF-to-CRLF working-copy warning for the decision file.
- Packaging owner's attributed PowerShell here-string piped to node: exit 0, combined static/diff-check tool call 2.36 seconds (individual audit duration unmeasured). Exact executed code is recorded below. Output: PASS: 8 stages; API default; 3 Compose targets resolve; migrations opt-in with 3 readonly mounts; 19 local COPY sources present; all workspace manifests included; nonroot API, 2 healthchecks, frozen production install. `git diff --check -- docker-compose.yml` also exit 0. This static audit is not a build or runtime claim.
- CI owner's attributed exact YAML check (exit 0, output `workflow YAML parse: PASS; steps=6`; individual duration unmeasured, combined tool batch 1.1 seconds):
```sh
node -e 'const fs=require("node:fs"); const yaml=require("./node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml"); const w=yaml.load(fs.readFileSync(".github/workflows/docker.yml","utf8")); for(const event of ["push","pull_request","workflow_dispatch"]) if(!Object.hasOwn(w.on,event)) throw Error("missing "+event); if(w.jobs.images["timeout-minutes"]!==35) throw Error("missing timeout"); fs.writeFileSync(require("node:path").join(require("node:os").tmpdir(),"lkb-docker-ci-syntax.sh"),w.jobs.images.steps.find(s=>s.name==="Build and smoke-test isolated images").run); console.log("workflow YAML parse: PASS; steps="+w.jobs.images.steps.length);'
```
- CI owner's attributed final `C:/Program Files/Git/bin/bash.exe --noprofile --norc -n C:/Users/product/AppData/Local/Temp/lkb-docker-ci-syntax.sh`: exit 0, 1.1074606 seconds. Bash required escalation after a sandbox Win32 shared-memory failure. The exact YAML command above was rerun on the final candidate with exit 0 and six steps, regenerating the checked script after the independent checker corrected the unauthorized JSON assertion to require error=unauthorized while allowing its real message field. No local Docker exists; no image execution is represented by these static checks.
- CI source includes `python3 contracts/verify_contracts.py`, clean-checkout `node scripts/lint-root.mjs` plus the focused root-consumer tests, bounded default/API/web/build image builds, Compose dummy-value validation and isolated runtime probes. Parent reports initial Docker CI run 38607346649 for published commit 766be00fddae086414336096d6397f50af69fe3e SUCCESS: root budgets, frozen validator, all image builds/smoke and evidence upload green. Initial run: https://github.com/vidysea-admin/KnowledgeBase/actions/runs/38607346649. This is attributed prior-candidate execution evidence; this revised fixture/workflow/contract packet requires a new candidate Docker-workflow run.
- Documentation owner: `git diff --check -- docs/docker-deployment.md`, exit 0; combined diff/hash call 1.2765 seconds. Corrected docs raw SHA256 independently reread and matches the pin below.
- Root-consumer maker evidence supplied by parent: `node --test --test-timeout=30000 --test-name-pattern='^lint-root:' scripts/lint.test.mjs`, exit 0, 2/2 pass, test duration 2737.6212 ms, command wall 3.4097 seconds. scripts/lint.test.mjs SHA256 c1603b60d7b96961d9c8ad542d12ffd0f963409e04c881cce66df107a03a78a3; actual configured-boundary consumer checked, no generic test suite rerun.
- CI owner's final YAML parse: exit 0, output `workflow YAML parse: PASS; steps=6`. All step run scripts concatenated into C:/Users/product/AppData/Local/Temp/lkb-docker-ci-syntax.sh and `C:/Program Files/Git/bin/bash.exe --noprofile --norc -n C:/Users/product/AppData/Local/Temp/lkb-docker-ci-syntax.sh`: exit 0, wall 0.4650134 seconds. `git diff --check -- scripts/lint.test.mjs .github/workflows/docker.yml`: exit 0. No second local container run; focused test evidence above covers unchanged pinned test bytes.
- Cycle 0 independently FAILed C3 on candidate 9b02375356ef88c966a58c83cde01ffa7bb8c614. Actual Docker run https://github.com/vidysea-admin/KnowledgeBase/actions/runs/38609031571 passed root lint at 16 files, then `node --test --test-timeout=30000 --test-name-pattern='^lint-root:' scripts/lint.test.mjs` exited 1 before either focused fixture ran: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'json-schema-to-typescript' imported from .../scripts/gen-types.mjs`. Host dependencies were absent; frozen-validator/image-smoke steps were skipped. Independent checker persisted qa/verdicts/root-docker-devops.md with VERDICT: FAIL, Cycle checked: 0; raw SHA256 9616411bec830d83890a41c836989df9f1eb0a74a673fd79b8f35d54d9b18763. This history is retained by checker and is not modified by maker.
- Cycle 1 fixes only the workflow prerequisite: pnpm/action-setup@v4 with version 10.33.0, then `timeout 300 pnpm install --frozen-lockfile --ignore-scripts` before unchanged root lint and focused tests. scripts/lint.test.mjs imports gen-types.mjs, whose JavaScript schema compiler needs json-schema-to-typescript; frozen host dev dependencies supply it without lifecycle/native hooks. No local install or new local test execution is claimed. No product/test assertion, lint enforcement, package manifest or lockfile changed in this fix.
- Cycle 1 CI owner's attributed static evidence: same js-yaml parse command on final workflow, exit 0, `workflow YAML parse: PASS; steps=8`, all run scripts captured; same Git Bash `--noprofile --norc -n C:/Users/product/AppData/Local/Temp/lkb-docker-ci-syntax.sh`, exit 0, wall 0.505822 seconds; `git diff --check -- .github/workflows/docker.yml`, exit 0. Remote execution was pending at submission and is established in the matching-cycle close-out below.
- Complete cycle-1 Docker workflow and independent same-cycle checker PASS are established below. General platform CI is reported separately and is not a gate for this unit. D-169's full-CI phrase means the full Docker workflow under this accepted plan and C3/C4; no whole T-051 acceptance is inferred.

Close-out requirement met: independent same-slug Cycle checked: 1 PASS covers unchanged candidate bytes and actual complete Docker-workflow evidence.

The submitted ready-for-check packet requested independent review and remote execution; it did not itself certify success. The checked-PASS state now records the independent cycle-1 verdict and actual reviewed-candidate Docker-workflow success below.

Earlier pre-verdict resubmissions retained cycle 0 with checker confirmation. After the formal current-candidate C3 FAIL was persisted, this repaired submission increments to Fix cycle 1. Earlier 766be00 and documentation-only 0bdf3572d816734a784a1e3ea0d693e2a7e36ef8 packets remain prior candidates. The latter's Docker run https://github.com/vidysea-admin/KnowledgeBase/actions/runs/38607933307 is prior-candidate success, not final acceptance of the changed contract/workflow/test. The 9b023753 cycle-0 FAIL remains an independent historical verdict, not a PASS or withdrawn finding. Final cycle-1 verdict must review the new publication SHA and its actual complete Docker-workflow results.

## Candidate provenance

Base tracked Git blobs at commit 305c856e799a0f99d74a60d2a86822e317d3edfa: docker-compose.yml `fb3e6500c34f701db05c99d1fc53b686af5142e7`; structure.config.json `37f7c86c9728ae44098b98631c7861abacdb4361`; docs/DECISIONS.md `468a436b46c46347f08df1b0865c163d3020241d`. Dockerfile, docs/docker-deployment.md, .github/workflows/docker.yml, this manifest and checker contract were untracked new files with no baseline blob. The ninth scoped source file scripts/lint.test.mjs had existing tracked source; its submitted base is the file at 0bdf3572d816734a784a1e3ea0d693e2a7e36ef8. Cycle-1 repair base is 9b02375356ef88c966a58c83cde01ffa7bb8c614. This resubmission publishes only .github/workflows/docker.yml, this manifest and the independently written cycle-0 FAIL verdict; exact remote CI source commit must match the new cycle-1 candidate. Other scoped source pins are unchanged.

Raw-byte SHA256 pins (CRLF-to-LF normalization may change checkout byte hashes; checker must distinguish that from changed source):

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

Manifest self-hash is supplied separately at dispatch to avoid recursive hashing. Existing local gitIgnored anomaly stays a disclosed environment fact; remote root lint is the acceptance gate.

## Cycle 1 matching-verdict close-out

Independent verdict: qa/verdicts/root-docker-devops.md, VERDICT: PASS, Cycle checked: 1, Commit checked: c7b4c60157e9b03642ea964df15192e7eeb0ccf7. The checker appended cycle 1 while preserving the cycle-0 FAIL. Final verdict raw SHA256: 6232a0ede178afe0eaf3a6af6ef05c740e5843c9055fdb19e208d0cd7357bff8. Before flipping status, maker independently reread the matching verdict, confirmed HEAD c7b4c601 and all eight source pins unchanged; that pin check exited 0. Reviewed manifest self-hash was 631b606addc3ef1190edfd27d870b73db7327f8b6c64a4c93c03100dc34a8ef8. Only this close-out changes the manifest after the check; product, workflow, contract and remaining source pins remain unchanged.

Actual complete Docker workflow: [run 38609853426](https://github.com/vidysea-admin/KnowledgeBase/actions/runs/38609853426), SUCCESS for the exact checked candidate. All eight workflow steps succeeded; job 17:49:02Z-17:50:10Z (68 seconds), image build/smoke step 17:49:12Z-17:50:07Z (55 seconds). Independent checker read downloaded actual job/smoke evidence, rather than inferring execution from the workflow source.

Exact executed focused host commands and recorded outputs:
```sh
timeout 300 pnpm install --frozen-lockfile --ignore-scripts
node scripts/lint-root.mjs
node --test --test-timeout=30000 --test-name-pattern='^lint-root:' scripts/lint.test.mjs
python3 contracts/verify_contracts.py
```
```text
Done in 3.6s using pnpm v10.33.0
lint-root: OK (16 loose root file(s), 0 gitignored excluded)
lint-root: passes on a clean fixture (44.788215ms)
lint-root: fails on a violating fixture (41.453968ms)
tests 2; pass 2; fail 0; cancelled 0; skipped 0
duration_ms 239.158117
verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity
```

Principal image build commands ran with the workflow's ephemeral image tags:
```sh
timeout 900 docker build --progress plain -t "$api_image" .
timeout 900 docker build --progress plain --target web --build-arg VITE_API_BASE_URL=http://localhost:3300 -t "$web_image" .
timeout 120 docker build --progress plain --target build -t "$build_image" .
```
The complete Compose dummy-value validation, Node runtime assertions, bounded waits and cleanup commands are the reviewed .github/workflows/docker.yml run block (hash pinned above). Actual smoke outputs:
```text
Opt-in migration build target dependencies: PASS
API user, runtime assets and exclusions: PASS
Missing database name startup refusal: PASS
API health and unauthenticated refusal: PASS
Web root and settings SPA fallback: PASS
Docker image smoke: PASS
```
Default/API container health was HTTP 200/db=ok; unauthenticated POST /ask was HTTP 401/error=unauthorized; missing MONGODB_DB startup exited 1 with its guard message. API USER=node, bundled server/schema/routing assets and prohibited secret/data/raw/source/dev-dependency exclusions were asserted. Migration build dependencies resolved without a migration. Web / and /settings produced identical SPA content; independent downloaded-file comparison SHA256 f4cb424f481d4b311aab7d0355dfa9099be9e689a2646b0f40b8d4306c640cdc. Runtime used only ephemeral Mongo/network, dummy key and empty watcher tenants; no production connection, provider request, migrations, seed, persistent volume or published Mongo port.

Evidence: [artifact 11917248485](https://github.com/vidysea-admin/KnowledgeBase/actions/runs/38609853426/artifacts/11917248485); downloaded zip SHA256 fab9267979c0279d45de8fbd563ce403510bbebed746360a64bc4d4127b1837b. Local attributed evidence at C:/Users/product/AppData/Local/Temp/root-docker-38609853426/job.log and evidence/smoke.log, missing-db.log, index.html, settings.html and service logs. Independent checker recorded final artifact/hash review at 17:51:50Z and persisted PASS at 17:53:04Z.

Scope is packaging and its immediate consumers under C1-C4. Frozen validation remains vacuous because no contracts are frozen. General platform/tracker CI has a separately identified baseline failure; it is reported independently and is not claimed green. T-051 full operational release, production deployment/host activation, real capture/provider/database acceptance and the remaining roadmap tasks remain unclaimed. No task tracker was closed by this manifest.

## Attributed packaging audit command

Executed by the packaging owner as a PowerShell here-string piped to node, exit 0:
```powershell
@'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const yaml = require('./node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml');
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
const stages = [...dockerfile.matchAll(/^FROM .+ AS ([\w-]+)$/gm)].map(m => m[1]);
assert.equal(stages.at(-1), 'api');
const compose = yaml.load(fs.readFileSync('docker-compose.yml', 'utf8'));
for (const [service, target] of [['api','api'],['web','web'],['migrate','build']]) {
  assert.equal(compose.services[service].build.dockerfile, 'Dockerfile');
  assert.equal(compose.services[service].build.target, target);
  assert.ok(stages.includes(target));
}
assert.deepEqual(compose.services.migrate.profiles, ['migrate']);
assert.equal(compose.services.api.depends_on, undefined);
for (const mount of ['./migrations:/app/migrations:ro','./config/migrate-mongo-config.cjs:/app/config/migrate-mongo-config.cjs:ro','./schema:/app/schema:ro']) assert.ok(compose.services.migrate.volumes.includes(mount));
let localCopies=0;
for (const match of dockerfile.matchAll(/^COPY (.+)$/gm)) {
  if (match[1].startsWith('--from=')) continue;
  for (const source of match[1].trim().split(/\s+/).slice(0,-1)) {
    assert.ok(fs.existsSync(source), 'missing COPY source '+source); localCopies++;
  }
}
for (const directory of ['packages','apps','workers']) {
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const manifest = directory+'/'+entry.name+'/package.json';
    if (fs.existsSync(manifest)) assert.ok(dockerfile.includes('COPY '+manifest+' '+manifest), 'missing workspace manifest '+manifest);
  }
}
assert.ok(dockerfile.includes('USER node'));
assert.ok(dockerfile.includes('CMD ["node", "apps/api/dist/server.js"]'));
assert.equal([...dockerfile.matchAll(/^HEALTHCHECK /gm)].length, 2);
assert.ok(dockerfile.includes('--frozen-lockfile --prod --filter "@lkb/api..."'));
console.log('PASS: 8 stages; API default; 3 Compose targets resolve; migrations opt-in with 3 readonly mounts; '+localCopies+' local COPY sources present; all workspace manifests included; nonroot API, 2 healthchecks, frozen production install');
'@ | node
```

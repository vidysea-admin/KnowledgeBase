# Manifest - root-docker-devops

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
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
- .github/workflows/docker.yml: remote container validation; existing full CI remains acceptance evidence.
- structure.config.json: root.maxLooseFiles 15 -> 16, solely to accommodate the root Dockerfile.
- docs/DECISIONS.md: one append-only D-169 authorization entry.
- qa/manifests/root-docker-devops.md: this maker packet.

Maker owns no qa/contracts changes or checker verdict. No production promotion, real Mongo data write, credential printing, enforcement changes, browser work, full local suite, commit or push is performed by this agent. Source packaging does not establish capture, provider, supervisor, Ubuntu-host, or whole T-051 acceptance.

## Boundaries and consumers

Root structure budget is consumed by scripts/lint-root.mjs check() through scripts/lib/walk.mjs loadConfig(); allowance changes from 15 to 16 with all other budgets unchanged. Existing service runtime commands and migration dependencies are consumed by docker-compose.yml; independent checker must review final security/environment behavior. Source packaging touches credential transport and persisted-volume configuration, so environment and exclusion boundaries require review. No secret values belong in this packet.

Dockerfile build calls packages/apps workspace manifests and @lkb/api build; API bundle consumer is node /app/apps/api/dist/server.js. Production bundle runtime consumers include schema/index.json and config/ai-routing.yaml. Compose service api consumes target api, web consumes target web, and opt-in migrate consumes build with three existing read-only mounts. Migration remains behind its profile and is not an API dependency. Web nginx consumer is apps/web/nginx.conf; build-time VITE_API_BASE_URL stays browser-reachable rather than Compose-private, with CORS_ORIGINS documented separately.

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
- Packaging owner reports attributed static audit exit 0: eight stages/default api, three Compose targets, opt-in migrate with three read-only mounts, 19 COPY source checks, all workspace manifests, USER node/CMD/two healthchecks and frozen production installation. Exact partner command/artifact pending; this summary is not a build or runtime claim.
- CI owner's attributed exact YAML check (exit 0, output `workflow YAML parse: PASS; steps=6`; individual duration unmeasured, combined tool batch 1.1 seconds):
```sh
node -e 'const fs=require("node:fs"); const yaml=require("./node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml"); const w=yaml.load(fs.readFileSync(".github/workflows/docker.yml","utf8")); for(const event of ["push","pull_request","workflow_dispatch"]) if(!Object.hasOwn(w.on,event)) throw Error("missing "+event); if(w.jobs.images["timeout-minutes"]!==35) throw Error("missing timeout"); fs.writeFileSync(require("node:path").join(require("node:os").tmpdir(),"lkb-docker-ci-syntax.sh"),w.jobs.images.steps.find(s=>s.name==="Build and smoke-test isolated images").run); console.log("workflow YAML parse: PASS; steps="+w.jobs.images.steps.length);'
```
- CI owner's attributed final `C:/Program Files/Git/bin/bash.exe --noprofile --norc -n C:/Users/product/AppData/Local/Temp/lkb-docker-ci-syntax.sh`: exit 0, 1.1074606 seconds. Bash required escalation after a sandbox Win32 shared-memory failure. The exact YAML command above was rerun on the final candidate with exit 0 and six steps, regenerating the checked script after the independent checker corrected the unauthorized JSON assertion to require error=unauthorized while allowing its real message field. No local Docker exists; no image execution is represented by these static checks.
- CI source includes `python3 contracts/verify_contracts.py`, clean-checkout `node scripts/lint-root.mjs`, bounded default/API/web/build image builds, Compose dummy-value validation and isolated runtime probes. These remote commands have not run yet; required actual remote full CI and Docker CI evidence remains pending.
- Required independent checker, root image build, container downstream smoke and actual remote full-CI results: pending. No PASS inferred from static preparation or absent runtime evidence.

Do not close this manifest until an independent same-slug cycle-0 PASS covers unchanged candidate bytes and required actual CI evidence.

Source candidate and static packet are ready for independent review/publication to obtain remote execution evidence. This ready-for-check state requests the check; it does not represent executed Docker/full-CI success. Checker must HOLD if required remote evidence is unavailable.

## Candidate provenance

Base tracked Git blobs at commit 305c856e799a0f99d74a60d2a86822e317d3edfa: docker-compose.yml `fb3e6500c34f701db05c99d1fc53b686af5142e7`; structure.config.json `37f7c86c9728ae44098b98631c7861abacdb4361`; docs/DECISIONS.md `468a436b46c46347f08df1b0865c163d3020241d`. Dockerfile, docs/docker-deployment.md, .github/workflows/docker.yml, this manifest and checker contract were untracked new files with no baseline blob. Publication candidate commit is to be recorded by parent after staging only this unit's eight files; exact remote CI source commit must match that candidate.

Raw-byte SHA256 pins (CRLF-to-LF normalization may change checkout byte hashes; checker must distinguish that from changed source):

| Path | SHA256 |
| --- | --- |
| Dockerfile | c5e1ba0859c763d2b4534fc6a19a183d29994022c1e02caf0910c898a2b8019b |
| docker-compose.yml | fb262e68eb9127bdd73785a91b34e34bdf07b2cbc9c43af57a54158db1336e24 |
| docs/docker-deployment.md | cc40cb82e21648c03e04f3234d5a6114c3d1794a313b634ab24565f6491c7058 |
| .github/workflows/docker.yml | c248a020c986532470167bd8d07d667fd92466f2d254562a8794970c73d4bb71 |
| structure.config.json | e1e3ccbdd32fb6be246a022256fd8f1ae88d2ead99746f36853154a51d59ae23 |
| docs/DECISIONS.md | 9e3ab1d1f4630956b1ec2d3a7803a55a20065d435b0d3e9977539bf044964ad5 |
| qa/contracts/root-docker-devops.md | 0811c165cdeedae533687a62afc80c36811a4257224ee7c79402ce349c69e721 |

Manifest self-hash is supplied separately at dispatch to avoid recursive hashing. Existing local gitIgnored anomaly stays a disclosed environment fact; remote root lint is the acceptance gate.

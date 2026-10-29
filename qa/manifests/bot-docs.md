# Manifest — bot-docs
**Contract:** none specific (D-205 U6, docs only; D-206 for the user-accounts and whatsapp-multiuser plan pointers; survey qa/evidence/bot-linux-survey-2026-10-29.md)
**Goal task:** none
**Date:** 2026-10-29
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** no (docs and an `.env.example` comment block only: no code, no auth, tenancy or data write; no secret value written)
**Persona walk:** skip (no screen, flow or user type)
**Executor:** claude-sonnet-subagent
**Executor rationale:** docs-only unit with fixed sources (merged docker/meeting-bot/*, compose bot service, bot-smoke.sh); edit-in-place on four existing files.
**Docs-only:** yes. No falsification (mutation) run: the diff touches only Markdown and comments in `.env.example`. The coordinator decides the status (merged-no-check docs lane or a checker pass); this manifest does NOT set it.

## Criteria
- C1 `docs/GO-LIVE-UBUNTU.md` section 5 replaces the "Windows-only / UNTESTED" text with a runbook for the merged Linux bot: build, doctor mode, smoke, env names, login mode (VNC over an SSH tunnel to loopback only, one-time Google sign-in), gws OAuth, volumes, run mode (`run-pipeline --run --watch`), healthcheck, the Linux live-proof human step, and the accepted limits (no native privacy-window masking on Ubuntu, `--native-tab-clock` unsupported). No `UNTESTED` text remains in GO-LIVE-UBUNTU.md or DEVOPS-HANDOVER.md; the stale Windows-only bot lines (guide sections 2 and 8 item 5, handover section 8) are corrected.
- C2 Every command and file the runbook cites exists in the repo, and the documented syntax parses: `docker compose --profile bot config` is valid, the compose `bot` env names, the four volume names and the profile name in the docs equal those in `docker-compose.yml`, and `scripts/webinar/setup.mjs`, `scripts/webinar/run-pipeline.mjs`, `scripts/qa/container-workflows/bot-smoke.sh`, `docker/meeting-bot/{Dockerfile,entrypoint.sh,healthcheck.sh}` are the real paths.
- C3 `.env.example` lists the bot-only names the compose `bot` service forwards and `.env.example` lacked (`VNC_PASSWORD`, `LKB_CHROME_NO_SANDBOX`), names only, commented out, matching the compose `bot` environment exactly (every compose bot name is present in `.env.example`).
- C4 `docs/DEVOPS-HANDOVER.md` has a bot section (8a) with the devops order and the human steps, its section 2 no longer says the compose change is pending / `.env.t028`, its section 4 links the merged base-path work (4a, `APP_BASE_PATH`, `LKB_API_URL` for the bot) without duplicating it, and its env-name group for the bot matches compose.
- C5 `docs/WHATSAPP-GOLIVE-GAP.md` gap 1 points to `docs/features/whatsapp-multiuser/plan.md` as the plan of record and records that compose now forwards the three `WHATSAPP_*` names (`docker-compose.yml:83-85`).
- C6 The APP_BASE_PATH / vidysea.com upstream rule is present once (GO-LIVE-UBUNTU.md 4a, DEVOPS-HANDOVER.md 4a) and the new text links to it instead of repeating it.

## What changed (all edited in place; no new files except this manifest)
- docs/GO-LIVE-UBUNTU.md: header status line; section 5 rewritten as 5.1-5.9; section 2 trailing sentence; section 8 item 5; two "bot machine" mentions now say the existing Windows bot host.
- docs/DEVOPS-HANDOVER.md: section 1 table (bot and base-path rows); section 2 (compose merged, `.env.t028` retired); section 3G (bot volumes in the backup list); section 4 (`LKB_API_URL` with the 4a layout); section 5 (bot env group); section 8 (bot bullets replaced); NEW section 8a (bot checklist and do-nots).
- docs/WHATSAPP-GOLIVE-GAP.md: gap 1 row and Option B step 3.
- .env.example: one comment block with `# VNC_PASSWORD=` and `# LKB_CHROME_NO_SANDBOX=` (commented, so no blank-value hazard).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 4 files, 6 criteria, est 40 min, single builder, no checker dispatch by the builder
Tier: L (documentation and an example env file; nothing executed in production)
Base / checked state: base 69806029; docs commit 5c26591c (the manifest commit that follows touches only qa/).
Affected tests: docker/meeting-bot/image.test.mjs (static bot and compose contract, 7 of 10 run; the 3 built-image tests are Docker-gated and skipped), pnpm lint:structure, node scripts/snapshot.mjs --check.
Independent review: NOT run by the builder; the checker or coordinator owns review. Docs-only, so no senior-software-engineer code review applies.
Not run / limits: no image build, no smoke, no login, no gws OAuth and no live proof were re-run by this unit (they were proven by bot-image, bot-gws-install and bot-smoke and are cited, not repeated; disk is tight). The gws OAuth flow inside the container is documented as NOT yet exercised. No falsification runs (docs-only).
Metrics: builder_min=40
Tests[C1]: docker/meeting-bot/image.test.mjs::"entrypoint has run, doctor and login modes and cleans stale state" — the BOT_MODE names, loopback VNC publish and the doctor gate that section 5 documents are asserted by the existing static test; the prose itself is checked by Pre-check[C1]
Tests[C2]: docker/meeting-bot/image.test.mjs::"docker compose config validates; the default project excludes the bot" — compose validity and profile gating that the documented `--profile bot` commands rely on
Tests[C3]: docker/meeting-bot/image.test.mjs::"compose adds only an opt-in bot service" — the compose bot service whose env names C3 compares to `.env.example`
Tests[C4]: pnpm lint:structure — OK (10 stages, 0 failed) after this diff
Tests[C5]: node scripts/snapshot.mjs --check — docs/SNAPSHOT.md still matches a fresh regeneration
Tests[C6]: pnpm lint:structure — OK (10 stages, 0 failed); the base-path rule is grep-counted in Pre-check[C6]
Pre-check[C1]: 5c26591c grep -c UNTESTED docs/GO-LIVE-UBUNTU.md docs/DEVOPS-HANDOVER.md; grep -nE '^### 5\.[1-9]' docs/GO-LIVE-UBUNTU.md -> exit 0, ok: UNTESTED count 0 and 0; subsections 5.1 Build, 5.2 Doctor, 5.3 Smoke, 5.4 env, 5.5 login, 5.6 gws, 5.7 live proof, 5.8 run/health, 5.9 limits t=1 blobs=docs/GO-LIVE-UBUNTU.md:HEAD
Pre-check[C2]: 5c26591c MONGODB_URL=x MONGODB_DB=x OLLAMA_API_KEY=x docker compose --profile bot config; grep -ohE of backticked repo paths in the three docs, each tested with [ -e ]; compose bot env names and volumes compared to docs -> exit 0, ok: compose renders the bot service (init, shm_size 2gb, restart unless-stopped, 4 lkb-bot-* volumes, VNC_PASSWORD null); 0 missing paths; 0 compose bot names absent from the docs; 4 of 4 volumes present in both; `node scripts/webinar/setup.mjs --help` printed the doctor/install plan (its --doctor flag is what the entrypoint runs) t=1
Pre-check[C3]: 5c26591c for each name in the compose bot environment: grep -qE "^#? ?NAME=" .env.example -> exit 0, ok: before the edit exactly VNC_PASSWORD and LKB_CHROME_NO_SANDBOX were missing; after the edit 0 compose bot names are missing from .env.example t=1
Pre-check[C4]: 5c26591c grep -n "8a\|\.env\.t028\|APP_BASE_PATH" docs/DEVOPS-HANDOVER.md; pnpm lint:structure -> exit 0, ok: lint:structure OK (10 stages, 0 failed); section 8a present; `.env.t028` only appears as retired/delete; 4a unchanged and linked from section 4; bot env group lists the compose names t=1
Pre-check[C5]: 5c26591c grep -n "whatsapp-multiuser/plan.md" docs/WHATSAPP-GOLIVE-GAP.md; sed -n 83,85p docker-compose.yml; node scripts/snapshot.mjs --check -> exit 0, ok: SNAPSHOT.md matches a fresh regeneration (174 lines); gap 1 cites the plan (W3, gate G-2) and compose lines 83-85 are the three WHATSAPP_ names t=1
Pre-check[C6]: 5c26591c grep -c "location /knowledgebase/" docs/GO-LIVE-UBUNTU.md docs/DEVOPS-HANDOVER.md; pnpm lint:structure -> exit 0, ok: lint:structure OK; 1 and 1 (one per file, unchanged by this diff); the bot text references section 4a and `https://vidysea.com/knowledgebase/api` by link, not by a second nginx block t=1

## How to verify (commands + expected)
- `git diff 69806029 5c26591c --stat` shows exactly `.env.example`, `docs/DEVOPS-HANDOVER.md`, `docs/GO-LIVE-UBUNTU.md`, `docs/WHATSAPP-GOLIVE-GAP.md`.
- `grep -c UNTESTED docs/GO-LIVE-UBUNTU.md docs/DEVOPS-HANDOVER.md` prints 0 for both.
- `MONGODB_URL=x MONGODB_DB=x OLLAMA_API_KEY=x docker compose --profile bot config --quiet` prints nothing.
- `node --test docker/meeting-bot/image.test.mjs` passes 7, skips 3 (Docker-gated).
- `pnpm lint:structure` and `node scripts/snapshot.mjs --check` pass.

## Notes for the checker
- Claims the docs make that are cited, not re-run here: image build about 4 min cold, about 700 MiB content and 2.84 GB unpacked (bot-image), smoke reference run 5.0 MB webm and -3.4 dB (bot-smoke), gws pinned 0.22.5 with sha256 check (bot-gws-install).
- The one new, unproven claim to look at: section 5.6 says `docker compose --profile bot run --rm --entrypoint gws bot auth status` is the check; `gws auth status` / `gws auth login` are cited from existing repo text, and the doc states the OAuth flow inside the container has not been exercised.
- Pre-existing, left alone: guide section 0 and D-192 text about the Windows calendar worker still describe a Windows host, correctly.

# Verdict: bot-image
VERDICT: PASS
Cycle checked: 0
Commit checked: 674061e4 (code 444b80dd, snapshot 1d004a4d; base 77ba22d8), coordinator A
Policy-Version: proportional-verification/2026-10-19.17

Check plan: validate identity of the maker image, re-run each criterion myself (no network, no live provider, no .env), one falsification per criterion in a copy, adversarial pass on secrets and ports.

SCOREBOARD: 5/5 criteria met
TIER: M (build and packaging files only; no product source under packages/ or scripts/)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (no portal or capability rows)
LIVE-BROWSER: not-applicable (changed paths: docker/, docker-compose.yml, .dockerignore)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

## EXPLANATION
- Identity: image lkb-bot-u1:test (sha256:44ece43b...) holds /app files byte-identical to the checked tree: Dockerfile a84c5da5 = HEAD blob; entrypoint 056772ea, healthcheck d80e1121 and image.test.mjs c2248e82 = HEAD blobs; compose, .dockerignore and package.json equal the working-tree (CRLF) bytes. Image ENV, USER node, HEALTHCHECK and the tini ENTRYPOINT read back as designed. A fresh rebuild was attempted with `--network none`; the apt layer was not cached, so it could not run offline and was stopped (no network used). C1 therefore rests on the maker's build exit 0 plus the identity above (the image exists and contains the HEAD Dockerfile's output); I did not independently rebuild.
- C1: image present, identity valid (above); static Dockerfile test passes; mutant dropping python3-tk is killed.
- C2: ran login mode in a --network none container: `Xvfb :99 -screen 0 1920x1080x24`, xdpyinfo 1920x1080, sink `botsink` (module-null-sink), `Default Sink: botsink`, bot-healthcheck exit 0, Docker health=healthy, uid 1000, x11vnc up with the password masked in argv.
- C3: `docker run --network none -e BOT_MODE=doctor` -> exit 0; OK pnpm 10.33.0, Node >=24, ffmpeg, ffprobe, venv imports incl. PyAutoGUI, CfT present, Chrome and UC driver versions match, DISPLAY; no MISSING line; run-pipeline not started.
- C4: `docker compose config --services` -> api web; `--profile bot` -> api bot web; bot has profiles, init true, shm 2gb, restart unless-stopped, no ports, four named volumes; diff has no deleted compose lines (no existing service touched).
- C5: `id` -> uid=1000(node); `find / -name '.env*'` -> only /app/.env.example and /app/apps/web/.env.example; /app/data and /app/raw/webinars empty; no .git, credential or key files in /app (only *.test.ts names matching "token/secret/credentials"). .dockerignore carries `.env`, `**/.env`, `.env.*`, `**/.env.*` with the .example re-includes.
- Falsification (copy in scratchpad, per-mutation byte backup, restore, git hash-object check, 90 s timeout, test file run alone): C1 drop python3-tk: 5 pass 1 fail, KILLED. C2 Xvfb :99->:98: 5/1, KILLED. C3 `setup.mjs --doctor`->`--docter`: 5/1, KILLED. C4 profiles bot->botx: 4/2, KILLED. C5a USER node->root: 5/1, KILLED. C5b comment out `**/.env`: 5/1, KILLED. All six restores HASH-OK; worktree status clean; no product file edited. Baseline: node --test image.test.mjs = 6 pass, 1 skipped (built-image test is gated by LKB_DOCKER_TESTS).
- Floor: `node scripts/snapshot.mjs --check` OK (174 lines); `node scripts/lint-loc.mjs --all` 10 stages, 0 failed.
- Deviations 1-4 in the manifest are acknowledged and reasonable: RECORD_DIR /app/raw/webinars and the volume layout are consistent; gws not installed (fails closed, observed by the maker, not re-run by me: needs MONGO env); NO_SANDBOX default is a value-less overridable pass-through, and Chrome runs as non-root.
- Not covered by me: a real run mode, a real join, gws installation. Not criteria of this unit.

PROPOSED-ISSUE: {"sev":"medium","unit":"bot-image","file":"docker/meeting-bot/entrypoint.sh:44-46","title":"doctor gate fails open: tee masks setup.mjs exit status","detail":"`node scripts/webinar/setup.mjs --doctor | tee /tmp/doctor.log` under `sh` without pipefail discards setup.mjs's exit code; the only gate is `grep -q '^MISSING'`. A doctor that crashes before printing MISSING (reproduced: docker run --network none -e BOT_MODE=doctor -e NODE_OPTIONS=--require=/nonexistent.js lkb-bot-u1:test -> MODULE_NOT_FOUND stack trace, container exit 0) reports success; in run mode the pipeline then starts unverified. The header comment says 'exit with its status'. A real failing check still prints MISSING and sets exitCode 1, so the normal path is correct.","fix_direction":"capture the status without a pipe (node ... > /tmp/doctor.log; rc=$?; cat /tmp/doctor.log) and fail on rc != 0 as well as on MISSING; add a static test for it."}
PROPOSED-ISSUE: {"sev":"low","unit":"bot-image","file":"docker/meeting-bot/image.test.mjs:80-89","title":"built-image test is skipped by default and does not cover the Xvfb/sink runtime path or a doctor crash","detail":"C2 (Xvfb :99 and botsink default sink) is asserted only by string presence in entrypoint.sh; the live behaviour was observed by hand by the maker and by this checker. Ledger only.","fix_direction":"extend the gated built-image test with a login-mode container probe (xdpyinfo, pactl info) when LKB_DOCKER_TESTS=1."}
PROPOSED-ISSUE: {"sev":"low","unit":"bot-image","file":"docker/meeting-bot/entrypoint.sh:38","title":"VNC password on the x11vnc command line","detail":"-passwd \"$VNC_PASSWORD\" is briefly visible in the container's process list before x11vnc masks argv; container-local, port published only on explicit -p 127.0.0.1. Ledger only.","fix_direction":"use -passwdfile with a 0600 file under XDG_RUNTIME_DIR."}

Metrics: start=2026-10-29T02:32:52Z end=2026-10-29T02:35:49Z wall_min=3 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=6 cycle=0 resumes=0 tokens=unavailable builder_min=50 check_min=3 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=180 mutants=6 defects_unit=1 defects_6c=0

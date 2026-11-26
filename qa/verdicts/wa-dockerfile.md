# Verdict - wa-dockerfile (C3C)
Bound to D:/KnowledgeBase. Archiver worktree D:/KnowledgeBase/.worktrees/wa-c3c, branch wave/c3c-dockerfile, head aab9ad5098e61ccffe4a32e7f0f75c9e2d870fce, base be5a090f.
Date: 2026-11-26. Cycle checked: 0. Policy-Version: proportional-verification/2026-11-22.19. Checker: fresh claude-sonnet-subagent.

## Check plan
Tier M (two recipe files, no source or test code). `tick.mjs --route be5a090f..aab9ad50` printed `{"floor":null,"dual":false,"rules_fired":[]}`, so no floor raise and one checker. Signals: static recipe check (C1-C7, I3), daemon-free replay (stand-in for the docker halves of C2/C4/C7), diff-scope read (4c), falsification floor plus 3 own mutants. No UI, no persona walk, no data, no prompt. Docker: daemon not running (the maker's `docker version` shows pipe-not-found); I did not start it.

## Evidence (my own runs)
- 4c diff scope: `git diff --name-only be5a090f HEAD` is `.dockerignore` and `Dockerfile` only (53 insertions, 0 deletions, nothing removed or renamed). `git diff be5a090f HEAD -- src` is empty; `src/wa/readOnlySocket.ts` diff is 0 lines. I1 holds. I2 holds structurally (no source or test blob changed vs base; maker's typecheck exit 0 and 66-test run reused under that identity).
- I read both files in full. Dockerfile: line 16 `RUN npm ci`, 17 `RUN npm run patch:baileys` (alone on its line, no bypass), 19 `RUN npm run build`, 20 `RUN npm prune --omit=dev`; the final stage copies package.json, node_modules and dist from `build` (27-29); `USER node` (30) after every COPY and no chown or chmod after it; `CMD ["node", "dist/index.js"]` (31). Only `ENV PORT=8080`; no secret ENV/ARG; no EXPOSE, no HEALTHCHECK.
- `check-dockerfile.mjs` on the worktree: PASS C3C-C1..C7 and I3, exit 0.
- `sim-build.mjs` re-run by me in a fresh scratch dir (offline): npm ci exit 0, patch:baileys exit 0, build exit 0, prune exit 0; MARKER socket.js=1 messages-recv.js=1; `/app` holds dist, node_modules, package.json; none of the lock's 62 dev-only packages present; start probe exit=1 (unreachable loopback Mongo), no module-resolution errors; SIM-PASS.
- Falsification, in scratchpad copies with a green control first (the worktree was never edited): MA patch step moved before `npm ci` -> C1 and C2 red (killed). MB final stage `RUN npm ci --omit=dev` instead of the node_modules copy -> C2 and C4 red (killed). MC `src` added to .dockerignore -> C4 red (killed). The maker's 24-mutant batch (qa/evidence/wa-dockerfile/falsify-output.txt) names a falsification for every criterion; floor met. After the run `git hash-object` of Dockerfile (b1cd2964...) and .dockerignore (b5041426...) equals the HEAD blobs.

## Criteria
- C3C-C1 met (read plus script). C3C-C2 met statically and by replay; docker-run grep half NOT-MEASURED. C3C-C3 met statically; `docker run ... id -u` NOT-MEASURED. C3C-C4 met statically and by the replay listing; docker `ls -A` NOT-MEASURED. C3C-C5 met. C3C-C6 met statically; `docker history` NOT-MEASURED. C3C-C7 met statically (no bypass) plus the real patch step exit 0 in replay; docker build halves NOT-MEASURED.
- C3C-C8 NOT-MEASURED (needs Docker and the C3A hosted mode, absent at be5a090f); the contract says it never blocks the static clauses.
- I1, I2, I3 hold.

## Rulings on the 5 review claims
1. /app root-owned: TRUE as an observation, not a FAIL. `WORKDIR /app` (Dockerfile:23) creates /app as root; `src/config.ts:13-14` defaults to `./sessions` and `./media`; `mkdir` at `src/wa/authState.ts:18` and `src/wa/ingest.ts:163` runs at link or ingest time, not at boot, and would hit EACCES for uid node. Contract C3C-C3 states the process writes no files by design in hosted mode, and the manifest flags this. The reviewer's direction is right: MEDIA_DIR on the bucket mount and KEY_STORE=mongo (C3A) at deploy, no folders created in the image. P1.
2. mongo.ts logs the full URI: TRUE and OUTSIDE this unit's diff. In this tree the line is `src/db/mongo.ts:14` (not :16): `logger.info({ uri: config.mongoUri, db: ... }, 'mongo connected')` writes the whole URI, which carries credentials on a real server. The file was last changed in d6d451d and is untouched by aab9ad50. So it is a PROPOSED-ISSUE (P2), not a FAIL of C3C.
3. Floating node:24-slim: TRUE. C3C-C1 asks for an explicit tag that is not `latest`, and the contract's own [ASSUMPTION] accepts the tag. Low, not a FAIL (P3).
4. Test files in dist: TRUE. `tsconfig.json:20-21` includes `src/**/*.ts` and excludes only node_modules, dist and web, so `dist/**/*.test.js` is built and copied. Not this unit's file and harmless. Low (P4).
5. Shutdown without a timeout: TRUE. `src/index.ts:58-61` is `await close(); process.exit(0)`. Unchanged file; the platform's SIGKILL after Cloud Run's grace period bounds it. Low (P5).

PROPOSED-ISSUE: {"severity":"medium","type":"deploy-config","feature":"wa-dockerfile","title":"/app is root-owned so default ./sessions and ./media are unwritable as node; set MEDIA_DIR to the bucket mount and KEY_STORE=mongo at deploy (C3A/C6), do not bake folders into the image","evidence":"Dockerfile:23,30; src/config.ts:13-14; src/wa/ingest.ts:163; src/wa/authState.ts:18"}
PROPOSED-ISSUE: {"severity":"high","type":"credential-handling","priority":"security","feature":"archiver-logging","title":"mongo connect log writes the full MONGO_URI (credentials) at info level; log host and db only","evidence":"src/db/mongo.ts:14 (outside this unit's diff)"}
PROPOSED-ISSUE: {"severity":"low","type":"hygiene","title":"node:24-slim tag floats; pin a digest once online","evidence":"Dockerfile:12,22"}
PROPOSED-ISSUE: {"severity":"low","type":"hygiene","title":"tsc compiles *.test.ts into dist and the image copies them; add a test exclude","evidence":"tsconfig.json:20-21"}
PROPOSED-ISSUE: {"severity":"low","type":"reliability","title":"shutdown awaits close() with no timeout before exit","evidence":"src/index.ts:58-61"}

Process notes (low, not FAIL): the worktree has untracked `.codex/` and `AGENTS.md` that are not in the unit's commit. The evidence scripts live only in the KB evidence folder, as the manifest says. Merge and push of the archiver branch stay a separate human step; a real `docker build` plus the four docker run lines should run wherever a daemon is up.

VERDICT: PASS
SCOREBOARD: 7/7 static criteria met (C3C-C8 NOT-MEASURED, deliberately off the Criteria line), 3/3 invariants hold
TIER: M (two recipe files; route floor null)
FAILURES: none
CAPABILITY-COVERAGE: 3 own mutants killed; maker's 24 (23 static, 1 dynamic) not re-run; every criterion has a named falsification
LIVE-BROWSER: not-applicable (Dockerfile and .dockerignore only)
ISSUES-WRITTEN: none (findings go to the maker as Candidates)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The Dockerfile runs npm ci, then the C2 patch applier alone on its line, then build and prune, and the runtime image copies the patched, pruned node_modules; the static check, my own replay and 3 independent mutants agree. The docker-dependent halves stay NOT-MEASURED and are listed above. The two review claims worth acting on (root-owned /app, logged MONGO_URI) fall outside this unit's criteria and are filed as proposals.
Metrics: start=2026-11-26T05:11:00Z end=2026-11-26T05:15:00Z wall_min=4 agent_min=4 blocked_min=0 suite_runs=0 repeat_runs=1 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=240 mutants=3 defects_unit=0 defects_6c=0

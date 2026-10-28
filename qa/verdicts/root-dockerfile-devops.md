# Verdict: root-dockerfile-devops

VERDICT: PASS (conditional on CI build-targets green at a3b9bbbb; cycle 0 was HOLD, see history below)
Cycle checked: 1
Reviewed SHA: a3b9bbbbf048e25acbfd8fc5f0357193e94d5418
Base SHA: dbb719a5
Cycle 0 (historical): VERDICT HOLD, Cycle checked 0, Reviewed SHA c75b59cc4cdea647706bf8be37a62618d7eb7eec.
Scope: `git diff dbb719a5 c75b59cc` (Dockerfile, .github/workflows/docker.yml, docs/docker-deployment.md). Authorized by D-169 (Changes-authorized lists exactly these three paths). Static review only: Docker is not installed, so no image was built or run.

## Checks (independently performed)
1. COPY sources: every COPY source exists at c75b59cc (package.json, pnpm-lock.yaml, pnpm-workspace.yaml, 7 packages/*/package.json, workers/transcribe/package.json, apps/api|web/package.json, apps/web/nginx.conf, schema, config, migrations, scripts/qa/container-workflows, scripts/eval/extraction-authorized-import.mjs). Stage names and --from refs (web-build, build, prod-deps, media-tool-download, worker-tools, api) resolve. `api` is the last stage so plain `docker build .` yields api. PASS.
2. Build chain: packageManager pnpm@10.33.0 matches corepack prepare; frozen lockfile; apps/api build is esbuild (apps/api/scripts/build.mjs) with entryPoints server + source-worker, outdir apps/api/dist, ESM; web vite outDir dist, copied from /app/apps/web/dist. PASS. Note: `node --check` on typeless ESM .js relies on Node 24 syntax detection (same reliance as runtime `node apps/api/dist/server.js`); low risk, CI will confirm.
3. Entrypoint: script is generated with `#!/bin/sh` (dash in node:24-slim), `chmod 755`, `sh -n` at build, `exec "$@"` (signals pass), only `set`/`MISSING` printed, no values. Consumers: docker-compose.yml api service uses target api with no entrypoint/command override and PORT 3300; migrate uses target build (no ENTRYPOINT); worker-tools unchanged (no ENTRYPOINT); run.sh passes explicit commands (`node ...`, `sh -c`, `--user root`) which exec cleanly; refusal test (run.sh:86-90) still gets exit 1 and "MONGODB_DB" text. UID 1000 deviation is justified by run.sh:98 chown 1000. PASS.
4. web: `sed 's/listen 80;/listen ${PORT};/'` matches apps/web/nginx.conf line 2 exactly; grep guard in the same RUN; original conf.d/default.conf removed (no duplicate listener); ENV PORT=80 so envsubst's defined-vars-only behaviour leaves `$uri` intact and PORT is defined when unset. See finding F1 for the one unverified risk.
5. docker.yml: parses (js-yaml, exit 0); jobs images + build-targets; matrix include api(target "")/web; push:false; zero `secrets` references; permissions contents: read. build-push-action treats an empty `target` as unset (from knowledge of the action, not run). PASS.
6. Docs vs Dockerfile: accurate except F2.

## Findings
- F1 (HOLD reason, probable build break, Dockerfile web stage, `RUN sed ... > /etc/nginx/templates/default.conf.template`): the official nginx image is believed NOT to pre-create `/etc/nginx/templates` (users mount or COPY into it; the 20-envsubst script merely tests whether it exists). If absent, the shell redirect fails with "No such file or directory" and the web target fails to build. Could not verify without pulling the image. Fix: prefix the RUN with `mkdir -p /etc/nginx/templates &&` (harmless if it exists). Alternatively, remove the HOLD with a CI receipt that the `build-targets` web leg built green at this SHA or at the fixed SHA.
- F2 (minor, docs/docker-deployment.md:69): "The web image probes `/` on port 80" is now inaccurate; the web HEALTHCHECK probes `${PORT}` (default 80). Reword to "on `PORT` (default 80)".

## Not verifiable here
Actual image builds (api and web), runtime behaviour of the nginx envsubst entrypoint, `node --check` on the ESM bundle under Node 24, build-push-action empty-target handling, and full CI. The remaining operational T-051 gates are out of scope.

## Efficiency
Checker tokens/active time not measured by the host; reported as unknown. No test suites run; no files other than this verdict written.

---

# Cycle 1 result

VERDICT: PASS (conditional)
Cycle checked: 1
Reviewed SHA: a3b9bbbbf048e25acbfd8fc5f0357193e94d5418
Parent: a9fac545 (unrelated checkpoint). Reviewed `git diff a9fac545 a3b9bbbb -- Dockerfile docs/docker-deployment.md` and `git diff c75b59cc a3b9bbbb` on the same two files.

- F1 fixed: Dockerfile:54 now `RUN mkdir -p /etc/nginx/templates && sed ... > /etc/nginx/templates/default.conf.template && grep -q ... && rm ...`. The chain is syntactically valid and the mkdir cannot fail on an existing directory.
- F2 fixed: docs/docker-deployment.md:69 now says the web image probes `/` on `${PORT}` (default 80).
- Nothing else changed in those two files vs c75b59cc (the diff is exactly 1 line in each).

CONDITION: PASS is conditional on the CI `build-targets` job (api and web legs) going green at this SHA. Remaining unknowns need a real docker build: nginx envsubst runtime, `node --check` on the ESM bundle, and build-push-action empty-target handling. No Docker is available locally.

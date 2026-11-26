# Contract — wa-dockerfile (unit C3C, plan Lane C row C3, D-227, archiver D-023 item 8)

> Status: adopted by /checker 2026-11-25. SOURCE: MAKER-DERIVED. The criteria were proposed by the maker from the owner-approved plan D-227 (Lane C), the archiver's own decisions D-023, D-024 and D-025
> (final entries in the archiver repo `D:\KnowledgeBase\sources\whatsapp_msg`, read in its worktree `D:\KnowledgeBase\.worktrees\wa-hosted\docs\DECISIONS.md`) and KB decision D-235; they are not Umesh's words.
> The archiver has no `qa/` folder, so its unit checks live here by decision, and the checker runs them from the KB repo against `D:\KnowledgeBase\sources\whatsapp_msg`. Paths below are relative to that
> repo unless marked KB. Every criterion is provable on a laptop with no real WhatsApp connection, no phone, no cloud call and no production database.
> Runners and isolation (all Lane C units): `npm test` (= `tsx --test src/**/*.test.ts`, 6 test files today, verified by the checker 2026-11-25) and `npm run typecheck` from the archiver root. Tests use injected
> fakes, or a throwaway database named `whatsapp_msg_test_<random>` on a LOOPBACK mongod (the archiver's existing `identity.test.ts` already needs a local mongod). A test that needs mongod and finds none is
> NOT-MEASURED, never PASS; where a clause needs mongod only that clause is NOT-MEASURED and the rest runs on the fakes. Every Mongo-using test the unit writes first asserts that the host of `MONGO_URI` is
> `127.0.0.1` or `localhost` and aborts otherwise (new guard). That guard is written inline in each unit's own test file: no unit owns a shared helper file and a new one is a STOP-and-ask; `identity.test.ts`
> is owned by no unit and is not edited (checker reading of the maker's "every Mongo-using test": every one this unit adds or edits). Tests never read an archiver `.env`, never open anything under `sessions/`
> except their own `./.test-sessions`, make no network call, and use no real Baileys socket (a stub socket factory only). Any random test prints its seed and takes it from an environment variable so the
> checker can replay it.
> Merge gate (not a criterion): D-023 marks two readings as waiting for the Approver's answer (the Baileys patch's read-only reading in item 4, and the tenancy reading). The code may be built and checked;
> a PASS here does not authorise merging it to the archiver's main branch before he answers. Merging, pushing and the KB pin bump (D-235, plan unit C6) are separate human-gated steps.
> Unit: `wa-dockerfile` (C3C). Files it owns: `Dockerfile` and `.dockerignore`, nothing else. Built after C2 closes, because its patch step runs C2's `patch:baileys` script from `package.json`
> (`wa-baileys-patch.md`).
> Scope: `Dockerfile` and `.dockerignore` only; built after C2 (needs the `patch:baileys` script in `package.json`). Per D-023 item 8: multi-stage; `npm ci`; the patch step; `npm run build`; a runtime stage with production dependencies only, a non-root user, `node dist/index.js` in exec form, `PORT` honoured, every secret supplied at run time, startup probe is TCP so no `HEALTHCHECK` that needs the token. [ASSUMPTION] base image `node:24-slim` (D-023 item 8).
> What can be checked without a Docker daemon: structure, the stage-to-stage flow of `node_modules`, the user, the start command, the ignored paths and the secret patterns, by reading both files with a checker command (a small script in the checker's scratch area; this unit owns no test file, so these static checks are not a standing regression test, and that is a known limit). What needs a daemon and the network: that the image builds, that the patched file is in the final image, the uid, the file listing and the run. Without `docker version` succeeding those clauses are NOT-MEASURED, never PASS.
> Known limit, kept: this unit owns no test file, so the static checks are a checker script in the checker's scratch area, not a standing regression test. A later change to the Dockerfile is not guarded
> until a unit that may own a test is opened.

## Criteria
- **[C3C-C1]** Build structure (static). Two or more `FROM` stages; every `FROM` names an explicit tag or digest and none is `latest`; the build stage runs `npm ci` and never `npm install`; it runs `npm run patch:baileys` (the C2 script, the same command C2 tests) after `npm ci` and before `npm run build`, in the same stage, with no `|| true`, `; true`, `|| echo`, `set +e` or `--ignore-scripts`-style bypass on that line; `npm run build` follows.
  Check: checker script over `Dockerfile`.
- **[C3C-C2]** The patch survives into the runtime image. The final stage's `node_modules` comes from a stage in which the patch ran (`COPY --from=<that stage> ... node_modules`, after any `npm prune --omit=dev`), or the final stage runs `npm ci --omit=dev` and then the patch script itself (checker note, not a change in what is required: this second route cannot work, because `patch-package` is a dev dependency (C2-I1) and `--omit=dev` removes it, so copying from the patched build stage is the only route that can pass); a final stage that runs a bare `npm ci --omit=dev` with no later patch step fails this criterion (it would reinstall an unpatched Baileys). With Docker: `docker run --rm --entrypoint grep wa-archiver:test -c "<marker from C2>" /app/node_modules/baileys/lib/Socket/socket.js` prints 1 or more, and the same for `messages-recv.js` (the patch adds the marker to both files, no new file).
  Check: static flow check; the grep run is NOT-MEASURED without Docker.
- **[C3C-C3]** Non-root. The last `USER` instruction in the final stage names a user that is not `root` and not `0`, and no later instruction switches back; the files the process writes (none by design in hosted mode) are not owned in a way that needs root (checker reading: statically this means no `chown` or `chmod` after the last `USER`, and the files copied into the final stage are readable by that user; whether the process really starts as that user is proved by C3C-C8). With Docker: `docker run --rm --entrypoint id wa-archiver:test -u` prints a non-zero uid.
  Check: static, plus the docker run.
- **[C3C-C4]** Image contents. No `COPY` or `ADD` names `.env`, `.env.*`, `sessions`, `media`, `web`, `.git` or `.playwright-mcp`; if `COPY . .` is used, `.dockerignore` lists every one of `.env`, `.env.*`, `sessions`, `media`, `web`, `.git`, `.playwright-mcp`, `node_modules`, `dist`; the final stage copies `dist/` and production `node_modules` and `package.json` only. (checker-added) `.dockerignore` must NOT list anything the build stage needs: `patches`, `package.json`, `package-lock.json`, `tsconfig*.json`, `src`; a patch step that cannot see `patches/` would fail only on a daemon, so the static check names it. With Docker: `docker run --rm --entrypoint sh wa-archiver:test -c 'ls -A /app'` shows no `.env`, `sessions`, `media` or `web`.
  Check: static; the listing is NOT-MEASURED without Docker.
- **[C3C-C5]** Start. The command is exec form (a JSON array) and is `["node","dist/index.js"]`: no shell form, no `npm start`, no `sh -c`, so SIGTERM from the platform reaches the node process (C3A-C8(e)); the Dockerfile sets no fixed `EXPOSE` port other than via `PORT`, and sets no `HEALTHCHECK` (the probe is TCP). (checker reading of the first clause: any `EXPOSE` line names the same port as an `ENV PORT=<number>` default or uses `$PORT`; `ENV PORT=<number>` is allowed and is not a secret under C3C-C6.)
  Check: static.
- **[C3C-C6]** No secret in the image. No `ENV` or `ARG` line matches `(API_KEY|TOKEN|PASSWORD|SECRET|MONGO_URI|ENC_KEY)\s*=\s*\S` and none names `SERVICE_API_TOKEN`, `SERVICE_API_TOKEN_NEXT`, `SESSION_KEYS_ENC_KEY` or `MONGO_URI` with a value; no `COPY` of a credentials file; every secret setting is read from the run-time environment only. With Docker: `docker history --no-trunc wa-archiver:test` shows no value for those names.
  Check: static; the history check is NOT-MEASURED without Docker.
- **[C3C-C7]** A patch that does not apply fails the build. Static: the patch line of C3C-C1 has no bypass. With Docker (needs network): on a temporary copy where the first hunk context line of the patch file is changed so it no longer matches, `docker build` exits non-zero at the patch step; the unmodified tree builds (`docker build -t wa-archiver:test .` exits 0). The case "a different Baileys version fails the build" is proven by composition, not by a build: C2-C4 proves the `patch:baileys` script exits non-zero on a different installed version, and this unit's static check proves the Dockerfile runs that script without a bypass. State in the manifest which clauses were run and which were NOT-MEASURED.
  Check: static; the build checks are NOT-MEASURED without Docker.
- **[C3C-C8]** Run (needs Docker). With `SERVICE_API_ONLY` on and no token the container exits non-zero within 10 s and its log names the setting and no value; with a test token, `KEY_STORE=mongo`, a test `SESSION_KEYS_ENC_KEY` and an unreachable loopback `MONGO_URI`, `/svc/v1/health` answers 200 `degraded` with `store: "down"` and `/api/me` answers 404; `docker stop` returns within 10 s.
  Check: NOT-MEASURED without Docker; this clause never blocks the static clauses.

## Invariants (what must not change)
- **[C3C-I1]** `git diff --name-only HEAD` is exactly `Dockerfile` and `.dockerignore`; nothing else is touched.
- **[C3C-I2]** `npm test` and `npm run typecheck` pass unchanged (same test files and counts); `src/wa/readOnlySocket.ts` is unchanged.
- **[C3C-I3]** No secret value in either file, in the build log, or in test output.

## Out of scope / ignore
Not in this unit: pushing the image, Artifact Registry, Cloud Run, bucket mounts, secrets in Secret Manager, the min/max instance and CPU settings (plan C5, a dry run first and Umesh's yes); choosing the base image tag beyond D-023's assumption.

## Stop rule
Stop rule: a finding outside these criteria is filed and not built.

## Amendment log
- 2026-11-25 · routine · created from the maker-derived inbox entry "unit-level checks for Lane C units C2, C3A, C3B and C3C". Dispositions: C3C-C1 accept; C3C-C2 accept (note added: the "npm ci --omit=dev then
  patch" alternative cannot work because patch-package is a dev dependency); C3C-C3 clarified (the second clause was vague; made checkable statically, proved by C3C-C8 on a daemon); C3C-C4 tightened (`.dockerignore`
  must not hide `patches`, `package*.json`, `tsconfig*.json` or `src`); C3C-C5 clarified (EXPOSE vs `ENV PORT`); C3C-C6, C7 accept; C3C-C8 accept (NOT-MEASURED without Docker, never blocks the static clauses);
  C3C-I1..I3 accept. Every clause that needs a daemon or the network is NOT-MEASURED without one and the manifest states which clauses ran. [ASSUMPTION] base image `node:24-slim` kept from D-023 item 8.

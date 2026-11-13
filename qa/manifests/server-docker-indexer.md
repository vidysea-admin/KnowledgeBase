# server-docker-indexer

**Status:** checked-PASS
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (config: Dockerfile, docker-compose.yml, runbook section 6)
Fix cycle: 0
Dual check: no - deploy config only; the indexer service reuses the existing production guards in scripts/ unchanged (no guard code in the diff), one checker
Authorized-by: Umesh in chat, 2026-11-13 ("jo jo validate and verify hai sabb push kroo"; Phase 4a build "Yes, build karo"); D-214
Commit: d521fec0 on fix/server-docker-indexer (parent fc099756 = origin/master)
Round: 1, est 15 min

## Why
On a Docker-only server (vidysea-docker-vm, D-214) nothing could run scripts/create-admin.mjs or scripts/webinar/sync-session.mjs, and the api image lacked docs/whatsapp/notice.md, so WhatsApp link requests answered 503.

## Acceptance criteria
- C1: Dockerfile build stage copies scripts/ (so the runbook scripts run in a container); api and web runtime images change only by the one added file docs/whatsapp/notice.md at /app/docs/whatsapp/notice.md (the path notice.ts resolves to after bundling).
- C2: docker-compose.yml adds an `indexer` service with profiles ["tools"], target build, the same required env set as api (MONGODB_URL, MONGODB_DB, OLLAMA_API_KEY) and no env_file/bind mounts; plain `up -d api web` never starts it.
- C3: no secret or .env enters any image layer (.dockerignore still excludes .env, **/.env, .env.*, keys/certs).
- C4: runbook section 6 commands match the compose service name, flags and env names, and production writes still need --i-know-this-is-production plus MONGO_WORK_DB=MONGODB_DB=lkb_prod, gated on Umesh's yes.

## Evidence
Pre-check[C1,C2]: on vidysea-docker-vm, 2026-11-13 ~11:38 UTC, slim git archive of d521fec0 (sha256 8a7ab85ab3720a46f9919305e777cb355444fb301929d65ae26d3a15f46016de) built with a dummy .env.build: `docker compose -p kb ... config -q` exit 0; `build api web` and `--profile tools build indexer` exit 0 -> kb-api e1dd72f91ef9 (1.29 GB), kb-web ad04456b0cbd (74.7 MB), kb-indexer 9c73d54c15a6 (859 MB).
Pre-check[C1]: `docker run --rm --entrypoint node kb-api -e "require('fs').statSync('/app/docs/whatsapp/notice.md')"` -> exit 0. Web bundle index-7AdPBhyc.js: csrf 2 hits, whatsapp/links 4 hits.
Pre-check[C1,C2]: `docker run --rm --network none --entrypoint node -w /app kb-indexer --import tsx -e "<import production.ts, scripts/native-capture/server.ts, packages/db/src/client.js>"` -> `imports OK`, exit 0.
Pre-check[C4]: `docker run --rm --network none -i ... kb-indexer scripts/create-admin.mjs --tenant toc --email a@example.org </dev/null` -> "create-admin: explicit isolated work database and Mongo URL required; production writes refused", exit 1 (refusal, no Mongo connect).
Pre-check[C4]: `kb-indexer node scripts/webinar/sync-session.mjs` with no args -> prints usage `<sessionId> [--dry-run] [--emit-files] [--index] [--grounded-notes]`, exit 1 (expected).
Review: senior-software-engineer (fresh context, read-only), 2026-11-13 -> VERDICT Approve. Two low findings, filed not fixed (low = ledger only): LKB_ALLOW_STAGING defined as empty string in indexer env (docker-compose.yml:59) makes create-admin refuse work-db rehearsals (fail-closed); runbook section 6 should say to run the ~35 min grounded index inside tmux/screen/nohup.
Live stack untouched: knowledgebase-master-api-1 and -web-1 still Up (healthy) after the build.
Tests: none added. Gap noted by review: no test asserts the indexer service shape or notice.md in the api image.
Falsification: not run (no test asserts these criteria; evidence is image-level).

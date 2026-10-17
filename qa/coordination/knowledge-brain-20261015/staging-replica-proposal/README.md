# Dedicated staging replica-set proposal — NOT ACTIVATED

Purpose: unblock native transaction acceptance without converting/restarting the existing standalone Mongo server. Existing lkb_staging receipt verification-native-readonly-20261015T0947.json shows transactions unavailable. All existing production processes, databases and volumes remain outside this configuration.

## Concrete boundary

compose.yml uses a separate project lkb-vectorless-transaction, internal Docker network, loopback-only port127.0.0.1:27029 and owned volumes lkb-vectorless-transaction-data-v1 / lkb-vectorless-transaction-key-v1. No existing database/corpus directory is mounted. No application service, migration, corpus copy, port27017 replacement or production URI is configured. pull_policy never prevents an implicit image download. A locally installed pinned Mongo image ID is mandatory; no floating image is selected here. replica-init.js authenticates privately, initializes only the expected new one-member set, refuses unexpected existing configuration and reports no credentials.

Required private configuration references (no secret values or example credentials are included):
- LKB_STAGING_MONGO_IMAGE: approved existing immutable local image reference, exactly `sha256:` plus64 lowercase hex digits or a repository reference ending `@sha256:` plus64 lowercase hex digits. Tags and short IDs are rejected by the key-init guard before copying the key; the host guard below rejects them before Docker invocation.
- LKB_STAGING_MONGO_ROOT_USERNAME: dedicated staging identity.
- LKB_STAGING_MONGO_ROOT_PASSWORD_FILE: absolute private root-password file outside repository/public roots.
- LKB_STAGING_MONGO_REPLICA_KEY_FILE: absolute private replica-key file outside repository/public roots, valid Mongo keyfile content.
- LKB_STAGING_FIXTURE_USERNAME / LKB_STAGING_FIXTURE_PASSWORD_FILE: distinct restricted fixture identity and absolute private password-file reference; never reuse the root identity/password.

Key-init copies only into the new owned key volume with owner derived from the same image's mongodb account and mode0400. Private files must be provisioned separately; this proposal creates/reads no credentials. Docker Desktop secrets are file mounts, not an assurance of encrypted secret storage.

## Read-only readiness, then approval

Broker read-only readiness receipt verification-staging-readiness-20261015T1030.json records Docker CLI not found in the current PATH. Docker installation/daemon, local images and proposed project/volume state therefore remain UNKNOWN, not absent; bounded port27029 query also returned UNKNOWN, not free. Do not pull images, start containers or write database documents during readiness. Activation is NOT READY. It requires Docker available, selected immutable image already local with GNU timeout/mongosh/bash/install available, port proven unused, both named volumes absent (or independently proven this proposal's owned state), private files present and a suitable nonmeasurement window. An unexpected existing volume/project/port is a blocker, not permission to remove it.

Resource caps: Mongo0.50CPU/768MiB with256MiB WiredTiger cache; short key/init services each0.25CPU and128/192MiB. Startup, health probes and acceptance work still consume CPU/disk and can affect the shared Chrome search worker. Do not activate during A/B measurement windows. No claim that caps eliminate that impact. Volumes persist; no destructive cleanup command is proposed.

## Exact activation request and commands (DO NOT RUN YET)

Only after readiness is proven, owner approval must explicitly authorize a narrow D-143 exception/extension allowing this additional dedicated staging server, while preserving D-143's existing-server and production boundaries elsewhere. Record that exception through the required append-only decision script without blanket supersession. Its exact activation scope must cover: this separate Docker project/network/two named volumes, copying the dedicated replica key into its owned volume, starting its mongod at127.0.0.1:27029, root-user bootstrap and lkb-staging-rs administrative initialization metadata writes ONLY inside the new owned replica, creating the dedicated fixture user with readWrite on lkb_staging ONLY, and subsequent bounded native transaction fixtures against lkb_staging only. It does not authorize production writes, existing-server conversion/restart, host supervision, corpus ingestion, provider calls, volume deletion or unrelated migrations. No activation approval is being requested while readiness remains unproved.

After that approval only, set a private environment-file path in $privateStagingEnv (never print contents) and run from this proposal directory:

```powershell
$immutableImage = $env:LKB_STAGING_MONGO_IMAGE
if ($immutableImage -notmatch '^(?:sha256:[a-f0-9]{64}|[^\s@]+@sha256:[a-f0-9]{64})$') { throw 'Immutable staging image ID/digest required before Docker invocation' }
docker compose --env-file $privateStagingEnv -f compose.yml --profile activate config --quiet
docker compose --env-file $privateStagingEnv -f compose.yml --profile activate up -d mongo-staging
docker compose --env-file $privateStagingEnv -f compose.yml --profile activate run --rm replica-init
```

Set the validated immutable image in the host environment explicitly; host environment precedence prevents a private environment-file tag from replacing it. The compose key-init guard validates the same immutable form before any key copy. The second Docker command creates the dedicated owned key volume/container and starts only the new staging mongod. The third performs replica and restricted-user metadata writes. Its outer GNU timeout sends TERM after90s and KILL after5s grace, covering stalled mongosh authentication and administrative calls; URI connect/selection/socket timeouts are5s. Docker's health probe has an independent10s outer timeout. A timeout cannot promise rollback of an already accepted administrative write; the next approved initialization validates expected identity without reconfiguring foreign state. No command has been executed by this proposal. Inspect startup locally without publishing logs/credential fields. A failed readiness/init is HOLD; do not retry against the old server or weaken transaction checks.

Post-initialization application/fixture validation must use ONLY the dedicated fixture identity, granted exactly readWrite on lkb_staging, with no cluster/admin/other-database role. Root credentials remain in the initialization-only secret mount; never forward them to API, fixture processes or browser. Existing fixture users with a different owner/role are refused, not modified; password drift becomes a configuration HOLD, not an automatic reset. Application validation requires MONGODB_DB=lkb_staging AND LKB_ALLOW_STAGING=lkb_staging. Supply MONGODB_URL privately for the new loopback endpoint using that restricted fixture identity and replicaSet=lkb-staging-rs, authSource=lkb_staging and directConnection=true; never expose user/password or use public runtime config. directConnection keeps host clients on the approved loopback address despite the member's Docker hostname. Verify expected primary/set and restricted credential scope before bounded staging-only native transaction fixtures. Do not run migrations or copy existing data merely to establish connectivity.

## Alternative without local activation

Umesh may privately supply an already approved, transaction-capable replica-set URI for a dedicated staging target. The exact same explicit lkb_staging / LKB_ALLOW_STAGING guard applies; verify tenant isolation, authenticated primary and transaction support read-only before any separately approved fixture writes. Store URI only in private server environment; never paste it into chat, QA artifacts, browser config or generated reports. No use of a production target or transaction-less fallback is permitted.

Current status: reviewable config only. Docker/config/runtime compatibility and native transaction acceptance are unverified until broker readiness, owner activation approval and actual bounded evidence. All39parent acceptance gates remain open.

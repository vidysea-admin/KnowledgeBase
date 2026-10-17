# Manifest - container-workflows

Status: in_progress
Fix cycle: 0
Date: 2026-10-14
Maker: /root/docker_governance_review
Checker: /root/docker_checker (independent)
Priority: Explicit active-goal Docker runtime integration; authorized parent/runtime exclusive lease.
Scope: Current-source image/native readiness and isolated mounted production API/Mongo workflows.
Parent: T-051 operational runtime preparation; does not close live-source T-045 or full T-051.

## Owned changes

Dockerfile preserves default/final api, Node24/pnpm10.33.0 frozen installs, production bundle/assets/nonroot/3300 health, explicit nginx web and opt-in build migration target. Pinned official yt-dlp standalone/ffmpeg are available to opted-in request paths; optional worker-tools precedes api and commands the actual separate compiled source-worker entry; API startup still starts no capture/provider. Build copies only source CI helpers/migrations/schema/config; final API has no QA helpers/corpus/credentials.

.github/workflows/docker.yml invokes scripts/qa/container-workflows/run.sh with a bounded outer process and artifact upload on failure. Ten small helpers are copied only in build or mounted readonly in final images. Owned uniquely named containers, internal network and labelled private volume have bounded EXIT/INT/TERM cleanup, including foreground containers after client timeout. Mongo advertises its shared network alias and runs a replica set without exposing a host port.

Real stored hashed synthetic keys and exact trusted operator bootstrap feed actual production authentication/tenancy/roles. Mounted checks cover auth/scope refusals, source reads, role mutation/isolation, transcript correction/history/raw-row preservation and pending refresh. Actual API restart must preserve private grants and overlay state. T054 migration and existing T054/T061 durable Mongo proofs run explicitly on restricted disposable targets with deterministic fixture provider/workflow outputs. Unauthorized Ask must return401 with zero latched external fetch/http/process calls. Final-image external modules are actually imported from the authoritative build manifest.

## Evidence and gates

Maker executed only read/metadata/hash and git diff --check (exit0). No local Docker, native media command, database write, provider call, tests, browser, deployment, commit or Git push. Low-CPU syntax and T045 focused tests remain queued through the sole broker. All container/native/migration/API/Mongo assertions are authored and UNRUN until runtime publishes and remote CI finishes.

Retained gates: independent review; successful unchanged-source remote CI receipts; actual private retention writer (current factory explicitly absent, expected503); executed separate durable worker/source/provider proof; real source/provider/Ask proof for all five sources; platform/supervisor/operator host acceptance. Native synthetic sine audio is not YouTube acquisition. Existing root-docker-devops checked-PASS covers its historical packaging bytes only and does not cover this newer candidate.

Candidate and hashes: qa/packets/container-workflows.md. Maker edits no checker contract/verdict or historical decisions. No checked-PASS claim.

## Current candidate update

Actual separate jobs/entry.ts and source-jobs.ts root factory are authored; shared esbuild emits both entries but no build run occurred. API queue helper is lazy and needs no provider credentials. Worker requires explicit provider/model and trusted tenant allowlist; fresh nonrevoked ingest identity and configured hosting/account lifecycle are rechecked before actual work. Ten FS fixtures are queued. Container smoke now configures private source spool and probes actual mounted 202 enqueue/idempotency/poll/foreign-tenant refusal with zero acquisition, preserving queued-only labeling. API restart must preserve that queued request. No worker/provider/source execution or remote CI receipt yet.

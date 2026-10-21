# w26-askdoc: go-live guide: Mongo replica set required for Ask; T-028 scope

Status: ready-for-check
Fix cycle: 1
Lane: KnowledgeBase-lanes/w26-askdoc  Branch: lane/w26-askdoc  Base: fd471686
Candidate SHA: see `git log -1 lane/w26-askdoc` (the commit that adds this file)
Prior verdict: qa/verdicts/w26-askdoc.md (9fcab6b8), cycle 0 FAIL, reviewed 8c1f0ecf.

## Fix cycle 1 (docs only)
- keyFile steps added (openssl rand -base64 756, chmod 400, chown, security.keyFile) with an explicit safe order: replica set and lkb_app user before enabling auth; localhost exception noted if auth already on.
- rs.initiate now uses an explicit member host reachable from the api container; recommended replicaSet=rs0 with that host, directConnection=true only as fallback.
- T-028 sentence corrected: gates /keys, /hosting, /webhooks, operations schedules, automation, capture readiness; Ask unaffected.
- Added a before-you-start note: mongod restart (brief downtime) and mongodump backup first; no data loss.

## Changed paths
docs/GO-LIVE-UBUNTU.md, qa/manifests/w26-askdoc.md

## Checks
- Docs only. Not verified on a real Mongo (none available on this machine).

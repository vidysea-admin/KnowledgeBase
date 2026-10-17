# Manifest — goal-t053

**Handshake status:** building
**Status:** building
**Fix cycle:** 0
**Task:** T-053
**Tier:** 3 — user-authorized ALL40 roadmap continuation, D-170.
**Authority:** root ROOTGO exclusive path lease received 2026-10-14.
**Contract:** qa/contracts/goal-t053.md C1–C7; full-parent P1–P4 remain open.
**Fixture boundary:** T045 deterministic Windows ACL reader model; actual journal,
worker and strict indexing run. Actual generation binding is now a leased source
candidate, awaiting runtime proof; native Windows ACL remains a separate live gate.

## Authorized scope

New isolated connector-workflow API: authenticated public/on-demand intake through
the existing intake sink and indexing consumer; owner/SLA-bound missing-recording
create/list/receive/expire lifecycle; guarded exact-snapshot watched verification,
changed-content intake and indexing, unchanged skip, CAS verified-hash persistence,
retry and visible durable failure gaps. New ConnectorsPage and API client consume
these real workflows. No maker changes to shared mounting/composition or schemas.

## Changed paths

- apps/api/src/connector-workflow/types.ts
- apps/api/src/connector-workflow/consumption.ts
- apps/api/src/connector-workflow/intake-consumption.ts
- apps/api/src/connector-workflow/jobs.ts
- apps/api/src/connector-workflow/gaps.ts
- apps/api/src/connector-workflow/watched.ts
- apps/api/src/connector-workflow/snapshot.ts
- apps/api/src/connector-workflow/mongo-store.ts
- apps/api/src/connector-workflow/wiring.ts
- apps/api/src/connector-workflow/router.ts
- apps/api/src/connector-workflow/fixtures.ts
- apps/api/src/connector-workflow/workflow.test.ts
- apps/api/src/indexing/generation.ts
- apps/api/src/indexing/generation.test.ts
- apps/api/src/indexing/public-preserved-review.fixture.ts (isolated public synthetic input model)
- apps/api/src/indexing/public-preserved-review.test.ts (exact T040 writer/reader floor)
- apps/api/src/indexing/session.ts (exclusive generation lifecycle/receipt/tree CAS hunks)
- apps/api/src/indexing/chunk-write.ts (exclusive generation stamped writes)
- apps/api/src/indexing/grounded-write.ts (exclusive generation/preserved manifest hunks)
- apps/web/src/api/connector-workflow.ts
- apps/web/src/pages/ConnectorsPage.tsx
- apps/web/src/pages/ConnectorsPage.test.tsx
- qa/packets/goal-t053.md
- qa/manifests/goal-t053.md

Connector/web sources and generation helpers are new: no base existed. Existing
indexing producer/writer preimage hashes are requested from root's prior freeze.
The resumed candidate requires a
positive v2 indexing receipt plus validated physical page/chunks/tree/turns and claim evidence,
persisted in sourceMeta.connectorIndex; legacy/partial status alone cannot seed
deduped success. Final hashes will be recorded after
the candidate and focused runtime evidence are ready.

## Current evidence and gates

Sole executor ran the isolated public4 check: 3 PASS, 1 FAIL, 0 SKIP,
exit1/1069ms, PID12016. Receipt:
qa/evidence/goal-t053/ordinary-public4-20261015T003325Z.receipt.json.
Exact fee writer/reader, canonical/current-source tamper and generated-paraphrase
refusal checks passed; invalid-evidence loop failed with Missing expected rejection.
The candidate remains BUILDING. Original 34 tests and 9 UI tests have not run.
Current ordinary public-only API specification is the 4-test isolated
public-preserved-review.test.ts writer/reader floor. Original 34 Node tests remain
separate HOLD/default OFF until the root verifies their import/data privacy boundary;
test-name filtering alone is not authorization to import any private corpus.
The current prepared checks are 34 Node (27 workflow +7 actual generation) and 9 UI tests. The candidate now consumes
the T045-owned private durable source spool/worker through optional injected
SourceJobStore: enqueue 202, checked progress, positive physical proof before
recording CAS, deterministic visible uncertain-job gap and no provider retry.
Durable mode refuses direct intake and watched snapshot execution; immutable
watched-job payload support and actual cadence remain open parent gates.
Candidate is BUILDING, not ready-for-check, and no PASS is claimed. Root alone
owns server/production/App/nav mounting and schema metadata declarations.
Focused fixture evidence is planned at qa/packets/goal-t053.md; it cannot close
the actual-source/DB/scheduler/media/notification parent gates.

Security flags: auth, tenancy, data writes and credentials-adjacent public/hosted
URLs. Server-derived tenant scopes every read/write and downstream call. Public
errors contain fixed codes; URLs/tokens/provider error strings are not echoed.
Protected production DBs are refused; no new production opt-in is invented.

## Remaining full-parent evidence

P1: real authorized connector/public/on-demand URL/media, required credentials,
transport and real durable downstream consumption per connector.
P2: actual missing-recording inventory, persistent owner requests and consumed
recording receipt; delivery confirmation only if notifications are authorized.
P3: actual watched scheduler cadence, live guarded fetch, changed-content
re-ingestion, unchanged skip and persisted provenance against authorized sources.
P4: root production integration and real isolated DB/tenant boundaries; production
enablement remains subject to explicit write authorization and independent check.

## Fix cycle 1 (lane w16-t053conn) - evidence

Prior FAIL "Missing expected rejection" (public-preserved-review.test.ts): at base the test already
carries the detached-foreign-row oracle and 4/4 PASS (see below); no code change was needed there.
Two other failures surfaced when the full 40-test node set first ran and were fixed:
1. `auth, scope, body tenancy and unsafe URLs...`: fixture `lookup` returned a public IP even for
   literal IP hosts, so http://127.0.0.1/ was never refused. Fixture defect (fixtures.ts): literal IPs
   now resolve to themselves, as dns.lookup does; the real guarded fetcher is unchanged and refuses.
2. `disabled wiring, protected DBs...`: store methods threw synchronously, so a caller got a throw
   rather than a rejected promise. mongo-store.ts listGaps/findGap/findSource/listWatched are now async
   (still fail closed, same error code). No contract or policy change.
Durable watched-job support (watched-job.ts + watched-job.test.ts, 6 tests) was already present and passes.

Commands (node from the bundled runtime; no network, no browser, no real DB):
- apps/api: `node --test --test-concurrency=1 --import tsx src/indexing/public-preserved-review.test.ts` -> pass 4 fail 0.
- apps/api: `node --test --test-concurrency=1 --import tsx src/connector-workflow/workflow.test.ts src/indexing/generation.test.ts src/connector-workflow/watched-job.test.ts` -> tests 40 pass 40 fail 0 (27 workflow + 7 generation + 6 watched-job). Output: qa/evidence/goal-t053/w16-node-40tests.txt
- apps/web: `node node_modules/vitest/vitest.mjs run src/pages/ConnectorsPage.test.tsx --maxWorkers=1 --minWorkers=1` -> 9 passed. Output: qa/evidence/goal-t053/w16-ui-9tests.txt
Not run: tsc typecheck, contracts/verify_contracts.py, mutation runs (root-centralised per packet).

# Contract — goal-t053

Status: active
Authored by: independent checker, 2026-10-14
Task: T-053; backlog tier 3, user-authorized ALL40 goal

## Acceptance boundary

T-053 is the residual G1 connector expansion, public/on-demand intake,
missing-recording workflow and watched-source verification task. Its dependencies
are T-006, T-023, T-025, T-027 and T-045. Existing dependency verdicts certify their
stated slices only: recognizers, injected transports and pure decision functions
do not establish provider access, unattended scheduling, live ingestion or full
T-053 completion. A local implementation slice may receive a scoped PASS while
the full-parent gates below remain explicitly open.

Inherits the applicable recording-gap-tracking, URL adapter, guarded-fetcher,
watched-sources-entrypoint and watched-sources-run contracts. Their security and
provenance requirements are not weakened by this contract.

## Local implementation criteria

- C1: A reachable application caller composes supported connector/public URL
  intake with the existing source/turn ingestion and immediate indexing consumer.
  The packet identifies each connector actually supported and each unsupported
  or credential-gated path. A URL recognizer or orphan exported helper is not
  intake acceptance. Local fixtures must be identified as fixtures.
- C2: Tenant identity is server/auth-derived at every read/write and downstream
  call. Another tenant's source, request, watched row or receipt is inaccessible;
  a caller cannot replace the authenticated tenant through body/query input.
  Source identifiers and provenance stay tenant-bound across retries.
- C3: Public/on-demand ingestion retains source URL/identity, fetched-at context,
  content identity and turn evidence through downstream consumption. Consent and
  SSRF/redirect/DNS/size/time bounds inherit the existing applicable boundaries;
  credentials and bearer recording URLs are not disclosed in public errors.
- C4: Missing recordings have a visible, durable owner-bound lifecycle. Opening,
  listing, receiving and expiring a request enforce valid state transitions and
  source/tenant existence. A missing, failed or unconfirmed recording cannot be
  reported received/ingested. Conflicting/repeated receipts and retries are
  idempotent or explicitly refused, without a fabricated success.
- C5: Failed connector fetch, downstream ingest/index, persistence or missing
  recording remains visible as a source-linked gap/action-required condition.
  A failed write cannot increase a success count; one failed source must not
  silently discard other source outcomes. No real message sending is implied.
- C6: Watched checks use the guarded snapshot, preserve prior hash/diffFrom and
  fetchedAt provenance, skip unchanged content, and re-ingest changed content
  through the existing pipeline. Persisting successful lastFetch must follow
  successful required downstream consumption, so failed ingestion stays due
  and retryable. Verify first check, unchanged check, changed check and failure
  then retry, including tenant isolation and bounded execution.
- C7: Demonstrate the affected stage on identified sample data and immediate
  downstream consumption, plus a meaningful independent boundary probe. Record
  exact command/output, counts, exit code, duration, cycle and checked hashes.
  Run contracts/verify_contracts.py where applicable. No full suite or mutation
  run is required merely to expand a focused check; mutation safety still binds.
- C8: Positive indexing completion is bound to the actual persisted attempt and
  effective transcript digest. Actual page, generated claims, chunks and the
  exact session tree node carry that attempt's generation/source/session binding;
  the acknowledged artifact manifest agrees with readback before completion CAS.
  A returned random token or post-hoc marker does not establish current-generation
  consumption. Missing/stale/mixed generation, changed effective turns or missing
  exact session artifacts refuse source success, recording receipt and watched
  healthy-hash persistence. Pending/uncertain attempts cannot be taken over merely
  because time elapsed. Fixture CAS tests establish only fixture semantics; actual
  Mongo concurrent-writer and restart behavior remains a P4 gate.
- C9: Preserve the applicable T-040 reviewed-claim boundary (goal-T040 criterion
  3 and 7). Preserved reviewed canonical claims retain identity, review state and
  semantic digest, with exact current source quotes and valid turn/session
  evidence. Their canonical text may be a reviewed paraphrase; the generated
  output's extractive display-text rule must not newly block a legitimate
  preserved paraphrase. Unsupported/stale evidence remains refused. Synthetic
  review-state fixtures prove behavior only and cannot establish human gold or
  justify changing reviewer provenance, semantic policy or safety thresholds.

## Full-parent completion gates

- P1: Each assigned connector/public/on-demand path has independently verified
  supported behavior and a precise unsupported/credential/action-required
  boundary. Real connector transport and authorized source/media provenance
  reach the real downstream durable consumer; fake transports are insufficient.
- P2: The recording-gap/missing-recording workflow is exercised with authorized
  actual source inventory, persistent requests/gaps and an actual recording
  receipt that reaches ingestion. No notification/delivery claim without its
  corresponding authorized destination and confirmation evidence.
- P3: Actual watched-source cadence, successful live guarded fetch, content
  change, changed-content downstream re-ingestion and unchanged skip are proven
  against authorized sources. The live artifact includes persisted provenance
  and outcomes; placeholder rows and reachability do not satisfy A13.
- P4: Production integration and durable tenant boundaries are independently
  checked. Missing provider credentials/permissions, authorized media or URLs,
  active scheduler, isolated DB/tenant, and notification target where applicable
  are named separately with exact required evidence. Local PASS does not close
  these gates or permit upgrading full T-053/catalogue readiness.

## Checker ownership and scope

Maker does not edit this file. Checker owns this contract and matching verdict.
No browser, external network/provider action, production writes, exports,
deployment or external messages are authorized by this check. Root grants the
focused runtime-test CPU lease; prior to that, review remains read-only/light.

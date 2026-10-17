# Contract — goal-t007: full WhatsApp claims ingestion review

Checker-owned additive acceptance map, prepared 2026-10-14 under D-170. Task: T-007;
priority tier 3. Existing `qa/contracts/whatsapp-ingestion-first-slice.md` criteria 1–14
remain authoritative and unchanged. This file clarifies verification and scope accounting;
it does not waive any clause, authorize production writes or confer semantic approval.

## Acceptance map

1. **Source intake (existing C1–6).** Real selected-group messages, owner resolution from
   verified tenant configuration, stable source/session/message identities, real attribution,
   time and idempotent upserts. Existing tenant-isolation and source-id contracts remain binding.
2. **Detection/lifecycle (C7–8).** Canonical schema-backed claim/topic/decision/attachment
   candidates carry tenant, source, exact evidence, visible reason flags and decision audit.
   Cover positive/negative topics, decisions, attachments, sensitive and personal exclusion,
   same-import and known-tenant duplicates, including foreign-tenant non-duplicates. Required
   detection/evidence mutation probes must fail when the behavior is removed. Metadata-only
   attachment comparison is disclosed, never claimed as verified file-byte detection.
3. **Quarantine (C9).** Every production tree/vector/lexical Ask arm, search, graph, public
   citations, entity promotion and parent summaries exclude unapproved/rejected material.
   A collection audit alone does not prove all production readers are safe. Plant answer-bearing
   unique text; prove selection with guards removed and exclusion with guards present, then
   prove approved text is answerable with exact resolvable evidence. Only the approved candidate
   may become trusted; siblings remain quarantined.
4. **Review/publication (C10–11).** Verified-key tenant and scope govern actual mounted routes
   and stores. Foreign identities do not disclose existence. Approval and candidate-only trusted
   materialization commit atomically; materializer failure rolls back; conflicting concurrent
   decisions cannot both win; retries preserve audit. Re-ingest/re-index retains unchanged ids
   and decisions; source edits/deletions invalidate stale trusted material rather than transferring
   old approval. Every operation remains tenant scoped.
5. **Provenance/UI (C12–13).** Shipped WhatsApp review UI exposes pending count, kind, state,
   flags, exact evidence link and permitted approve/reject controls. Success updates visible state
   without manual reload. Loading, empty, forbidden, conflict and failed-publish behavior are
   actionable. Evidence opens the correct session and visibly identified turn with real attribution
   and occurrence time. Mounted shipped UI/API browser workflow completes ingest, review, evidence,
   separate approval/rejection and Ask with zero console/page errors.
6. **Verification/persistence (C14 and project DoD).** Same-cycle final bytes have direct checker
   source review, meaningful independent probes, affected-stage sample execution and immediate
   downstream consumption. Frozen-contract validation, affected typechecks, schema/type drift,
   structure lint and required workspace checks pass. Real main-Mongo ingest, persistence, process
   restart, unchanged re-ingest, approval/rejection retrieval and second-tenant isolation are
   demonstrated with retained commands/output. Fakes cannot replace these proofs.

## Verdict accounting

- A scoped implementation PASS may certify explicitly listed UI/backend behavior and checked
  bytes only after its own complete evidence. It must list every remaining parent clause/gate.
- Full T-007 PASS requires all C1–14 acceptance, mounted production consumers and real persistence
  and browser proofs. Historical foundations, unmounted routes, fake-DB or React tests alone
  cannot close T-007. Restricted credentials/live access remain HOLD until actual proof is available.
- Maker submission: `qa/manifests/goal-t007.md` at `Status: ready-for-check`, with `Fix cycle`,
  packet, final SHA256s, ownership/consumer map and exact evidence. Checker reply:
  `qa/verdicts/goal-t007.md`, same `Cycle checked`; candidate changes require resubmission.
- Testing/mutations wait for the root coordinator's CPU slot. Browser/provider/network/production
  actions are outside this checker assignment. Evidence from a separately authorized integration
  checker may be attributed only when checked bytes, cycle, command and results are established.

# U2.5 decisions extraction: parent gates and scoped write safety

Checker-owned contract established 2026-10-14 before the new candidate. Priority: tier 3, explicit ALL40 continuation (D-170). Existing u25decisions cycle-0 PASS certifies the historical flag-gated mechanism only. Its medium ISS-U25DECISIONS-001 is a recorded data-write risk; this contract does not rewrite that historical verdict or imply whole U2.5 completion. U2.2 remains an unresolved parent dependency.

## Full U2.5 acceptance (parent gates)

P1. The actual configured decisions provider extracts decisions from real session turns using the existing job routing/prompt seam. Demonstrate a genuine decision and a no-decision session; opinions, unaccepted suggestions, facts and open questions remain distinct. Provider failures and absent stages are unknown/degraded, never successful empty measurements. No provider/production execution is authorized by this contract.

P2. Every persisted decision has current tenant/session/turn provenance, locally derived timestamp span and only a cited speaker as optional owner. Actual immediate downstream consumers read the persisted schema-shaped output without errors and preserve tenant scope, stable identity and honest extraction degradation. Required frozen-contract verification and affected real-data stage evidence must bind the candidate bytes.

P3. The U2.2 harness separately measures raw, parsed, filtered and persisted decisions, retaining fabricated citation evidence before filtering. Actual individual Umesh approval is required before decision labels become human gold under D-163; AI-drafted or JSON-declared labels are not proof of approval. Missing decision gold/coverage remains unavailable.

P4. Precision/recall, hallucination/provenance and semantic support measurements must meet explicitly approved binding thresholds against independently reviewed, hash-bound decision gold. No invented threshold or acceptance follows from fake-provider tests, this safety unit or historical PASS. U2.5 remains incomplete until P1-P4 and its U2.2 dependency pass.

## Scoped local extraction and persistence safety acceptance

S1. Default flag-off integration continues to issue no decision provider call, collection operation or decisions result key. Successful extraction retains only actual cited turns, computes min/max time from those turns, and omits uncited owners. Empty turns avoid provider calls. Mixed tenant/session turns, ambiguous duplicate IDs, invalid source identity or invalid times must refuse before provider/DB operations rather than stamp foreign evidence as local.

S2. Provider, parse, source validation or persistence failure must remain explicit. Failed/degraded extraction leaves prior stored decisions untouched. A nonempty wholly unusable response must not masquerade as a successful no-decision result that prunes earlier knowledge; a genuine clean [] may remove stale proposed rows for this session only.

S3. Repeated successful extraction yields deterministic tenant/session-scoped IDs independent of evidence order or duplicates and avoids duplicate decisions. Reviewed verified/needs-review records, including legacy random IDs, retain their IDs, content, status and provenance. No extraction response may manufacture reviewed status or overwrite such rows. Different tenants or sessions remain isolated.

S4. New/changed proposed decisions are durably written before stale proposed rows are removed. Any insert/upsert failure must leave every preexisting decision intact and skip destructive cleanup. Cleanup targets only this tenant, this session, status proposed and genuinely stale candidates. An incomplete multiwrite may leave additional proposals, but must report degradation/failure and never claim atomic replacement. Tests use filter-honoring in-memory storage and assert actual rows as well as exact predicates.

S5. Independently replay the two recorded ISS-U25DECISIONS-001 reproductions: (a) successful rerun over verified/needs-review rows, and (b) write failure after old rows would historically have been deleted. Report case counts by issue ID and named any omitted case. Also probe cross-tenant/session targeting, stable reruns, clean-empty pruning, degraded no-write and partial write failure.

S6. Required evidence comprises current ready-for-check manifest and Fix cycle, changed-call-site/dependency map, exact final hashes, bounded focused tests for extraction/persistence and indexSession downstream consumption, schema-compatible output and contracts/verify_contracts.py. Checker independently reviews all changed logic and one meaningful behavioral boundary; no browsers/full suites/network/provider/production writes. Scoped PASS certifies S1-S6 only, records remaining P1-P4, and cannot mark U2.5 done or close U2.2.

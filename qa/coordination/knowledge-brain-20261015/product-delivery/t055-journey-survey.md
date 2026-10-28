# T055 product journey survey — 2026-10-15

Scope: read-only maker survey; priority tier 3. No source lease requested and no product source changed. No tests/builds/browser/network/database actions performed.

Read: root AGENTS.md, skills/maker/SKILL.md, ARCHITECTURE.md, current DECISIONS tail, TASKS T-055 row, qa/contracts/goal-t055.md, delivery-matrix.md, goal-t055 manifest, collections-store/router/tests, metadata-visibility, document-reader, KnowledgeDocumentsPage, documentClient, collectionsClient.

Findings: actual API/store already provides tenant-scoped durable collection CRUD, revisions/CAS, idempotent creation, membership deduplication, existing-member visibility refusal, and safe member links. Existing collections UI worker owns the separate bounded chooser data-loss repair. Documents already provide true page navigation, exact quote highlighting and scoped page/source/version client validation. The suspected document source-visibility omission is not established: document rows are a separately imported immutable producer, not aggregate raw-message metadata, as metadata-visibility explicitly documents. Do not apply aggregate-session withdrawal assumptions without a document lifecycle contract.

No distinct, necessary product behavior gap was established in this bounded survey. Current full-parent acceptance remains HOLD: actual DOCX rendering, representative runtime/browser review, genuine U2.2/U2.3/U2.4 semantic acceptance, final matching dependency evidence and independent checker remain outstanding. These cannot be replaced by another authored synthetic test or a maker done claim.

Suggested next verification: broker only, smallest existing mounted API cases in apps/api/src/knowledge/collections.test.ts plus existing KnowledgeDocumentsPage tests after source ownership settles; reuse historical receipts only where exact pins/environment match. Coordinator owns exact broker command/runtime selection. This note contains no execution claim.

# Speaker relation workbench maker packet

Status: implementation prepared; broker evidence and independent review pending.
Fix cycle: 2. Subunit of the coordinator's authorized product delivery; no independent task completion claimed. Current canonical pins and four-file integrated scope are in qa/packets/product-speaker-relation-workbench.md; cycle-1 notes/pins below are historical.

Cycle 2 mounts workbench inside the actual speaker profile. Strict authenticated GET /speaker-relations/source?personId validates explicit capabilities and hashed statement evidence and maps statements to claims. Source refreshes after successful mutations. Context-keyed source component and cancellation prevent stale credential/person responses from granting actions. Four mounted integration cases added; no test run by maker. Profile API/helper unchanged. Canonical manifest remains BUILDING.

Candidate SHA256: SpeakerRelationWorkbench.tsx = 6eddf4944a6835010284e3659916c4ea1d23b4381c9ab68fb34b13e73eda8363; SpeakerRelationWorkbench.test.tsx = 402bb7b08ee1b72a9af886ffd8bb8bec5b03022eadc21b685b9d47cacf93f7e2.

Root: C:/Users/product/Desktop/KnowledgeBase. New files (no base version):
- apps/web/src/pages/knowledge/speaker-relations/SpeakerRelationWorkbench.tsx
- apps/web/src/pages/knowledge/speaker-relations/SpeakerRelationWorkbench.test.tsx

Read repository AGENTS.md and skills/maker/SKILL.md. Server boundary consumed without edits: apps/api/src/speaker-relations/types.ts, router.ts, service.ts. Immediate existing consumer inspected: apps/web/src/pages/knowledge/speakers/KnowledgeSpeakerProfilePage.tsx and speakerProfileClient.ts. This component is not yet mounted; composition owner owns integration.

## Integration interface

Export SpeakerRelationWorkbench({apiKey,personId,authSession,authority?,onChanged?}). authSession is the authenticated session generation. Component key resets inventory, draft and late result state when credentials/session/person change. Authority is optional and must originate from an authenticated server response: {personId,canPropose,canReview,reviewerKind,sourceRevisionDigest?,claims?}. Each proposal-source claim is {id,text,evidence:[{sessionId,turnId,quote,transcriptHash}]}. No browser storage or profile identity inference establishes authority. Absent authority disables proposal/review; automation disables all review commands.

GET /speaker-relations?personId=<encoded>&status=suggested|accepted|rejected|revoked loads each bounded inventory, validates DTO provenance and shape, and renders pending separately from accepted. POST /speaker-relations submits the selected claims, exact evidence, source revision, and generated proposal id. POST /speaker-relations/:id/review sends only {baseRevision,requestId,decision} after a separate explicit confirmation. No actor, tenant, capability, identity or accepted flag enters a mutation body. Server remains authoritative. Missing bootstrap hashed evidence visibly prevents proposal creation; existing profile/knowledge responses do not contain transcriptHash.

403 automation/human refusal, 409 conflict and 503 stale/unavailable evidence render explicit notices; failed writes retain pending inventory and disable further mutation until refresh. No optimistic acceptance. Server receipt status/id/revision are checked before success. Each claim relation links to exact session/turn evidence.

## Required broker/checker scope

Broker only; no test/build run by this maker per CPU lease. Run existing web focused Vitest command for the two new component files, plus central mounted profile test after integration. Verify TypeScript compatibility in the broker's shared build. Tests cover default deny, pending/accepted distinction, exact source links, explicit human confirmation, CAS revision body, 403/409/503 refusal, automation refusal, stale digest, exact hashed proposal payload, and malformed cross-person inventory.

Security flags: authenticated reads, tenant-scoped inventory validation, data writes; no credentials emitted/persisted. Protected governance/shared composition files untouched. No DB, network, browser, provider call or test run performed. Model token/cost usage unavailable; wall activity not measured independently. Checker and root/base/candidate SHA, environment fingerprints and final file hashes must be attached by the coordinator's same-candidate central packet. No PASS claimed.

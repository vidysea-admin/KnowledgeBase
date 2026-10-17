# Manifest — goal-t007

**Handshake status:** checked-PASS
Status: checked-PASS
Fix cycle: 1
Task: T-007
Priority tier: 3 — user-authorized ALL40 roadmap, D-170; ROOTGO exclusive UI lease.
Contract: qa/contracts/whatsapp-ingestion-first-slice.md C12–13 UI source behavior; additive qa/contracts/goal-t007.md. All parent C1–14 remain binding.
Packet: qa/packets/goal-t007.md
Base: ed542fd01c870e5d5b64e1d72b413062d595f675. Existing tracked UI source had no other changes in the submitted diff; nested review files are new with no base.

Scope: ship the previously absent WhatsApp candidate review interface through existing authenticated backend endpoints: pending count, kind/state/flags, attributed exact-turn evidence, explicit approve/reject, per-candidate confirmed status and honest loading/empty/access/conflict/publication errors. Refresh after ingest, and clear private review state and late responses on credential changes. Source-only scoped implementation; not whole-task acceptance.

Ownership: apps/web/src/api/whatsapp.ts; apps/web/src/pages/WhatsAppPage.tsx; apps/web/src/pages/WhatsAppPage.test.tsx; apps/web/src/pages/whatsapp/ReviewQueue.tsx; apps/web/src/pages/whatsapp/ReviewQueue.test.tsx; this manifest and packet. No backend, shared composition, schema/generated/migration, package/lock, contract, tracker or governance edits.

Security: private tenant-qualified review reads; authenticated approve/reject writes initiated only by explicit control. Browser sends no tenant, owner or actor in decision request. Server remains authorization/transaction authority. Credential-change unmount plus generation guards discard obsolete private responses.

Evidence: first root-granted focused startup exit1 after0.927s (esbuild spawn EPERM, zero cases). Exact approved unsandboxed single-worker retry exit0: 2 files,19/19 PASS (13 review+6 page), Vitest10.84s/outer14.515s, no failures. Actual HTTP client endpoint/body/auth test is immediate downstream consumer coverage; fixtures only, no mounted/backend/live proof. Source hashes reread unchanged against packet after process end. Both CPU slots released immediately. Full web compiler remains centralized and deferred. React Router future-flag stderr warnings disclosed; zero-console browser gate remains unverified.

Remaining parent gates: central reviewed-ingest/router mounting; all trusted reader and aggregate quarantine; detection mutation probes; actual attachment/source-detection acceptance; schema/type drift and complete workspace integration checks; live main Mongo transactional persistence/restart/reingest/foreign-tenant proof; mounted shipped-browser ingest/evidence/approve/reject/Ask run with zero errors. C1–14 are not closed by this UI unit.

Close-out: matching qa/verdicts/goal-t007.md VERDICT: PASS /Cycle checked:1 persisted independently20:53:48UTC. Current five source/test hashes reread equal packet and verdict. Independent broker22/22 PASS includes19 standing and3 checker probes; coherent web compiler attempt2 exit0,14090ms with ten relevant compile-snapshot pins matched; frozen contract registry unchanged, vacuous validator PASS. Initial/intermediate HOLD preserved in checker evidence. This closes only the five-file UI source unit; remaining parent gates above stay open.

# Manifest — whatsapp-message-publication

**Handshake status:** in_progress
Status: in_progress
Fix cycle: 1
Task: T007/T008 actual approved-message vectorless publication.
Priority tier: 3 — explicitly assigned roadmap integration; data-write/consent/tenant security is uncapped and requires full ceremony.
Contract: qa/contracts/whatsapp-ingestion-first-slice.md C9–12/C14; qa/contracts/goal-t007-visibility.md C1–6.
Packet: qa/packets/whatsapp-message-publication.md
Source freeze epoch: 2026-10-15T10:59:31.5274026Z.
Git base SHA: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a.
Scoped candidate identity: 71D7152D7DAAE17CA19A4CD35FA3A547910A6837731213420C61A4350FFD73B8 (SHA256 of exact ordered final-pin artifact, not a Git commit).
Final changed-file identity: qa/evidence/whatsapp-message-publication-pins.json (12 exact source/test paths; each SHA256 recorded there).

Central authorized new message publisher/revision helper/fixture/tests, narrow actual materializer callback and revoke hook, shared authority projection/active-session seam, strict quarantine audit and tests, fake active-transaction predicates, and the single old direct-revoke fixture session wrapper. Actual consent-write fence/store.ts remains unchanged.

New files: native-evidence/message-publication.ts, message-publication.test.ts, message-publication-fixture.ts, message-revision.ts; whatsapp/review/quarantine-native.test.ts. Existing changed files are the remaining seven paths in the final identity artifact. Existing pre-unit hashes are preserved by previous manifests/receipts where available; no fresh pre-thaw byte backup of materializer.ts was made (reported to root). Do not claim a missing backup or reconstruct it as an original. No reset/clean/deletion of user source occurred.

## Behavior and evidence

Real review repository persists approved candidate then actual materializer upserts claim and awaits bounded native tree publication in the SAME ClientSession/transaction. New source/passage branches use exact internal message locators, shared semantic revision and <=1024 UTF8-byte passages. Tree CAS preserves unrelated branches and requires acknowledged matched/modified or confirmed upsert plus exact readback. Source fence excluded from semantic revision; two approved messages survive later fence rotation. Publisher never calls provider/vector/indexer/external services. Retries replay only deterministic DB work.

Revocation removes only matching candidate native branch in the SAME invalidation transaction; audit validates complete exact native branches against canonical current approval/body in ONE snapshot/session, retaining raw/mixed/stale findings. No blanket message-kind exemption. Supplied authority session must be active according to actual driver API; missing/inactive refuses. Direct fabricated-approved materializer intent over a pending persisted candidate never publishes native tree authority.

Five new publication tests, two new audit/session tests and eight authority tests supplement all original64 consent/security cases: expected79 focused declarations total. No local tests/compiler/native DB/provider/browser runs by maker. Broker API typecheck is next priority; focused test receipts and independent checker pending. Native replica-set race002/snapshot semantics and full mounted Ask remain separate acceptance gates; no mock PASS can close them.

## Actual maker accounting

Implementation phase2026-10-15T10:50:49Z→10:59:31.5274026Z: elapsed/active522.527seconds, no explicit idle waits. Tokens:null, cost:null (unavailable). Targeted pre-phase grounding and later packet preparation were not separately timed, so whole maker denominator remains unknown; do not report measured10% efficiency. Preserve shared-suite costs separately and use checker assess/explicit bounded bootstrap if needed.

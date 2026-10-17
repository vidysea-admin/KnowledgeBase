# Manifest — whatsapp-native-authority

**Handshake status:** in_progress
Status: in_progress
Fix cycle: 1
Task: T007/T008 current native message evidence.
Priority tier: 3 — explicitly assigned vectorless native source integration; consent/quarantine security keeps full ceremony.
Contract: qa/contracts/whatsapp-ingestion-first-slice.md C9–12, C14; qa/contracts/goal-t007-visibility.md C1–6; native source locator/resolver interface supplied by central integration.
Packet: qa/packets/whatsapp-native-authority.md

Exclusive new paths (no base):

| Path | Final SHA256 |
| --- | --- |
| apps/api/src/native-evidence/whatsapp-authority.ts | C99B3DC6AF517079692CB004603D7A36740656FC3D9204EEFE1807BF7EFD842E |
| apps/api/src/native-evidence/whatsapp-authority.test.ts | 05C5BEE5032005D28CDF80A9759DF156303DE17F7A33BDD26F32F1CFCBA5E4B7 |

Central owns actual factory mounting. createWhatsAppNativeAuthority(db:Db) exports loadCurrent and listCurrent; factory adapts to TrustedMessageAuthority loadCurrent+listLocators. This is not production accepted merely because the helper exists. Canonical IDs are actual sources._id, sessions._id as threadId and turns._id as messageId; no fabricated upstream IDs or audio timing. Source/effective-turn/claim/candidate/review guard reads all use a mandatory Mongo snapshot transaction session. No writes, credentials, provider calls or standalone fallback.

Eight focused test declarations authored: real materializer-to-resolver positive; pending/rejected/attachment/quarantine/withdrawal/deleted refusal; foreign/stale raw source; missing turn/claim; current consent revision versus harmless fence; effective overlay invalidation; Unicode passage bounds and inventory cap; sanitized infrastructure/unsupported transaction failure. Broker pending; no test run by maker. Real replica-set snapshot proof remains HOLD, as does earlier consent-race002 native acceptance. Existing consent files remain frozen and untouched.

Maker prospective implementation phase2026-10-15T10:36:47Z→10:40:08.5025263Z: elapsed/active201.503seconds, no explicit idle waits; tokens:null/cost:null (unavailable). Pre-phase targeted grounding not separately timed; unknown time must not be treated as measured whole-maker denominator. Whole-maker time/usage therefore remains unknown for checker ratio; use bounded BOOTSTRAP_REVIEW if no comparable denominator. No padding or earlier checker work attributed to maker.

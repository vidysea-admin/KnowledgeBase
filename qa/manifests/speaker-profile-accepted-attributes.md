# speaker-profile-accepted-attributes

Status: checked-PASS
**Handshake status:** checked-PASS
Fix cycle: 0
Base SHA: a9fac545 (lane/w16-u24attr). Candidate SHA: the single commit on this branch (see packet). Pins below re-measured at this base; the earlier pins were stale. Source code was already integrated at base (acceptedAttributeReader is the optional third arg of createMongoSpeakerProfileDeps); this unit changes only this manifest.

Tier 3, U2.4 / T-055 accepted attribute source integration authorized by root through integration_control. This candidate invalidates prior store/store.test receipts by changing those files; unchanged relationship-reader files remain frozen. No schema, barrels, composition, routers, service, QA contracts or UI edits. Full identity quality, human review and parent task acceptance remain open.

## Behavior and consumer chain

`readSpeakerAttributeAuthority(snapshotDb, tenant, person)` reuses the existing private sanitized input loader and source-only graph/hash authority. New `buildSpeakerAttributeAuthority` derives attributed turns from current accepted profile blocks and exact effective turns; non-human-confirmed or ambiguous identities expose no accepted attribute turn authority. The helper opens no transaction and reads no attribute/relationship rows, avoiding recursive source digests.

`createMongoSpeakerProfileDeps(db, acceptedRelationshipReader?, acceptedAttributeReader?)` adds an optional third dependency. Both profile and graph consumers call it inside the existing final source-read snapshot. Missing reader preserves legacy behavior. With a reader present, accepted fields replace cached org/role values; absent or conflicted fields clear them, including old evidence. Evidence is projected with `status: accepted` for the existing profile builder, which revalidates source ownership/quotes. Derived profiles expose an additive `revision`; graph revision includes accepted projection revision. Base authority never includes accepted projection revision or relationship edges.

Attribute adapter signature matches canonical `apps/api/src/speaker-attributes/mongo-store.ts` `readAcceptedSpeakerAttributes(snapshotDb, tenant, person, authority)`. Those producer/service/type files are dependencies owned by u24_quality, not changed here. Central production/router activation is deferred. Existing role/organization shape remains compatible; profile revision is additive and existing web validator ignores extras.

Contracts: existing source-grounded profile/identity privacy requirements and `qa/contracts/speaker-knowledge-vectorless.md` clauses 1–5. Auth/tenant boundaries yes; new data writes, providers, credentials and external effects no. No new acceptance thresholds, human confirmations or live evidence invented.

## Exact leased source pins

All paths below prefix `apps/api/src/speaker-profiles/`.

| File | SHA256 |
|---|---|
| store.ts | 2FC7F7079CDC3A90A531376D9002CBCAF091928A766F7E70E17989D397FA0E0E |
| store.test.ts | 81C653002A538694DB0FBBE9230BF957C6EF9DC0D3384C397738DE958D107255 |
| attribute-authority.ts | 1D1ADC4BD00F4B3514FC97556AA3DCE5118B85552BCA9D61D21C38940B713DE8 |
| attribute-authority.test.ts | D524BE04BCB1B49C1AA96E7FFEEFE78AB4D9FB7B2CA72A87EF3314421971F481 |

Store baseline SHA256 `14A5817B08DF1488E037D122EC34E7A28E9FE2C6907C9141424E66B555F6C086`; test baseline `E5FB7F33E2B4FD388BAAC0D3852BDA5F83A785FF856FC6299E2C4463F319F144`. New helper and test had no base. Preserve all unrelated dirty changes. Existing HEAD reference `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a` is historical, not an assertion that the current dirty candidate equals HEAD.

## Sole-broker selected checks

No checks executed by maker. In-memory fixtures and SDK lifecycle only; no live DB/provider/browser/private source. Exact new nodes:

- attribute-authority.test.ts: `accepted attribute projection replaces cached fields and never falls back on absent or conflicted values` — projection/revocation/conflict/source immutability.
- attribute-authority.test.ts: `attribute-derived revisions change on accepted-source generation and source correction` — cache revision invalidation.
- store.test.ts: `source-only attribute authority exposes exact confirmed blocks without recursive accepted attributes` — exact speaker-block provenance and base digest independence.
- store.test.ts: `accepted attributes update profile and graph in the same source snapshot and clear revoked cached fields` — immediate profile/graph consumers, current snapshot capability, no fallback after revocation, stable base authority.

Command: root `node --import tsx --test --test-name-pattern="^(accepted attribute projection replaces cached fields and never falls back on absent or conflicted values|attribute-derived revisions change on accepted-source generation and source correction|source-only attribute authority exposes exact confirmed blocks without recursive accepted attributes|accepted attributes update profile and graph in the same source snapshot and clear revoked cached fields)$" apps/api/src/speaker-profiles/store.test.ts apps/api/src/speaker-profiles/attribute-authority.test.ts`.

Canonical attribute service's accepted-row receipt/refusal checks and relationship reader remain independent producer gates. Joint mounted API/UI acceptance, central source checkpoint, frozen verifier and release checks remain required at their respective gates. Request ready-for-check only after broker evidence and current dependency pins are attached.

## Measurement

Prospective source-phase monotonic ticks `247064046642` to `249206229020`, frequency `10000000`: elapsed `214.2182378` seconds. Explicit waits: zero; runtime host tokens and cost unknown (`null`). Metadata packaging is separate. This measurement does not claim reviewer efficiency or full task acceptance.

## Maker evidence (cycle 0, lane w16-u24attr)

Typecheck: apps/api tsc --noEmit reports 0 errors in speaker-profiles or speaker-attributes.

Command (lane root, node on PATH): `node --import tsx --test apps/api/src/speaker-profiles/store.test.ts attribute-authority.test.ts router.test.ts relationship-reader.test.ts` -> tests 24, pass 23, fail 0, skipped 1 (private TOC test held: needs KB_U24_PRIVATE_TOC_TESTS=1). Includes the four named nodes above. Accepted-only filter is in speaker-attributes/service.ts acceptedSpeakerAttributes (status accepted, tenant/person match, current, receipt); conflicts are withheld.

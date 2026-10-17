# Independent field-provenance finding

ISS-U24PROFILECHECK-003: high/open. This is a distinct synthetic regression, not a replacement for the original topic-withdrawal or whole-row metadata floors.

On store A57C28DB9DDEDC697669158B3B352C5C773592F607458DDFDB4E1427B57CB449 and metadata helper 200262B9B6DB1E609A275FA920FBA8C96811B7AE59B6094B599C179A665FF8D1, identity evidence references only permitted primary session s1. Independent orgEvidence/roleEvidence reference withdrawn s2 in both negative inputs. Confidence is fixed at 0.9, with primary support; eligible identity and claims are identical. Only stored org/role presence varies.

The healthy all-visible control retained its primary claim and supported fields. The negative produced different public profiles: withheld.profileFields changed from 2 to 0. Confidence remained 0.9 in both. The oracle permits equal output or equal whole-profile refusal; it does not prescribe negative output confidence. There is no schema invariant requiring attribute evidence to be included in identity evidence.

Command: `node --test --test-timeout=30000 --test-concurrency=1 --import tsx qa/evidence/u24-speaker-profile/checker/field-provenance-cycle3.test.mts`, outer timeout 30000ms, private-input flag 0. Actual result: EXIT1, 949ms, 1 healthy PASS / 1 privacy FAIL / 0 SKIP, all 13 pins stable. Receipt: `field-provenance-cycle3-20261015T010532Z.receipt.json`, SHA256 409625325942966C70B7382A7E6F3FADF0DD6DB2F910C015B6CB8FE4D0DD56B6. Immutable case file SHA256 AE57E3AB6FE04EF4BFFEBC397536593BFC88F3FDE17B519F7AB277633AC62DB6.

The pre-execution precision revision was never run and is not a recorded RED. Original 32B9/F055/F249 floors and their failures remain unchanged. Real SDK Db/session shape is exercised over authored synthetic collection data; this is not actual Mongo server snapshot, provider, private corpus or human-confirmation evidence.

The root-authorized repair now checks identity and independent attribute contributors regardless of raw value presence. Its acceptance remains pending fresh original 8 + mixed 2 + field 2 + affected store 7, additional helper controls, current coherence and the maker's matching READY cycle. No current-cycle or full-parent PASS is claimed. This operational finding and raw run artifacts remain local and excluded from publication.

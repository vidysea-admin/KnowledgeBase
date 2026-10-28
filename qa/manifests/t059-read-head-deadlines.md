# t059-read-head-deadlines

**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 1
**Task:** T-059
**Priority:** tier3 centrally authorized roadmap slice
**Maker:** /root/product_delivery_coordinator/product_api_inventory
**Packet:** qa/packets/t059-read-head-deadlines.md
**Contract:** qa/contracts/goal-t059.md scoped S3/S5/S7/S10/S12/S13/S15
**Base HEAD:** 9e55b642 (fix cycle 1; cycle 0 base was 5c4cbade)

Candidate SHA256 (actual bytes, fix cycle 1): workflow.ts 1b0689155c395d7c86cce4586207830471c2b5bbce05eb4f14cdcab0d6e3273c; workflow.test.ts 1d0415ed91fb980e9abfb9294623bd45f8a5e2a00eb35a511f9672bffa021334. workflow.ts is unchanged from 9e55b642 (git blob 78e6f457 LF-normalized); the cycle 0 hashes were stale. The committed workflow.ts also carries another unit's readIndex/vectorless receipt changes.

Bound storage reads and terminal-head promotion after immutable child persistence. Storage deadlines retain ownership and never invoke recovery writes; freshness read deadlines never trigger paid rebuild. Four new fault tests include ambiguous final CAS and no-paid-replay recovery. Whole-operation deadlines and all other writes remain explicitly out of scope and unbounded.

Fix cycle 1 (tests only, workflow.test.ts): HOLD verdict item 1 repaired. The read-deadline test now asserts failure unchanged, failureHistory length unchanged and revision == pre+1 (lease only). The terminal-CAS test asserts failure undefined, failureHistory empty and revision == CAS predicate revision (+1 only when the CAS committed).
Evidence (fix cycle 1, each run under timeout 600 from apps/api): workflow.test.ts 22/22; router.test.ts 3/3; composition.test.ts 2/2 (its apps/api/qa output removed, not committed).
Mutation M1 (delete the StorageTimeout rethrow line (if error instanceof StorageTimeout, throw error) in retest main catch, line 201): KILLED, 2 failures ("no recovery failure record" in both new assertions), 20 pass. Per-mutation byte backup, trap on EXIT/INT/TERM/ERR, timeout 600; restored hash 78e6f4579ce8 equals HEAD:workflow.ts blob.
Remaining (live gates, not done): broker receipts for focused tests, contract validator and typecheck are still pending; no typecheck was run. Native/live gates and parent T-059 remain HOLD. Independent checker re-verdict is coordinator-owned.

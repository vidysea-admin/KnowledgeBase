# Native read-view consistency repair

Status: SOURCE FROZEN; HOLD pending sole broker execution and independent verification. No local tests/typecheck or live DB/provider calls.

Root: C:/Users/product/Desktop/KnowledgeBase. Existing diagnostic receipt qa/goal-vectorless-2026-10-15/verification-message-positive-diagnostic.json and stdout remain untouched: tree snapshot session 8 begins, native message authority requests session 9 while active=1, outer Ask aborts. Repair retains the fixture mutex and original timeouts.

## Candidate pins and ownership

- apps/api/src/native-evidence/resolver.ts — 75c39b52f8c8620bf28bf55133b63e3b3746d40236806127540a3f843bc4fe61
- apps/api/src/composition/integrations/native-production.ts — a16cacc13ebcc18e1ad959dcfbd7a28bf26ccc9a0c8ef2d3aeb5cd7e651f8698
- apps/api/src/composition/integrations/trusted-readers.ts — 6a3ef8fba476fda5d25de208b8869fe165990e6d1b2487f486d5c66698e307bc
- apps/api/src/composition/integrations/native-read-view-binding.test.ts — 06e578fe1eecd1e893e6b075ff2edfc09e9eab22cd13d3113216983f11d83c37
- Dependency owned exclusively by whatsapp_maker: apps/api/src/native-evidence/whatsapp-authority.ts — 32dbcfe90c978c6050afdf0c8717c3937cd547d90b32542d4342bfe94af733cb

Generic resolver receives optional forReadView(collection-only snapshot capability). Production attaches its binder to the existing resolver object, preserving every original resolve/revalidate function. The binder constructs source-head and exact immutable document reads on the supplied view and invokes message authority with its explicitly supplied readView. Direct document lookup is tenant-scoped document_documents by exact ID; there is no getDb/default acquisition or mutable global/session cache. The current tree reader invokes the binder inside its existing snapshot and passes only the bound resolver into that phase's visibility traversal. Bound resolver remains inside that callback; only safe tree data is returned.

Unchanged mounted path: production.ts native.resolver → store.ts createMongoTreeStore(native.resolver) → trustedTreeReads → outer snapshot → native.resolver.forReadView(snapshotDb) → createKnowledgeVisibility(snapshotDb,bound). Ordinary nativeSources hydration, Search/citation and final evidence/release verification still call the original fresh resolver and create their own current authority snapshots. The WA owner preserves mutual exclusion with supplied ClientSession, original source/approval/effective-text checks and infrastructure failure tracking; no mock lock removal or timeout expansion.

## Focused evidence to collect

Root requested first the existing positive MESSAGE diagnostic/vertical case with the existing 15s watchdog, before wider bounded checks. Keep its original failed receipt separately. New focused test command after root/broker admission:

`node --test --import tsx apps/api/src/composition/integrations/native-read-view-binding.test.ts`

Two authored cases: actual native tree read binds message authority to the outer view while later resolver checks stay fresh; native read-view document getter stays tenant scoped on the supplied view without base DB fallback. They reuse the existing actual message publication fixture and actual production factory, preserve the real fixture transaction mutex, check one outer session for all source/guard/tree reads, then verify later original resolve/revalidate start fresh sessions and observe consent withdrawal. The document case throws on any base DB fallback. No local execution receipt exists; broker must bind command/output/exit/runtime/lock and current pins. Relevant compiler and combined integration gates remain root-owned.

## Prospective maker measurement

This lane: node:perf_hooks 5854420.9733ms → 5972889.335ms, UTC 2026-10-15T11:44:32.268Z → 11:46:30.736Z; active 118.4683617 seconds, no recorded waits. Actual tokens/cost null. Read-only design/triage precedes and is outside this measured implementation phase; packaging is outside its source-phase denominator. WA owner separately reports its own 14.378-second phase and unknown tokens; retain both contributions without replacing prior diagnostic costs. No efficiency success or checker verdict claimed.

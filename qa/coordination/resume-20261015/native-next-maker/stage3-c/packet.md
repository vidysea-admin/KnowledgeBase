# Stage3 C — narrow lazy production composition maker packet

Validation contract managed-review/1; unit stage3-c-lazy-production; cycle 1;
root C:/Users/product/Desktop/KnowledgeBase. Base HEAD d50a25c200dcbcf574ecade0aa205f5fcb45c5f8;
uncommitted candidate SHA unknown until central freezes. Exact four file pins and raw
preimage hashes in packet.json. Existing production.ts/test preimages are raw Copy-Item
backups, preserving earlier central work; compare against these for this narrow repair,
not the entire base diff. New helper paths were absent (preimages.txt).

Root cause: original production.test.ts18/30 expected construction without connected
Mongo. Production composition immediately called getDb for native integrations, reviews,
and shared input. Replacing only those calls would still evaluate real databaseName in
answer/transcript and configured evaluation integration constructors. scopedCollection
also eagerly obtains a Collection even when its eventual tenant operation is lazy.

Concrete repair, within granted four-file lease:
- New createLazyDatabase(resolve) returns deferred Db and retained Collection handles.
  Constructing scoped readers performs no resolver call. Actual member access resolves
  the connected DB/collection, with Mongo methods bound to their genuine receivers.
  No fabricated DB metadata, env substitution, connection, callback authority or network.
- Production uses that handle for native/review/shared consumers. Explicit optional
  ServerDeps getters defer answer/evaluation/transcript factories until route-property
  access, retaining their original exact actual-database-name policy checks. Both the
  top-level answerWorkflow consumed by route mounting and nested ask.answerWorkflow
  remain wired. Getter results are not cached. Ordinary bootstrap already connects
  before building/mounting server dependencies.
- The original constructor/Tavily assertions are unchanged. A new production test checks
  native/review/scoped readers bind before connection and relevant policy gates are
  descriptors. Two helper tests model no constructor resolution, current-connection
  tenant-safe collection operations and genuine method receivers, plus refused/allowed/
  refused gate changes. Synthetic helper fixtures certify software behavior only.
- production.ts is 294 nonblank lines by lightweight count; composition immediate file
  count is 9. Actual repository structure parser remains the broker's required check.

Immediate consumers: native production resolver/graph and head store; shared knowledge,
review, hosting and session-decision readers; gated answer/evaluation/transcript route
factories and mountIntegratedWorkflows; ask.answerWorkflow. No integration source file,
DB/schema/contracts/deps/enforcement file was edited. Parent's earlier hook/host-adapter
changes in leased production files remain intact. Unrelated dirty/index state preserved.

Native EPERM coordination: B diagnosed closed spool chmod0400 followed by archive copyFile
preserving the read-only bit, then destination open r+ failing. B owns bounded streaming
copy repair. No fixture defect was identified, so scripts/native-capture/production.test.ts
is unchanged by C. No ACL repair or duplicate probing occurred.

Required sole-broker minimal replay (NOT RUN): original production.test.ts18/30 unchanged
nodes, the new constructor/native binding regression, existing actual acknowledged-commit
index hook regression (all four production nodes), and both new lazy-database.test.ts
nodes. Suggested root command is node --import tsx --test apps/api/src/production.test.ts
apps/api/src/composition/lazy-database.test.ts under the broker's pinned environment.
Run API typecheck, applicable structure/cycles, and relevant existing actual-DB-name gate
matrix tests (answers/evaluation/transcripts) before combined stage/downstream acceptance.
B's repair additionally requires the original genuine native production49 test; C did not
execute or reinterpret it.

Original 206-test evidence remains unchanged: 184 pass / 18 fail / 4 skip in
../../broker/native-next-stage2-atomic-consumer-floor.log and focused checkpoint.
Those receipts describe pre-repair bytes, not success for this candidate. Sole broker
must collect current SHA/runtime/lock/environment receipts. No test/build/DB/provider/
browser/ACL/decoder execution, checker dispatch or PASS claim. token_metric actual_total;
actual tokens/active seconds/cost are null/unknown. Independent review remains gated on
complete attributable evidence, with no inheritance of acceptance from earlier stages.

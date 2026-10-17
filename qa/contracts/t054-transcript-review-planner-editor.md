# T-054 transcript review planner and standalone editor

Scope: pure correction/audit/refresh planning, revision-bound web client and an unmounted editor. This contract does not accept T-054 as a complete feature. Canonical atomic persistence, tenant/auth-bound routes, schema/migration work, refresh execution, mounting and live-browser acceptance remain separate gates.

1. Corrections name exact existing turn ids. Reject duplicate/foreign ids, malformed payloads and empty/no-op reviews. Preserve timing and unrelated turns. Require a nonblank bounded review reason.
2. Mapping names an explicit consecutive block of at most 100 turns with one existing speaker reference. Reject disjoint or mixed-speaker selections. Repeated references elsewhere must remain unchanged.
3. Planning requires the loaded revision and trusted tenant/session/actor/time. Reject conflicts and mismatched snapshot/turn scopes. Clients cannot supply trust or provenance fields.
4. Preserve the input snapshot. Audit before/after values must be detached from mutable input/output turn objects and identify every actual change. Supply a new deterministic revision and pending refresh targets; a plan is not a durable commit or refresh completion.
5. Client GET validates session, revision, unique ordered turns, timing and refresh state. POST sends the loaded revision in body and If-Match, and accepts only a bound durable committed receipt with a different valid revision.
6. Editor requires changed text/mapping and a reason before saving. It sends only named changes and the loaded revision. Conflicts and uncertain saves retain drafts and prohibit retry until reload.
7. Key/session changes and unmounts invalidate previous asynchronous work. Previous identity content must be hidden immediately and late results must not alter current content, notices or callbacks. This isolated unit requires stale-result fencing; actual transport abort is not claimed.
8. After a durable receipt, reload the canonical transcript before editing again; refuse a reload whose revision differs from the receipt. Report pending/failed refresh honestly and preserve commit truth when reload fails. Callback failures cannot misreport a confirmed commit as an uncertain write.
9. Render transcript/speaker/reason data as text. Exercise planner on retained sample turns and demonstrate the immediate consumer: real revision client consumed by editor with simulated HTTP responses. Required repository frozen-contract validator must pass. No live/backend completion claim without separate evidence.

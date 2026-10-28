# Gate — claims-citable-needs-review (opened 2026-10-28T12:00+05:30)

Root-cause fact pass (read-only) result: D-200 premise PARTLY true.
- Knowledge outputs 422: CONFIRMED. The only claim-status gate is packages/core/src/knowledge-outputs/evidence-builder.ts:108 (verified only) -> 0 excerpts -> apps/api/src/knowledge-outputs/evidence.ts:40-41 throws 422.
- Second independent 422 cause: claim caps (apps/api/src/knowledge-outputs/reader.ts:18 >200 claims; evidence.ts:27). Multi-session outputs still 422 after D-200.
- Counsellor 0 sources: REFUTED as a claim-status problem. /ask cites tree nodes/turns, not claims (packages/ask/src/ask-graph.ts); apps/api/src/ask/graph-context.ts:77 already admits needs-review. Real cause unknown; needs one authed live POST /ask reading auditLog/exclusionReasons.
- Unit needs an additive schema change: optional citations[].claimStatus in schema/knowledge_outputs.schema.json (+ gen:types). Not listed in D-200 Changes-authorized.

Blocks: QUEUE row 0 claims-citable-needs-review.

Questions (recommended default first):
Q1 scope: outputs-only unit (status gate + label + schema field) | also raise/paginate the 200-claim cap in the same unit
Q2 refuse policy: needs-review citations count as insufficient under onInsufficient=refuse (stay strict) | allowed under refuse too
Q3 schema: authorize additive optional citations[].claimStatus (new D-entry) | no schema change
Q4 counsellor: separate diagnosis (one authed live POST /ask, read-only) before any counsellor code | drop for now

Answered: 2026-10-28 — Q1 "cap ki need kyu hai like cap lagaaya kyu gaya hai phle properly build krr lo end to end firr dekengee" -> build outputs unit end to end now; cap untouched; explain cap origin; revisit after — chat
Answered: 2026-10-28 — Q2 Stay strict (refuse policy treats needs-review citations as insufficient) — chat
Answered: 2026-10-28 — Q3 Yes, additive optional citations[].claimStatus — chat, D-201
Answered: 2026-10-28 — Q4 Diagnose counsellor separately (read-only live POST /ask) — chat

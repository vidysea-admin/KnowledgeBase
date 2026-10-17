# vectorless-authorized-graph-arm

**Handshake status:** building
**Status:** building
**Fix cycle:** 0
**Priority tier:** 3 — approved vectorless speaker/topic graph retrieval gap.
**Authority:** user-approved Knowledge Brain plan; root/integration_control new epoch lease 2026-10-15.
**Contract:** qa/contracts/vectorless-tree-retrieval.md clauses 1,2,3,5,6; integration remains separately required.

## Scope and exact consumer commitment
Pure bounded graph expansion over a server-projected accepted/current graph. Graph IDs select evidence and never authorize source access. integration_control has committed the actual per-request mounted Ask consumer: optional speakerRefs/topicRefs, current tenant/source revision projection, helper invocation and existing extraCandidateArmsFn. Central owns request schema/shared exports/composition/source hydration and must pin its final consumer paths before ready-for-check. This module alone cannot certify mounted retrieval.

Input: tenantId; selection speakerRefs/topicRefs; accepted edges (id,tenantId,status,from/to kind/ref,provenance sessionId/sourceId/revisionHash); visible current source snapshot with tenantId/sessionId/sourceId/revisionHash; authorized tree. revisionHash is server-derived current lowerhex SHA256, never a caller assertion. Output: original current tree nodes and non-sensitive degraded status/statistics. Central must validate accepted/confirmed provenance upstream; this helper is not an authorization authority.

## Changed behavior
- No selection produces empty graph arm without scanning; unknown selection produces empty results.
- Selection is a union of routing hints. It does not turn source visibility on; central must document or constrain other Ask arms consistently.
- Limits:16 selected IDs,128 edges,128 visible sources,32KiB metadata,2 undirected hops,6 sessions,50k tree nodes/depth32. Row/byte/authority/duplicate/cyclic-tree failure refuses the whole arm; excess sessions sorted deterministically then bounded, marked degraded.
- Each edge must be accepted, same tenant and fully current: every proof matches current source ID/content hash and current tree evidence.sessionRef. A failed proof omits the entire edge and prevents traversal across it. Session endpoints must match an edge proof. Duplicate source/session/edge identities refuse ambiguity.
- Source graph text/labels and routing summaries never become evidence; no embedding/vector/model/DB calls. Selected nodes pass unchanged into existing exact evidence hydration/grounding.

## Verification request and pending evidence
Sole broker: node --test --import tsx packages/index/src/graph/authorized-expansion.test.ts packages/index/src/graph/speaker-knowledge.test.ts
Meaningful scenarios: confirmed speaker two-hop expansion; explicit topic and unknown/empty seeds; foreign/suggested/revoked/stale/wrong-source/invisible/partial-proof edges; tree intersection and path collision; duplicate authority/tree/edge identities; row/byte/session bounds; malicious labels ignored.
No tests/provider/DB/browser executed by maker. Broker evidence, applicable mandatory verifier/shared integration typecheck, actual mounted consumer, independent checker and source-native current revision proof remain pending. No parent task completion claimed.

## Review accounting
Maker actual active time/tokens/cost are unknown, not zero. Reviewer must load C:/Users/product/.agents/skills/checker/SKILL.md and use assess before dispatch/material phases. Use bounded BOOTSTRAP_REVIEW when denominator unavailable; ratio unverified. Shared test cost remains separate; do not transfer checker work into maker accounting. Exact evidence/runtime/lock/environment fingerprints must match for permitted reuse.
## Candidate pins
Base HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Both source/test files are new, no HEAD base.
- packages/index/src/graph/authorized-expansion.ts SHA256=8e8be650d49c1d025d0fc402e7bbe59a6286f51eac91dcc9c68d05a5a23bd6df
- packages/index/src/graph/authorized-expansion.test.ts SHA256=9896fabf4820f6a77eb5f440f1fc1be6aaf7d764e103f0f4aa6c0b98b2e4be0a

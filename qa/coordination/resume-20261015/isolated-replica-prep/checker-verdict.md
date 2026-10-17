# Independent offline source review

VERDICT: FAIL
Status: FAIL
Cycle checked: 0
Reviewed SHA: 1c128c8554b21efd9c393c93f5bece2f35d38f1082a52a9cfea19ecf324b8948
Runtime readiness: HOLD

Scope: manual instruction-aware source inspection only; not managed launcher execution. The optional launcher is not mandatory under checker/SKILL.md. Unknown native controls/startup allowance continue to block runtime execution. No server/vendor/application script, ACL operation, network, database, credential generation or tests were executed by this reviewer. D-143/D-173 human activation gate remains binding; approval JSON cannot grant authority. No approval artifact was changed.

## Proven source violations

1. HIGH — activate-proposal.py:185-195 (also 143-145, 207-209), init-and-smoke.py:37-56. Readiness proves only that the owned process was alive immediately before a successful TCP connection. The exclusive probe socket was already closed. It never binds the listening socket to the child PID/executable/creation identity. A different process winning the released port can receive replSetInitiate/createUser and the new root password; the child can still be alive while starting/failing to bind. Checking replica-set name or process liveness is insufficient endpoint ownership proof. Refuse all bootstrap/auth/shutdown commands until exact socket ownership is independently established and retained/rechecked across the relevant transition. Static counterexample is the interleaving: probe closes; competing listener binds; mongod child resumes/remains alive; poll returns None; connect succeeds to competing listener; smoke sends createUser with generated password. No real interception was attempted.

2. HIGH — activate-proposal.py:218-232. Cleanup errors bypass the only persistent activation receipt. For example owner.json write at162 fails after created=True; finally closes job then owner read223 raises, so232 never executes. After credentials exist, a rmtree permission/error at230 similarly leaves private remnants with no durable error/remnant receipt. A wait timeout inside job.close at220 also skips all receipt persistence. This violates PLAN's all-path sanitized receipt/owned-remnant requirement. Keep safe refusal of unknown ownership; move receipt persistence to an outer finally and record cleanup errors/remnants independently, without claiming deletion or job closure on unchecked API failures.

## Inspected boundaries and remaining proof

Source uses suspended process creation before job assignment and resumes only after assignment succeeds; private helper is byte-pinned and atomically creates a protected inheritable DACL; per-run UUID and ignore scope are narrow; passwords/keyfile use secrets; application identities have separate exact DB roles; config binds loopback with authorization/keyfile. None of these observations certifies native API behavior, PowerShell argument marshalling, resource enforcement, runtime bootstrap or parent-death safety. CPU/memory ABI/readback, helper/ACL invocation and full interruption matrix still need admitted independent probes. DACL verifier checks protected flag/allowed trustees but not full expected rights/owner/inheritance semantics; pinned helper mitigates source intent, runtime proof absent.

Disk/log limits are polling thresholds only, not hard quotas. Startup readiness and shutdown do not run disk monitoring; os.walk itself has no independent deadline. Overshoot, scan latency and runtime compatibility remain unmeasured. Synthetic smoke covers neither T059 user access isolation nor actual application publication/race/recovery acceptance.

## Evidence and identity

Independently raw-byte hashed all11 source-manifest entries; every SHA matches, including manifest SHA above and pinned private helper48ec95f14880c235dd8812f7ef68d4afbdf11b9c2beb9a1421151aa4d50178ca. See checker-source-hashes.json. Four packet receipt hashes independently match. Inspected broker all4-final-seal provenance: passive Python AST4, PowerShell2 and ignore5 green receipts are retained; historical assess/validate exit2 failures remain retained. Repaired metadata assess0/validate0 READY refers only to offline packet completeness. No receipt is runtime acceptance. Independent behavior probes are queued in checker-source-broker-request.md, not executed or claimed green.

Commands: Get-Content for exact scripts/config/helper/PLAN/packet/applicable AGENTS/skill and D143/D173 clauses; Get-FileHash for source/manifest/helper/receipt identities; review_budget.py assess --input checker-source-phase1-metrics.json exit0; assess --input checker-source-finalization-metrics.json exit0. Raw helper output retained in corresponding *-assess.txt. A scoped rg inventory returned access-denied on unrelated broker temp directories; no access repair/retry attempted, and it supplies no evidence for this verdict.

## Accounting and workflow limits

Maker active/tokens/cost unknown=null; reviewer actual total tokens/cost and initial active-time telemetry unknown=null. No measured efficiency success, 10% compliance or hard token interception is claimed. Historical6000 bootstrap allocation and repair1 outputs remain unchanged. Root explicitly authorized once finite escalation to24000 actual-total-token allocation total,180 active seconds, including4000 protected completion tokens, because startup plus security-sensitive source review cannot fit4000 review tokens. Phase1 debit120s/16000tokens and finalization30s/4000tokens are conservative allocated charges, not measured usage; remaining4000 covers startup allowance, not free retry. Both assessment inputs retain the original6000 bootstrap limit and explicit escalation. No child/retry was spawned.

Workflow deviation: initial source read was performed before this reviewer's phase assess; this cannot be retroactively called gated. Phase assess then returned0 before further inspection; finalization assess returned0. Therefore no overall compliant-check/PASS claim. Native controls/startup receipts remain unknown and runtime HOLD; no automatic retry or further positive allocation is authorized after finalization. Required executable probes and human activation approval remain unfulfilled. Findings are queued for the sole broker/root; shared production code, trackers and qa/contracts were untouched.

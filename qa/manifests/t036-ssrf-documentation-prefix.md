# T036/T045 shared source-egress documentation-prefix refusal

Status: checked-PASS
Fix cycle: 0
Task: T-036 / T-045
Issue: ISS-T036GUARD-001
Priority: security, high; no round cap.
Maker: /root/docker_dependency_review
Checker: /root/docker_dependency_review/checker_t036
Contract: qa/contracts/t036-ssrf-documentation-prefix.md (checker-owned)
Packet: qa/packets/t036-ssrf-documentation-prefix.md

ROOT/runtime granted the exact ordinary-source lease for packages/ingest/src/sources/guarded-fetch.ts and its focused test file. The change adds only g0===0x3fff && g1<0x1000 to refuse 3fff::/20. No unrelated address policy, enforcement, schema, account or provider behavior changes.

Primary source: https://www.rfc-editor.org/rfc/rfc9637.html, sections 4–6, identifies this documentation prefix as non-global and unsuitable for actual traffic. The original defect is checker-recorded STATIC evidence, not an executed RED.

The standing regression reads the issue shard and replays all eight original recorded cases verbatim: five in-prefix refusals, the exact outside-prefix boundary, and both mixed-DNS orders before request. Supplementary spelling, public-address preservation and redirect-hop tests add coverage without substituting a maker-authored floor.

Actual sole-broker run: bundled node --test --test-concurrency=1 --test-timeout=30000 --import tsx packages/ingest/src/sources/guarded-fetch.test.ts. Exit 0; 42/42 PASS, fail 0; 902.834 ms. ISS-T036GUARD-001: 8/8 recorded cases passed (five address refusals, two mixed-DNS zero-request refusals, one correctly allowed outside-prefix boundary). Source/test/original-ledger hashes unchanged before/after. Earlier source-line declaration count 21 omitted dynamically declared cases; actual count 42 supersedes it.

Receipt: qa/evidence/goal-t051checker-broker-t036-guard.json with stdout/stderr named therein. No real network/provider calls.

Matching independent verdict: qa/verdicts/t036-ssrf-documentation-prefix.md, VERDICT PASS, Cycle checked 0, SHA256 BA47AD2BD849CF46A35C03A0374394E836EBCDA644F5E3E41A9F8B72A95E43F4. Independent broker probe exited 0 in 301.5871 ms: three address boundaries passed and the actual public caller refused a redirected mixed-DNS answer before a second transport. Source/test/public/native/OnAir/export pins match again at maker closeout. Checker verified the issue metadata without changing its eight original cases; the executed original ledger SHA remains in the packet, and current verified-metadata shard SHA is 943E1AAD3C821151E25A02D397E3D4AC3B5DA6848809F1C29339EEC223EF0411. Full T036/T045 source mounting, real acquisition, host and downstream acceptance remain HOLD regardless of this scoped security PASS.

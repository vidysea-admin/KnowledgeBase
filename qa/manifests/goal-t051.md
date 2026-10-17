# T-051 Ubuntu supervisor interface

Status: checked-PASS
**Handshake status:** checked-PASS
Fix cycle: 1
Scoped close-out: qa/verdicts/goal-t051.md cycle1 C1 PASS; full C2-C4 HOLD. Independent verdict SHA256 D29F3B09CEB651B100CEEB761F9B62250039E0698B72F94B948643B94B44FD1E. Parent T-051 remains in_progress.
Priority tier: 3 (explicit user full-goal T-051)
Authority: D-170; root exclusive file lease.
Contract: qa/contracts/goal-t051.md C1 scoped foundation; C2-C4 whole-release gates remain NOT VERIFIED.
Packet: qa/packets/goal-t051.md
Changed paths: scripts/webinar/supervisor/install-ubuntu-supervisor.mjs; scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs; docs/webinar-release.md

Candidate SHA256:
- scripts/webinar/supervisor/install-ubuntu-supervisor.mjs: 0098172515A1BEA31A366BA0653C8896F0178F2EE27E214E6FCC3CBBD1FA710C
- scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs: 0F1448090A28BA3408528721EBF43FB4529F46CE1C6E731549F8BFA421B430B5
- docs/webinar-release.md: 1201D54D6BD044AA397D888BB41DB76C5816B99C39AC165E544EF72965435E68

Evidence: node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs -> exit0,10/10,0skips,TAP173.693ms,exec2.8246907s. Actual production setup renderer consumed in final test; OS/filesystem/service commands mocked. No actual host install/start/capture/provider/database operation. Independent checker /root/docker_checker, verdict qa/verdicts/goal-t051.md cycle0; root CPU lease required.

Scope only: complete Ubuntu preview/disabled-create/separate-activate interface; actual Ubuntu host/live/Windows restart/seven-day release remain incomplete. Historical Windows installer PASS unchanged.

Cycle 0 independent manager-shadow finding: installer checked file bytes but systemctl resolved another effective unit. Cycle 1 candidate verifies manager FragmentPath, drop-ins, load/reload state, environment and exact single executable before enable/start. Current candidate source changed; prior 10-test evidence is historical, not cycle1 PASS. Eleven-test serial rerun requested from broker /root/docker_checker.

Current cycle 1 maker evidence: node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 scripts/webinar/supervisor/install-ubuntu-supervisor.test.mjs -> exit0,11/11,0skips,TAP113.7327ms,tool6.2222385s. node qa/evidence/goal-t051checker-shadow.mjs -> exit0, unchanged recorded reproduction now refused:true, launched:null, no enable/start, stops at effective-manager show. Three candidate hashes above are current cycle1; earlier10-test cycle0 evidence remains historical. Independent cycle1 checker pending; full C2-C4 still NOT VERIFIED. No actual systemctl/host/capture/provider/database call.

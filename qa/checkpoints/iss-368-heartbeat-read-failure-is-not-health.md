# ISS-368 independent checkpoint cycle0
Policy-Version: proportional-verification/2026-10-05.3
Original checker: /root/iss368_acceptance
Verdict: qa/verdicts/iss-368-heartbeat-read-failure-is-not-health.md; CONTRACT_MISMATCH
Environment: Node v24.13.1 win32 x64; memory fixtures; ephemeral loopback HTTP; no production/data snapshot/deployment applicable
Checks: affected22/22, API-full248/248, API+9declared workspace typecheck scripts green,4criterion falsifications green/red/restored,ledger3/3conditions,senior static review no defect. Exact commands/counts/raw outcomes in verdict.
Gate: C9 structure exit1 (5/10stages fail,8dependency errors); historical C1/C8 unreconciled; C7literal pnpm launcher infrastructure abort.
Remaining: authoritative contract reconciliation and C9/C7 resolution. No feature-code failure demonstrated. No process remains.
Isolated reproduction script: C:/Users/Lenovo/AppData/Local/Temp/iss368-independent-falsify.cjs; copies C:/Users/Lenovo/AppData/Local/Temp/iss368-checker-fiLhkN
Reuse only if all applicable hashes/configs/environment match; all workspace source/config identities must be recomputed before reusing broad typechecks.
apps/api/src/routes/health.ts SHA256=9B1B4E0C658826DA92FDA97C6945E319A2CF9661E279298DBFB88C7EB870AC03
apps/api/src/routes/health.test.ts SHA256=0CABF50ECFA7C23D0AD930ED4470C2779A0A4E3B5B0FDC32EDE4A8AA024650DA
apps/api/src/health-probe.test.ts SHA256=EDD496C7224BEB5182A4B9382E10D3FE30F49BED46A194A18ACC73F64C5199AC
apps/api/src/testUtils.ts SHA256=A7930BC1837B86E834C0421D3AFFFF1BFFDFC468187E66100996B84AF58F36D4
apps/api/src/fixtures.ts SHA256=ED27B9E9E25F5E1FE4D3CF9F707399DF2CBC80D78CFBECB9F045374425E524E5
apps/api/tsconfig.json SHA256=24E2338CF4EC1AFB138844F72A77921B443A08BCC926B10E490B6E1E3448C3A3
tsconfig.base.json SHA256=5418B29B85E41BE846051AACC9083B5E1AFB2285F570A53AF0EFEE6CE15DF3EC
pnpm-lock.yaml SHA256=0D1B68F769D4E60CE4E20C1C761D28B904C276394DEE896AA0D7626AEAAE7D87
structure.config.json SHA256=B73C34327EDE280A4FBD6E76F39B0CE5EF3BD68288812767FD2D366D5E5CE98D
.dependency-cruiser.cjs SHA256=2F6A0DC9900123595A286EF027BE863A414ACD30E99BA5DD1CE9568A466309EC
Metrics: start=2026-10-05T14:09:26Z end=2026-10-05T14:13:10Z wall_min=3.74 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-05.3

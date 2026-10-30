# Checkpoint B - iss394-api-acl-timeout-retry (cycle 0, complete, VERDICT PASS)
Evidence identity (coordinator B only):
- Candidate: branch iss394-api-acl-timeout-retry HEAD b714c5e5, base b3eabbee; private-acl.ts blob 53ac2c2320238228b2f8c0b836d49338de9296ee (= HEAD blob).
- Env: win32, node v24.13.1; copy via git archive under scratchpad b394/copy; node_modules junctioned from D:/KnowledgeBase (root, apps/api, packages/*); junctions removed, copy deleted. Main checkout lacks ajv/ajv-formats/pdfjs-dist (ISS-396): not needed by these tests, nothing RERUN-BLOCKED.
- Commands (cwd apps/api): `node --test --import tsx src/bot-privacy/private-acl.test.ts` -> pass 1; `src/bot-privacy/router.test.ts` -> pass 4; `src/source-intake/jobs/privacy.test.ts` -> pass 12, skip 2.
- Probe: scratchpad b394/probe.mts, 42 stub cases + 2 real spawnSync timeouts, BAD_COUNT=0. Mutation runner: b394/mut.mjs, m0 green, m1-m5 red, byte restore checked per mutation.
- Remaining: none. Resume 0 of 2.

# Checkpoint — t043-vectorless-proof-consumer (cycle 0, 2026-10-26, HEAD dae90045)

Evidence identity (current tree bytes, CRLF-normalised sha256; all match the manifest pins except the sync-session dependency):
- index-proof-consumer.ts 923e6604863f7bf3547f81b714bafc83f90b7c0f0838f570690f998f4dcb160c
- index-proof-consumer.test.mjs 4b51ef56b2c392a9df0ac02c7916b3662a6b24250e4611e66f07d26607a93db1
- index-proof-fixture.mjs 895e10bbc12653558e42f2967a2b44c101ca3b744761f97c5b603af2c4d56055
- scripts/webinar/index-proof.mjs 704aa4c9a2cc85b32bfe85155c9c8bc0400cff42ec34d3c3c3c98dca4919f06a (match)
- scripts/webinar/sync-session.mjs a9a680b8... (manifest pin 95F970F5...; changed by later commits from other lanes; the proof block the fixture extracts is intact)

Runtime node v24.13.1 with tsx, cwd packages/meeting-bot. Attribution: claude-sonnet-subagent (this checker).

| Check | Command / scope | Result |
|---|---|---|
| Consumer suite | `node --test --import tsx src/workspace/index-proof-consumer.test.mjs` (9 collected) | 9/9 pass |
| Identity suite | same runner, `src/workspace/index-proof-identity.test.mjs` (4) | 4/4 pass |
| Falsify C8 | scratch copy row8: drop the provenance-passed conjunct; green-before 9/9 in the copy | red: v4 attack table on `{}` (provenance undefined) |
| Falsify C9 | scratch copy row9: `version === 3 or 4` branch guard changed to `version === 3`; green-before 9/9 in the copy | red: v4 attack table (forged sourceHash) and stale-validation/foreign-session test |
| Differential probe v4 | qa/evidence/t043-vectorless-proof-consumer/probe-v4.test.mjs (run in a copy) | 4/4 pass |
| Differential probe v3 | qa/evidence/t043-vectorless-proof-consumer/probe-v3-legacy.test.mjs (run in a copy) | 4/4 pass |

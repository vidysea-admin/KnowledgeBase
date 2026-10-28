# Checkpoint B — t043-vectorless-proof-consumer (coordinator B, cycle 0)
Evidence identity (all independent, own runs, 2026-10-26):
- cmd: node --test --import tsx src/workspace/index-proof-consumer.test.mjs, cwd packages/meeting-bot, node v24.13.1, collected 9 -> 9 pass.
- code (LF sha256 prefix): consumer.ts 923e6604863f · consumer.test.mjs 4b51ef56b2c3 · fixture 895e10bbc126 · index-proof.mjs 704aa4c9a2cc · sync-session.mjs a9a680b884be (differs from manifest pin) ; raw working-tree sha256 consumer.ts 0f81caa7...
- copy: scratchpad b43 (junctioned node_modules), 13/13 green before mutants m1-m4; m1,m2,m3 red, m4 survived.
- probes: probe-b.test.mjs (3/3 pass) in the copy only.
- Lock/deps: none changed; dependency lock not inspected. No data snapshot, no live service.
- result: PASS. Remaining: none.

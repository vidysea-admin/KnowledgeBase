Attribution: coordinator A (claude-sonnet-subagent), own runs only.

| Check | Command / scope | Result |
|---|---|---|
| unit+http | `node --test --import tsx src/whatsapp/links/{service,router,notice}.test.ts` (apps/api, git-archive copy of 8ca1dcc5) | 27 pass, 0 fail |
| mounted surface | `mounted-routes.test.ts server.test.ts user-accounts/admin-router.test.ts` | 37 pass |
| tsc | `tsc --noEmit -p apps/api/tsconfig.json` | exit 0 |
| lint:structure | `node scripts/lint-loc.mjs --all` | api and packages clean; dependencies stage shows 402 apps/web-only violations (copy has no web node_modules) |
| real Mongo | links.mongo.test.ts unmodified, local replica set 127.0.0.1:27555 | FAIL at migration guard (P1) |
| real Mongo | same with applyWhatsappLinks (copy only) | PASS |
| real Mongo probe | events, bind, expiry, ensureOwner once, no qr in rows (copy only, not committed) | all as expected |
| falsification | 10 mutants (D-020, HEAD-fidelity True each) | 7 killed, 3 survived (P2, P3, builder W5-7 equivalent) |

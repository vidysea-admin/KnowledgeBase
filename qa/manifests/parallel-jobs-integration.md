# Parallel jobs integration

Task: T-057; tier: 3 roadmap; mode: NORMAL, root-approved.
Status: checked-PASS
Fix cycle: 0

Scope: provider audit jobs only, dedicated jobs scope. Root reserves external API server/production ownership pending migration-chat freeze ACK. No server/production edits before root release. fixtures.ts stays untouched at300/300.

Frozen leaves checked against maker manifests: DB accessor bd5c7e1bc5528022074a6c30b7111f21ffea1e086ebdb2de9718da6d97f880a2; API router6c337958b7700638403e77d7006d4fd24d0b3393d9b81276cd58049d7d638131/store d28f40b17eddf581af62e7c973d91417571dc5b28ceb429dfc1e5658021fe03a; Web client5565e99ec7da536249509e28053e8fb5c2bdf32a70be37b0a36eda707a93ab2b/page ed15ee937652e376fb76a7c2e157e84a49e6ec57ea76afe2734bcdde155247e1. No leaf edits by integrator.

Safe glue applied with exact preimage hash/context checks: DB barrel named jobs/listJobs exports; App /jobs route; sidebar Provider jobs; Settings jobs permission unchecked by default. Existing Settings tests extended for explicit scope-only submission and actual App/sidebar->typed HTTP client->Jobs page.

API integration plan pending release: optional jobs dependency preserves existing fixtures without claiming empty healthy ledger; absent dependency explicitly unavailable503. Actual production injects createMongoJobsReadDeps. New jobs/fixture-store.test.ts may test real createServer auth/scope/tenant/DB projection and lazy real production binding. No helper/schema/frozen changes, key minting, DB/provider/browser/service/commit/push/full-suite actions.

Evidence: not yet run. Building; no checker PASS/T-057 completion claim.

## Safe glue verification

Focused command: bundled node bounded spawnSync(timeout60000) of apps/web/node_modules/vitest/vitest.mjs run src/pages/SettingsPage.test.tsx --maxWorkers=1 --minWorkers=1 --pool=threads from apps/web. Initial sandbox spawn EPERM before assertions; exact approved escalation final: 1 file passed,6 tests passed,0 failed,terminal exit0,6.41s runner duration. Two added regressions prove jobs unchecked by default and submitted only on explicit choice; actual App/sidebar navigation->real typed client->Jobs page with fixture HTTP-shaped data. No browser/server/DB/provider action.

Bundled node bounded spawnSync(timeout60000 each) node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json then packages/db/tsconfig.json: both exit0/no diagnostics. No API composed types/tests yet because server/production ownership release pending.

Exact current source hashes/budgets before API release:

```json
{
  "packages/db/src/index.ts": {
    "sha256": "f5797ab0860b99de1364c5e68de002b406d19133f07a0104469fbceb2803687b",
    "nonblankLines": 26
  },
  "apps/web/src/App.tsx": {
    "sha256": "1aabc8ec568eb83972ac995aafd2cecc56de2ec0b2bff7cb18e7d7467636eefd",
    "nonblankLines": 45
  },
  "apps/web/src/layout/NavSidebar.tsx": {
    "sha256": "8adce878ee3d1998df8cc9e530af2363519781b708b1d5391c408eef563349b6",
    "nonblankLines": 45
  },
  "apps/web/src/pages/SettingsPage.tsx": {
    "sha256": "7ae43f545697316d1f50ef16aad5f04a39b4c9a7a3ec1835381805fe059b290b",
    "nonblankLines": 99
  },
  "apps/web/src/pages/SettingsPage.test.tsx": {
    "sha256": "b3864075f01f3a1d1da68057330bee20c4600e49ad29316a6bbe9be4ed293c16",
    "nonblankLines": 91
  },
  "apps/api/src/jobs/fixture-store.ts": {
    "sha256": "6296490e14cd956ecf1779285046ef42d3d80ff77035848973917023119e129c",
    "nonblankLines": 5
  },
  "apps/api/src/jobs/fixture-store.test.ts": {
    "sha256": "c9762c58aa924cfb0f9de421b42c7c310debae9750975dbbdcfd8b238767ff3e",
    "nonblankLines": 72
  },
  "apps/api/src/server.ts": {
    "sha256": "2a77e71ec04e6b6c68c3b0b082e27ba19111a8a9d4827c7cd4d6e9d4a035211e",
    "nonblankLines": 96
  },
  "apps/api/src/production.ts": {
    "sha256": "7e155585e7096eec5973027af1a15b61265fee9a88a57d9255f4b215863cc365",
    "nonblankLines": 234
  },
  "apps/api/src/fixtures.ts": {
    "sha256": "a99dd8a2c9abf1864d9af6f26741e1d890da46fb9a4a1c0dbb2e0d762781639f",
    "nonblankLines": 300
  }
}
```

## Final API composition — root release and cycle0 evidence

Root explicitly released API integration after migration handoff C:/Users/product/Documents/Codex/2026-10-09/what-is-the-current-update-and/outputs/knowledgebase-api-integration-seam.json and exact stable preimages. Targeted server+4 / production+2 line insertions were applied only after both pins matched. Removing those exact insertions in memory recovers BOTH exact original preimage hashes, proving accepted Ask edits retained. No source/runtime accepted pins refreshed and no runtime restart. First inverse-check harness assumed CRLF suffix for new production lines despite existing LF suffixes and refused before manifest write; corrected in-memory removal of exact added prefix/text proves byte preservation. Bound source was never modified by that harness.

Actual command: bundled-node bounded spawnSync(timeout60000) process.execPath --test --import tsx apps/api/src/jobs/fixture-store.test.ts. First sandbox test worker spawn EPERM before assertions; exact escalation approved localfakeDB/ephemeralloopback scope. Final current-source rerun: actual createServer auth/accessor->adapter->HTTP tenant/metadata/truncation pass; missing-dep503 pass; lazyproduction noDBconstruction pass; tests3/pass3/fail0/exit0; duration2205.3117ms.

Actual command: bundled-node bounded spawnSync(timeout60000) node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json. Initial new integration test response annotation yielded TS2571 unknown, corrected only owned fixture-store.test.ts; reran current3/3 above then final API typecheck exit0/no diagnostics. Prior web/DB typechecks0 and six Settings/App tests0 retained; their sources unchanged since passing runs.

Final git diff --check on seven modified glue paths: no whitespace errors/exit0; Git line-ending informational warning for preexisting LF production noted.11 frozen leaf/fixtures pins match exactly. New API jobs folder6/30files; fixtures300/300unchanged; server100/300, production236/300. API src/routes directory baseline overages unchanged by subdir additions. This requests independent scoped review against qa/contracts/parallel-jobs-read.md, not a maker PASS. No full-suite/liveDB/provider/browser/service/keymint/globalcontract/ledger/goal/push action; runtime remains on older source until owner-reviewed restart.

Final exact integration source pins:

```json
{
  "packages/db/src/index.ts": {
    "sha256": "f5797ab0860b99de1364c5e68de002b406d19133f07a0104469fbceb2803687b",
    "nonblankLines": 26
  },
  "apps/api/src/server.ts": {
    "sha256": "fa4129a968966c6cceb1c9adc6443f42bc9f584ac7cb2feb698c07da2218bef5",
    "nonblankLines": 100
  },
  "apps/api/src/production.ts": {
    "sha256": "ff65725758a0ed858dda585f8ef469ffb32bf2a7afea375d0e650396b448ac1e",
    "nonblankLines": 236
  },
  "apps/web/src/App.tsx": {
    "sha256": "1aabc8ec568eb83972ac995aafd2cecc56de2ec0b2bff7cb18e7d7467636eefd",
    "nonblankLines": 45
  },
  "apps/web/src/layout/NavSidebar.tsx": {
    "sha256": "8adce878ee3d1998df8cc9e530af2363519781b708b1d5391c408eef563349b6",
    "nonblankLines": 45
  },
  "apps/web/src/pages/SettingsPage.tsx": {
    "sha256": "7ae43f545697316d1f50ef16aad5f04a39b4c9a7a3ec1835381805fe059b290b",
    "nonblankLines": 99
  },
  "apps/web/src/pages/SettingsPage.test.tsx": {
    "sha256": "b3864075f01f3a1d1da68057330bee20c4600e49ad29316a6bbe9be4ed293c16",
    "nonblankLines": 91
  },
  "apps/api/src/jobs/fixture-store.ts": {
    "sha256": "6296490e14cd956ecf1779285046ef42d3d80ff77035848973917023119e129c",
    "nonblankLines": 5
  },
  "apps/api/src/jobs/fixture-store.test.ts": {
    "sha256": "72259ead01eb6676458792708d5e485011ad11c88a0d5e007c59a5fb4c18120e",
    "nonblankLines": 74
  }
}
```


## Matching cycle0 close-out

Independent qa/verdicts/parallel-jobs-integration.md Cycle checked0 PASS accepted after rechecking exact checkerJSON SHA2568601a49f981bbcceb40590951323ddb25a830facfe3642cfee05a8dc5cb2218a, all15 current shared/leafsource pins and five leaf-test pins, and matching checked-PASS DB0/API1/Web1 manifests/verdicts. Independent3API+6Web tests and API/DB/Web typechecks0 accepted. Exact six API insertions removed in memory recover accepted Ask/server baseline hashes. Only this manifest changed during close-out. Scoped local integration only; no live/runtime/T-057/release acceptance, source accepted-pin refresh, staging, DB/provider/browser/restart/publication action.

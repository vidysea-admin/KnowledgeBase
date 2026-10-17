# T-013 checker packet — cycle 0 (ready-for-check source candidate)

Repository: `C:/Users/product/Desktop/KnowledgeBase`.
Maker skill: `skills/maker/SKILL.md`; checker contract: `qa/contracts/goal-t013.md` F1–F9.
Manifest: `qa/manifests/goal-t013.md`; intended checker verdict: `qa/verdicts/goal-t013.md` (root-assigned final handshake slug).

Latest source-candidate handshake: ready-for-check, cycle 0. Central actual fixture receipt is 21/21, exit0, 8.1585565s with unchanged code/dependency pins (details below). Full-parent F1–F9 acceptance remains unchanged: actual microphone/speech/GPU/provider/API/source-navigation evidence is absent, and coherent integrated compiler/build gates remain open. Earlier building/queued snapshots below are historical pin/readiness records, not current execution claims.

## Change map

- `CounsellorPage.tsx`: authenticated existing `ask(apiKey, query)` is the only answer request. No request contains tenant selection. `owner` + `generation` + `mounted` protect response and recognition callbacks; auth session identity uses both key and sessionVersion. Rendered answer/query/error ownership guards suppress stale private data.
- `voice.ts`: Recognition is started only by microphone button; final text delivered once. Stop removes callbacks, aborts recognition, cancels browser synthesis and invalidates captured callbacks. Speaking lifecycle follows actual utterance start/end. No usable language voice or recognition capability causes explicit error.
- `provenance.ts`: session/quote validation preserves source fields, rejects malformed ranges; spokenAnswer includes weak-coverage qualification.
- `Avatar.tsx`: vertex/fragment shader, triangulated sphere mesh, depth test and ellipsoid transforms render an actual locally shaded 3D head and shoulders. Jaw animation is bound to speaking; reduced motion and context loss handled.
- Owned focused tests: voice lifecycle/start-error/synthesis-error, authenticated consumer/citations/conversation/auth race/cancel/rendered lifecycle, malformed provenance, Avatar missing/blocked context and null GPU allocation cleanup. These tests use doubles and cannot prove actual devices/provider/rendering.

## Caller / consumer

Existing `apps/web/src/api/ask.ts` → `api/client.ts` → configured API `POST /ask`; response shape `api/types.ts`. Existing `AuthContext.tsx` owns credential handling and increments sessionVersion on explicit login/logout. `safe-url.ts` protects external citations. Internal source links route to existing sessions/SessionDetailPage.tsx and `#turn-...` anchors.

Root/docker_runtime reports central protected `/counsellor` route and AI counsellor navigation mounted; attributed diff-check exit0. At report time App SHA256 `57B67EFDA4D4B092E080632D87FAF3EF97BF2B905DD4DEF183CC1691E4BB0B78`, Nav SHA256 `9CC8B35294E61913D6E653256C360D61824A3C15FAF6DF7E66DBAAABADD11550`. Shared composition continues receiving sibling integrations, so these are interim hashes; final pins plus independently checked mounted behavior remain required.

Security flags: auth YES (existing auth consumer + response isolation); tenancy YES (existing server-derived tenancy preserved); credential handling YES (existing API key only within existing mechanism, not logged/spoken); data writes NO new persistence (existing /ask audit side effects preserved). Browser recognition may transmit audio externally via its native service, explicitly disclosed before start. No microphone/provider calls have run.

## Planned focused execution (requires coordinator CPU lease)

From apps/web: `pnpm exec vitest run src/pages/counsellor/CounsellorPage.test.tsx src/pages/counsellor/voice.test.ts src/pages/counsellor/provenance.test.ts src/pages/counsellor/Avatar.test.tsx --maxWorkers=1 --minWorkers=1`, outer bound 120 seconds. Root owns one coherent central types/build run, integrated structure checks and `contracts/verify_contracts.py` attribution; maker does not run local/full-repo tsc. Runtime pnpm/node supplied by repository environment; no new dependencies. No suite/browser allowed until allocated.

Root temporarily suspended work for roadmap review, then explicitly resumed all forty source leases. T-013 reports zero running handles. All historical CPU grants are revoked; sole broker `/root/docker_checker` must provide a fresh grant after runtime dependencies/codegen and T-051. Current owned source hashes were re-read and match the table below. Full voice/WebGL/provider/source-navigation live gates are retained; resume does not authorize browser/provider/database/external execution.

Actual F8 still needs dated mounted-browser microphone query, transmitted authenticated `/ask`, established provider/model response, synthesis observation/audio and actual 3D render + authorized source session/turn downstream readback. Existing Ask screenshots cannot prove the new client. Missing execution/device permission is HOLD, not inferred PASS.

## Candidate byte identity

Owned source candidates below are all new files (no base existed). Central fixture receipt below matches these source and shared-composition/dependency pins. Final live/compiler acceptance remains pending.

| File (under apps/web/src/pages/counsellor/) | SHA256 |
|---|---|
| Avatar.test.tsx | B86152EE65185EFB3C369FDE08FAFE4E3328132B7356D62759F45DFD771D418B |
| Avatar.tsx | 1502F4F5EA97202A76D5581B43F9399F445EC535E945563DDDEB4362B9FD5BC3 |
| CounsellorPage.test.tsx | 5A7651C42274062970B08629DD632B660ABEBA5D97CDB74DABB55AC2F58396FF |
| CounsellorPage.tsx | 8522876933DC1098C8C030F0DE94C9D5C7694D2010C92E108FC8E2CBECDEE3F0 |
| provenance.test.ts | 22520357EB2CB49608E7A55959C43185F7DEEFB0C8E736956A19EC2081A35B34 |
| provenance.ts | 4C007F88788816B2634364BBB32F68F801891AE29E89C26266F1B1259B45C529 |
| voice.test.ts | A63FA643FEA20766E245366011483ADC99E0D14C78DDAFE38751EF7F682C4484 |
| voice.ts | 29A3F92B465F51D48F855A547B3C04451FD6981AB4545CE8800C2CD767955844 |

## Attributed reusable frozen-validator evidence

Root/docker_checker assigned `qa/evidence/goal-t051checker-validator.json` (SHA256 `53EF35F5204AEA32DB0A4701DD60EBEEE10CBBF24AE5AF9287F16EB7EED0D6DB`). Command `python contracts/verify_contracts.py`, exit0, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`; executed within 2026-10-14T18:39:31.7184876Z–18:39:33.1459082Z batch (1.4327147s combined; individual duration unknown). Maker independently compared current validator SHA256 `1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3` and registry `D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940`: both match the receipt. This reusable vacuous validator result does not prove any voice/client/live parent criterion. T-013 focused execution remains queued with docker_checker.

## Resume dependency snapshot (not final readiness)

Maker read the current source mounting: `App.tsx` wraps routes in `AuthProvider` → `LoginGate` → `BrowserRouter` → `AppShell`, includes `/counsellor` and imports actual `CounsellorPage`; `NavSidebar.tsx` exposes AI counsellor. Downstream `SessionDetailPage.tsx` decodes the `#turn-` suffix (lines 94–95), finds the cited row by real turn ID, and reports an unresolved passage rather than inventing one (line 180). This is source readback only, not a running-browser observation.

| Path | Current SHA256 |
|---|---|
| apps/web/src/App.tsx | 57B67EFDA4D4B092E080632D87FAF3EF97BF2B905DD4DEF183CC1691E4BB0B78 |
| apps/web/src/layout/NavSidebar.tsx | 9CC8B35294E61913D6E653256C360D61824A3C15FAF6DF7E66DBAAABADD11550 |
| apps/web/src/api/ask.ts | B13C5D164CA261AB0C141580C1A64C9BAD2BA79B30BD316CB1D9A0F6E971416D |
| apps/web/src/api/client.ts | 854F0BC3301E097B83E2CAEFCD01A8EAE19530E3A6390ADD4DD6C9CFAF429802 |
| apps/web/src/api/types.ts | 0C988730BD44A86A6674D8B92C8DB642988DB8A1BC54FC0DB0E46DACA7242547 |
| apps/web/src/auth/AuthContext.tsx | 196181DC165208A35CB23C9D7F9B7AE5E293A7EB40135A7CD90686DDB4EC3E1C |
| apps/web/src/safe-url.ts | 607FCAF56D942752BD01A1C969457D97BDA5F7B5560DD83C8AB4161F3F2875C9 |
| apps/web/src/pages/sessions/SessionDetailPage.tsx | EA92F5B3684C956A4378D61B159C405ADA02F5B070F0734EEBF8E8847BAFE9A6 |
| docs/counsellor-client.md | 9ABAA1CB1563D2326D5037BAEBDABC37F3C5C19BD5F57AF75F662DAB9C3686EC |
| qa/contracts/goal-t013.md | 0C89198CC6DE12462C8D352D94911CF0661747AE78C80F1A6F560581CC8F540C |
| qa/manifests/goal-t013.md (building / cycle 0) | 5F8E37357653EBB359E215B2272E47EE85F9489D2FCF567D63B8068DF97AD645 |

Re-pin the final manifest after its status/evidence update and all shared composition/dependency bytes after the central build. This table is an explicit resume snapshot, not final checked-PASS identity.

## Latest full-forty resume dependency readback

The user temporarily requested the list/roadmap again; root then explicitly resumed the full forty-task source work. No running T-013 handle was present, and no command/test/live action was continued through that pause. A fresh four-file bounded grant was requested from sole broker docker_checker; historical grants remain invalid.

All eight owned source/test hashes still match the candidate table. Existing ask/client/types/AuthContext/safe-url hashes above are unchanged. Central source updates changed only these inspected dependency snapshots:

| Path | Latest SHA256 |
|---|---|
| apps/web/src/App.tsx | D11B6566F5988E65226AF4FDB198BBFB5D995A7D0D538586C58640D41E58F27D |
| apps/web/src/layout/NavSidebar.tsx | 39319E1CE324EC1110EE101528C08A56F88EB8D46032074CB54D69FBD4CA23F6 |
| apps/web/src/pages/sessions/SessionDetailPage.tsx | F4E2DB33A8E15A3DA50D9E07E62FF17095A002F124482AD41CD79955074536FA |

Readback confirms the actual CounsellorPage remains at `/counsellor` inside LoginGate, with AI counsellor navigation. SessionDetail still decodes the turn suffix (now lines 96–97), finds the real cited row, scrolls/seeks it when available, and reports an absent passage honestly (now line 182). These observations establish source compatibility only. Actual affected/downstream receipts, final composition pins and full microphone/speech/GPU/provider/citation live proof remain pending; manifest stays building.

## Central four-file fixture request / route-freeze pins

Broker requested an exact current map while schema/generation execution owns the CPU. `qa/evidence/t013-counsellor-client/four-file-current-pins.json` supplies command/cwd/120-second outer bound/single-worker specification plus all eight unchanged owned files, direct dependencies, test setup and QA/document identity. The latest centrally frozen route snapshots are App `EEF7AF89EB3C3C261678AED701F309D9399E0F77921B73E3B9CE97B1055571EA`, Nav `39319E1CE324EC1110EE101528C08A56F88EB8D46032074CB54D69FBD4CA23F6`, SessionDetail `16BD213AD66F6C76B2555CCE655FA7E2A880F0BE5B170E2022AEB41DB2620487`. These were independently re-read; other listed dependencies and all eight owned source/test files remain unchanged. No test has run and no local CPU grant exists. This machine-readable request is not an execution receipt; actual Avatar failure probes remain part of the central four-file fixture suite, with live success/device evidence separate.

## Actual central fixture receipt (supersedes historical queued execution state)

Broker supplied `qa/evidence/goal-t051checker-broker-t013-web.json`, SHA256 `0164AA3C6A136384B219A27AB4A9B44D769DF6B466F098561C719ABC4E163FFC`. Maker read the receipt and both actual raw logs; no duplicate test/typecheck/validator command was run. Exact command was the bundled executable `C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` with arguments `node_modules/vitest/vitest.mjs run src/pages/counsellor/CounsellorPage.test.tsx src/pages/counsellor/voice.test.ts src/pages/counsellor/provenance.test.ts src/pages/counsellor/Avatar.test.tsx --maxWorkers=1 --minWorkers=1`, cwd `C:/Users/product/Desktop/KnowledgeBase/apps/web`, environment overrides `{}`, outer timeout120000ms.

Started `2026-10-14T21:52:08.823Z`, completed `2026-10-14T21:52:16.987Z`; elapsed8158.5565ms; exit0, signal/error null. Actual stdout: `Test Files 4 passed (4)`; `Tests 21 passed (21)`. Counts: CounsellorPage9, voice8, actual Avatar3, provenance1. Vitest internal duration7.15s is separate from outer8.1585565s. Stderr contains two existing React Router v7 future-flag warnings, not failed assertions.

- stdout `qa/evidence/goal-t051checker-broker-t013-web.stdout.txt` SHA256 `F43513B50677CA389381A5D970A38E1BB64D06146F21F9ABF3FF811BCD3A2F0E`.
- stderr `qa/evidence/goal-t051checker-broker-t013-web.stderr.txt` SHA256 `898A80F32B7916801406C56F96D7A385FE420E5CDF72DD6376A2A0EBFAC39622`.
- Original request/pin snapshot `qa/evidence/t013-counsellor-client/four-file-current-pins.json` SHA256 `1E29A46FDAE8EA6D441766D5E4B7B6A13A98D7CF8DF3C844206DB1EC89EE000F` remains unchanged, preserving its historical not-run/building state. Receipt pre/post maps match all 21 entries, including eight code/test files, App/Nav/SessionDetail, immediate API/auth/safe-url/type dependencies, test configuration/setup, docs, contract and pre-update building manifest. `hashesUnchanged: true`.

Fixture scope: typed/microphone-callback query consumption uses existing Ask seam; response renders separate safe citations; conversation readback preserves coverage; auth/cancel/unmount callbacks retire; voice-host errors remain honest. The actual Avatar component, independently imported in Avatar.test.tsx, passed missing/throwing context and null-resource-cleanup probes. Its page-test double does not establish GPU rendering; neither fixture microphone callbacks nor host synthesis spies establish real audio/device/provider behavior.

Current coherent compiler gate is explicitly red: 39 API / 5 web errors, per central broker. Coordinator/runtime reported no owned T-013 diagnostic; maker made no compiler source fix, and preserved original red evidence. This cannot be reported as a type/build PASS. Root owns the next coherent run and its exact attribution.

Current manifest is now ready-for-check/cycle0 for source-candidate review and attributed fixture evidence, with full-parent criteria unchanged. Its metadata changed after the fixture receipt; the earlier manifest hash describes the preserved pre-execution building state. Final ready manifest/packet metadata hashes are supplied to checker separately. Source/doc/contract/runtime pins remain the receipt's checked bytes until a reported change; actual GPU/mic/speech/provider/API/citation proof and integrated types/build acceptance remain open.

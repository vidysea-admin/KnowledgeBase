# Migration alias repair — plan review

Verdict: APPROVED
Scope: Source-only plan approval; implementation and runtime verification remain pending.

Both supplied source hashes match the current files.

Evidence:
- config/migrate-mongo-config.cjs:14-30 currently lets lkb_prod enter the ordinary target return without opt-in. Adding lower === "lkb_prod" to the protected-name refusal at lines 25-26 closes that path across existing trim/case normalization.
- The production branch at lines 20-23 already refuses every noncanonical lkb target. Leaving it unchanged keeps lkb_prod refused with either opt-in and adds no production capability. Correcting the equivalence comment at lines 8-9 makes this deliberate migration/helper distinction explicit.
- docs/DECISIONS.md:2478-2489 (D-186) authorizes deployed-app lkb_prod writes, preserves local/script isolation, and reserves guard changes for a later decision. D-196 at lines 2589-2595 authorizes shared-helper changes while explicitly leaving migration exposure outside its scope. Neither substitutes for the separate decision required by this plan.
- scripts/lib/dbguard2.test.mjs:18-21 uses a fake URL, empty temporary cwd and restricted child environment; lines 64-101 load configuration and retain existing refusal/positive controls. Extending its existing migration refusal matrix with lkb_prod plus whitespace/case variants under no opt-in, argv opt-in and env opt-in is sufficient for this bounded deny-only change. Requiring this config performs no connection.

Implementation prerequisites (must remain satisfied):
1. Append the separate migration-scope DECISIONS entry through scripts/append_decision.ps1 before source edits; preserve D-186 app authority and all production execution gates.
2. Wait for the current dbguard2.test.mjs owner to finish and relinquish ownership before editing its migration section.
3. Limit edits to the two named existing files and named functions/tests; retain canonical lkb positive cases, isolated/staging controls and the existing production branch.
4. Run local affected checks after implementation and obtain independent final review with the shared alias implementation. This verdict is not a completion PASS or permission to execute production migrations.

No code edits, test execution, DB access, network access or agent dispatch performed. No blocked review restarted.

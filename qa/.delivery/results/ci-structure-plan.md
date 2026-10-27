**APPROVED — plan approval only. Findings: none.**

I independently constructed the proposed merge **in memory**, without editing source.

| Check | Evidence |
|---|---|
| Input identity | Both test-file hashes match the handoff; all four target/config files match base `f6bf0597` after newline normalization |
| Body preservation | Original body retained; fix1 lines 12–149 retained verbatim after newline normalization |
| Test preservation | **29/29 declaration sites**, **110/110 assertion sites**, every title and the three-code loop preserved |
| Expected registered tests | **31**, derived statically; not runtime-confirmed |
| LOC | **399/400**: `266 + 139 − 8 duplicate import lines + 2 braces` |
| Directory count | Currently **31/30**; removing only the tracked superseded test produces **30/30** |
| Syntax | `node --input-type=module --check`, merged text through stdin: **exit 0**, empty stderr |
| CI reachability | CI runs `pnpm test:lint`; appending the retained filename preserves every existing entry |

The lexical block preserves separate helper bindings, CRLF/LF fixture defaults, and temporary-directory prefixes. Real-ledger access remains read-only; append, cleanup and Windows ACL operations retain their existing temporary targets. The `ISS-298: 5/5` reproduction matches the recorded issue’s wrong-citation and allocation-window cases and remains intact.

Approved implementation instruments:

1. Modify only the two existing import lines, append the preserved comments/block, and append the canonical filename to `package.json`’s `test:lint`.
2. Before deletion, compare bodies, titles, assertion expressions and generated cases against the pinned originals; run the transferred suite under a **180-second outer timeout**:
   `node --test --test-timeout=60000 scripts/qa/ledger-alloc.test.mjs`
3. After successful transfer verification, remove **only** tracked `scripts/qa/ledger-alloc-fix1.test.mjs`.
4. Recount using the existing checker definitions: **399/400 lines, 30/30 files**, unchanged budgets. Preserve the Windows-only skip and cleanup.

No source edits, test execution, live calls, commits or pushes were performed. Runtime PASS and final integration/CI evidence remain outstanding.
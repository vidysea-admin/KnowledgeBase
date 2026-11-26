# KB Ask publisher release review

**Cycle checked:** 3
**Policy-Version:** proportional-verification/2026-11-22.19
**Commit:** 13a6c546
**Managed review receipt:** qa/.delivery/40bb68c94f6898eb68fa078665b13b40a877676a401d46d734bd2d0ef80ff25a.log

**PASS — cycle 3, C2 alpha-zero text-color repair at `13a6c546`.**

The independent fixture withheld all 16 zero-alpha cases across `color` and `-webkit-text-fill-color`, including numeric and percentage RGB/RGBA and short and long hex. Fresh discovery returned no source. Direct reads and history returned `stale` with a blank answer and zero citations. All 12 positive-control checks returned the answer and citation, including after restoring a visible color.

The diff from `f445c61a` contains exactly the four designated files. Their hashes match the handoff, `git diff --check` passed, and the worktree is clean. The production manifest, lockfile, and installed parser all agree on `@asamuzakjp/css-color` version `3.2.0`. [Parser call](/D:/KnowledgeBase/.worktrees/kb-password-min8/apps/api/src/answer-policy/answer-evidence.ts:67)

| Command | Actual outcome |
|---|---|
| `node --import tsx --test --test-name-pattern='^zero-alpha text colors' apps/api/src/answer-policy/answer-persistence.test.ts` | 1 passed |
| `node --import tsx --input-type=module -` with the independent fixture on stdin | 16 zero-alpha cases withheld, 12 positive-control checks allowed, 112 stylesheet reads |
| `node --import tsx --test apps/api/src/answer-policy/answer-persistence.test.ts` with `LKB_TEST_LIVE_NASA=0` | 16 passed, live NASA test skipped |
| `node --import tsx --test --test-skip-pattern='^resolveAll (returns\|rejects)' packages/ingest/src/sources/node-transport.test.ts` | 9 passed, including fresh connections for successive pinned reads |

## Earlier independent reports

# KB Ask grounding release review

**Cycle checked:** 2
**Policy-Version:** proportional-verification/2026-11-22.19
**Commit:** f445c61a
**Managed review receipt:** qa/.delivery/ada88b707d5df0b9c81edc18901878d14dd329d3f058300cb62f66a992e49b03.log

**FAIL — C2 publisher evidence, fix cycle 2, at `f445c61a`.** Both cycle 1 fixtures passed. Static review found a remaining gap in linked stylesheet visibility. The color check recognizes the `transparent` keyword but ignores colors whose alpha is zero. A paragraph hidden that way can still enter the citation candidates used for fresh answers and history. [Visibility check](D:/KnowledgeBase/.worktrees/kb-password-min8/apps/api/src/answer-policy/answer-evidence.ts:62)

- **Citation freshness passed the offline fixture.** The direct read and history each returned one citation while the publisher evidence matched. Both returned `stale` with zero citations and a blank answer when the document root was hidden, the linked sheet hid the paragraph or became unavailable, or the final URL, title, or quotation changed.
- **Pinned transport passed.** Two consecutive requests to a trusted loopback HTTPS fixture returned `statuses=200,200 unique TLS sockets=2`.
- **Refusal redaction and provider confinement passed** with stubbed providers.

Commands and actual results from `.worktrees/kb-password-min8` on Node `v24.13.1`:

```text
node --import tsx --test --test-timeout=15000 --test-reporter=spec apps/api/src/answer-policy/answer-persistence.test.ts apps/api/src/answer-policy/fast/answer-fast.test.ts apps/api/src/ask/ask-web-fallback.test.ts
tests 49, pass 48, fail 0, skipped 1

node --import tsx --test --test-timeout=9000 --test-reporter=spec --test-skip-pattern='^resolveAll (returns|rejects)' packages/ingest/src/sources/node-transport.test.ts
tests 9, pass 9, fail 0

node --import tsx --test --test-timeout=15000 --test-reporter=spec apps/api/src/answer-policy/answer-workflow.test.ts
tests 18, pass 18, fail 0
```

The policy check reported `proportional-verification/2026-11-22.19 targets=2 drift=0`, and both protocol hashes matched the manifest. The live publisher test was skipped, and two real DNS tests were excluded to keep the run offline. No files were changed.

## Earlier independent report

# KB Ask grounding release review

**Cycle checked:** 1
**Policy-Version:** proportional-verification/2026-11-22.19
**Commit:** 6ce91811
**Managed review receipt:** qa/.delivery/b222526439b1173f83e8931c00a71a3dbe8fa9e26a5825685598dc808691ba53.log

**FAIL — C2 publisher evidence, cycle 1, at `6ce91811`** in `.worktrees/kb-password-min8`.

- The reader checks inline styles and starts traversal at `<body>`. It misses linked stylesheets and visibility rules on `<html>`, so fresh publication and history can accept text whose visibility was never established. Check visibility from the document root and withhold evidence when stylesheet visibility cannot be verified. [Publisher reader](D:/KnowledgeBase/.worktrees/kb-password-min8/apps/api/src/answer-policy/answer-evidence.ts:96)
- The transport supplies a pinned DNS lookup but uses Node’s default HTTPS agent. Node 24.13.1 reported keep-alive enabled and identical pool keys for different lookup callbacks, so a reused socket can skip the current pin. Disable socket reuse for guarded requests or key the pool by the vetted address. [Transport](D:/KnowledgeBase/.worktrees/kb-password-min8/packages/ingest/src/sources/node-transport.ts:76)

`node --import tsx --test apps/api/src/answer-policy/answer-persistence.test.ts` passed **10/10**. A separate offline history fixture made five publisher reads and confirmed that changing either the title or the excerpt withheld the answer and citations. Production composition shares the verifier across Ask and championship reads. [Verifier](D:/KnowledgeBase/.worktrees/kb-password-min8/apps/api/src/composition/integrations/evidence-verifier.ts:10)

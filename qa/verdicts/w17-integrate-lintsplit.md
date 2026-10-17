# Verdict: w17-integrate-lintsplit

- **Verdict:** PASS
- **Status:** PASS
- **Cycle checked:** 1
- **Reviewed SHA:** 56f387784fe3b1f608a3e1cfcc9be553dd15cc0c (parent 56f38778~1)
- **Checker:** independent (Sonnet 5.5); token/time usage unmeasured (null)

## Diff review (own reading of `git show 56f38778`)
1. Hook equivalence: gating `committed && tileSuggest?.enabled === true && tileSpeakerSuggestEnabled()` (negated early return); same try/catch fallback `{suggested:0,inserted:null,reason:"failed"}`; same call args (tenantId, sessionId, turns, context, readCapture, db, {enabled:true}); call site still directly after the finishIndexAttempt/failIndexAttempt block; conditional-spread key `...(tileSpeakerSuggestions ? {...} : {})` untouched. Inferred type equals the dropped annotation.
2. Collapsed `suggestSpeakers === true ? await ... : undefined` ternary: identical condition, branches and argument list (formatting only).
3. derived-drafts.mjs: ROOT now `..,..,..` (scripts/eval/derived-drafts -> repo root); imports `../llm-eval.mjs`, `../extraction-review.mjs`, `../../../packages/ai/src/index.ts` all exist/resolve. Write path unchanged: safeOutPath confines to data/eval/derived-drafts, writeSidecar calls assertNoHumanGold before writeFileSync (flag wx). Test ROOT depth fixed likewise. Manifest edits are path-only.
4. No lint-loc, package.json, budget or config file in the commit's file list.

## Commands (exit codes captured)
- `node scripts/lint-loc.mjs --all`: rc 0, "OK (10 stages, 0 failed)"
- apps/api `node --test --import tsx session.test.ts session-tile-suggest.test.ts`: rc 0, 32/32 pass
- `DD_DATA_ROOT=C:\Users\product\Desktop\KnowledgeBase node --test --import tsx scripts/eval/derived-drafts/derived-drafts.test.mjs`: rc 0, 13/13 pass
- apps/api `tsc --noEmit -p tsconfig.json`: rc 0

## D-020 mutation
Removed `committed &&` from session-tile-suggest-hook.ts (per-mutation byte backup, trap INT/TERM/ERR, timeout 600). Killed: session-tile-suggest.test.ts rc 1, 5 pass / 1 fail, "enabled but index NOT committed (degraded claims): hook never runs, no key". Restored; cmp ok; `git -c core.autocrlf=true hash-object` = HEAD blob 7fc89a95bb1ec53a2085d21a5106c6828f0b1451; tracked tree clean.

## Limits
Full workspace suites not run (narrow-scope review). Evidence outputs in session scratchpad, not committed.

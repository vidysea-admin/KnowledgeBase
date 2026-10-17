# Verdict: t055-c6-safe-resource-links

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: 189ff6e158566c81f88ab7048df7a75f52fa3f11
Base SHA: a0391420
Scope: contract qa/contracts/goal-t055.md C6 (web side only). Parent T-055 stays open (P1/P2 gates).
Checker: independent, fresh context. Lane w17-t055c6, branch lane/w17-t055c6.

## Final hashes (git hash-object, after all checks and the mutation)
- apps/web/src/safe-url.ts 5b12dc790f3c5c3335ffa720901b374c546bf093 (equals HEAD blob)

## Diff review
safePublicResourceUrl = safeHttpUrl + refusal of username/password + C1 controls (U+0080-U+009F), returns {href, host}.
It replaces the two ad-hoc credential checks (knowledgeDirectoryModel.ts, knowledgeCatalogClient.ts). KnowledgeResourcesPage re-checks at render
(calls the sanitizer twice per row; cosmetic only). Both external `<a>` sites in the knowledge directory use target=_blank rel="noopener noreferrer".

## 1. Bypass probe (uncommitted, apps/web/src/__checker_probes_c6__/probe.test.ts, exit 0)
Refused (null): mixed-case JaVaScRiPt:, tab/newline/CR inside scheme, %6A-encoded javascript:, %68ttps://, nbsp / U+3000 prefix, nbsp / U+2028 suffix,
zero-width space inside scheme, C1 U+0085 in path, data:.
Allowed (all genuine http(s) per WHATWG; none is a script or credential vector):
- `http:\evil.example\x` and `https:/\evil.example/x`: accepted, host reported evil.example. The browser normalises `\` to `/`, so the host shown matches the host navigated to.
- `https://good.example\@evil.example/`: accepted, parsed host good.example (no userinfo, so not a credential trick).
- IDN: `https://münchen.de/` allowed, host reported as punycode xn--mnchen-3ya.de; punycode input allowed; Cyrillic homograph `аpple.com` allowed (host xn--pple-43d.com). No homograph defence exists and C6 does not require one. Note only.
- `https:///x` accepted with host "x" (WHATWG quirk); NBSP / zero-width space inside host or path accepted (not controls, not surrounding whitespace). Note only.

## 2. Render sites
grep of `href=` in apps/web/src (non-test): the two knowledge-directory sites use safePublicResourceUrl. Other external-link sites (AskPage, AnswerSources,
AnswerPolicySimulator, CounsellorPage, AgendaView, EventDetail) use safeHttpUrl, which still refuses unsafe schemes and controls. They do not refuse credentials and use rel="noreferrer".
They are outside the knowledge directory/resource scope of C6 and not changed here. NavSidebar hrefs are API_BASE_URL constants. No unsanitised resource/source href found.

## 3. Tests
vitest (timeout 600) on resourceLinks.test.tsx, KnowledgeDirectoryPage.test.tsx, knowledgeDirectoryModel.test.ts, safe-url.test.ts, catalog/ (3 files): exit 0, 7 files, 66/66 passed.
`tsc --noEmit -p apps/web/tsconfig.json`: exit 0. Receipts in the checker scratchpad (c6-vitest.out, c6-tsc.out).

## 4. Mutation (own)
Dropped the username/password check in safePublicResourceUrl (per-mutation byte backup, trap INT TERM ERR EXIT, timeout 300). Vitest exit 1, 6 tests failed
(sanitizer refuses user:pass@, user@, directory render, catalog render, knowledgeDirectoryModel inert-URL, knowledgeCatalogClient DTO). Restored; cmp clean; hash-object equals HEAD blob.

## 5. Lint baseline
lint-loc dependencies stage (dependency-cruise) in KnowledgeBase-lanes/w17-integrate: exit 0, "no dependency violations found (1889 modules)".
Same command in this lane: exit 129, 897 errors, all rule no-unresolvable-workspace-import (e.g. apps/api/... -> express), zero in any touched file.
Cause: node_modules is a junction to the main checkout. Confirmed as a lane-junction artefact, not a candidate defect.

## Remaining gates and limits
- API side not changed and not verified here: GET /sources (apps/api/src/routes/brain.ts:205) returns whole source rows, so `path` reaches the client JSON (the web DOM never renders it, proven by the tests). The maker's note that the serializer should drop source.path stands as an open API-side follow-up under C6/C7. It does not affect this web-scope PASS.
- Not run: browser, full suite, network (per contract). The contract C9 verify_contracts.py run is not covered by this unit-level verdict.
- No new issue allocated.

LEDGER: rows for this unit may be flipped to verified for the web scope. ISSUES-WRITTEN: none

# Manifest: iss-browsercheck-001-mint-join-rules-scope

**Handshake status:** checked-PASS
**Fix cycle:** 0
**Lane:** mintjoin
**Class:** auth (key scope issuance)
**Fixes:** ISS-BROWSERCHECK-001 (recorded on lane/browsercheck, qa/issues.browsercheck.jsonl; not merged)

## Change
- scripts/lib/mint-scopes.mjs: WRITE_SCOPES = ["send-now", "join-rules"]. `--with-scope join-rules` (repeatable, comma list, combinable with send-now) mints it. DEFAULT_SCOPES untouched (same 14, same order). Unknown/typo/non-write names and a missing value still throw; mint-key.mjs turns that into exit 1 before any DB connect. Duplicates collapse.
- scripts/mint-key.mjs: usage header documents the editor-key command (no README/docs describe mint-key; that header is the only documentation).
- apps/api/src/join-rules/send-now.test.ts: old assertion that `join-rules` is refused and WRITE_SCOPES==[send-now] updated to the new rule.
- New scripts/lib/mint-scopes.test.mjs.

Contract item 10 (qa/contracts/t037-join-rules-edit-api.md) preserved: no key holds join-rules unless asked for by name. No key was minted, no DB touched, no existing keys/fixtures changed.

## Evidence
- `node --test scripts/lib/mint-scopes.test.mjs`: 5/5 pass (default byte-identical; each opt-in; both; duplicates; 8 bad inputs throw).
- `node --import tsx --test src/join-rules/send-now.test.ts` (in apps/api): 12/12 pass.
- Replay of ISS-BROWSERCHECK-001: default scopes include join-rules: false (unchanged, by contract); with `--with-scope join-rules`: true. The issue's literal "document a separate mint step" fix_direction was taken, not "add to defaults".

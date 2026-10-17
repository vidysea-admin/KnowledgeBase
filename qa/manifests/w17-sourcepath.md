# Manifest — w17-sourcepath
**Status:** ready-for-check
**Fix cycle:** 1
**Contract:** qa/contracts/goal-t055.md C6 ("No local source.path leakage")
**Base SHA:** a0391420
**Candidate SHA:** see the commit that adds this manifest (git log -1 lane/w17-sourcepath)

## What changed
- `apps/api/src/routes/brain.ts`: `GET /sources` now maps rows through `publicSourceView`, an allowlist
  projection (`_id, tenantId, kind, captureMode, hash, createdAt, consent{given,recordedBy}`, and `url` only when
  a credential-free http(s) URL). `path`, `sourceMeta`, `consent.note`, and any extra/nested path-like keys are dropped.
  Stored rows are unchanged.
- `apps/api/src/knowledge/source-path-privacy.test.ts` (new): plants a Windows and a POSIX path in top-level,
  nested and consent-note fields plus a `file://` url; asserts neither string, nor any path-like key, appears in
  the `/sources` response JSON or in `createMongoKnowledgeCatalog(...).resources()` (the `/knowledge/resources` payload).
- `/knowledge/resources` already used an allowlist (`id, kind, createdAt, url`); no change needed, test added.
- Other routes (grep of `path|filePath|localPath|absolutePath|storagePath` in apps/api/src/routes and src): no other
  response emits these from source or capture records (`brain.ts` media paths are server-side only; `ui-shell`/`stubs`
  `path` are route/nav names).

## Consumer finding (apps/web, not changed: out of scope)
- `apps/web/src/pages/SourcesPage.tsx` line 28 (search filter) and line 71 (display fallback `s.url ?? s.path`) DO read `source.path`;
  `apps/web/src/api/types.ts` `Source.path?`. After this change those fall back to "(no location recorded)". Needs a web follow-up.
- Also `apps/web/src/pages/knowledge/knowledgeDirectoryFixtures.ts` uses a `path` fixture (test data only).

## Checks a checker must run
- `cd apps/api && node --test --import tsx src/knowledge/source-path-privacy.test.ts src/routes/brain.test.ts`
- `node node_modules/typescript/lib/tsc.js --noEmit -p apps/api/tsconfig.json`
- `node scripts/lint-loc.mjs --all`

## Evidence
- Privacy + brain tests: `ℹ tests 13 / pass 13 / fail 0` (also with catalog.test.ts: 17/17 before the test file move).
- tsc apps/api: exit 0.
- lint-loc --all: stages loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, tracker, dependencies all exit 0
  (test placed in knowledge/ because routes/ was at its 30-file budget).
- Mutation (D-020): re-added `path: row.path` to `publicSourceView` with per-mutation backup + EXIT/INT/TERM/ERR trap:
  `ℹ pass 1 / fail 1` (the /sources test killed it); restore verified by cmp; post-run
  `git -c core.autocrlf=true hash-object brain.ts` = 54042d2c5b57477e9e70365b70724b08d1de1878, identical to pre-mutation worktree state; `git diff` shows only the intended change.

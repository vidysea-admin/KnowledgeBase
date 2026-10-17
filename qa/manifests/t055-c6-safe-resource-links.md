# t055-c6-safe-resource-links

Status: ready-for-check
Fix cycle: 0

Task: T-055 clause C6 (qa/contracts/goal-t055.md). Base a0391420, lane lane/w17-t055c6. Candidate SHA: see the lane HEAD commit.

Change: one sanitizer `safePublicResourceUrl` in apps/web/src/safe-url.ts (safeHttpUrl plus credential and C1-control refusal, returns {href, host}). Used by knowledgeDirectoryModel.ts, catalog/knowledgeCatalogClient.ts (response validation) and re-checked at render in catalog/KnowledgeResourcesPage.tsx. Removes two ad-hoc duplicate credential checks. Directory page already emitted rel="noopener noreferrer" target="_blank"; source.path is never read by the DOM code.

Changed paths: apps/web/src/safe-url.ts, pages/knowledge/knowledgeDirectoryModel.ts, pages/knowledge/catalog/{knowledgeCatalogClient.ts,KnowledgeResourcesPage.tsx}, new pages/knowledge/resourceLinks.test.tsx.

Checks for checker: vitest on resourceLinks.test.tsx, KnowledgeDirectoryPage.test.tsx, knowledgeDirectoryModel.test.ts, catalog/, safe-url.test.ts (66/66 pass, 7 files); tsc apps/web exit 0; D-020 mutation (allow javascript: in safeHttpUrl) fails 3 tests, restored, hash 5b12dc79 equals intended post-change blob.

API side: not changed. Check that API output (/sources, /knowledge/resources) omits `path`; the web fixtures show /sources rows carry `path`, which the web never renders. Needed: serializer should drop source.path.

# t055-profiles

Status: ready-for-check
**Handshake status:** ready-for-check
Fix cycle: 0

Task: T-055; priority tier 3 (roadmap). Branch `lane/t055-profiles` from `lane/codexwave1` (cd843b26). Not an issue-fix unit; no ledger corpus substituted.
Predecessor: `qa/manifests/t055-evidence-directory.md` (PASS cycle 0) excluded document highlights, full topic/speaker profiles and curated collections. This unit adds the first three, read-only, in `apps/web/src/pages/knowledge/**` only.

## Ownership
New files only: `KnowledgeProfilesPage.tsx` (route component), `ProfileViews.tsx`, `ProfileEvidenceList.tsx`, `ProfileHighlights.tsx`, `profileModel.ts`, `profileClient.ts`, tests `profileModel.test.ts`, `KnowledgeProfilesPage.test.tsx`. No apps/api, App.tsx, Nav, contracts or governance edits.

## Mount (integrator)
`import { KnowledgeProfilesPage } from "./pages/knowledge/KnowledgeProfilesPage.js";` then in the protected layout
`<Route path="/knowledge/profiles" element={<KnowledgeProfilesPage />} />`; Nav entry "Profiles" -> `/knowledge/profiles`. Query: `?tab=topics|speakers|highlights|collections&id=<graph node id | session id>`. Component must sit under AuthProvider and a Router.

## Behaviour
- Topic profile (graph topic node) and speaker profile (graph person node): sessions linked, relationships, claims tagged with the topic (exact node id match), and per-evidence rows showing quote (from `GET /sessions/:id` turns, clipped at 400 chars), speaker label, timestamp, session title, inferred/stated, confidence, origin, and a link to `/sessions/<id>#turn-<id>`.
- Ownership rule matches the directory (exactly one known session; conflicts/unknown withheld and counted). Speaker pages state the name does not confirm identity, role or counsellor status.
- Highlights: per session, `GET /sessions/:id/grounded-content` notes and claims with quote, speaker, timestamp and source link; notes marked unverified.
- Collections: saved/curated collections shown as unavailable (typed stub, no request); derived career-theme views (Admissions, Study abroad, Courses and programs, Careers) by topic-label keyword match, explicitly labelled a convenience filter.
- States: unauthenticated (no request), loading, error (403 specific), graph 404 (sessions kept), claims failure (explicit note), empty lists, missing selection, truncation notes, key/generation fencing. Phone width: flex-wrap tabs, `overflowWrap: anywhere`, no fixed widths.

## Live gaps / API gaps
- G1 topic->claim: `claims.topicRefs` are tenant-namespaced `topics._id` (promote-entities.ts), not graph node ids `topic:<slug>`; web matches exact node id only, so tagged claims likely show empty live. Needs API to return graph node ids or a `GET /claims?topic=` filter.
- G2 curated collections: no endpoint to create/store/list them; stub `listCuratedCollections()` in `profileClient.ts` (TODO).
- G3 quotes: no endpoint returns a turn by id; web fetches whole sessions (max 8 per profile, 50 evidence rows). Needs `GET /sessions/:id/turns/:turnId` or quote on graph evidence.
- G4 speakers: graph person nodes carry no role/organization; no counsellor designation exists. Profiles cannot say who is a counsellor.
- G5 topic taxonomy: no category field for admissions/study abroad/courses; themes use label keywords. Claims list capped at 500 rows (5 pages).
- G6 highlights are only the grounded-content notes/claims; no page-level (document) highlight data exists.
- Not browser/live verified; mount not installed.

## Evidence (cwd C:\Users\product\Desktop\KnowledgeBase-lanes\t055-profiles\apps\web, node on PATH)
- `node node_modules\vitest\vitest.mjs run src/pages/knowledge` -> 5 files, 41/41 pass (10 new: 4 model, 6 page).
- Full `node node_modules\vitest\vitest.mjs run` -> 82 files pass, 1 fail: `src/pages/search/SearchPage.test.tsx` 2 failed (824/826 pass). Reproduced identically on the untouched base (git stash -u): 2 failed / 13 passed. Pre-existing, unrelated.
- `node C:\Users\product\Desktop\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> exit 0.
- `node scripts/lint-loc.mjs` -> 1 violation, pre-existing: `packages/meeting-bot/py/test_sb_join_ownership.py:408 (budget 400)`; no knowledge file flagged. `lint-loc --all` also reports a stale docs/SNAPSHOT.md (not touched; generated).

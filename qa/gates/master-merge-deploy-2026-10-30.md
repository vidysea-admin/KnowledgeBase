# Gate: merge docs/devops-golive-2026-10-26 to master and redeploy

**Asked:** 2026-10-30, after the deployed `/search` hang diagnosis. The live build is old master. Its `/search` has no deadline and runs serial per-turn visibility checks, and `/route` is missing.
**Answered:** 2026-10-30 by Umesh: "Approve merge+deploy".

## Scope of the approval
- Fast-forward `master` on `origin` (github.com/vidysea-admin/KnowledgeBase) to the branch head. The branch is 477 commits ahead and 0 behind, so this is a fast-forward with no merge commit.
- Redeploy api and web on the Ubuntu server (34.47.136.12) per `docs/GO-LIVE-UBUNTU.md`, using `git pull && docker compose build api web && docker compose up -d api web`.

## Conditions
- The push happens only after a green pre-push proof: typecheck, the api/web build, and the search/route/visibility tests.
- The claude session has no SSH access to the server. Devops runs the server steps.
- This approval does not cover any server `.env` change, production Mongo write, bot profile, or archiver deployment. Each of those stays its own gate.

# Checkpoint — f0-cloudbuild (checker, cycle 0)
Status: complete, verdict PASS (F0-C5 operator-gated). Nothing remaining.
Evidence identity: head 54abe1fa, base a9bbeb98; cloudbuild.yaml blob and scripts/operations/cloudbuild.test.mjs as at 791b8ffa; structure.config.json as at 8bda9a45.
- `node --test scripts/operations/cloudbuild.test.mjs` -> 5 pass / 0 fail.
- `node scripts/lint-root.mjs` OK 17; `node scripts/lint-dirsize.mjs` OK 307.
- `tick.mjs --route a9bbeb98..HEAD --root <worktree>` -> floor L, dual false.
- 8 cloudbuild.yaml falsifications + 1 structure.config.json falsification, all green-before/red-after in copies outside the bound root.
- Read-only gcloud: containers, images, trigger images/tags/step names, service labels, spec.traffic.

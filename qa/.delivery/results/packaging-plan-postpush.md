**APPROVED — plan approval only.** No blocking finding in the proposed packaging repair.

The six inspected handoff files match their supplied SHA-256 hashes.

- `Dockerfile:40–45`: `web-build` inherits installed dependencies/manifests and copies `apps/web`, but never copies the policy source imported by `joinRulesModel.ts:7` and `RuleSetEditor.tsx:2`. The API build’s `COPY packages` belongs to a separate stage.
- Both frontend imports resolve to `/app/packages/ingest/src/join-policy/join-rules.ts`. Add, inside `web-build` before its build command:

  ```dockerfile
  COPY packages/ingest/src/join-policy ./packages/ingest/src/join-policy
  ```

- The complete transitive closure is five existing files: `join-rules.ts`, `platform.ts`, `join-rules-normalize.ts`, `join-rules-optout.ts`, and `meeting-identity.ts`. Every discovered dependency stays within that subtree. No external imports, dynamic imports, `require`, or Node-global references were found in those files. `.dockerignore` permits this source.

The read-only, in-memory copied-context check produced:

```text
Current context: both frontend policy imports unresolved
Proposed context: both frontend policy imports resolved
Policy closure: 5 files; missing dependencies: 0
```

Approved test boundary: append the focused regression to existing `scripts/qa/dockerfile-media-tool.test.mjs:81`. It must scope assertions to `web-build`, require the source COPY before `pnpm --filter @lkb/web build`, and verify the transitive closure at the preserved relative paths. A COPY elsewhere in Dockerfile must not satisfy it. Preserve existing tests.

Before completion, the parent must record red/green regression evidence, reproduce failure and success using an isolated copied context, run focused join-rules tests, measure Docker availability, and obtain actual pushed Docker CI results. Host-checkout success alone cannot prove image packaging.

No source edits, builds/TSC, agents, network, credentials, commits, or pushes were performed. This approval does **not** close the separate `31/30` structure issue, runtime/configuration gates, hosted-capture gates, or the original product task.
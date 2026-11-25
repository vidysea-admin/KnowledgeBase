# Contract — cloud-build-deploy (unit F0, D-227)

> Status: adopted by /checker 2026-11-25. Authority: D-227 (Changes-authorized names the new root `cloudbuild.yaml`); plan section 7 lane A F0. Scope: root `cloudbuild.yaml` and the test that parses it.
> Owner's words: "Make master pushes safe. New file: root `cloudbuild.yaml` that builds both targets and runs the two-container deploy"; check: "a throwaway tagged deploy from the trigger keeps both
> containers". Stage 0 correction (plan): the trigger runs an INLINE four-step config, it does not auto-detect the Dockerfile; the unit is unchanged in substance.
> Relation: `root-docker-devops.md` governs the Dockerfile and compose files; this contract governs only the Cloud Build config.

## Criteria
- **[F0-C1] Builds and pushes.** The file builds the root Dockerfile twice (`--target web`, `--target api`), pushes both images to the same repository paths the live service's two containers use today, and tags
  each with the commit sha. The inline trigger config's build-args, cache settings and labels are all present (the manifest pastes the inline config, read-only from the trigger, and shows the line-by-line
  mapping). Other tags (for example `latest`) exist only if the inline config applies them today; the unit adds no new mutable tag (D-227 fixed choice 1: commit-pinned images).
- **[F0-C2] Two-container deploy.** The deploy step sets the image of BOTH named containers of the service in ONE revision and changes nothing else: before/after `describe` of the service differs only in the
  two image fields and revision metadata (env, secrets, resources, ports, ingress container, sidecar wiring, scaling, service account and traffic split are identical).
- **[F0-C3] Substitutions.** The file requires no substitution the trigger does not already supply; every other substitution has a safe default, so a tagged, no-traffic throwaway run is possible without
  editing the trigger.
- **[F0-C4] Structural test.** A test parses the file and asserts: two builds, two pushes, exactly one two-container deploy, every substitution is the trigger's or has a default, and no step deploys a
  single container. The test goes red when one of the two containers is dropped (falsification).
- **[F0-C5] Throwaway deploy (owner's check).** A throwaway deploy of the file, run with a revision tag and no traffic, produces a revision whose two containers are both at the new images and whose
  live traffic revision is unchanged; evidence header per `go-live-acceptance.md` [GI1].
- **[F0-C6] Root budget.** The structure lint passes with the new root file; any allowance entry that was needed is named in the manifest and no linter logic is changed to fit it.

## Invariants
- **[F0-I1]** Pointing the real build trigger at this file, and pushing master, are NOT part of this unit: they are outward-facing and need Umesh's approval. The unit never edits the trigger or pushes master.
- **[F0-I2]** No secret value in the file; secrets are referenced by name only.

## Out of scope
Load balancer, DNS and domain mapping (plan Stage 1/L-units). Consent (D-210).

## Amendment log
- 2026-11-25 · routine · created. Maker reading [F0-a]->C1 (REJECTED the "`latest` tag" requirement: not in the owner's words and adds a mutable tag against D-227 choice 1; tightened to sha plus whatever the inline
  config does today), [F0-b]->C2 (tightened to a before/after diff), [F0-c]->C3, [F0-d]->C4 (kept, but a parse test cannot prove a deploy, so the owner's throwaway deploy is C5); added C6 (root budget) · folds inbox "unit-level checks for wave 1" (D-227)

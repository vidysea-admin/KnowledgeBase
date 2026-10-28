# Private own-model path — T-015

This CLI implements private local preparation, an approval-bound exporter and an audited local
trainer interface. It does not choose an external training provider or send knowledge to a global
model. G10 capability is retained; activation, real export, training, inference, evaluation and
promotion each require their own evidence. T-015 remains open until the whole contract passes.

The supported dataset task is `grounded-claim-v1`: cited attributed turns are inputs and an existing
verified claim with evidence is the target. These are not invented counselling question/answer
examples, independent semantic gold, or a claim that this training objective improves counselling.
Only current derivation proof is accepted. Stale and legacy-unbound sessions must be regenerated
or independently reconciled by their existing provenance owner; this tool never binds real data.
The WhatsApp source has its own governance and is not included by this TOC artifact adapter.

## Prepare and validate without corpus export

Create an ordinary metadata configuration, with an explicit tenant, seed and selected session IDs:

```json
{"tenantId":"toc","seed":"review-v1","sessions":["2026-05-08-funding-dreams-loans-forex"],"relatedGroups":[]}
```

```powershell
node scripts/training/prepare.mjs --config <config.json> --out <new-plan.json>
node scripts/training/validate.mjs --plan <new-plan.json>
```

Preparation reads existing source artifacts; only hashes, counts, identities, timestamps,
exclusions and memberships are emitted. No transcript or claim text is returned. Capture permission
must exist and remain effective; explicit source-owner training prohibitions/revocations/expiry
exclude a source. Capture permission never becomes permission to train or export. Unknown intended
training permission remains `awaiting-exact-export-approval`. A generic request `approved:true`
is ignored; altered plan JSON is rejected.

The plan fingerprints the exact ordered claim/cited-turn content hashes, source bytes and current
derivation proof, identity transformation and configuration. It groups whole sessions connected
by source hashes, identical normalized claims/cited turns, or explicitly reviewed relatedGroups.
First seeded-hash group is evaluation, second validation, remaining groups training. Fewer than
three groups is a blocked split; this is a structural requirement, not a quality threshold.
Split algorithm v2 computes declared related-session closure over all selected sessions before
projecting eligible membership. An excluded session still connects its related eligible sessions,
but contributes no dataset rows, leakage-group membership or split membership. The algorithm
version is fingerprinted, so earlier v1 plans and approvals require a new reviewed proposal.
Near-duplicate/paraphrased sessions require operator-supplied relatedGroups and independent review;
exact duplicate detection is not a semantic leakage guarantee. Evaluation membership never enters
the trainer's supplied arguments. The actual host must independently prove access/network isolation
of an audited trainer; ordinary filesystem access alone is not a sandbox for arbitrary executables.

## Concrete export approval is a human gate

Umesh must review the exact plan, restrictions, purpose and absolute private local destination.
The central decision writer alone records the actual approval through `scripts/append_decision.ps1`.
No decision is created by these tools. UNC/SMB paths, network/device namespaces and Windows device
names are rejected lexically before filesystem access. Drive-letter absolute paths alone do not
prove local/private storage: mapped drives and redirected directories remain a host HOLD until
the reviewed target's fixed private local volume is independently verified. A unique ACTIVE canonical decision requires
`**Approved-by:** Umesh` and one machine-readable line with the following shape:

```text
**Training-export:** {"version":1,"revoked":false,"privacy":"local-only","approvedAt":"<canonical ISO UTC>","expiresAt":"<canonical ISO UTC>","restrictions":"<reviewed conditions>","fingerprint":"<exact plan fingerprint>","tenantId":"<tenant>","destination":"<new absolute canonical local directory>","purpose":"<reviewed use>","taskFormat":"grounded-claim-v1","storageProof":{"path":"qa/evidence/<reviewed-proof>.json","sha256":"<exact proof hash>"}}
```

```powershell
node scripts/training/export.mjs --plan <plan.json> --decision D-NNN --destination <new-absolute-directory> --purpose <exact-reviewed-purpose>
```

D-170's general implementation approval is insufficient. Missing, superseded, expired, revoked,
foreign-tenant, stale or mismatched approval is rejected before corpus serialization or writes.
The canonical grant must bind a current `private-storage-proof-v1` artifact under qa/evidence:
kind `fixed-private-local-volume`, status `verified`, current hostId (OS hostname), exact destination,
verifiedBy `Umesh`, canonical verifiedAt/expiresAt and retained evidence from real host verification.
The hash, host, target and effective validity are checked before destination filesystem access.
This artifact records operator-reviewed host evidence; the file tool cannot authenticate the
reviewer or prove hardware topology itself. Synthetic test proof assertions never count as real
private-storage acceptance. Source corpus/guarded directories cannot be output destinations. Export writes restrictive files
into a temporary sibling and renames a complete bundle to a new destination. Windows POSIX mode
bits do not establish NTFS ACL isolation: independently secure the approved destination on that host.
The receipt binds train/validation/evaluation JSONL bytes, counts and membership. Existing output
is refused; failure cleans the temporary bundle and never reports exported success.

## Local training interface and separate approval

An independently audited local trainer must support this JSONL format. Supply a
`private-training-recipe-v1` JSON object with `privacy:local-only`, `taskFormat:grounded-claim-v1`,
baseModel, absolute baseModelPath, baseModelSha256, license, trainerVersion, absolute executable,
executableSha256, args containing separate `{train}`, `{validation}`, `{output}`, `{model}`
arguments, artifacts (an explicit array of absolute path/SHA256 dependency bindings), timeoutMs
(bounded), seed, resources and a single checkpoint filename. Literal script/config paths in args
must be bound artifacts. Static arguments
must identify the audited trainer/config; fingerprint the entire recipe. The model and executable
must already exist locally with matching hashes. No automatic downloads, dependency installation,
API-key credential fallback, paid calls, provider upload or shell expansion is implemented.

Umesh separately approves the exact recipe/export fingerprint, model, tenant, purpose and new
output destination in a canonical ACTIVE `**Training-run:**` line with the same validity/privacy
fields and exact current host/storageProof binding, plus `fingerprint`, `exportFingerprint`, `recipeFingerprint`, `tenantId`, `destination`,
`purpose` and `baseModel`. The decision writer records it only after the actual human approval.

```powershell
node scripts/training/train.mjs --export <approved-export-directory> --recipe <recipe.json> --decision D-NNN --destination <new-absolute-model-output> --purpose <exact-reviewed-purpose>
```

The runner validates the still-effective export approval, current sources, dataset bytes/membership,
local model/executable and exact training approval before creating output or starting a process.
It passes only basic OS environment variables, seed and offline/no-telemetry flags; API credentials
are not inherited. Offline flags request behavior from an audited trainer; they are not network
enforcement. Imported/transitive trainer dependencies must be covered by the audited recipe artifact
closure and immutable host environment; an interpreter's own executable hash is not such closure.
The direct process is bounded by timeout; descendant isolation/termination is a host
acceptance requirement. Logs retain byte counts and hashes, never raw stdout/stderr corpus text.

Exit zero plus a nonempty exact checkpoint file yields `trainer-completed-unverified-checkpoint`;
nonzero/signal/launch-error/missing artifact yields `training-failed`. Neither means a verified model.
Actual inference must load the identified checkpoint, then independently measure baseline versus
candidate on unchanged held-out cases with citation/refusal/tenant safety and per-case failures.
No automatic score, improvement, model activation or promotion is supplied. Promotion needs an
explicit reversible provider/artifact selection and a separate authorized integration unit.

## Evidence boundaries

`qa/contracts/goal-t015.md` distinguishes P preparation, X export, R real model delivery and Q
independent verification. Synthetic fixture exports/injected runner probes verify interfaces only.
Real data with zero current eligible rows is honestly blocked; it is never repaired into a training
corpus here. Metadata success cannot substitute for actual authorized corpus/training/live proof.

# U2.4 — TOC speaker resolution and cited personas

Checker-owned whole-task acceptance, authored 2026-10-14. This is the parent goal;
a PASS for a narrower profile, grounder, suggestion UI or writer unit does not close U2.4.

Authority: TASKS.md U2.4; ARCHITECTURE.md H3/H4 and tenancy/idempotency rules;
answered qa/gates/speaker-segment-identity.md; D-128, D-132 and active D-141.
The attachment's 40-task plan requires full acceptance and immediate downstream proof.
This file does not authorize changing frozen contracts, production data or enforcement paths.

## Required behavior

1. **Corpus accounting and uncertainty.** Scan the real TOC corpus and record its exact session,
   positional-turn and contiguous-block counts, corpus hashes and any skipped/failed source.
   Each positional turn is either attributable within an evidenced block or explicitly unresolved.
   Coverage is measured by turn/block, never by assigning every occurrence of a recurring spk:N
   label to one person. Low-confidence identities stay unresolved. No arbitrary recall threshold
   is added by this contract; an empty accepted set is not evidence of useful resolution.
2. **Grounded identity and scope.** Every accepted identity links to actual tenant/session/turn
   evidence and its exact block bounds. Model attribution retains a verified verbatim quote and
   evidence kind, as required by D-132. Evidence for a moderator's introduction, quoted speech,
   backchannel or another block cannot name the wrong speaker. Invalid/missing/reversed/out-of-range
   windows and stale evidence are refused. A recurring label and same-name people across sessions
   must not silently expand identity or fabricate a disambiguator.
3. **D-141 review boundary.** Single-evidence model proposals that pass grounding and verification
   remain visibly SUGGESTED with their quotes. They never feed final names, profiles, knowledge,
   citations or answers until an explicit human confirmation. Reject is durable; confirm/reject
   retries are idempotent; conflicting decisions are explicit; re-index preserves confirmations
   and rejections. Auto-final remains deterministic floor plus independent-pair. Suggestion
   generation stays behind its authorized setting. Model failure/degradation is visible and cannot
   fabricate a final identity.
4. **Measured model behavior.** Record the real authorized provider/model, corpus/prompt/config
   hashes, raw proposals, verifier outcomes and scoring on the production-shaped corpus.
   Distinguish suggestions, human-confirmed and auto-final identities in all measurements.
   Automatic finalization must satisfy the applicable precision/stability gate: 100% accepted
   identity precision, zero wrong name/label/citation links and preservation of the deterministic
   floor. D-141 permits useful human-reviewed suggestions despite the earlier pair-mode result of
   zero additions; it does not waive precision for automatic finalization. Synthetic quotes,
   oracle verifiers and scripted responses are unit evidence, never live model evidence.
5. **Durable evidence-safe identities.** Real tenant-scoped persistence validates the authoritative
   schemas and preserves provenance and block scope, either directly or through a durable verified
   link to the confirmed suggestion. A final row alone cannot justify label-wide attribution.
   Accepted turn references or an equivalent consumer mapping resolve only the authorized block;
   evidence turn/session/time remains traceable. Writes are authorized, idempotent, and recover from
   interruption without losing human decisions. Ambiguous collisions remain visible.
6. **Cited persona and knowledge profile.** A resolved person's usable profile exposes identity,
   aliases and evidence, supported organisations/roles, topics and cited claims. Every asserted
   organisation/role and attributed knowledge item has surviving evidence belonging to that person
   in an accepted block or a directly established stable person reference. Unsupported fields are
   explicitly unavailable rather than guessed. Mentioning a person or topic is not proof that they
   spoke the claim. Profiles must exclude unconfirmed/rejected suggestions and neighbouring blocks.
   A read-only profile assembled from persisted evidence is acceptable; a fabricated biography is not.
7. **Real caller and consumer.** The actual indexing/review path generates and persists suggestions;
   a real API/UI human decision produces the expected final evidence-bound identity. The immediate
   downstream profile/directory and speaker/timestamp citation consumer can use it without error.
   Verify actual mounted production composition, authenticated responses and a real TOC sample,
   not only an unmounted route, mocked store or standalone helper. T-055 may supply the profile UI
   consumption; its missing integration prevents whole-task completion.
8. **Isolation and privacy.** Tenant and session scope come from authenticated server context.
   Another tenant/session cannot read, confirm, reject or use the identity or profile. Names alone
   cannot join tenant data. Invalid inputs and store failures produce safe responses without
   transcript/secret leakage. No new unapproved cross-session or write authority is inferred.

## Proof and handshake

- Maker submits a ready-for-check manifest with Fix cycle, exact scoped paths/final hashes,
  caller/consumer map, command/output evidence, declared reuse of earlier PASSes and every
  remaining whole-task gate. The independent checker verifies those bytes; maker closes only a
  matching PASS. Profile-only/source-only proof must state that U2.4 remains in_progress.
- Run the smallest affected tests and an independent adversarial probe, authoritative schema and
  generated-type checks when relevant, contracts/verify_contracts.py when applicable, a real sample
  stage and its immediate downstream consumer. Exact commands, exit codes, counts, output paths,
  durations and any unmeasured intervals belong in the verdict.
- Reproduce each issue-fix unit's own recorded ledger cases verbatim from the union of all issue
  shards, with per-issue counts and explicit reasons for omissions. Do not replace them with a
  easier self-authored corpus or declare a prior narrow PASS to be full acceptance.
- Real model and Mongo/API/UI evidence requires the appropriate root CPU lease and existing
  authorization; no browser, broad suite or production write follows merely from this checklist.
  Missing authorization or missing actual output means HOLD, never synthetic completion.

## Initial gaps (2026-10-14, attributed existing evidence)

TASKS.md U2.4 explicitly reports missing persona fields and turn rewrites. Prior speaker unit
PASSes qualify their scope. u24-model-judged-speaker-attribution cycle 2 verifies deterministic
grounding plus an injectable verifier, not live gate completion. u24-wire-speaker-suggest cycle 1
verifies the indexing hook with fakes, not real generation/persistence/UI proof. buildSpeakerDocs
currently omits quote/kind; final suggestion confirmations retain a suggestionId but omit blocks,
so consumers must rehydrate and validate the confirmed suggestion rather than project its label.
These observations are baseline gaps, not a verdict on an as-yet-unsubmitted candidate.

# Contract — speaker-resolution-llm

**Status:** active
**Owner:** checker (this file is checker-owned; the maker never edits it)
**North star link:** Phase 1 exit — "speaker+timestamp-cited internal answers".
Catalogue **B3** (speaker identity resolution) / **B10** (speaker profiles), goal task U2.4.
**Created:** 2026-09-08 (cycle 1 of `speaker-resolution-llm`)
**Sibling:** `speaker-resolution-deterministic.md` — the no-model half.

## Why this is a separate contract and not an amendment

The maker left the choice to the checker. It is a separate file because the two paths
**disagree on a criterion**, and a merged contract would contradict itself:

- Deterministic **[C6]**: *"a third-party mention never resolves a speaker — hearing a name is
  not evidence of who is speaking."* A regex cannot tell "Prasanti, what do you think?" from
  "I'm Prasanti", so it must refuse both.
- This path **deliberately admits** that evidence class — the system prompt says *"Some speakers
  introduce themselves, **are greeted by name, or are handed over to by name**"* — because
  handover and greeting are precisely the ~84% that self-naming cannot reach. Verified: a
  third-party-mention turn resolves a speaker here (checker probe A3) and does not there.

That is a legitimate design difference between a syntactic matcher and a model that reads
context, not a violation. It is also a real risk transfer, recorded as **[C12]** below.

Everything else is inherited: deterministic **[C2]** (verbatim), **[C3]** (real ids),
**[C4]** (derived `personId`), **[C7]** (contradiction unresolved), **[C8]** (positional labels
only), **[C9]** (explicit `unresolved`), **[I4]** (persists nothing) carry over unchanged and are
restated here in this path's terms.

## Acceptance criteria

- **[C1]** A speaker whose `displayName` is verbatim in a real cited turn is kept, with a derived
  `personId`, and evidence deduplicated and in transcript order, each `turnId` paired with that
  turn's own `sessionId`.
- **[C2]** **(binding rule, inherited)** A `displayName` that does **not** appear verbatim —
  exact substring, no normalisation, no case folding, no re-spelling — in a cited turn's text is
  **dropped**. The model's spelling never overrides the transcript's. This is enforced
  **per cited turn**, not per speaker: an evidence turn that does not contain the name is
  discarded even when a sibling turn does.
- **[C2a]** *(checker-added, cycle 1 of `speaker-verbatim-token-boundary`)* Containment is
  **whole-word**, and the boundary characters that end the match must not be characters that
  join a name to itself. A `displayName` matching only inside a longer *name* — across a hyphen
  (`"Ruby"` in `"Ruby-Anne Smith"`), an apostrophe internal to a name, or a letter boundary
  (`"Ruby"` in `"Rubykumar"`) — is **dropped**. The test is: would a human reading the transcript
  say the turn names *this* person? A prefix of someone else's name does not.
- **[C2b]** *(checker-added, same cycle)* A `displayName` must be **name-shaped**: every token
  capitalised bar recognised interior particles, bounded token count. Shape alone is **not**
  sufficient. A single-token `displayName` that is an ordinary English word functioning as
  discourse rather than as an identity — a greeting, an interjection, an acknowledgement, a
  pronoun (`"Welcome"`, `"Thanks"`, `"Okay"`, `"Hello"`, `"I"`) — is **dropped**, and so is a
  multi-token one built only from such words (`"Thank You"`). The rule this enforces is the one
  the substring test could not: *the string must have appeared in the transcript **as a name**,
  not merely as capitalised text.* Sentence-initial capitalisation is the normal case in a
  transcript, so capitalisation carries no evidential weight on its own.
  Mechanism is the maker's choice (stopword list, position/context evidence, or requiring a
  naming cue); the criterion is the outcome, not the implementation.
- **[C3]** A `turnId` not present in the input is dropped. A speaker left with zero surviving
  evidence does not ship.
- **[C4]** Partial survival is correct behaviour: real cited ids are kept, invented ones
  discarded, and the speaker is retained on what remains.
- **[C5]** A turn already carrying a real (non-positional) name is never renamed — only `spk:N`
  labels are in scope.
- **[C6]** A `speakerRef` absent from the transcript is dropped — the module cannot name a
  speaker who never spoke.
- **[C7]** A label the model names two different ways is left **unresolved**, not coin-flipped;
  the label appears in `unresolved`.
- **[C8]** **(binding rule)** A provider failure **degrades to the deterministic pass** and says
  so via a non-null `degraded.reason`. It must never return an empty result a caller would read
  as "no speakers in this session" (the ISS-056 failure mode). This holds for *every* way the
  injected `complete` can fail, not only a thrown `Error`: a rejected promise, a non-`Error`
  throw, a resolved-but-undefined return, and a malformed `CompleteResult` all degrade.
- **[C9]** A response that is not a JSON array — including unparseable text, an object, or an
  empty body — degrades rather than throwing.
- **[C10]** The job is sent with `kind: "speakers"` and a citable transcript in which every line
  carries both an `[id:...]` prefix and its `[spk:N]` label, and `config/ai-routing.yaml`
  declares a provider chain for that kind.
- **[C11]** Empty input never calls the provider and returns a non-degraded empty result.
- **[C12]** *(checker-added, cycle 1)* Because this path accepts greeting/handover evidence that
  the deterministic path refuses (see "Why this is a separate contract"), the **verbatim rule is
  the only surviving guard against a fabricated identity**. It must therefore be pinned by a test
  that fails when the rule is removed, and that mutation must be reproducible by the checker.
- **[C13]** *(checker-added, cycle 1)* Any yield or degradation figure stated in this unit's
  documentation must be re-derivable by running the module over the real corpus
  (`data/toc-migrated/*/turns.json`). A number that cannot be re-derived is a failed criterion.

## Invariants

- **[I1]** `extractSpeakers` never throws into its caller, for any provider behaviour or any
  response shape.
- **[I2]** `packages/index/src/pipeline/speakers.ts` is byte-unmodified — this unit adds a path,
  it does not alter one that already carries a PASS verdict.
- **[I3]** Nothing is persisted (no `speakers` document, no mutated `turns.speakerRef`) and no
  provider is contacted at import time. The module is pure apart from the injected `complete`.
- **[I4]** Pre-existing tests continue to pass.

## Out of scope / ignore

- **Real-provider yield.** Every test injects a fake `complete`. This unit claims a *correct and
  safe path*, not a number above 15.8%. Measuring the real yield is its own unit and must report
  the number even if it disappoints. Judged an **honest scoping**, not a hidden gap — the
  manifest states it first and the module makes no yield claim.
- **Prompt quality as a prompt.** C10 pins the job shape, not that the wording elicits good
  extractions. That is U2.2's extraction-quality eval, not a unit test.
- `org` / `role` / `confidence` extraction (B10 profiles).
- Persisting identities and flipping catalogue B3/B10.

### Deferred to the apply/persist unit — BLOCKING there, not here

Two identity defects are **real, reproduced, and deliberately not charged to this unit**, because
this unit persists nothing and therefore cannot cause them to land. They must be blocking
criteria on whichever unit first writes a `speakers` document or mutates `speakerRef`:

1. ~~**Token-boundary substring.**~~ **Taken up early by `speaker-verbatim-token-boundary`
   (cycle 1) and now governed by [C2a]/[C2b] above — no longer deferred.** Original text:
   C2 is a substring test. A transcript reading
   `"My name is Rubykumar Shah."` accepts a model-returned `displayName` of `"Ruby"` — verbatim,
   well-formed, and a different human (checker probe, cycle 1). Likewise `"Good morning"` from
   `"Good morning everyone"` ships as `person:good-morning`. The apply unit must require the
   match to fall on token boundaries and must reject a `displayName` that is not name-shaped.
2. **`personId` collision across distinct people** (the maker's gap 5). Two labels legitimately
   both named `"Ruby"` produce two resolved speakers sharing `personId: "person:ruby"`
   (reproduced, cycle 1). This originates in `personIdFor` in the already-PASSed
   `speakers.ts` — which **I2 forbids this unit from touching** — and the deterministic path
   collides identically, so it is not a regression introduced here. The apply unit must
   disambiguate before two people are merged into one stored identity.

## Phase-3 gate bar-2 reading (checker ruling, cycle-1 check of `u2-4-phase3-precision-regate`)

- **[C14]** *(checker-added, cycle 1 of `u2-4-phase3-precision-regate`)* `qa/gates/speaker-segment-identity.md`'s
  phase-3 bar 2 ("zero wrong label/name/citation links") is measured, for THIS path, by whether each
  shipped evidence turn is inside — or immediately adjacent to, in the direction its cue requires — a
  claimed block whose gold person is the accepted name (`05-score.mjs`'s `wrongEvidencePairsRelational`
  / `relationalInvalid`), never by the legacy `wrongEvidencePairs` counter, which accepts an evidence
  turn only when it lies inside a gold block **of the named person themself** — i.e. only a
  self-naming turn. Every greeting/handover/thanks turn this path deliberately admits (see "Why this
  is a separate contract" above) is spoken by someone else and fails the legacy counter by
  construction, so that counter cannot discriminate a correct relational citation from a wrong one on
  this path — it reads the same non-zero number whether the citations are right or wrong. This does
  **not** relax C2/C2a/C2b/C12: every evidence turn must still contain the name verbatim, in a
  cue-shaped occurrence, exactly as before; C14 only says which of the two counters *in the
  measurement script* operationalizes "wrong citation link" for this path's admitted evidence class.

## Amendment log

- 2026-09-08 · routine · Initial contract authored by the checker from the maker's proposed
  C1–C11 / I1–I4, adopted with C8 and C9 strengthened to name the failure modes the checker
  actually exercised, plus C12 and C13 added. · *Why:* the maker asked the checker to choose
  between authoring and amending; a merged file would have self-contradicted on deterministic C6,
  which this path inverts by design. C12/C13 pin two commitments the manifest makes but its
  proposed criteria did not — the load-bearing mutation and the re-derivable corpus numbers.
  All additions are tightenings and each was independently verified as already met in cycle 1,
  so no artifact was softened and no criterion was invented to fail one.
- 2026-09-08 · routine (tightening) · Added **[C2a]** (whole-word containment must also not match
  inside a longer *name* — hyphen/apostrophe joiners are not boundaries) and **[C2b]**
  (name-shape is necessary but not sufficient; a capitalised ordinary word used as discourse is
  not an identity). Un-deferred item 1 of "Deferred to the apply/persist unit", since
  `speaker-verbatim-token-boundary` elected to close it at the source. · *Why:* the maker asked
  the checker to amend C2 to require whole-word containment and a name-shaped `displayName`, and
  invited a FAIL if the checker judged the remaining capitalised-word hole in scope. It is: the
  twin attack this unit exists to close is *a human being invented out of a greeting*, and
  `"Good morning"` is refused only because "morning" is lowercase — `"Welcome"`, `"Thanks"` and
  the bare pronoun `"I"` still ship as people (checker probe, reproduced). Both additions are
  **tightenings**; neither was written to fail a conforming artifact, and both were placed on the
  contract by the checker's own cycle-1 verdict before this unit was built.
- 2026-09-25 · routine (clarification) · Added **[C14]**, ruling that the gate's phase-3 bar 2
  ("zero wrong ... citation links") is read via `05-score.mjs`'s relational check, not its legacy
  `wrongEvidencePairs` counter. · *Why:* `u2-4-phase3-precision-regate` fix cycle 1's manifest
  explicitly asked the checker to rule on this, since the legacy counter reads 18 (every one of 18
  relation-evidence citations, x3 outer runs) while the relational check reads 0, and the two
  readings disagree on whether bar 2 holds. The legacy counter's own definition — an evidence turn
  must lie inside a gold block of the person it names — cannot be satisfied by a greeting, handover
  or thanks turn, which this path's own "Why this is a separate contract" section (predating the
  gate's 2026-09-21 answer) already commits to admitting; a metric that reads "wrong" on every
  correct instance of an explicitly-designed-for evidence class carries no discriminating
  information for this path. This is a routine reading clarification, not a criterion softening:
  C2/C2a/C2b/C12's verbatim-and-cue requirement is unchanged and was independently re-verified this
  cycle (D-020 mutation falsification, 6 mutants, all caught). If a future unit wants the legacy
  counter reinstated as bar 2's measure — e.g. because relational evidence turns out to be a bigger
  fabrication risk than this cycle's evidence shows — that is a criterion **tightening against an
  admitted evidence class**, which is a CRITICAL amendment requiring the human, not a routine one.

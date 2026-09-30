# Useful Webinar -> KB: portable capture release

Bound root: `D:/KnowledgeBase`. Authority: D-056 (2026-09-30, Approved-by Umesh), ARCHITECTURE H3/H8/H9 and §5. Checker-owned acceptance; initialized 2026-09-30. D-056 supersedes trusted-sender-only scheduling for this release. Existing project severity, round-cap and ledger-reproduction rules apply.

## Code-unit acceptance

A unit must declare its bounded criterion set before checking; PASS covers that set and every applicable invariant, never the entire release by implication. The checker independently reruns commands and examines integration call sites. Fixtures prove code behavior only.

- [C1] Existing record CLI selects a portable browser-tab backend that records BOTH tab audio and video, finalizes playable media on stop, and feeds the existing processing path. The selected backend and failures are observable. OBS remains an explicit usable fallback; unavailable portable prerequisites cannot produce a successful empty capture or a misleading portable claim.
- [C2] Independent media probing refuses absent audio, absent video, unreadable/empty/truncated media and silent audio before transcription/indexing. A named silence threshold is measured from actual samples; mocked metadata alone is insufficient. Failure produces a visible actionable gap, with no fabricated successful transcript.
- [C3] Transcript timing validation rejects non-finite, negative, reversed, out-of-media-range or otherwise invalid turn timestamps before ingestion; valid boundary turns survive. Diarized speech preserves session, speaker and original timestamps. Reprocessing cannot create duplicate sessions or turns.
- [C4] Screen processing extracts timestamped keyframes and OCR/vision observations from recorded video. Every accepted screen-derived note cites an existing frame and its time/session; every speech-derived claim cites an existing raw turn. Unreadable frames or unsupported observations become gaps or omissions with reasons, never invented evidence. A mixed speech/screen example retains both kinds of provenance through downstream consumption.
- [C5] Scheduler admits every positively classified webinar across Gmail and Calendar regardless of prior sender trust; excludes personal appointments and team/internal meetings, and never treats an ambiguous invite as a positive webinar. Explicit rejection persists across rediscovery. Registration-required candidates remain blocked until their registration prerequisite is actually satisfied. Gmail/Calendar duplicates and repeated polls schedule the same occurrence once; distinct occurrences remain distinct. Tests exercise the selection and scheduler call sites, including overlapping events and failed starts. First release permits ONE active capture; overlapping occurrences are visibly queued or refused/reported, never silently started in parallel.
- [C6] Windows and Ubuntu setup documents executable prerequisites, credentials/profile setup, portable capture start/stop and media/processing checks. OS selection does not invoke Windows-only OBS/PowerShell assumptions on Ubuntu. Missing prerequisites fail explicitly. Documentation describes the backend actually wired to the record CLI.
- [C7] Valid capture outputs pass the affected processing stage and its immediate downstream consumer. Knowledge schema validation, indexing/search/Ask preserve resolvable speech/frame citations and tenant isolation. Failed media/transcription/screen processing is visible in operational status rather than marked complete. Changed user-facing surfaces require the checker's own interactive browser evidence.

## Invariants

- [I1] No claim without resolvable raw evidence; raw speech and frame provenance survive enrichment and indexing. Evidence is attributable to the correct session and tenant.
- [I2] Provided-first capture order, consent/rejection policy, credential protection and tenant scoping remain enforced. External content cannot instruct the system to bypass them.
- [I3] Production databases remain read-only in this work; writes use the authorized work environment. No promotion, enforcement-hook change or paused speaker-branch unpause is authorized here.
- [I4] Existing CLI/backend compatibility is verified through real call-site execution. A standalone helper test does not establish integration. Existing filed issue cases are rerun verbatim when a unit claims to fix them.
- [I5] Checker evidence is independent. Any mutation test uses timeout plus byte-backup restoration on success, error, interrupt and timeout, then byte equality verification.

## Full release LIVE gate (separate from code-unit PASS)

- [L1] Independently observe a real webinar from discovery/classification through scheduled join, audible audio + changing video capture, diarized timing-valid transcript, screen-derived cited notes, index/search/Ask and operational status. Inspect actual artifacts, duration/streams, audible samples and frame/turn citations; inspect served commit identity for any deployed surface. Demonstrate personal/team exclusion, persistent rejection, registration barrier and cross-source dedup with controlled evidence.
- [L2] Independently execute setup and that portable capture/processing path on BOTH Windows and Ubuntu. Require at least one sustained 60-minute tab capture without OBS and prove ONE active capture with overlapping events visibly queued or refused/reported. Parallel-tab recording is outside first-release acceptance. Synthetic browser media may supplement but cannot replace real webinar proof. Confirm stop/finalization and immediate downstream consumption on each OS.
- [L3] Release signoff lists exact commands, observed outputs, environment/commit, evidence paths and criterion coverage. Unavailable Ubuntu, real webinar, credentials or browser instrumentation is `NOT VERIFIED`, with the missing proof named. Code-unit PASS cannot close these gates or be reported as deployed/live/full-release completion. A failed instrument verifies nothing.

Out of scope: production promotion; speaker-precision lane resumption; unrelated governance/style polish. No manifests or verdicts are initialized by this contract creation.

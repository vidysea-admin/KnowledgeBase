# Maker manifest — T-052 approved registration workflow

**Goal task:** T-052
**Tier:** 3 — full unblocked roadmap task under the explicit forty-task goal.
**Fix cycle:** 1
**Status:** building
**Handshake status:** in-progress
**Contract:** qa/contracts/goal-t052.md C1–C14; applicable gmail-meeting-candidates-approval.md amendments.
**Packet:** qa/packets/t052-approved-registration-workflow.md
**Base commit:** ed542fd01c870e5d5b64e1d72b413062d595f675

## Authority and behavior

ROOT explicitly leased calendar/auto-record-policy.ts, state/schedule-state.ts, a new registration helper/tests and this unit's QA files. Existing D-079 literal same-thread/organizer/time/direct-link policy is retained. D-165/D-166 discovery/join authority does not become registration consent. Ordinary engineering is authorized; actual external submission still requires the approved organizer/operator/target and live prerequisites.

Registration now checks the initiating source's approval/authentication, positive webinar classification and acquired unresolved state before calling the candidate-bound profile resolver. Missing or invalid required configuration persists a finite actionable reason without inventing an attempt; corrected configuration can safely resume. An attempted submission still persists submitting before execution and never blindly repeats after uncertain or interrupted restart. Browser outcomes retain safe actionable reasons, and submission is described as awaiting confirmation.

Confirmation additionally requires canonical provider receivedAt evidence no older than the attempt and no newer than the acquisition time, together with authenticated sender evidence or a manually approved confirmation. The old acquired-ID baseline, exact organizer/thread/message/interval and literal direct-join conditions remain mandatory. Previously unseen old mail cannot establish freshness.

## Implementation ownership

Maker-owned: packages/meeting-bot/src/calendar/registration-workflow.ts, registration-workflow.test.ts, auto-record-policy.ts, state/schedule-state.ts.

Coordinated caller changes are separately owned: T-036 genuine Gmail internalDate acquisition; ROOT receivedAt schema/generated/store/HTTP/core normalization and faithful standing fixtures; T-037 persisted approved profile and scope plus opt-out/deny resolver; T-038 serialized service/CLI diagnostics and the actual persistSync caller. These are integration dependencies, not silently claimed as this maker's work.

The candidate-bound resolver additionally receives private deny-only identity metadata from accepted non-unresolved acquisition occurrences and proven linked calendar state: exact source IDs, current legacy gmail:/cal: session keys and proven alias keys. Invalid/over-limit metadata refuses without truncation. This identity is not sent to the browser/form or included in the registration attempt/public output; it cannot grant consent or infer linkage from a title.

## Validation

No test has run for this candidate yet. ROOT CPU lease requested for the ten focused helper/consumer tests, affected runner tests, direct meeting-bot compiler and frozen-contract verifier. Current evidence and final hashes will be recorded before ready-for-check. Historical Windows/native browser evidence is not current evidence for this candidate.

The integration also repairs delayed-reconciliation replacement of active child state. A three-way operation-field merge preserves child completion/artifact/captureSlot/graph fields, preparation uses the latest live state, and the explicit persistSync interface commits in the same synchronous call stack. Declared async writers are rejected before invocation; generic async storage is unsupported without a separate serialized/CAS boundary. The callback is trusted internal code: a post-return check cannot undo side effects of a callback that violates the sync contract. Confirmation's timestamp uses the acquisition cutoff rather than a later moving clock, retaining the existing future-proof guard. These changes still await current command evidence and independent review. Independent static concerns and their scope are retained in qa/evidence/t052-checker-static-20261014.md; pinned SeleniumBase browserExecutable `cft` remains supported.

Actual read-only connected Gmail acquisition is recorded in qa/evidence/t052-real-mail-provenance.json. The historical original invite and confirmation are real provider messages with internalDate evidence, distinct threads and different envelope senders; receiving-provider DMARC-pass headers were observed, but canonical post-repair authentication has not run. The original has opaque tracking links; the confirmation has a literal direct Zoom join. This concretely shows the current strict D-079 policy cannot correlate this provider flow. No registration attempt or executable success is inferred from historical mail, and no tracked URL was opened. ROOT received the reasoned approval gate before any wider correlation or tracked-link policy could be implemented.

## Full acceptance still required

Actual approved operator and organizer, actual permitted submission and genuine Gmail confirmation, real isolated Mongo/operation storage and restart readback, actual projected join/capture/transcription/index/cited Ask, supported custom JavaScript forms and required Windows/Ubuntu ownership remain unproven. None is replaced by fixture success. C1–C14 need independent complete acceptance; this manifest does not close T-052, T-038, T-051 or the forty-task objective.

Read-only local prerequisite check: raw/webinars/registration-policies does not exist; tenant policy JSON file count is zero. No approved operator/organizer policy was fabricated or activated. The real historical email pair does not supply this missing approval.

Concrete reviewed decision proposal: qa/gates/t052-zoom-confirmation-and-brevo-resolution.md, status proposed/awaiting Umesh. It retains D-079 until an explicitly approved provider-bound exception and bounded SSRF-safe read-only resolution can be implemented and verified. No provider call, browser or submission was made after the roadmap resume.

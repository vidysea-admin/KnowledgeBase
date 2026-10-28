# Maker manifest — sender authentication quoted properties

**Goal task:** T-052 / T-036 authentication prerequisite
**Tier:** 2 — concrete authentication security-class correctness finding; uncapped.
**Fix cycle:** 1
**Status:** building
**Handshake status:** in-progress
**Risk:** authentication/trust derivation; full maker-checker ceremony.
**Contract:** qa/contracts/sender-authentication-quoted-properties.md (independent checker-owned criteria requested).
**Packet:** qa/packets/sender-authentication-quoted-properties.md
**Base commit:** ed542fd01c870e5d5b64e1d72b413062d595f675

ROOT exclusively leased packages/core/src/domain/sender-authentication.ts and focused existing/new tests for a narrow quoted-property parser correction. No other core/schema/enforcement file is owned by this unit. D-079 thread/organizer correlation remains unchanged.

Actual retained Zoom Gmail Authentication-Results contains a quoted smtp.mailfrom property alongside receiving-provider dmarc=pass header.from=zoom.us. The old parser rejects every quote before parsing. This is observed source grammar, not an executed new authentication result. The new sanitized fixture reproduces that grammar without its recipient/bounce token.

The parser normalizes only well-formed nonempty quoted property atoms. Quoted methods/results/receiver IDs, empty or unterminated values, suffix garbage, controls, parentheses, semicolons and backslashes refuse. Quoted text cannot manufacture another auth method. Existing single receiving-provider header, DMARC precedence, duplicate-property handling, exact alignment and From parsing are unchanged.

No command or actual post-change authentication measurement has run. The independent checker reviewed the precise oracle amendment: the original valid quoted header.from input remains verbatim as an explicit positive, and only that negative entry is replaced with an additional unterminated-quote refusal. Every other negative is preserved. Five focused new tests contain sanitized real grammar and adverse quotation cases. Filed ISS-322 4+4, ISS-333 5 and ISS-CAPTURE-003 1 reproductions are queued for verbatim replay, not yet measured. Frozen rules and strict From parsing remain unchanged. Tests and compiler run only through the sole CPU broker. No provider call, registration, database write, policy approval or task completion is claimed.

# T-013 continuing voice conversation — maker checkpoint

Slug: t013-continuing-voice-conversation
Fix cycle: 0
Status: awaiting-broker
Policy version: managed-review/1 (packet fragment; not dispatch-ready until current evidence and validation)
Root: C:/Users/product/Desktop/KnowledgeBase
Base/HEAD at maker start: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Candidate: working-tree bytes bound by candidate-pins.json; no candidate commit created.
Maker actual usage: active_seconds=null; total_tokens=null; cost=null; token_metric=actual_total. No estimates presented as measured usage.
Independent checker: not dispatched; no PASS claimed.

## Authority and acceptance

Parent explicitly leased the four paths in candidate-pins.json and authorized this source implementation. Read C:/Users/product/.agents/skills/checker/SKILL.md and references/managed-review-v1.md. Full-parent qa/contracts/goal-t013.md remains authoritative; this slice implements F2 continuing conversation, F3 successful synthesis completion and F7 callback retirement. F1/F4/F5/F6 existing consumers are preserved; F8 real browser/voice/provider and F9 integration checks remain outstanding. No contract/enforcement/shared tracker edits.

## Changed behavior and consumers

voice.ts adds an optional successful-completion callback to speak; only current utterance end invokes it after retiring its generation. Stop/replacement/error/unavailable voice do not invoke it. Existing two-argument callers remain compatible.

CounsellorPage owns a conversation-session object bound to auth identity and language. Explicit checkbox plus Ask by voice starts recognition. Final transcript calls existing authenticated ask; qualified real response goes to synthesis; successful end rearms the same session. Generic idle never rearms. Old request/session generations cannot rearm after stop, auth replacement, language change, unmount, manual read, mode change, failures or a replacement session. Dictation stays push-to-talk/editable. No recognition runs during readback; the adapter retires recognition before delivering transcript and starting API/synthesis. Explicitly enabled conversation is required; typed submission alone does not create a microphone session.

Immediate consumers: existing mounted /counsellor route, existing ask client, speech recognition/synthesis adapter. No provider/backend/dependency change.

## Raw evidence

candidate-pins.json binds all four source/test bytes and raw byte backups. backup/ copies were made before edits with Copy-Item; no normalization. candidate.diff is a review aid, not a byte backup. environment-fingerprints.txt binds lock/package/tsconfig only and contains no environment values. No tests/build run by maker. Read-only git diff --check produced no whitespace diagnostics (Git emitted line-ending warnings); its exit was not separately persisted, so it is not a claimed test receipt.

## Broker request and required checks

See broker-request.json. First run only voice.test.ts and CounsellorPage.test.tsx under one worker and outer120-second timeout, retain exact exit/stdout/stderr/duration and candidate pins before/after. These suites cover actual adapter successful completion/error/cancellation and mounted page two-turn pipeline, old callbacks, mode-off, auth/session replacement, language/unmount, capability/error and API failure. Existing provenance and dictation cases remain included. No real audio/microphone/provider/browser calls. Relevant web typecheck and applicable frozen validator/structure evidence should be provided by root's shared exact-candidate integration run or separately brokered if required. No mutation run requested; if checker adds one it must use isolated bytes, timeout and guaranteed restoration per AGENTS.

## Next action

Await broker receipt, repair any observed failure within this lease, then finalize hashes, evidence-linked managed-review/1 packet and maker manifest. Run packet validate before independent fresh-context checker dispatch. Current source is a candidate only. Full T-013 remains HOLD/open; no real voice or parent acceptance inferred.

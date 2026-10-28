# T041 failed observation boundary repair — cycle 0

Status: candidate frozen for sole-broker checks; no checker verdict. Parent T041 remains HOLD for L1–L3.
Root: C:/Users/product/Desktop/KnowledgeBase
HEAD/base: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a (shared working tree; raw hashes below are authoritative).
Authorization: integration_control explicit source2 grant plus exact existing test extension, relayed by capture_delivery_coordinator.
Unit: genuine newly identified S4/S5 failure-boundary violation; not a repeat of scoped S1–S9 acceptance.

## Behavior and paths

- scripts/webinar/process-video.mjs: cap prior successful frame's tEnd at each distinct visual observation before OCR. Failed OCR remains omitted with typed error/attempt count. Advance lastHash on observed failures so A / failed B / A resumes A.
- scripts/webinar/slides/slide-knowledge.mjs: validate/use optional frame.tEnd bounded by next retained observation and recording duration; legacy absent tEnd retains existing behavior.
- scripts/webinar/slides/slide-knowledge.test.mjs: helper invalid/end/trailing-gap checks, existing exhausted-frame producer test strengthened, and actual synthetic processVideo → persisted output → loadWebinarSession A / failed B / A test.

Immediate consumers: buildScreenEvidenceTurns in the same helper; scripts/webinar/session-rows.mjs attachment validation and screenEvidenceTurns, unchanged. Both call the actual span helper, so explicit shortened intervals survive ingestion validation. Existing test also imports buildChunks and actual source hydrator; all data is public synthetic fixture data with fake media commands/providers and an injected database.

Contract: qa/contracts/goal-T041.md S2 (A/B/A distinct observations), S3 (omit failed OCR, preserve counts), S4 (real half-open coverage), S5 (timed provenance), S8 (typed failure), S9 (execution evidence still pending). No collection/schema/contract/enforcement/tracker changes. Existing derived JSON evidence gains optional tEnd on retained frames; no native database or ingestion write executed. No auth/tenant/credential behavior changed.

## Exact SHA256 pins

| Path | Before | Candidate |
|---|---|---|
| scripts/webinar/process-video.mjs | 27E1EC624BFA31395DE400FEAA992431256FC5362095BA87A4327C396E2D6ED7 | 64042EF0A4496487B5972A1FD13F074921C42269E588AFA144C230F6E71CB7AC |
| scripts/webinar/slides/slide-knowledge.mjs | E541AEFE83EFDBA59CF78D3BAD29820816DA441CF5B8294D2DFC81288A470EEF | C1FA5C657FD0DDC8A93296B1EDE257A76797DBE313BBEED4ED85F8E203F3F5A2 |
| scripts/webinar/slides/slide-knowledge.test.mjs | 4C69ACE06A5EF0E6C2E4A1A675FD88D2791BC2F5D8F13C2990A0BBAA1FB55685 | 0157B42BEDFAE7A030422E6E73A7564704A0F07263A330669473FE5E185690FB |

Packet is new/untracked, no base existed. No other owned edits. Actual maker active time/tokens/cost: unknown; independent checker budget requires bounded BOOTSTRAP_REVIEW under checker skill.

## Broker request / evidence

No tests, media, providers, browsers, native database, or network run locally. Source diff inspected only. Sole appointed broker must preflight the existing Node/tsx runtime and writable fixture temporary directory, pin immediate imports/environment before/after, enforce 30-second outer timeout, and retain terminal output/exit/counts/elapsed/pins.

Requested focused command from repository root: node --test --test-isolation=none --test-concurrency=1 --test-timeout=15000 --import tsx scripts/webinar/slides/slide-knowledge.test.mjs

Existing file uses only fake ffmpeg/ffprobe command function and fake providers. Actual processVideo temporary file writes are synthetic fixture-only. No FFmpeg/native media/provider call is authorized. Required contract validator evidence should be supplied/reused by central coordinator only with compatible same-environment pins; this packet claims none. Independent checker must review source plus immediate loader consumer and issue its own persisted verdict; this candidate does not supersede historic scoped PASS or satisfy L1–L3.

# Manifest — mbdirsize-meeting-bot-relocation

**Status:** checked-PASS
**Fix cycle:** 0
**Commit:** 74416c0b (lane/mbdirsize)

## Claim
Move-only refactor to satisfy lint-dirsize for packages/meeting-bot: 38 renames into
calendar/join-rules (17), calendar/state (7), capture/notify (10), capture/obs (4); 94 files,
178 insertions / 178 deletions. The 56 non-rename files change only import specifiers, path
literals and doc/comment references. No logic change; public API of @lkb/meeting-bot unchanged.
Maker-reported suite: 844 pass / 5 fail vs base 843 pass / 6 fail.

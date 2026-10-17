# Contract — meeting-bot-existing-subprofile

Status: adopted for the authorized narrow source unit, 2026-10-09.
Owner: independent checker. Maker never edits this file.
Parent ground truth: meeting-bot-live-capture C1, C2, C6.
Scope: explicit reuse of an existing Chrome subprofile in the already-owned persistent parent. Actual Google authentication and live Meet capture are separate runtime gates.

## Acceptance

1. **Existing-directory selection.** An omitted selector preserves existing Default and parent-profile behavior. An explicit `--profile-directory` overrides `LKB_BROWSER_PROFILE_DIRECTORY`; the selector must be one nonempty safe basename and identify an existing physical subdirectory with an existing Preferences file beneath the canonical original parent. Reject traversal, absolute paths, separators, comma/argument injection, control characters, symlinks/junctions, absent/non-directory targets, and redirected Preferences. Validate before profile-side effects or browser launch. Never create the selected subprofile or copy profiles/cookies.
2. **All product entrypoints.** Login, tab capture, and OBS capture propagate the same validated selector to Python while retaining the unchanged parent `--profile` / SB `user_data_dir`. Login retains unconditional `--no-click`; media prompts remain denied. Parent launch ownership and cleanup boundaries are unchanged. If existing session/exit-metadata cleanup selects that subprofile, it must stay contained, reject redirected cleanup paths, and leave sibling subprofiles untouched.
3. **Pinned effective UC options.** The process-local adapter uses the documented low-level `suppress_welcome=False` mechanism only with pinned SeleniumBase 4.51.9 and a verified supported constructor. Effective final browser arguments contain exactly one `--profile-directory=<selected>` and retain the former welcome flags. A plain early chromium argument that is later overridden by appended Default is insufficient. Restore any process-local constructor hook on success and exception. Do not edit vendor files or bypass launch containment.
4. **Unsupported behavior.** An unknown SeleniumBase version or missing/unsupported constructor capability causes an explicit failure before browser launch; it cannot silently fall back to Default or a new profile.
5. **Evidence.** Independently check safe and hostile selectors, existing-path containment/redirection, CLI/environment precedence, login/tab/OBS propagation, actual low-level effective options, hook restoration, and unsupported capability behavior. Run the smallest focused tests and `contracts/verify_contracts.py`; include exact commands/results, immutable candidate hashes, and scoped diff hygiene. No browser or full suite is required for this source unit.
6. **Proof boundary.** Local State account metadata is not evidence of actual authentication. A source verdict certifies this profile-selection unit only. Signed-in Google/Meet identity, actual browser selection, genuine received audio/video, finalization/transcription/index/Ask proof remain separate runtime acceptance.

No filed issue corpus is claimed for this unit. Auth/credential handling remains uncapped under AGENTS.md.

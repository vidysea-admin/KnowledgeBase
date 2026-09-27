# Gate — sign the bot's Chrome profile into Zoom (blocks Ashoka 2026-09-27 11:00 recording)
**Opened:** 2026-09-25T11:4x+05:30 (U0 zoom-browser-join, ISS-U0-2)
**Question:** The Ashoka Educator Dialogues webinar (Zoom 951 9469 1654) host requires attendees signed in to a Zoom account. The bot's persistent Chrome profile (data/bot-profile/) is not signed in to Zoom. Umesh must sign it in once — ideally with the same email the registration used (umeshsugara@vidysea.com).
**Command (run in D:\KnowledgeBase, a Chrome window opens, sign in, then close the window):**
    pnpm --filter @lkb/meeting-bot cli login "https://zoom.us/signin"
**Options:** (a) sign in with umeshsugara@vidysea.com via the command above; (b) a different Zoom account (say which — the registration link is tied to the registrant email, so a mismatch may be refused); (c) skip this webinar.
**Also blocking (fixable by maker after sign-in, ISS-U0-1):** Zoom's web client UI is inside a same-origin iframe the bot's click/end-phrase JS doesn't traverse yet — fix + live-verify needs a signed-in session to reach the waiting screen.
**Deadline:** before Sun 2026-09-27 ~10:00 IST (bot must be scheduled for 10:55).
**Blocks:** U0 live delivery; any future sign-in-required Zoom webinar (U5).

Answered: 2026-09-27T08:15:37+05:30 — option (a): bot profile uses umeshsugara@vidysea.com "for now" — Umesh in chat to checker session knowledgebase-7a, verbatim "so take umeshsugara@vidysea for now" (after being offered a dedicated recorder@vidysea.com account). ACTION STILL PENDING: Umesh runs the login command himself (password/OTP cannot be entered by an agent). Scribed by /checker.

**ACTION DONE + VERIFIED (2026-09-27 ~08:30 IST, checker knowledgebase-7a):** Umesh signed in via
Google in a *plain* Chrome launched on `--user-data-dir=data/bot-profile` (the SeleniumBase login
window got Google OAuth 400 "malformed request" — Google rejects sign-in in automation-controlled
Chrome; email+password path unavailable because the account is Google-login only). Checker then
closed that Chrome and reopened the same profile through the bot's own driver path
(`SB(uc=True, headed=True, user_data_dir=data/bot-profile)`) → `https://zoom.us/myhome` loaded,
title "Home - Zoom", "Umesh Sugara" present, no redirect to signin. Session persists into the bot.
Follow-up for maker (not blocking today): `cli login` should launch plain Chrome, not sb_join.py,
so Google SSO works; plus session-expiry detection (feedback-inbox).

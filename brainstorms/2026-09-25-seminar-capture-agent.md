# Seminar capture agent (the lead's ask) — grill notes

**Date:** 2026-09-25
**Goal of session:** decide the best way to take the EXISTING webinar bot from "Umesh's laptop, hand-scheduled" to what the lead asked for: every seminar invite from info@vidysea.com is picked up, attended, recorded and turned into topic-by-topic knowledge, running on a server, with the knowledge staying proprietary and feeding the virtual counsellor.
**Disciplines on:** strict-mode · critical-analysis · blindspot-analysis
**Status:** active

## Baseline / current understanding

> Surface read before grilling. A starting hypothesis, not ground truth.

- **The lead's words (2026-09-25 counselor-portal review):** "info@vidysea.com se jis bhi seminar ki detail aaye, ek agent likh do vo usko pakde, seminar me baithe, aur hamare paas uska chappa-chappa nikaal ke rakh de. Server me hi daal do … taaki laptop-vaptop kahin use hi na ho … proprietary hona chahiye, hamare hi server pe store ho … ye AI pe na jaaye wapas."
- **Already built (D-027, docs/meeting-bot-roadmap.md):** phase 0 is live-proven on 2026-09-24. A browser bot joins as the registered attendee (SeleniumBase Chrome profile) → OBS per-app capture → silence gate → Gemini diarised transcript → data/toc-migrated/<id>/. Supported platforms: zoho and cloudonair. Scheduling: Windows Task Scheduler on the laptop.
- **Roadmap already planned:** P1 reliability (auto-reconnect, Telegram alerts), P2 in-browser tab capture (no OBS, ~10× smaller files), P3 Gmail/Calendar discovery + auto-join rules + scheduler, P4 knowledge (summary, slides OCR, speaker names, index into the KB, /ask), P5 more sources + retention UI. About 8–10 days in total.
- **Gaps against the lead's ask:**
  - it runs on the laptop, not a server ("VM later decision, not planned yet");
  - discovery reads *which* mailbox? (Umesh's Gmail vs info@);
  - STT and summarising go to Gemini, while the lead said knowledge should not go back to AI;
  - the link into D:/vc (the virtual counsellor) is not designed.
- **Existing rules that apply:** no single AI dependency (Gemini/OpenAI/Ollama/Anthropic rotation, in the D-00x supersession); Recall.ai rejected (D-004); Vexa is the planned route for Meet/Teams/Zoom; recordings are internal KB use only, never redistributed.

## Summary / key decisions

(populated during/after Q&A)

## Q&A log

## Blindspot probes

## Contradictions tracker

## Open flags

- ☐ (none yet)

## Pre-mortem (added at session end)

## Next moves

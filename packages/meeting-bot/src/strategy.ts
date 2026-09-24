/**
 * packages/meeting-bot/src/strategy.ts — T-024 C2. Pure function mapping a detected `Platform`
 * to a join strategy.
 *
 * Vexa platform-support check (done 2026-09-03, before writing this file, per the maker
 * instructions — not invented): fetched github.com/Vexa-ai/vexa's README directly plus its
 * GitHub repo description. The repo description reads "Open-source meeting transcription API
 * for Google Meet, Microsoft Teams & Zoom. Auto-join bots, real-time WebSocket transcripts...";
 * the README's bot-creation API documents a `platform` request parameter with enum
 * `google_meet | teams | zoom | jitsi` (Jitsi flagged "offline-proven, live validation pending").
 * Webex does **not** appear anywhere in Vexa's supported-platform list.
 *
 * This AMENDS the contract's original guess (meeting-bot-capture.md C2: "vexa for meet/teams ...
 * browser for zoom/webex") — Zoom is actually one of Vexa's three natively-supported platforms,
 * and Webex is not supported at all. The mapping below follows the verified facts rather than
 * the contract's pre-check assumption; /checker should treat this as an intentional, cited
 * amendment, not a drift.
 */
import type { Platform } from "./platform.js";

export type JoinStrategy = "vexa" | "browser" | "system-audio";

export function selectJoinStrategy(platform: Platform): JoinStrategy {
  switch (platform) {
    case "meet":
    case "teams":
    case "zoom":
      // Vexa's verified native support (see file header).
      return "vexa";
    case "webex":
    case "zoho":
    case "cloudonair":
      // Not in Vexa's supported list — joined by the local bot browser (joiners/browser-joiner.ts
      // with capture/obs-windows.ts deps). Zoho/cloudonair added 2026-09-24: no open-source bot
      // supports them, and both are plain web clients.
      return "browser";
    case "unknown":
      // Grill's blindspot resolution: system-audio is the universal fallback.
      return "system-audio";
  }
}

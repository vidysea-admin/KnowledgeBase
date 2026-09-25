// @lkb/meeting-bot — T-024. Platform detection, join-strategy selection, the Joiner seam + three
// stubbed joiners (TODO(T-024b) for real implementations), and capture() which composes them with
// packages/ingest's recording adapter. cli.ts is the `lkb capture` entry point (not re-exported —
// it is a script, run via `pnpm --filter @lkb/meeting-bot run cli -- capture <url>`).
export * from "./platform.js";
export * from "./strategy.js";
export * from "./joiner.js";
export * from "./capture.js";

export * from "./joiners/vexa-joiner.js";
export * from "./joiners/browser-joiner.js";
export * from "./joiners/system-audio-joiner.js";

// T-025 — calendar auto-join decision layer (interface only; no real Google Calendar
// implementation yet, see docs/adr/0005-calendar-auto-join.md).
export * from "./calendar/calendar-client.js";
export * from "./calendar/auto-join.js";

// T-011 — Phase-B primitives: per-user profile directory resolution + live-monitor privacy
// filter (no real Playwright wiring / UI yet).
export * from "./profile/user-profile.js";
export * from "./live-monitor.js";

// U3 (plan §U3) — configurable multi-channel notifications: the generic channel/fan-out/digest
// primitives, the Telegram + WhatsApp(stub) channel implementations, and the env/settings-driven
// assembly (`createConfiguredNotifier` / `notifyDigest`). Re-exported here (this package's public
// entry point, package.json `main`) so a consumer outside this package — e.g. U2's future
// scripts/watch/run-watch.mjs, once it lists `@lkb/meeting-bot` as a workspace dependency — can
// `import { notifyDigest } from "@lkb/meeting-bot"` without reaching into src/capture/ directly.
// telegram-alerts.ts's own T-030 exports (createTelegramNotifier etc.) are intentionally NOT
// re-exported here (they never were, pre-U3) — record-commands.ts/record-finalize.ts import them
// by relative path within this package, same as before.
export * from "./capture/notify-channels.js";
export * from "./capture/telegram-channel.js";
export * from "./capture/whatsapp-channel.js";
export * from "./capture/configured-notifier.js";

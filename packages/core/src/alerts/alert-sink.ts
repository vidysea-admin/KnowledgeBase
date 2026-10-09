/**
 * packages/core/src/alerts/alert-sink.ts — U4b/R2 (D-053, answering `u4b-r2-alert-sink-depcruise`
 * option (a)). The thin alert interface that lets `apps/api/src/routes/health.ts`'s watcher-
 * silence detector deliver a REAL alert without `apps/*` ever importing `packages/meeting-bot` —
 * `.dependency-cruiser.cjs`'s `apps-only-ask-ingest-index-ai-db-core` rule forbids that edge, and
 * D-053 explicitly declined to loosen it (option (b)) or move the detector out of `health.ts`
 * (option (c)).
 *
 * `AlertSink` is the canonical name for the shape `WatchSilenceDeps.notifyWatchSilent`
 * (apps/api/src/routes/health.ts) already required structurally. `packages/meeting-bot`'s
 * `TelegramNotifier.notifyWatchSilent` (telegram-alerts.ts) already satisfies it BY SIGNATURE,
 * with ZERO changes to that file — this was already true before this unit (see health.ts's own
 * "structurally identical... satisfies it with NO import" doc comment) and D-053's
 * Changes-authorized list does not touch packages/meeting-bot at all.
 *
 * `createTelegramAlertSink` is a SEPARATE, deliberately minimal Telegram sender for the apps/*
 * side of that boundary — it does NOT import meeting-bot's `telegram-channel.ts`, because
 * `packages/core` may import NO workspace package at all (`core-imports-nothing`,
 * .dependency-cruiser.cjs) and `apps/*` may not import `packages/meeting-bot` either. It reads
 * the SAME env vars (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`) and POSTs to the same Telegram Bot
 * API endpoint, mirroring `telegram-channel.ts`'s `defaultTelegramSend` request shape/timeout/
 * token-redaction so the two stay behaviourally compatible even though they are now two
 * independent implementations.
 *
 * DISCLOSED DUPLICATION — same shape as `health.ts`'s own `isStale` second-implementation
 * (its doc comment, line ~72), and for the identical reason: a dependency-boundary that cannot be
 * crossed by an import. There is no test-time cross-check against meeting-bot's implementation
 * here (unlike `isStale`, which dynamically imports the other side) because a test file under
 * `packages/core/src/` importing `packages/meeting-bot` would itself violate `core-imports-
 * nothing` — `.dependency-cruiser.cjs`'s "from" pattern matches any file under `packages/core/`,
 * tests included. Left as an explicit follow-up in the manifest, not hidden.
 */
import https from "node:https";

/** The canonical shape `apps/api/src/routes/health.ts`'s `WatchSilenceDeps.notifyWatchSilent`
 * already required. Never throws — a failing alert transport must never break the `/health`
 * probe it is reporting through (same contract as meeting-bot's `TelegramNotifier`). */
export interface AlertSink {
  notifyWatchSilent(
    tenantId: string,
    sourceType: string,
    lastHeartbeatAt: string | null,
    intervalMs: number,
  ): void;
}

export interface TelegramAlertSinkDeps {
  /** Defaults to process.env.TELEGRAM_BOT_TOKEN. */
  token?: string;
  /** Defaults to process.env.TELEGRAM_CHAT_ID. */
  chatId?: string;
  /** Injectable transport — tests supply a fake here. NEVER call the real API from a test (a
   * live send is an outward-facing action that gates to the human). */
  send?: (token: string, chatId: string, text: string) => Promise<void>;
  log?: (msg: string) => void;
  /** Injectable clock for the backstop throttle below — tests supply a fake here so throttle
   * behaviour is deterministic (mirrors notify-channels.ts's `NotifierDeps.now`). */
  now?: () => number;
  /** Overrides DEFAULT_THROTTLE_MS below — tests only; production always takes the default. */
  throttleMs?: number;
}

const SEND_TIMEOUT_MS = 8_000;

/** ISS-U4BR2-001: `notify-channels.ts`'s generic per-key backstop throttle, mirrored here rather
 * than imported — `packages/core` may import no workspace package (`core-imports-nothing`,
 * .dependency-cruiser.cjs), so the two Telegram senders (a disclosed duplication, see this file's
 * header) must keep this behaviour in sync by hand, not by sharing code. Same default as
 * notify-channels.ts's `DEFAULT_THROTTLE_MS`. */
const DEFAULT_THROTTLE_MS = 60_000;

/** Replaces every occurrence of `token` in `s` — mirrors telegram-channel.ts's own `redact`, the
 * one thing standing between a thrown network error and a token landing in a log line. */
function redact(s: string, token: string | undefined): string {
  if (!token) return s;
  return s.split(token).join("[REDACTED]");
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m${r}s`;
}

/** Real transport: POST to api.telegram.org. Never called directly by a test — always reached
 * through the injectable `send` dep, which tests replace with a fake. Same request shape,
 * timeout and drain-the-response-body behaviour as telegram-channel.ts's `defaultTelegramSend`. */
export function defaultTelegramAlertSend(token: string, chatId: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text });
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/sendMessage`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: SEND_TIMEOUT_MS,
      },
      (res) => {
        res.resume(); // drain — this module never reads the response body
        if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`telegram sendMessage HTTP ${res.statusCode ?? "?"}`));
      },
    );
    req.on("timeout", () => req.destroy(new Error("telegram sendMessage timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Builds the `AlertSink` apps/api's production wiring injects into `WatchSilenceDeps`. Missing
 * TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID -> alerts silently disabled with ONE log line, matching
 * every other channel in this repo (never throws, never blocks the `/health` probe it reports
 * through). Message text matches meeting-bot's `notifyWatchSilent` wording so an operator sees
 * the same alert shape regardless of which implementation sent it.
 *
 * ISS-U4BR2-001: also applies a generic per-key backstop throttle, mirroring
 * `notify-channels.ts`'s `createNotifier` — `detectSilentWatchers` (health.ts) has no
 * state-based throttle of its own and re-evaluates + re-alerts every stale source type on every
 * `/health` hit, so without this the sink would re-send a live Telegram message per stale
 * (tenant, sourceType) per probe, indefinitely, once something schedules `/health` (U6). The
 * throttle key is `watchSilent:${tenantId}:${sourceType}` — both fields, deliberately: keying on
 * sourceType alone would let one tenant's noisy watcher suppress a different tenant's first
 * alert for the same source type, and keying on tenantId alone would do the same across source
 * types within one tenant. A bounded set of (tenant, sourceType) pairs keeps the backing Map's
 * size bounded in practice, same as notify-channels.ts's own per-key Map.
 */
export function createTelegramAlertSink(deps: TelegramAlertSinkDeps = {}): AlertSink {
  const token = deps.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = deps.chatId ?? process.env.TELEGRAM_CHAT_ID;
  const log = deps.log ?? ((m: string) => console.log(m));
  const send = deps.send ?? defaultTelegramAlertSend;
  const now = deps.now ?? (() => Date.now());
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  const lastSentAt = new Map<string, number>();

  function throttled(key: string): boolean {
    const t = now();
    const last = lastSentAt.get(key);
    if (last !== undefined && t - last < throttleMs) return true;
    lastSentAt.set(key, t);
    return false;
  }

  return {
    notifyWatchSilent(tenantId, sourceType, lastHeartbeatAt, intervalMs) {
      if (!token || !chatId) {
        log("[alert-sink] disabled — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set");
        return;
      }
      const key = `watchSilent:${tenantId}:${sourceType}`;
      if (throttled(key)) {
        log(`[alert-sink] throttled (${key})`);
        return;
      }
      const last = lastHeartbeatAt ? `last completed run: ${lastHeartbeatAt}` : "no run has ever completed";
      const text =
        `🔕 Watch gone quiet: ${sourceType} (tenant ${tenantId}) — ${last}, expected within ` +
        `${formatDuration(intervalMs / 1000)}. This means polling itself has stopped, not that a ` +
        `poll failed — check the watcher process/task, not the credential.`;
      // Fire-and-forget: notifyWatchSilent is void and must never throw into detectSilentWatchers,
      // which already wraps its call in try/catch as a second backstop (health.ts:113-118).
      void send(token, chatId, text).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[alert-sink] send failed: ${redact(msg, token)}`);
      });
    },
  };
}

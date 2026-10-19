/**
 * OnAir on-demand "watch" job (task: ondemandwatch). A watch job records a Google Cloud OnAir recording page
 * (https://cloudonair.withgoogle.com/events/<slug>) through the existing tab-capture `record` path. Unlike a live
 * meeting there is no lobby: the recorder child runs with a 1 s admission window (the lenient non-Meet assumed-
 * admitted path), is scheduled immediately, runs for media duration + padding capped at a maximum, and is claimed
 * once per slug forever (the claim is never released, so a failed run is not silently repeated).
 * OFF unless LKB_ONAIR_WATCH=1. The live join path (planSendNow, runRecord, recorder.js) is not touched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Exact host, https only: the ONLY origin a watch job may open. Live jobs do not read this list. */
export const WATCH_ORIGIN_ALLOWLIST: readonly string[] = ["https://cloudonair.withgoogle.com"];
export const WATCH_PADDING_SEC = 120;
export const WATCH_MAX_SEC = 4 * 3600;
export const WATCH_ADMISSION_TIMEOUT_S = "1";
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const TENANT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

export interface OnairWatchInput { slug: string; url: string; mediaDurationSec?: number }
export type WatchRefusal = "disabled" | "invalid-slug" | "invalid-url" | "origin-not-allowed" | "slug-mismatch" | "invalid-tenant" | "invalid-clock" | "duplicate-slug" | "claim-failed";
export interface OnairWatchConfig { enabled: boolean; maxSec: number; paddingSec: number }
export interface OnairWatchDeps {
  now: () => Date;
  claimDir: string;
  tenantId: string;
  config: OnairWatchConfig;
  launch: (args: string[], env: NodeJS.ProcessEnv) => Promise<void>;
}
export type OnairWatchResult =
  | { ok: true; slug: string; url: string; startAt: string; until: string; durationSec: number; args: string[]; done: Promise<void> }
  | { ok: false; reason: WatchRefusal };

/** Flag is OFF by default; only the exact string "1" enables it. */
export function onairWatchConfig(env: NodeJS.ProcessEnv = process.env): OnairWatchConfig {
  const max = Number(env.LKB_ONAIR_WATCH_MAX_SEC);
  return { enabled: env.LKB_ONAIR_WATCH === "1", paddingSec: WATCH_PADDING_SEC,
    maxSec: Number.isInteger(max) && max > 0 && max <= WATCH_MAX_SEC ? max : WATCH_MAX_SEC };
}

/** media duration + padding, never above the cap; unknown or invalid duration records up to the cap. */
export function watchDurationSec(mediaDurationSec: unknown, cfg: Pick<OnairWatchConfig, "maxSec" | "paddingSec">): number {
  const media = typeof mediaDurationSec === "number" && Number.isFinite(mediaDurationSec) && mediaDurationSec > 0 ? mediaDurationSec : Infinity;
  return Math.ceil(Math.min(media + cfg.paddingSec, cfg.maxSec));
}

/** `--onair-session TITLE`: validated, then handed to the bot browser through LKB_ONAIR_SESSION (acts only under LKB_ONAIR_WATCH=1). */
export function applyOnairSession(title: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  if (title === undefined) return;
  if (!/^[ -~]{1,200}$/.test(title)) throw new Error("invalid --onair-session (1-200 printable ASCII characters)");
  env.LKB_ONAIR_SESSION = title;
}

/** The `onair-duration` event from the bot browser -> a new recording end (media + padding, capped); else undefined. */
export function onairUntilFromEvent(ev: { event?: unknown; seconds?: unknown }, nowMs: number, env: NodeJS.ProcessEnv = process.env): Date | undefined {
  const cfg = onairWatchConfig(env);
  if (!cfg.enabled || ev.event !== "onair-duration" || typeof ev.seconds !== "number" || !(ev.seconds > 0) || !Number.isFinite(ev.seconds)) return undefined;
  return new Date(nowMs + watchDurationSec(ev.seconds, cfg) * 1000);
}

/** Canonical watch URL for an exact allowlisted origin and `/events/<slug>`; query and fragment are dropped. */
export function canonicalWatchUrl(url: unknown, slug: string): { ok: true; url: string } | { ok: false; reason: WatchRefusal } {
  if (typeof url !== "string" || url.length > 2048 || /[\x00-\x20\x7f\\]/.test(url)) return { ok: false, reason: "invalid-url" };
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, reason: "invalid-url" }; }
  if (u.username || u.password || u.port) return { ok: false, reason: "invalid-url" };
  if (!WATCH_ORIGIN_ALLOWLIST.includes(u.origin)) return { ok: false, reason: "origin-not-allowed" };
  const m = /^\/events\/([A-Za-z0-9-]{1,100})\/?$/.exec(u.pathname);
  if (!m || m[1]!.toLowerCase() !== slug) return { ok: false, reason: "slug-mismatch" };
  return { ok: true, url: `${u.origin}/events/${slug}` };
}

/** Entry point for the mail lane: `{slug, url}` in, an immediate (ASAP) one-shot watch recording out. */
export function scheduleOnairWatch(input: OnairWatchInput, deps: OnairWatchDeps): OnairWatchResult {
  const no = (reason: WatchRefusal): OnairWatchResult => ({ ok: false, reason });
  if (!deps.config.enabled) return no("disabled");
  const slug = typeof input?.slug === "string" ? input.slug.toLowerCase() : "";
  if (!SLUG.test(slug)) return no("invalid-slug");
  if (!TENANT.test(deps.tenantId)) return no("invalid-tenant");
  const canonical = canonicalWatchUrl(input.url, slug);
  if (!canonical.ok) return no(canonical.reason);
  const start = deps.now();
  if (!Number.isFinite(start.getTime())) return no("invalid-clock");
  const durationSec = watchDurationSec(input.mediaDurationSec, deps.config);
  const startAt = start.toISOString(), until = new Date(start.getTime() + durationSec * 1000).toISOString();
  // One claim per slug and tenant, created exclusively and never released: a slug never runs twice.
  const dir = path.join(deps.claimDir, deps.tenantId);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(dir, `onair-watch-${slug}.json`), JSON.stringify({ version: 1, slug, url: canonical.url, claimedAt: startAt, until }), { flag: "wx", mode: 0o600 });
  } catch (error) { return no((error as NodeJS.ErrnoException).code === "EEXIST" ? "duplicate-slug" : "claim-failed"); }
  const args = ["record", canonical.url, "--until", until, "--tenant", deps.tenantId, "--session-id", `onair-watch-${slug}`, "--title", `onair watch ${slug}`];
  const done = Promise.resolve().then(() => deps.launch(args, { ...process.env, LKB_TENANT_ID: deps.tenantId, LKB_ADMISSION_TIMEOUT_S: WATCH_ADMISSION_TIMEOUT_S }));
  done.catch(() => {}); // the caller may await `done`; an ignored failure must not crash the process
  return { ok: true, slug, url: canonical.url, startAt, until, durationSec, args, done };
}

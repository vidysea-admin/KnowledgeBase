/**
 * apps/web/src/config/runtime.ts -- the ONE place the web app learns where it is mounted.
 *
 * One built image serves any base path (e.g. "/knowledgebase"). The web container generates
 * `config.js` at start from APP_BASE_PATH (and optionally APP_API_BASE); index.html loads it before
 * the app and it sets `window.__LKB_CONFIG__ = { basePath, apiBase }`. This module normalizes that
 * and exposes the router basename, a helper for app-route hrefs outside the router, and the API
 * base resolution used by api/client.ts. Local dev (vite) serves public/config.js = root, no
 * explicit apiBase, so the existing localhost:3300 dev fallback still applies.
 */
export interface RuntimeConfig {
  /** "" for root, otherwise "/segment[/segment]" with no trailing slash. */
  basePath: string;
  /** Explicit API base from config.js, "" when not configured (then the default is `<basePath>/api`). */
  apiBase: string;
}

/** "", "/", "knowledgebase", "/knowledgebase/" ... -> "" or "/knowledgebase". Drops empty, "." and ".." segments. */
export function normalizeBasePath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const segments = raw.trim().split("/").filter((s) => s !== "" && s !== "." && s !== "..");
  return segments.length ? `/${segments.join("/")}` : "";
}

export function normalizeApiBase(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

export function readRuntimeConfig(win: Window | undefined = typeof window === "undefined" ? undefined : window): RuntimeConfig {
  const raw = (win as unknown as { __LKB_CONFIG__?: unknown } | undefined)?.__LKB_CONFIG__;
  if (typeof raw !== "object" || raw === null) return { basePath: "", apiBase: "" };
  const cfg = raw as { basePath?: unknown; apiBase?: unknown };
  return { basePath: normalizeBasePath(cfg.basePath), apiBase: normalizeApiBase(cfg.apiBase) };
}

/** Prefix an app route ("/calendar") with the base path, for hrefs that cannot use a router <Link>. */
export function withBasePath(route: string, config: RuntimeConfig = readRuntimeConfig()): string {
  return `${config.basePath}${route.startsWith("/") ? route : `/${route}`}`;
}

/**
 * Precedence: VITE_API_BASE_URL build override (backward compatible) > explicit runtime apiBase >
 * dev-server fallback (vite on localhost) > `<basePath>/api` (the container's nginx proxy).
 */
export function resolveApiBase(args: { config: RuntimeConfig; viteOverride: string | undefined; devFallback: string | null; configPresent?: boolean }): string {
  const override = normalizeApiBase(args.viteOverride);
  if (override) return override;
  const explicit = normalizeApiBase(args.config.apiBase);
  if (explicit) return explicit;
  if (args.devFallback) return args.devFallback;
  // No config.js at all = a legacy deployment (bundle served without the web container's hooks): keep the
  // old same-origin default. The container always writes config.js, so it always takes the <basePath>/api route.
  if (args.configPresent === false) return "";
  return `${args.config.basePath}/api`;
}

/** True when config.js ran (the web container always writes it; `vite dev` serves public/config.js). */
export function hasRuntimeConfig(win: Window | undefined = typeof window === "undefined" ? undefined : window): boolean {
  const raw = (win as unknown as { __LKB_CONFIG__?: unknown } | undefined)?.__LKB_CONFIG__;
  return typeof raw === "object" && raw !== null;
}

const config = readRuntimeConfig();
export const runtimeConfig: RuntimeConfig = config;
export const basePath: string = config.basePath;
/** BrowserRouter basename: "/" at root. */
export const routerBasename: string = config.basePath || "/";

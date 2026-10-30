/**
 * apps/web/src/api/client.ts — one shared fetch wrapper. The API base URL comes from
 * config/runtime.ts (`<basePath>/api` by default, an explicit runtime `apiBase`, or the
 * `VITE_API_BASE_URL` build override; dev mode points it at apps/api's real port).
 * Attaches Authorization: Bearer, throws a typed ApiError on any non-2xx so callers can render a
 * real error state instead of guessing from a thrown generic Error.
 */
import { hasRuntimeConfig, resolveApiBase, runtimeConfig } from "../config/runtime.js";

function resolveApiBaseUrl(): string {
  return resolveApiBase({ config: runtimeConfig, viteOverride: import.meta.env.VITE_API_BASE_URL, devFallback: devApiFallback(), configPresent: hasRuntimeConfig() });
}

/** Dev mode only (vite on localhost): web on :5173, API on :3300. Null everywhere else. */
function devApiFallback(): string | null {
  if (typeof window === "undefined") return null;
  const { hostname, protocol } = window.location;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return null;
  if (import.meta.env.PROD) return null;
  return `${protocol}//${hostname}:3300`;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const AUTH_INVALIDATED_EVENT = "lkb:auth-invalidated";
export const AUTH_KEY_STORAGE_KEY = "lkbApiKey";

/**
 * UA-30. The "credential" every page already threads through `apiFetch(path, apiKey)` when the person signed in with an
 * account: not a secret and never stored, only the marker that the httpOnly session cookie authenticates the request
 * (`credentials: "same-origin"`, no Authorization header, `X-LKB-CSRF` on unsafe methods). The cookie itself is unreadable here.
 */
export const SESSION_CREDENTIAL = "@@lkb-cookie-session@@";
export const CSRF_HEADER = "X-LKB-CSRF";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The CSRF proof lives in this module variable only: never localStorage, sessionStorage, a cookie or a URL (UA-16, A7 item 4).
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void { csrfToken = token; }

/** The auth part of a request for `credential`: a Bearer key, or the cookie session (+ CSRF proof on unsafe methods). */
export function credentialInit(credential: string, method: string = "GET"): { headers: Record<string, string>; credentials?: RequestCredentials } {
  if (credential !== SESSION_CREDENTIAL) return { headers: { authorization: `Bearer ${credential}` } };
  const headers: Record<string, string> = {};
  if (csrfToken !== null && UNSAFE_METHODS.has(method.toUpperCase())) headers[CSRF_HEADER] = csrfToken;
  return { headers, credentials: "same-origin" };
}

export interface AuthInvalidationEventDetail {
  apiKey: string;
  /** The server's own 401 message, when the response body carried one. */
  message?: string;
}

// A request belongs to the login session that sent it, even when a later login reuses the key.
// This tab-local identity carries no credential and is never persisted or transmitted.
let authSession: object = {};
export function advanceAuthSession(): void { authSession = {}; }

function invalidateAuth(apiKey: string, sentSession: object, message?: string): void {
  if (sentSession !== authSession) return;
  if (typeof window === "undefined" || !window.dispatchEvent) return;

  try {
    const stored = window.localStorage?.getItem(AUTH_KEY_STORAGE_KEY) ?? null;
    // Only clear storage when the failed key is still the stored one. A late 401 for an
    // already-replaced key must not delete its replacement (the AuthContext event handler
    // guards React state; this guards localStorage the same way).
    if (window.localStorage && (stored === null || stored === apiKey)) {
      window.localStorage.removeItem(AUTH_KEY_STORAGE_KEY);
    }
  } catch {
    // LocalStorage access can fail in some browser states; treat it as non-fatal.
  }

  const event = new CustomEvent<AuthInvalidationEventDetail>(AUTH_INVALIDATED_EVENT, { detail: message ? { apiKey, message } : { apiKey } });
  window.dispatchEvent(event);
}

export class ApiError extends Error {
  status: number;
  /** The response body's structured `error` code (e.g. "join_rules_busy"), when the body carried one. */
  code?: string;
  /** `Retry-After` in whole seconds (delta-seconds form only), when the response carried a valid one. */
  retryAfterSeconds?: number;
  /** Closed-vocabulary `reasons` (e.g. password policy codes) from a 400 body, when present. */
  reasons?: string[];
  constructor(status: number, message: string, extra: { code?: string; retryAfterSeconds?: number; reasons?: string[] } = {}) {
    super(message);
    this.status = status;
    if (extra.code !== undefined) this.code = extra.code;
    if (extra.retryAfterSeconds !== undefined) this.retryAfterSeconds = extra.retryAfterSeconds;
    if (extra.reasons !== undefined) this.reasons = extra.reasons;
    this.name = "ApiError";
  }
}

function parseRetryAfter(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined || !/^\d{1,6}$/.test(raw.trim())) return undefined;
  return Number(raw.trim());
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Extra request headers (e.g. If-Match). Never overrides authorization, content-type or the CSRF proof. */
  headers?: HeadersInit;
  /** Called with the response headers of a 2xx response, before the body is parsed. Lets a caller read ETag without the wrapper changing its return type. */
  onResponseHeaders?: (headers: Headers) => void;
}

/** Caller headers (plain object, tuple array or Headers) minus authorization / content-type in ANY letter case: a differently-cased duplicate key would otherwise be merged into the real one by fetch (ISS-RULESWEB-002). */
function callerHeaders(extra: HeadersInit | undefined): Record<string, string> {
  // Entries keep the caller's own key casing (existing consumers assert on it); only the two protected names go, in any case.
  const entries: [string, string][] = extra === undefined ? [] : extra instanceof Headers ? [...extra.entries()] : Array.isArray(extra) ? extra.map(([k, v]) => [k, v] as [string, string]) : Object.entries(extra);
  return Object.fromEntries(entries.filter(([k]) => { const n = k.toLowerCase(); return n !== "authorization" && n !== "content-type" && n !== CSRF_HEADER.toLowerCase(); }));
}

export async function apiFetch<T>(path: string, apiKey: string | null, options: ApiFetchOptions = {}): Promise<T> {
  if (!apiKey) throw new ApiError(401, "no API key set");
  return send<T>(path, apiKey, options, true);
}

async function send<T>(path: string, apiKey: string, options: ApiFetchOptions, mayRefreshCsrf: boolean): Promise<T> {
  const sentSession = authSession;
  const method = options.method ?? "GET";
  const auth = credentialInit(apiKey, method);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...callerHeaders(options.headers),
        ...auth.headers,
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      ...(auth.credentials ? { credentials: auth.credentials } : {}),
    });
  } catch (err) {
    const target = API_BASE_URL || "same origin";
    const detail = `failed to connect to ${target}`;
    throw new ApiError(0, `${detail} (${err instanceof Error ? err.message : "network error"})`);
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let serverMessage: string | undefined;
    let code: string | undefined;
    let reasons: string[] | undefined;
    try {
      const body = (await res.json()) as { message?: string; error?: unknown; reasons?: unknown };
      if (body.message) { message = body.message; serverMessage = body.message; }
      if (typeof body.error === "string") code = body.error;
      if (Array.isArray(body.reasons)) reasons = body.reasons.filter((r): r is string => typeof r === "string");
    } catch {
      // response wasn't JSON; keep the generic message
    }
    // A stale CSRF proof (the server rotated its secret or restarted with a new one): fetch a fresh one once and replay.
    // The session's own 401 handling below is untouched; a second 403 csrf is surfaced as is.
    if (res.status === 403 && code === "csrf" && apiKey === SESSION_CREDENTIAL && mayRefreshCsrf && sentSession === authSession && await refreshCsrfToken()) {
      return send<T>(path, apiKey, options, false);
    }
    if (res.status === 401) invalidateAuth(apiKey, sentSession, serverMessage);
    throw new ApiError(res.status, message, { code, retryAfterSeconds: parseRetryAfter(res.headers?.get?.("retry-after")), reasons });
  }
  options.onResponseHeaders?.(res.headers);
  return res.json() as Promise<T>;
}

/** GET /auth/session for a fresh CSRF proof. True only when one was obtained; never throws, never invalidates auth. */
async function refreshCsrfToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/session`, { credentials: "same-origin" });
    if (!res.ok) return false;
    const body = (await res.json()) as { csrfToken?: unknown };
    if (typeof body.csrfToken !== "string" || body.csrfToken === "") return false;
    csrfToken = body.csrfToken;
    return true;
  } catch {
    return false;
  }
}

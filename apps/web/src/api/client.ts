/**
 * apps/web/src/api/client.ts — one shared fetch wrapper. Reads the API base URL from Vite's env
 * (`VITE_API_BASE_URL`, defaults to same-origin `""` for the Docker/prod case where apps/web is
 * served behind the same reverse proxy as apps/api; dev mode points it at apps/api's real port).
 * Attaches Authorization: Bearer, throws a typed ApiError on any non-2xx so callers can render a
 * real error state instead of guessing from a thrown generic Error.
 */
function normalizeBaseUrl(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const configured = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (configured) return configured;

  if (typeof window === "undefined") return "";

  const { hostname, protocol } = window.location;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return "";
  if (import.meta.env.PROD) return "";

  // Dev mode default: web runs on Vite (usually :5173), API on :3300.
  return `${protocol}//${hostname}:3300`;
}

export const API_BASE_URL = resolveApiBaseUrl();

export const AUTH_INVALIDATED_EVENT = "lkb:auth-invalidated";
export const AUTH_KEY_STORAGE_KEY = "lkbApiKey";

export interface AuthInvalidationEventDetail {
  apiKey: string;
}

function invalidateAuth(apiKey: string): void {
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

  const event = new CustomEvent<AuthInvalidationEventDetail>(AUTH_INVALIDATED_EVENT, { detail: { apiKey } });
  window.dispatchEvent(event);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

export async function apiFetch<T>(path: string, apiKey: string | null, options: ApiFetchOptions = {}): Promise<T> {
  if (!apiKey) throw new ApiError(401, "no API key set");

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    const target = API_BASE_URL || "same origin";
    const detail = `failed to connect to ${target}`;
    throw new ApiError(0, `${detail} (${err instanceof Error ? err.message : "network error"})`);
  }

  if (!res.ok) {
    if (res.status === 401) invalidateAuth(apiKey);
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // response wasn't JSON; keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

/**
 * ua-web A7 items 2, 4, 5: the cookie-session mode of apiFetch. Client logic only (headers, credentials, CSRF in memory,
 * 401 handling); the server's refusal of a forged write is proven by the API suites, and the live walk is an open point.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { advanceAuthSession, apiFetch, AUTH_INVALIDATED_EVENT, SESSION_CREDENTIAL, setCsrfToken } from "./client.js";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const lastInit = (m: ReturnType<typeof vi.fn>, n = -1) => (m.mock.calls.at(n) as unknown as [string, RequestInit])[1];

describe("apiFetch with the account session", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setCsrfToken(null); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setCsrfToken(null); });

  test("sends the cookie (same-origin) and NO Authorization header; the marker never reaches the wire", async () => {
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/sessions", SESSION_CREDENTIAL);
    const init = lastInit(fetchMock);
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("authorization")).toBeNull();
    expect(JSON.stringify(init)).not.toContain(SESSION_CREDENTIAL);
  });

  test("CSRF proof: attached on POST/PUT/DELETE, absent on GET, and a caller cannot override it in any letter case", async () => {
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("proof-1");
    await apiFetch("/x", SESSION_CREDENTIAL);
    expect(new Headers(lastInit(fetchMock).headers).get("x-lkb-csrf")).toBeNull();
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      await apiFetch("/x", SESSION_CREDENTIAL, { method, body: {}, headers: { "x-lkb-csrf": "evil", "X-LKB-CSRF": "evil2" } });
      expect(new Headers(lastInit(fetchMock).headers).get("x-lkb-csrf")).toBe("proof-1");
    }
  });

  test("an API key request is unchanged: Bearer, no credentials option, no CSRF header even when a proof is held", async () => {
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("proof-1");
    await apiFetch("/x", "real-key", { method: "POST", body: {} });
    const init = lastInit(fetchMock);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer real-key");
    expect(new Headers(init.headers).get("x-lkb-csrf")).toBeNull();
    expect("credentials" in init).toBe(false);
  });

  test("the CSRF proof and the marker are never written to any storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", vi.fn(async () => json(200, {})));
    setCsrfToken("proof-secret-value");
    await apiFetch("/x", SESSION_CREDENTIAL, { method: "POST", body: {} });
    expect(setItem).not.toHaveBeenCalled();
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i)!)).not.toContain("proof-secret-value");
    }
  });

  test("403 csrf: one fresh proof is fetched from GET /auth/session and the write is replayed once", async () => {
    const calls: Array<[string, string | undefined, string | null]> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init?.method, new Headers(init?.headers).get("x-lkb-csrf")]);
      if (url.endsWith("/auth/session")) return json(200, { csrfToken: "fresh" });
      return new Headers(init?.headers).get("x-lkb-csrf") === "fresh" ? json(200, { ok: true }) : json(403, { error: "csrf", message: "missing or invalid CSRF proof" });
    });
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("stale");
    await expect(apiFetch("/things", SESSION_CREDENTIAL, { method: "POST", body: {} })).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c[2])).toEqual(["stale", null, "fresh"]);
  });

  test("a proof fetched for a session that was replaced while the refresh was in flight is not adopted", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/session")) { advanceAuthSession(); setCsrfToken(null); return json(200, { csrfToken: "proof-of-the-old-login" }); } // a sign-in/out lands mid-refresh
      return json(403, { error: "csrf", message: "missing or invalid CSRF proof" });
    });
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("stale");
    await expect(apiFetch("/things", SESSION_CREDENTIAL, { method: "POST", body: {} })).rejects.toMatchObject({ status: 403, code: "csrf" });
    fetchMock.mockClear();
    await apiFetch("/other", SESSION_CREDENTIAL, { method: "POST", body: {} }).catch(() => undefined);
    expect(new Headers(lastInit(fetchMock, 0).headers).get("x-lkb-csrf")).toBeNull();
  });

  test("403 csrf that persists is surfaced after exactly one replay (no loop)", async () => {
    const fetchMock = vi.fn(async (url: string) => (url.endsWith("/auth/session") ? json(200, { csrfToken: "fresh" }) : json(403, { error: "csrf", message: "no" })));
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("stale");
    await expect(apiFetch("/things", SESSION_CREDENTIAL, { method: "POST", body: {} })).rejects.toMatchObject({ status: 403, code: "csrf" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("an API-key 403 csrf is never retried", async () => {
    const fetchMock = vi.fn(async () => json(403, { error: "csrf", message: "no" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiFetch("/things", "key", { method: "POST", body: {} })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("401 session_revoked emits one invalidation carrying the marker and the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: "session_revoked", message: "this session has ended; sign in again" })));
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(AUTH_INVALIDATED_EVENT, on);
    await expect(apiFetch("/sessions", SESSION_CREDENTIAL)).rejects.toMatchObject({ status: 401, code: "session_revoked" });
    window.removeEventListener(AUTH_INVALIDATED_EVENT, on);
    expect(seen).toEqual([{ apiKey: SESSION_CREDENTIAL, message: "this session has ended; sign in again" }]);
  });

  test("stale-401 guard: an in-flight request of a previous login cannot invalidate the new one", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const old = apiFetch("/sessions", SESSION_CREDENTIAL).catch((e: unknown) => e);
    advanceAuthSession(); // a new login happened meanwhile
    resolve(json(401, { error: "session_revoked", message: "old" }));
    expect(await old).toMatchObject({ status: 401 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("a 400 body's closed-vocabulary reasons are exposed on the ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(400, { error: "invalid_request", message: "x", fields: ["password"], reasons: ["too_short", 5, "common"] })));
    await expect(apiFetch("/auth/signup", SESSION_CREDENTIAL, { method: "POST", body: {} })).rejects.toMatchObject({ status: 400, reasons: ["too_short", "common"] });
  });
});

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

/**
 * ISS-UAWEB-001 (D-015). A cookie-session person is signed out only by the session's own end: a 401 `session_revoked` /
 * `session_expired`, a 401 on `GET /auth/session` (the identity check), or a feature 401 whose follow-up identity probe also
 * answers 401. A 401/403 from a feature route while the session is alive leaves them signed in.
 * CORPUS is the recorded reproduction list of ISS-UAWEB-001 (the qa/issues.uaweb.jsonl row and the verdicts ua-web.md / ua-web.b.md
 * it was reconciled from), one entry per recorded request, each answered the way the live API answered it.
 */
type Repro = { id: string; who: string; method: "GET" | "POST"; path: string; status: number; body: unknown };
const CORPUS: Repro[] = [
  { id: "R1", who: "admin session", method: "GET", path: "/meeting-bot/capture-readiness", status: 401, body: { error: "unauthorized" } },
  { id: "R2", who: "viewer session", method: "GET", path: "/meeting-bot/capture-readiness", status: 401, body: { error: "unauthorized" } },
  { id: "R3", who: "member session", method: "GET", path: "/meeting-bot/capture-readiness", status: 401, body: { error: "unauthorized" } },
  { id: "R4", who: "extraction-review router", method: "GET", path: "/extraction-review", status: 401, body: { error: "unauthorized" } },
  { id: "R5", who: "label-review router", method: "GET", path: "/label-review", status: 401, body: { error: "unauthorized" } },
  { id: "R6", who: "knowledge collections router", method: "POST", path: "/knowledge/document-sources", status: 401, body: { error: "verified_key_identity_required" } },
  { id: "R7", who: "registration-approvals router", method: "POST", path: "/registration-approvals", status: 401, body: { error: "unauthorized" } },
  { id: "R8", who: "speaker-attributes router", method: "GET", path: "/speaker-attributes", status: 401, body: { error: "unauthorized" } },
  { id: "R9", who: "member/admin session, DashboardPage", method: "GET", path: "/keys", status: 403, body: { error: "forbidden", message: "x" } },
  { id: "R10", who: "member session, /ask", method: "GET", path: "/answer-policies", status: 403, body: { error: "forbidden", message: "x" } },
];

describe("ISS-UAWEB-001: a feature route's 401/403 does not end the cookie session", () => {
  let sessionAlive: boolean;
  let probeStatus: number | "network";
  let calls: string[];
  const events: unknown[] = [];
  const on = (e: Event) => events.push((e as CustomEvent).detail);
  const serve = (feature: Repro | null) => vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/^(\/knowledgebase)?\/api/, "");
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/auth/session") {
      if (probeStatus === "network") throw new TypeError("offline");
      if (probeStatus !== 200) return json(probeStatus, { error: "unauthorized", message: "sign in required" });
      return sessionAlive ? json(200, { csrfToken: "c" }) : json(401, { error: "unauthorized", message: "sign in required" });
    }
    return feature ? json(feature.status, feature.body) : json(200, {});
  });
  beforeEach(() => { localStorage.clear(); setCsrfToken(null); sessionAlive = true; probeStatus = 200; calls = []; events.length = 0; window.addEventListener(AUTH_INVALIDATED_EVENT, on); });
  afterEach(() => { window.removeEventListener(AUTH_INVALIDATED_EVENT, on); vi.restoreAllMocks(); vi.unstubAllGlobals(); setCsrfToken(null); });

  test("C1/C3: every recorded reproduction leaves the session alive (N/N)", async () => {
    let kept = 0;
    for (const r of CORPUS) {
      events.length = 0; calls = [];
      vi.stubGlobal("fetch", serve(r));
      await expect(apiFetch(r.path, SESSION_CREDENTIAL, r.method === "POST" ? { method: "POST", body: {} } : {})).rejects.toMatchObject({ status: r.status });
      if (events.length !== 0) throw new Error(`${r.id} (${r.who}) ended the session`);
      kept += 1;
    }
    expect(`${kept}/${CORPUS.length}`).toBe(`${CORPUS.length}/${CORPUS.length}`);
  });

  test("C1: a 403 never ends the session and costs no identity probe", async () => {
    vi.stubGlobal("fetch", serve(CORPUS[8]!));
    await expect(apiFetch("/keys", SESSION_CREDENTIAL)).rejects.toMatchObject({ status: 403 });
    expect(events).toEqual([]);
    expect(calls).toEqual(["GET /keys"]);
  });

  test("C1: a feature 401 is confirmed against GET /auth/session (same-origin cookie, no Authorization) before it is judged", async () => {
    const fetchMock = serve(CORPUS[0]!);
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiFetch("/meeting-bot/capture-readiness", SESSION_CREDENTIAL)).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(calls).toEqual(["GET /meeting-bot/capture-readiness", "GET /auth/session"]);
    const probe = lastInit(fetchMock);
    expect(probe.credentials).toBe("same-origin");
    expect(new Headers(probe.headers).get("authorization")).toBeNull();
    expect(events).toEqual([]);
  });

  test("C1: a probe that cannot answer (5xx or no network) is not a session end", async () => {
    for (const p of [503, "network"] as const) {
      probeStatus = p; events.length = 0;
      vi.stubGlobal("fetch", serve(CORPUS[0]!));
      await expect(apiFetch("/meeting-bot/capture-readiness", SESSION_CREDENTIAL)).rejects.toMatchObject({ status: 401 });
      expect(events).toEqual([]);
    }
  });

  test("C1: simultaneous feature 401s share one identity probe", async () => {
    vi.stubGlobal("fetch", serve(CORPUS[0]!));
    await Promise.allSettled([apiFetch("/meeting-bot/capture-readiness", SESSION_CREDENTIAL), apiFetch("/extraction-review", SESSION_CREDENTIAL), apiFetch("/label-review", SESSION_CREDENTIAL)]);
    expect(calls.filter((c) => c === "GET /auth/session")).toHaveLength(1);
    expect(events).toEqual([]);
  });

  test("C2: a 401 on GET /auth/session itself ends the session, once, with the server's message", async () => {
    sessionAlive = false;
    vi.stubGlobal("fetch", serve(null));
    await expect(apiFetch("/auth/session", SESSION_CREDENTIAL)).rejects.toMatchObject({ status: 401 });
    expect(events).toEqual([{ apiKey: SESSION_CREDENTIAL, message: "sign in required" }]);
    expect(calls).toEqual(["GET /auth/session"]); // the identity check is its own proof: no second probe
  });

  test("C2: a feature 401 whose identity probe also answers 401 (the cookie is really dead) ends the session once", async () => {
    sessionAlive = false;
    vi.stubGlobal("fetch", serve(CORPUS[0]!));
    await Promise.allSettled([apiFetch("/meeting-bot/capture-readiness", SESSION_CREDENTIAL), apiFetch("/label-review", SESSION_CREDENTIAL)]);
    expect(events).toEqual([{ apiKey: SESSION_CREDENTIAL, message: "sign in required" }]);
  });

  test("C2: 401 session_expired and session_revoked from a feature route end the session with no probe", async () => {
    for (const code of ["session_expired", "session_revoked"]) {
      events.length = 0; calls = [];
      vi.stubGlobal("fetch", serve({ id: code, who: "x", method: "GET", path: "/sessions", status: 401, body: { error: code, message: `m-${code}` } }));
      await expect(apiFetch("/sessions", SESSION_CREDENTIAL)).rejects.toMatchObject({ status: 401, code });
      expect(events).toEqual([{ apiKey: SESSION_CREDENTIAL, message: `m-${code}` }]);
      expect(calls).toEqual(["GET /sessions"]);
    }
  });

  test("a probe that lands after a sign-in/out replaced the login cannot end the new one", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/auth/session")) { await gate; return json(401, { error: "unauthorized", message: "old" }); }
      return json(401, { error: "unauthorized" });
    }));
    const pending = apiFetch("/label-review", SESSION_CREDENTIAL).catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 0));
    advanceAuthSession(); // a new login happened while the probe was in flight
    release();
    expect(await pending).toMatchObject({ status: 401 });
    expect(events).toEqual([]);
  });

  test("an API-key 401 is unchanged: it still invalidates, with no identity probe", async () => {
    vi.stubGlobal("fetch", serve(CORPUS[0]!));
    await expect(apiFetch("/meeting-bot/capture-readiness", "real-key")).rejects.toMatchObject({ status: 401 });
    expect(events).toEqual([{ apiKey: "real-key" }]);
    expect(calls).toEqual(["GET /meeting-bot/capture-readiness"]);
  });
});

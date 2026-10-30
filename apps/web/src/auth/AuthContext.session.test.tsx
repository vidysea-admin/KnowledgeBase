/** ua-web A7 items 1, 4, 5 at the provider level: restoreSession, adoptSession, signOut, and the stale-401 / stale-probe fences. */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { advanceAuthSession, apiFetch, SESSION_CREDENTIAL, setCsrfToken } from "../api/client.js";
import type { SessionInfo } from "../api/user-accounts.js";
import { AuthProvider, useAuth } from "./AuthContext.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const info = (id = "u1", role: "admin" | "member" | "viewer" = "member", csrf = "csrf-1"): SessionInfo => ({ state: "active", user: { id, displayName: id, role }, csrfToken: csrf });
const wire = (s: SessionInfo) => ({ state: s.state, user: s.user, csrfToken: s.csrfToken });

type Ctx = ReturnType<typeof useAuth>;
let ctx: Ctx;
function Probe() { ctx = useAuth(); return <div data-testid="p">{ctx.apiKey ?? "none"}|{ctx.restoring ? "restoring" : "idle"}|{ctx.authError ?? ""}</div>; }
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); setCsrfToken(null); advanceAuthSession();
  (window as unknown as { __LKB_CONFIG__: unknown }).__LKB_CONFIG__ = { basePath: "", apiBase: "", userAccounts: true };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete (window as unknown as { __LKB_CONFIG__?: unknown }).__LKB_CONFIG__; });

describe("restoreSession", () => {
  test("a live cookie becomes the session marker + user + CSRF proof, and nothing is stored", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", vi.fn(async () => json(200, wire(info("ada", "admin", "csrf-9")))));
    mount();
    expect(ctx.restoring).toBe(true);
    await act(async () => { await ctx.restoreSession(); });
    expect(ctx.apiKey).toBe(SESSION_CREDENTIAL);
    expect(ctx.user).toMatchObject({ id: "ada", role: "admin" });
    expect(ctx.restoring).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    // the proof is what the next unsafe call carries
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/x", ctx.apiKey, { method: "POST", body: {} });
    expect(new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get("x-lkb-csrf")).toBe("csrf-9");
  });

  test("401 (signed out) and an unreachable server both end in the login state without an error banner", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: "unauthorized", message: "sign in required" })));
    mount();
    await act(async () => { await ctx.restoreSession(); });
    expect(ctx).toMatchObject({ apiKey: null, restoring: false, authError: null, user: null });
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    mount();
    await act(async () => { await ctx.restoreSession(); });
    expect(ctx).toMatchObject({ apiKey: null, restoring: false, authError: null });
  });

  test("a sign-in that completes while the probe is in flight wins (version fence)", async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { release = done; })));
    mount();
    let probe!: Promise<void>;
    act(() => { probe = ctx.restoreSession(); });
    act(() => { ctx.adoptSession(info("bob", "member", "csrf-new")); });
    await act(async () => { release(json(200, wire(info("old", "admin", "csrf-old")))); await probe; });
    expect(ctx.user?.id).toBe("bob"); // the slow probe for the earlier cookie did not overwrite it
  });

  test("an API key present at start skips the probe", async () => {
    localStorage.setItem("lkbApiKey", "k");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await act(async () => { await ctx.restoreSession(); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.apiKey).toBe("k");
  });
});

describe("adoptSession / key switching", () => {
  test("adopting a session removes a stored API key; entering a key later drops the session and the proof", async () => {
    localStorage.setItem("lkbApiKey", "old-key");
    vi.stubGlobal("fetch", vi.fn(async () => json(200, {})));
    mount();
    act(() => { ctx.adoptSession(info()); });
    expect(localStorage.getItem("lkbApiKey")).toBeNull();
    expect(ctx.apiKey).toBe(SESSION_CREDENTIAL);
    act(() => { ctx.setApiKey("typed-key"); });
    expect(ctx.user).toBeNull();
    expect(ctx.apiKey).toBe("typed-key");
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/x", ctx.apiKey, { method: "POST", body: {} });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("x-lkb-csrf")).toBeNull();
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer typed-key");
  });

  test("viewer role sets readOnly; member and admin do not", () => {
    vi.stubGlobal("fetch", vi.fn());
    mount();
    act(() => { ctx.adoptSession(info("v", "viewer")); });
    expect(ctx.readOnly).toBe(true);
    act(() => { ctx.adoptSession(info("m", "member")); });
    expect(ctx.readOnly).toBe(false);
  });
});

describe("signOut", () => {
  test("server confirms: POST /auth/logout with the proof, then everything local is reset", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => { calls.push(`${i?.method ?? "GET"} ${u} ${new Headers(i?.headers).get("x-lkb-csrf")}`); return json(200, { ok: true }); }));
    mount();
    act(() => { ctx.adoptSession(info("u", "member", "csrf-7")); });
    let ok = false;
    await act(async () => { ok = await ctx.signOut(); });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^POST .*\/auth\/logout csrf-7$/);
    expect(ctx).toMatchObject({ apiKey: null, user: null });
  });

  test("server unreachable: the person still leaves locally and the caller learns it was not confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    mount();
    act(() => { ctx.adoptSession(info()); });
    let ok = true;
    await act(async () => { ok = await ctx.signOut(); });
    expect(ok).toBe(false);
    expect(ctx).toMatchObject({ apiKey: null, user: null });
  });
});

describe("401 handling (item 5)", () => {
  test("session_revoked clears the session and shows the server's reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: "session_revoked", message: "this session has ended; sign in again" })));
    mount();
    act(() => { ctx.adoptSession(info()); });
    await act(async () => { await apiFetch("/sessions", ctx.apiKey).catch(() => undefined); });
    await waitFor(() => expect(ctx.apiKey).toBeNull());
    expect(ctx.authError).toBe("this session has ended; sign in again");
    expect(ctx.user).toBeNull();
  });

  test("a 401 for a request sent before a NEW sign-in does not sign the new session out", async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { release = done; })));
    mount();
    act(() => { ctx.adoptSession(info("first")); });
    let late!: Promise<unknown>;
    act(() => { late = apiFetch("/sessions", ctx.apiKey).catch(() => undefined); });
    act(() => { ctx.adoptSession(info("second", "member", "csrf-2")); });
    await act(async () => { release(json(401, { error: "session_revoked", message: "old" })); await late; });
    expect(ctx.apiKey).toBe(SESSION_CREDENTIAL);
    expect(ctx.user?.id).toBe("second");
    expect(ctx.authError).toBeNull();
  });

  test("a 401 on an API key still reports that key was not accepted (unchanged)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: "unauthorized" , message: "" })));
    mount();
    act(() => { ctx.setApiKey("bad"); });
    await act(async () => { await apiFetch("/x", ctx.apiKey).catch(() => undefined); });
    await waitFor(() => expect(ctx.apiKey).toBeNull());
    expect(ctx.authError).toBe("That API key was not accepted.");
  });
});

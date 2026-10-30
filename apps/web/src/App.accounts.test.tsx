/**
 * ua-web A7 acceptance 1-7, client side, against a stateful fake of apps/api's /auth and /admin routes (cookie jar, CSRF proof,
 * revocation, read-only role). The live browser walk on the work stack waits on ua-production-enable; the server's own refusals
 * are proven by the A3/A4/A6 suites. Each step is asserted by a state change in the fake server or the URL, not by render alone.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App.js";
import { apiFetch, SESSION_CREDENTIAL, setCsrfToken } from "./api/client.js";

type U = { id: string; name: string; email: string; password: string; status: "unverified" | "pending" | "active" | "rejected" | "disabled"; role: "admin" | "member" | "viewer" | null };
interface Req { method: string; path: string; body: unknown; auth: string | null; csrf: string | null; credentials: string | undefined }

function makeServer() {
  const users: U[] = [{ id: "u-admin", name: "Ada Admin", email: "ada@x.org", password: "correct horse battery", status: "active", role: "admin" }];
  const st = { sid: null as string | null, revokedSid: null as string | null, logoutFails: false, cookiesWork: true, blockLogin: null as null | { status: number; body: unknown }, reqs: [] as Req[], tokens: new Map<string, string>(), n: 0 };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const sessionUser = () => users.find((u) => st.sid && st.sid === `sid-${u.id}`);
  const sessionBody = (u: U) => ({ state: u.status, user: { id: u.id, displayName: u.name, role: u.role }, csrfToken: `csrf-${st.sid}` });
  const handler = async (input: string, init?: RequestInit): Promise<Response> => {
    const path = input.replace(/^https?:\/\/[^/]+/, "").replace(/^(\/knowledgebase)?\/api/, "");
    const method = init?.method ?? "GET";
    const h = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    st.reqs.push({ method, path, body, auth: h.get("authorization"), csrf: h.get("x-lkb-csrf"), credentials: init?.credentials });
    const hasCookie = st.cookiesWork && st.sid !== null;
    if (path === "/auth/signup") {
      if (st.blockLogin?.status === 503) return json(503, { error: "signup_not_configured", message: "x" });
      users.push({ id: `u-${++st.n}`, name: body.displayName, email: body.email, password: body.password, status: "unverified", role: null });
      return json(202, { ok: true, next: "check_email" });
    }
    if (path === "/auth/verify-email") {
      const id = st.tokens.get(body.token); const u = users.find((x) => x.id === id);
      if (!u || u.status !== "unverified") return json(400, { error: "invalid_token", message: "x" });
      st.tokens.delete(body.token); u.status = "pending"; return json(200, { ok: true, state: "pending" });
    }
    if (path === "/auth/login") {
      if (st.blockLogin) return json(st.blockLogin.status, st.blockLogin.body);
      const u = users.find((x) => x.email === body.email);
      if (!u || u.password !== body.password) return json(401, { error: "invalid_credentials", message: "invalid email or password" });
      if (u.status === "rejected" || u.status === "disabled") return json(200, { state: u.status });
      st.sid = `sid-${u.id}`; st.revokedSid = null;
      return json(200, sessionBody(u));
    }
    if (h.get("authorization") === "Bearer operator-key") return json(200, { policies: [], history: [], sessions: [], questions: [], conflicts: [], items: [], events: [], sources: [], keys: [], gaps: [], next: null });
    // everything below needs the cookie
    if (!hasCookie) return json(401, { error: "unauthorized", message: "sign in required" });
    if (st.revokedSid === st.sid) return json(401, { error: "session_revoked", message: "this session has ended; sign in again" });
    const me = sessionUser()!;
    if (h.get("authorization")) return json(403, { error: "key_not_allowed", message: "x" });
    if (path === "/auth/session") return json(200, sessionBody(me));
    if (method !== "GET" && h.get("x-lkb-csrf") !== `csrf-${st.sid}`) return json(403, { error: "csrf", message: "missing or invalid CSRF proof" });
    if (path === "/auth/logout") { if (st.logoutFails) return json(500, { error: "internal", message: "x" }); st.sid = null; return json(200, { ok: true }); }
    if (me.status !== "active") return json(403, { error: "account_not_active", message: "x" });
    if (me.role === "viewer" && method !== "GET") return json(403, { error: "read_only_role", message: "x" });
    if (path.startsWith("/admin/users") && method === "GET") {
      if (me.role !== "admin") return json(403, { error: "forbidden", message: "x" });
      const status = new URL(`http://x${path}`).searchParams.get("status");
      const list = users.filter((u) => !status || u.status === status).map((u) => ({ id: u.id, email: u.email, displayName: u.name, status: u.status, role: u.role, createdAt: "2026-10-30T00:00:00Z", updatedAt: "2026-10-30T00:00:00Z" }));
      return json(200, { users: list, next: null, pendingCount: users.filter((u) => u.status === "pending").length });
    }
    const approve = /^\/admin\/users\/([^/]+)\/approve$/.exec(path);
    if (approve && method === "POST") {
      if (me.role !== "admin") return json(403, { error: "admin_session_required", message: "x" });
      const u = users.find((x) => x.id === approve[1])!; u.status = "active"; u.role = body.role; return json(200, { user: {} });
    }
    return json(200, { policies: [], history: [], sessions: [], questions: [], conflicts: [], items: [], events: [], sources: [], keys: [], gaps: [], next: null });
  };
  return { users, st, handler, jar: { revoke: () => { st.revokedSid = st.sid; } } };
}

type Server = ReturnType<typeof makeServer>;
let server: Server;
const enable = () => { (window as unknown as { __LKB_CONFIG__: unknown }).__LKB_CONFIG__ = { basePath: "", apiBase: "", userAccounts: true }; };
const visit = (path: string) => { window.history.pushState({}, "", path); return render(<App />); };
const paths = () => server.st.reqs.map((r) => `${r.method} ${r.path}`);

async function signIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setCsrfToken(null); server = makeServer(); enable(); vi.stubGlobal("fetch", vi.fn((u: string, i?: RequestInit) => server.handler(u, i))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete (window as unknown as { __LKB_CONFIG__?: unknown }).__LKB_CONFIG__; });

describe("account sign-in is dark by default (item 6)", () => {
  test("without userAccounts in config.js the API-key gate is untouched and /auth is never called", () => {
    delete (window as unknown as { __LKB_CONFIG__?: unknown }).__LKB_CONFIG__;
    visit("/ask");
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(server.st.reqs).toEqual([]);
  });
});

describe("persona walk T1..T5 (item 1, client side)", () => {
  test("signup -> check-email -> verify -> pending -> admin approves -> member uses the app -> reopen keeps the session -> logout -> API 401", async () => {
    const user = userEvent.setup();

    // T1 signup. Signed out at /ask is sent to /login first (state: the URL), then to /signup.
    visit("/ask");
    await screen.findByRole("button", { name: "Sign in" });
    expect(window.location.pathname).toBe("/login");
    await user.click(screen.getByRole("link", { name: "Create an account" }));
    await user.type(await screen.findByLabelText("Your name"), "Mia Member");
    await user.type(screen.getByLabelText("Email"), "mia@x.org");
    await user.type(screen.getByLabelText("Password"), "a long passphrase here");
    await user.type(screen.getByLabelText("Confirm password"), "a long passphrase here");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("heading", { name: "Account requested" });
    expect(window.location.pathname).toBe("/signup/check-email");
    expect(server.users.find((u) => u.email === "mia@x.org")?.status).toBe("unverified");
    const signup = server.st.reqs.find((r) => r.path === "/auth/signup")!;
    expect(Object.keys(signup.body as object).sort()).toEqual(["displayName", "email", "password"]);

    // T2 verify: the admin-issued link carries the token in the FRAGMENT; it is stripped from the address bar.
    server.st.tokens.set("tok-1", server.users.find((u) => u.email === "mia@x.org")!.id);
    cleanup();
    visit("/verify#token=tok-1");
    expect(window.location.hash).toBe("");
    expect(server.st.reqs.some((r) => r.path === "/auth/verify-email")).toBe(false); // no call until the click
    await user.click(await screen.findByRole("button", { name: "Confirm my email" }));
    await screen.findByRole("heading", { name: "Email confirmed" });
    expect(server.users.find((u) => u.email === "mia@x.org")?.status).toBe("pending");

    // T3 pending: the session exists but only the waiting screen is reachable.
    cleanup();
    visit("/ask");
    await signIn(user, "mia@x.org", "a long passphrase here");
    await screen.findByRole("heading", { name: "Waiting for approval" });
    expect(window.location.pathname).toBe("/pending");
    expect(screen.queryByLabelText("Question")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: "Sign in" });
    expect(server.st.sid).toBeNull();

    // T4 admin approves with a chosen role.
    cleanup(); setCsrfToken(null);
    visit("/admin/users"); // the signed-out visit is sent to /login and returned here after sign-in
    await signIn(user, "ada@x.org", "correct horse battery");
    await screen.findByText("Mia Member");
    expect(window.location.pathname).toBe("/admin/users");
    expect(screen.getByRole("link", { name: "Account audit" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Role for Mia Member/), "member");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(server.users.find((u) => u.email === "mia@x.org")).toMatchObject({ status: "active", role: "member" }));
    const approve = server.st.reqs.find((r) => r.path.endsWith("/approve"))!;
    expect(approve.body).toEqual({ role: "member" });
    expect(approve.csrf).toMatch(/^csrf-sid-/);
    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]!);
    await waitFor(() => expect(server.st.sid).toBeNull());

    // T5 member signs in, uses the app, closes and reopens the browser (cookie jar survives, JS state does not).
    cleanup(); setCsrfToken(null);
    visit("/ask");
    await signIn(user, "mia@x.org", "a long passphrase here");
    await screen.findAllByLabelText("Question");
    expect(window.location.pathname).toBe("/ask");
    cleanup(); setCsrfToken(null);
    const before = server.st.reqs.length;
    visit("/ask");
    await screen.findAllByLabelText("Question");
    expect(server.st.reqs.slice(before).map((r) => `${r.method} ${r.path}`)[0]).toBe("GET /auth/session"); // restored from the cookie, not from storage
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();

    // logout, then an API call from the same page is 401.
    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]!);
    await screen.findByRole("button", { name: "Sign in" });
    expect(server.st.sid).toBeNull();
    await expect(apiFetch("/sessions", SESSION_CREDENTIAL)).rejects.toMatchObject({ status: 401 });
    expect(server.st.reqs.every((r) => r.auth === null && (r.path.startsWith("/auth/") ? true : r.credentials === "same-origin"))).toBe(true);
  }, 30000); // a full five-step walk takes ~4s alone; the default 5s flaked under a loaded machine
});

describe("viewer (item 2, client side)", () => {
  test("read-only banner, no admin navigation, and a forced write is refused by the server (fake)", async () => {
    server.users.push({ id: "u-v", name: "Vic Viewer", email: "vic@x.org", password: "viewer passphrase 1", status: "active", role: "viewer" });
    const user = userEvent.setup();
    visit("/ask");
    await signIn(user, "vic@x.org", "viewer passphrase 1");
    await screen.findByText(/Read-only account/);
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your account" })).toBeInTheDocument();
    await expect(apiFetch("/knowledge/ingest", SESSION_CREDENTIAL, { method: "POST", body: { x: 1 } })).rejects.toMatchObject({ status: 403, code: "read_only_role" });
  });
});

describe("storage and CSRF memory (item 4)", () => {
  test("after login nothing session-related is written to local/session storage; a reload re-fetches the proof", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    visit("/ask");
    await signIn(user, "ada@x.org", "correct horse battery");
    await screen.findAllByLabelText("Question");
    expect(setItem).not.toHaveBeenCalled();
    for (const store of [localStorage, sessionStorage]) expect(store.length).toBe(0);
    cleanup(); setCsrfToken(null); // a reload: module memory is gone
    visit("/ask");
    await screen.findAllByLabelText("Question");
    await apiFetch("/something", SESSION_CREDENTIAL, { method: "POST", body: {} });
    const write = server.st.reqs.at(-1)!;
    expect(write.csrf).toBe(`csrf-${server.st.sid}`); // obtained from GET /auth/session after the reload
    expect(JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)])).not.toContain("csrf-");
  });
});

describe("revoked session (item 5)", () => {
  test("401 session_revoked returns to the login page with the reason, and does not loop", async () => {
    const user = userEvent.setup();
    visit("/ask");
    await signIn(user, "ada@x.org", "correct horse battery");
    await screen.findAllByLabelText("Question");
    server.jar.revoke();
    await user.click(screen.getAllByRole("link", { name: "Your account" })[0]!); // any page that calls the API
    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.getByRole("alert")).toHaveTextContent("this session has ended");
    await new Promise((r) => setTimeout(r, 150));
    const calls = server.st.reqs.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(server.st.reqs.length).toBe(calls); // quiet: nothing keeps retrying
    expect(paths().filter((p) => p === "GET /auth/session").length).toBeLessThanOrEqual(3);
  });
});

describe("API key path still works (item 6)", () => {
  test("Use an API key (advanced) opens the old gate; the key is sent as Bearer and no cookie is requested", async () => {
    const user = userEvent.setup();
    visit("/ask");
    await user.click(await screen.findByRole("link", { name: "Use an API key (advanced)" }));
    await user.type(await screen.findByLabelText("API key"), "operator-key");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    await waitFor(() => expect(server.st.reqs.some((r) => r.auth === "Bearer operator-key")).toBe(true));
    expect(server.st.reqs.filter((r) => r.auth !== null).every((r) => r.credentials === undefined)).toBe(true);
  });
});

describe("failure states (item 7)", () => {
  test("cookies blocked: login succeeds but the next request carries no cookie -> a clear message, no signed-in UI", async () => {
    server.st.cookiesWork = false;
    const user = userEvent.setup();
    visit("/ask");
    await signIn(user, "ada@x.org", "correct horse battery");
    expect(await screen.findByRole("alert")).toHaveTextContent("did not keep the sign-in cookie");
    expect(screen.queryByLabelText("Question")).not.toBeInTheDocument();
  });

  test.each([
    ["429 rate limited", 429, { error: "rate_limited", message: "x" }, /Too many attempts/],
    ["503 not configured", 503, { error: "auth_not_configured", message: "x" }, /not set up/],
    ["503 unavailable", 503, { error: "auth_unavailable", message: "x" }, /temporarily unavailable/],
    ["locked account looks like a wrong password", 401, { error: "invalid_credentials", message: "x" }, /email or password is not right/],
  ])("login: %s", async (_name, status, body, text) => {
    server.st.blockLogin = { status, body };
    const user = userEvent.setup();
    visit("/ask");
    await signIn(user, "ada@x.org", "whatever whatever 1");
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  test("signup 503 signup_not_configured and an unreachable server", async () => {
    server.st.blockLogin = { status: 503, body: {} };
    const user = userEvent.setup();
    visit("/signup");
    await user.type(await screen.findByLabelText("Your name"), "N");
    await user.type(screen.getByLabelText("Email"), "n@x.org");
    await user.type(screen.getByLabelText("Password"), "a long passphrase here");
    await user.type(screen.getByLabelText("Confirm password"), "a long passphrase here");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-up is not open on this server.");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach the server"));
  });

  test("a rejected or disabled account gets the message and no session", async () => {
    server.users.push({ id: "u-r", name: "R", email: "r@x.org", password: "rejected passphrase 1", status: "rejected", role: null });
    const user = userEvent.setup();
    visit("/ask");
    await signIn(user, "r@x.org", "rejected passphrase 1");
    expect(await screen.findByRole("alert")).toHaveTextContent("not approved");
    expect(server.st.sid).toBeNull();
  });
});

describe("base path (item 3)", () => {
  test("under /knowledgebase the redirect, the links and the API calls all carry the base path", async () => {
    vi.resetModules();
    (window as unknown as { __LKB_CONFIG__: unknown }).__LKB_CONFIG__ = { basePath: "/knowledgebase", apiBase: "", userAccounts: true };
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_API_BASE_URL", "");
    window.history.pushState({}, "", "/knowledgebase/ask");
    const { App: BaseApp } = await import("./App.js");
    render(<BaseApp />);
    await screen.findByRole("button", { name: "Sign in" });
    expect(window.location.pathname).toBe("/knowledgebase/login");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/knowledgebase/signup");
    expect(screen.getByRole("link", { name: "Forgot password" })).toHaveAttribute("href", "/knowledgebase/forgot");
    expect(screen.getByRole("link", { name: "Use an API key (advanced)" })).toHaveAttribute("href", "/knowledgebase/login/key");
    const first = (vi.mocked(fetch).mock.calls[0] as unknown as [string])[0];
    expect(first).toBe("/knowledgebase/api/auth/session");
    vi.unstubAllEnvs();
  });
});

describe("fix cycle 1: pending guard, sign-out failure, stale return path", () => {
  test("a pending session that opens /ask directly ends on /pending (the gate redirect, not the login page)", async () => {
    server.users.push({ id: "u-p", name: "Pia Pending", email: "pia@x.org", password: "pending passphrase 1", status: "pending", role: null });
    server.st.sid = "sid-u-p"; // the cookie from an earlier visit
    visit("/ask");
    await screen.findByRole("heading", { name: "Waiting for approval" });
    expect(window.location.pathname).toBe("/pending");
    expect(screen.queryByLabelText("Question")).not.toBeInTheDocument();
    expect(paths()[0]).toBe("GET /auth/session");
  });

  test("when POST /auth/logout fails the person stays signed in and sees 'Could not sign you out' (sidebar and account page)", async () => {
    server.st.sid = "sid-u-admin";
    server.st.logoutFails = true;
    const user = userEvent.setup();
    visit("/account");
    await screen.findByRole("heading", { name: "Your account" });
    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]!); // sidebar
    await screen.findAllByText("Could not sign you out, try again.");
    expect(server.st.sid).toBe("sid-u-admin");
    expect(window.location.pathname).toBe("/account");
    expect(screen.getByRole("heading", { name: "Your account" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Sign out" })[1]!); // account page button
    expect(screen.getAllByText("Could not sign you out, try again.").length).toBe(2);
    // the server recovers: the next attempt signs out for real and the error is gone
    server.st.logoutFails = false;
    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]!);
    await screen.findByRole("button", { name: "Sign in" });
    expect(server.st.sid).toBeNull();
    expect(screen.queryByText("Could not sign you out, try again.")).not.toBeInTheDocument();
  });

  test("the pending page shows the same sign-out failure and stays put", async () => {
    server.users.push({ id: "u-p", name: "Pia Pending", email: "pia@x.org", password: "pending passphrase 1", status: "pending", role: null });
    server.st.sid = "sid-u-p"; server.st.logoutFails = true;
    const user = userEvent.setup();
    visit("/pending");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign you out, try again.");
    expect(window.location.pathname).toBe("/pending");
    expect(server.st.sid).toBe("sid-u-p");
  });

  test("signing out of one account and into another does not land on the first person's page", async () => {
    server.users.push({ id: "u-m", name: "Mo Member", email: "mo@x.org", password: "member passphrase 1", status: "active", role: "member" });
    const user = userEvent.setup();
    visit("/admin/users");
    await signIn(user, "ada@x.org", "correct horse battery");
    await screen.findByRole("heading", { name: /users/i });
    expect(window.location.pathname).toBe("/admin/users");
    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]!);
    await screen.findByRole("button", { name: "Sign in" });
    await signIn(user, "mo@x.org", "member passphrase 1");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/");
  });

  test("the same person signing back in after a session ended still returns to where they were", async () => {
    const user = userEvent.setup();
    visit("/account");
    await signIn(user, "ada@x.org", "correct horse battery");
    await screen.findByRole("heading", { name: "Your account" });
    server.jar.revoke();
    await apiFetch("/sessions", SESSION_CREDENTIAL).catch(() => undefined);
    await screen.findByRole("button", { name: "Sign in" });
    await signIn(user, "ada@x.org", "correct horse battery");
    await screen.findByRole("heading", { name: "Your account" });
    expect(window.location.pathname).toBe("/account");
  });
});

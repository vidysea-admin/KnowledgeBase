/** ua-web A7 pages: signup/forgot/reset/verify, the account page, and the admin pages (users, detail, audit). Fake fetch records every call. */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useEffect, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setCsrfToken } from "../../api/client.js";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { AccountPage } from "./AccountPage.js";
import { AuditPage } from "./AuditPage.js";
import { ForgotPage } from "./ForgotPage.js";
import { ResetPage } from "./ResetPage.js";
import { SignupPage } from "./SignupPage.js";
import { UserDetailPage } from "./UserDetailPage.js";
import { UsersAdminPage } from "./UsersAdminPage.js";
import { VerifyPage } from "./VerifyPage.js";

interface Call { method: string; path: string; body: unknown; csrf: string | null }
type Responder = (c: Call) => Response | undefined;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let calls: Call[];
let responder: Responder;
const stamp = "2026-10-30T00:00:00Z";
const adminUser = (over: Record<string, unknown> = {}) => ({ id: "u9", email: "mia@x.org", displayName: "Mia", status: "pending", role: null, createdAt: stamp, updatedAt: stamp, ...over });

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); setCsrfToken(null); calls = []; responder = () => undefined;
  (window as unknown as { __LKB_CONFIG__: unknown }).__LKB_CONFIG__ = { basePath: "", apiBase: "", userAccounts: true };
  vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => {
    const call: Call = { method: i?.method ?? "GET", path: u.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api/, ""), body: typeof i?.body === "string" ? JSON.parse(i.body) : undefined, csrf: new Headers(i?.headers).get("x-lkb-csrf") };
    calls.push(call);
    return responder(call) ?? json(200, {});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as unknown as { __LKB_CONFIG__?: unknown }).__LKB_CONFIG__; });

function Signed({ id = "me", role = "admin", children }: { id?: string; role?: "admin" | "member" | "viewer"; children: ReactNode }): ReactNode {
  const { adoptSession, apiKey } = useAuth();
  useEffect(() => { adoptSession({ state: "active", user: { id, displayName: "Me", role }, csrfToken: "proof" }); }, [adoptSession, id, role]);
  return apiKey ? <>{children}</> : null;
}
function page(path: string, route: string, element: ReactNode, signed?: { id?: string; role?: "admin" | "member" | "viewer" }) {
  const inner = <Routes><Route path={route} element={element} /><Route path="*" element={<p>elsewhere</p>} /></Routes>;
  return render(<AuthProvider><MemoryRouter initialEntries={[path]}>{signed ? <Signed {...signed}>{inner}</Signed> : inner}</MemoryRouter></AuthProvider>);
}

describe("signup", () => {
  test("password mismatch is caught before any call; a policy refusal shows the closed-vocabulary reasons", async () => {
    const user = userEvent.setup();
    page("/signup", "/signup", <SignupPage />);
    await user.type(screen.getByLabelText("Your name"), "N");
    await user.type(screen.getByLabelText("Email"), "n@x.org");
    await user.type(screen.getByLabelText("Password"), "aaaaaaaaaaaa");
    await user.type(screen.getByLabelText("Confirm password"), "bbbbbbbbbbbb");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(calls).toHaveLength(0);
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "aaaaaaaaaaaa");
    responder = () => json(400, { error: "invalid_request", message: "x", reasons: ["too_short", "common"] });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("use at least 12 characters; that password is too common");
  });
});

describe("forgot / reset / verify", () => {
  test("forgot gives the same note whatever the server says about the account", async () => {
    const user = userEvent.setup();
    page("/forgot", "/forgot", <ForgotPage />);
    await user.type(screen.getByLabelText("Email"), "nobody@x.org");
    await user.click(screen.getByRole("button", { name: "Request a reset" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Request noted");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /auth/password/forgot"]);
  });

  test("reset: the token comes from the fragment, leaves the address bar, and is posted with the new password only on submit", async () => {
    window.history.replaceState(null, "", "/reset#token=tok-abc");
    const user = userEvent.setup();
    page("/reset", "/reset", <ResetPage />);
    expect(window.location.hash).toBe("");
    expect(calls).toHaveLength(0);
    await user.type(screen.getByLabelText("New password"), "a fresh long passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "a fresh long passphrase");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "POST", path: "/auth/password/reset", body: { token: "tok-abc", newPassword: "a fresh long passphrase" } });
  });

  test("reset and verify without a token say so and cannot submit; an invalid token explains itself", async () => {
    window.history.replaceState(null, "", "/reset");
    page("/reset", "/reset", <ResetPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("missing its code");
    expect(screen.getByRole("button", { name: "Set password" })).toBeDisabled();
    cleanup();
    window.history.replaceState(null, "", "/verify#token=dead");
    responder = () => json(400, { error: "invalid_token", message: "x" });
    const user = userEvent.setup();
    page("/verify", "/verify", <VerifyPage />);
    await user.click(screen.getByRole("button", { name: "Confirm my email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
  });
});

describe("account page", () => {
  test("change password posts both passwords; own sessions list marks this device and can revoke another", async () => {
    responder = (c) => (c.path === "/auth/sessions" ? json(200, { sessions: [{ id: "s1", current: true, userAgentSummary: "Chrome", lastUsedAt: stamp, ipPrefix: null }, { id: "s2", current: false, userAgentSummary: "Phone", lastUsedAt: stamp, ipPrefix: null }] }) : undefined);
    const user = userEvent.setup();
    page("/account", "/account", <AccountPage />, { role: "member" });
    expect(await screen.findByText(/Chrome \(this device\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out this device" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/auth/sessions/s2")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")?.csrf).toBe("proof");
    await user.type(screen.getByLabelText("Current password"), "old old old old");
    await user.type(screen.getByLabelText("New password"), "brand new passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "brand new passphrase");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed");
    expect(calls.find((c) => c.path === "/auth/password/change")?.body).toEqual({ currentPassword: "old old old old", newPassword: "brand new passphrase" });
  });

  test("sign out everywhere calls logout-all and returns to the signed-out state", async () => {
    const user = userEvent.setup();
    page("/account", "/account", <AccountPage />, { role: "member" });
    await user.click(await screen.findByRole("button", { name: "Sign out everywhere" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/auth/logout-all" && c.method === "POST")).toBe(true));
  });
});

describe("admin users", () => {
  test("pending queue: approve sends the chosen role; the count is shown", async () => {
    responder = (c) => (c.path.startsWith("/admin/users?") ? json(200, { users: [adminUser()], next: null, pendingCount: 1 }) : undefined);
    const user = userEvent.setup();
    page("/admin/users", "/admin/users", <UsersAdminPage />, { role: "admin" });
    expect(await screen.findByText("Mia")).toBeInTheDocument();
    expect(screen.getByText(/1 waiting for approval/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Role for Mia/), "viewer");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/admin/users/u9/approve")?.body).toEqual({ role: "viewer" }));
  });

  test("a server refusal (403 admin_session_required) is shown as a plain sentence", async () => {
    responder = () => json(403, { error: "admin_session_required", message: "x" });
    page("/admin/users", "/admin/users", <UsersAdminPage />, { role: "member" });
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to that.");
  });
});

describe("user detail", () => {
  const detail = (over: Record<string, unknown>) => (c: Call) => (c.method === "GET" && c.path === "/admin/users/u9" ? json(200, { user: adminUser(over), activeSessionCount: 2 }) : undefined);

  test("issue-link: the link appears once with a one-time notice and disappears on Done", async () => {
    responder = (c) => detail({ status: "unverified" })(c) ?? (c.path.endsWith("/issue-link") ? json(200, { link: "https://x/verify#token=SECRET", expiresAt: stamp, purpose: "verify_email" }) : undefined);
    const user = userEvent.setup();
    page("/admin/users/u9", "/admin/users/:id", <UserDetailPage />, { role: "admin" });
    await user.click(await screen.findByRole("button", { name: "Issue verification link" }));
    const box = await screen.findByLabelText("One-time link");
    expect(box).toHaveValue("https://x/verify#token=SECRET");
    expect(JSON.stringify([localStorage, sessionStorage].map((s) => Object.entries(s)))).not.toContain("SECRET");
    await user.click(screen.getByRole("button", { name: "Done, hide it" }));
    expect(screen.queryByLabelText("One-time link")).not.toBeInTheDocument();
  });

  test("destructive actions need a second click; own account hides disable and role change", async () => {
    responder = (c) => detail({ status: "active", role: "member" })(c);
    const user = userEvent.setup();
    page("/admin/users/u9", "/admin/users/:id", <UserDetailPage />, { role: "admin" });
    await user.click(await screen.findByRole("button", { name: "Disable" }));
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Confirm disable" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/admin/users/u9/disable", csrf: "proof" }));
    cleanup();
    calls = [];
    responder = (c) => detail({ id: "me", status: "active", role: "admin" })(c) ?? (c.path === "/admin/users/me" ? json(200, { user: adminUser({ id: "me", status: "active", role: "admin" }), activeSessionCount: 1 }) : undefined);
    page("/admin/users/me", "/admin/users/:id", <UserDetailPage />, { id: "me", role: "admin" });
    await screen.findByRole("button", { name: "Clear sign-in lock" });
    expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set role" })).not.toBeInTheDocument();
  });

  test("last_admin 409 is explained", async () => {
    responder = (c) => detail({ status: "active", role: "admin" })(c) ?? (c.method === "POST" ? json(409, { error: "last_admin", message: "x" }) : undefined);
    const user = userEvent.setup();
    page("/admin/users/u9", "/admin/users/:id", <UserDetailPage />, { id: "other", role: "admin" });
    await user.click(await screen.findByRole("button", { name: "Set role" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("only admin");
  });

  test("an unknown 409 shows a fixed sentence, never the server's own message text", async () => {
    responder = (c) => detail({ status: "active", role: "admin" })(c) ?? (c.method === "POST" ? json(409, { error: "something_new", message: "SERVER-INTERNAL-DETAIL" }) : undefined);
    const user = userEvent.setup();
    page("/admin/users/u9", "/admin/users/:id", <UserDetailPage />, { id: "other", role: "admin" });
    await user.click(await screen.findByRole("button", { name: "Set role" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("conflicts with the current state");
    expect(alert).not.toHaveTextContent("SERVER-INTERNAL-DETAIL");
  });
});

describe("token links under <StrictMode> (dev double render and double effect)", () => {
  const strict = (path: string, route: string, element: ReactNode) =>
    render(<StrictMode><AuthProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter></AuthProvider></StrictMode>);

  test("a valid #token verify link still shows the action, strips the fragment, and sends the token on the click", async () => {
    window.history.pushState({}, "", "/verify#token=tok-strict");
    const user = userEvent.setup();
    strict("/verify", "/verify", <VerifyPage />);
    const confirm = await screen.findByRole("button", { name: "Confirm my email" });
    expect(screen.queryByText(/missing its code/)).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(calls).toHaveLength(0); // nothing is spent on load
    await user.click(confirm);
    await screen.findByRole("heading", { name: "Email confirmed" });
    expect(calls.find((c) => c.path === "/auth/verify-email")?.body).toEqual({ token: "tok-strict" });
  });

  test("a valid #token reset link still accepts a new password under StrictMode", async () => {
    window.history.pushState({}, "", "/reset#token=tok-reset");
    const user = userEvent.setup();
    strict("/reset", "/reset", <ResetPage />);
    await user.type(await screen.findByLabelText("New password"), "brand new passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "brand new passphrase");
    expect(screen.queryByText(/missing its code/)).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    await screen.findByRole("heading", { name: "Password changed" });
    expect(calls.find((c) => c.path === "/auth/password/reset")?.body).toMatchObject({ token: "tok-reset" });
  });

  test("a link without a token still says so", async () => {
    window.history.pushState({}, "", "/verify");
    strict("/verify", "/verify", <VerifyPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("missing its code");
  });
});

describe("audit", () => {
  test("rows render and the user filter reaches the query; load more appends", async () => {
    const ev = (id: string) => ({ id, at: stamp, type: "login", outcome: "ok", detail: "d", actorUserId: "a", targetUserId: "u9", ipPrefix: "10.0.0" });
    responder = (c) => (c.path.startsWith("/admin/audit") ? json(200, c.path.includes("cursor=c1") ? { events: [ev("e2")], next: null } : { events: [ev("e1")], next: "c1" }) : undefined);
    const user = userEvent.setup();
    page("/admin/audit?user=u9", "/admin/audit", <AuditPage />, { role: "admin" });
    await screen.findAllByText("login");
    expect(calls[0]?.path).toContain("targetUserId=u9");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByText("login")).toHaveLength(2));
  });
});

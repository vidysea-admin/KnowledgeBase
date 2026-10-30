/** wa-web (W10): request, approval, QR connect, group/people selection, unlink. A fake fetch records every call; assertions are on calls and state changes. */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setCsrfToken } from "../../api/client.js";
import { QR_POLL_MIN_MS } from "../../api/whatsapp-links.js";
import { App } from "../../App.js";
import appSource from "../../App.tsx?raw";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { ChoosePage } from "./ChoosePage.js";
import { ConnectPage } from "./ConnectPage.js";
import { LinkDetailPage } from "./LinkDetailPage.js";
import { LinksPage } from "./LinksPage.js";
import { NewLinkPage } from "./NewLinkPage.js";

interface Call { method: string; path: string; body: unknown }
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
let calls: Call[];
let responder: (c: Call) => Response | undefined;
const SEC = "2@SECRET-QR-CANARY,aa==,bb==";
const HEX = "a".repeat(64);
const link = (over: Record<string, unknown> = {}) => ({ id: "L1", userId: "me", legacy: false, label: "My phone", state: "requested", noticeVersion: HEX, requestedAt: "2026-10-30T10:00:00Z", ...over });
const g = (n: number, over: Record<string, unknown> = {}) => ({ jid: `1203630${n}@g.us`, subject: `Group ${n}`, participantCount: 5 + n, marked: false, trackAllSenders: false, ...over });
const groupList = (groups: unknown[], over: Record<string, unknown> = {}) => ({ view: "owner", canEdit: true, source: "live", refreshedAt: "2026-10-30T10:00:00Z", truncated: false, groupCount: groups.length, markedCount: 0, groups, ...over });

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); setCsrfToken(null); calls = []; responder = () => undefined;
  vi.stubGlobal("fetch", vi.fn(async (u: string, i?: RequestInit) => {
    const c: Call = { method: i?.method ?? "GET", path: u.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api/, ""), body: typeof i?.body === "string" ? JSON.parse(i.body) : undefined };
    calls.push(c);
    return responder(c) ?? json(200, {});
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Signed({ id, role, children }: { id: string; role: "admin" | "member" | "viewer"; children: ReactNode }): ReactNode {
  const { adoptSession, apiKey } = useAuth();
  useEffect(() => { adoptSession({ state: "active", user: { id, displayName: "Me", role }, csrfToken: "proof" }); }, [adoptSession, id, role]);
  return apiKey ? <>{children}</> : null;
}
function page(path: string, route: string, element: ReactNode, who: { id?: string; role?: "admin" | "member" | "viewer" } = {}) {
  const tree = <Routes><Route path={route} element={element} /><Route path="*" element={<p>elsewhere</p>} /></Routes>;
  return render(<AuthProvider><MemoryRouter initialEntries={[path]}><Signed id={who.id ?? "me"} role={who.role ?? "member"}>{tree}</Signed></MemoryRouter></AuthProvider>);
}
const paths = () => calls.map((c) => `${c.method} ${c.path}`);

describe("links list", () => {
  test("a member sees their own link and the request entry only when they have no live link", async () => {
    responder = (c) => (c.path === "/whatsapp/links" ? json(200, { links: [] }) : undefined);
    page("/whatsapp/links", "/whatsapp/links", <LinksPage />);
    expect(await screen.findByRole("link", { name: "Request a WhatsApp link" })).toHaveAttribute("href", "/whatsapp/links/new");
    cleanup();
    responder = () => json(200, { links: [link({ state: "active" })] });
    page("/whatsapp/links", "/whatsapp/links", <LinksPage />);
    expect(await screen.findByRole("link", { name: "My phone" })).toHaveAttribute("href", "/whatsapp/links/L1");
    expect(screen.queryByRole("link", { name: "Request a WhatsApp link" })).toBeNull();
  });

  test("an admin sees every owner's link and the waiting count", async () => {
    responder = () => json(200, { links: [link(), link({ id: "L2", userId: "bob", label: "Bob" }), link({ id: "L3", userId: null, legacy: true, state: "active", label: "Old" })] });
    page("/whatsapp/links", "/whatsapp/links", <LinksPage />, { role: "admin", id: "root" });
    expect(await screen.findByText("Owner bob")).toBeInTheDocument();
    expect(screen.getByText(/Legacy link/)).toBeInTheDocument();
    expect(screen.getByText("2 request(s) waiting for approval.")).toBeInTheDocument();
  });

  test("a viewer gets the read-only note and no request is made", async () => {
    page("/whatsapp/links", "/whatsapp/links", <LinksPage />, { role: "viewer" });
    expect(await screen.findByText(/role is read-only/)).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  test("a failed list shows one plain sentence", async () => {
    responder = () => json(503, { error: "links_unavailable", message: "driver exploded at 10.0.0.5" });
    page("/whatsapp/links", "/whatsapp/links", <LinksPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(document.body.textContent).not.toContain("10.0.0.5");
  });
});

describe("request", () => {
  test("shows the notice and its version, then sends only the label and the notice version", async () => {
    responder = (c) => c.path === "/whatsapp/links/notice" ? json(200, { version: HEX, text: "We archive messages." })
      : c.method === "POST" ? json(201, { link: link() }) : undefined;
    const user = userEvent.setup();
    page("/whatsapp/links/new", "/whatsapp/links/new", <NewLinkPage />);
    expect(await screen.findByText("We archive messages.")).toBeInTheDocument();
    expect(screen.getByText(`Notice version ${HEX.slice(0, 12)}`)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name for this link"), "  My phone ");
    await user.click(screen.getByRole("button", { name: "Request link" }));
    await waitFor(() => expect(screen.getByText("elsewhere")).toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.path).toBe("/whatsapp/links");
    expect(post.body).toEqual({ label: "My phone", noticeVersion: HEX });
  });

  test("a viewer cannot request; an unavailable notice blocks the form with a sentence", async () => {
    page("/whatsapp/links/new", "/whatsapp/links/new", <NewLinkPage />, { role: "viewer" });
    expect(await screen.findByText(/for member and admin accounts/)).toBeInTheDocument();
    expect(calls).toEqual([]);
    cleanup();
    responder = () => json(503, { error: "notice_unavailable", message: "x" });
    page("/whatsapp/links/new", "/whatsapp/links/new", <NewLinkPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("notice text is unavailable");
    expect(screen.getByRole("button", { name: "Request link" })).toBeDisabled();
  });
});

describe("link detail and approval", () => {
  test("an admin approves with the chosen student-data class; the page flips to approved", async () => {
    responder = (c) => c.method === "POST" ? json(200, { link: link({ state: "approved", approvalExpiresAt: "2099-01-01T00:00:00Z", studentData: "unknown" }), selfApproved: false })
      : json(200, { link: link({ userId: "bob", studentData: "no" }) });
    const user = userEvent.setup();
    page("/whatsapp/links/L1", "/whatsapp/links/:id", <LinkDetailPage />, { role: "admin", id: "root" });
    await user.selectOptions(await screen.findByLabelText("Student-data class"), "unknown");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Approved");
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/whatsapp/links/L1/approve", body: { studentData: "unknown" } });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  test("an admin never gets the connect or choose controls on someone else's approved link", async () => {
    responder = () => json(200, { link: link({ userId: "bob", state: "approved", approvalExpiresAt: "2099-01-01T00:00:00Z", studentData: "no" }) });
    page("/whatsapp/links/L1", "/whatsapp/links/:id", <LinkDetailPage />, { role: "admin", id: "root" });
    await screen.findByText(/Approved\. Connect before/);
    expect(screen.queryByRole("link", { name: /Connect WhatsApp/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Choose groups/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Revoke link" })).toBeInTheDocument();
  });

  test("the owner of an approved link is offered Connect; a member sees no admin controls", async () => {
    responder = () => json(200, { link: link({ state: "approved", approvalExpiresAt: "2099-01-01T00:00:00Z" }) });
    page("/whatsapp/links/L1", "/whatsapp/links/:id", <LinkDetailPage />);
    expect(await screen.findByRole("link", { name: "Connect WhatsApp" })).toHaveAttribute("href", "/whatsapp/links/L1/connect");
    expect(screen.queryByText("Administrator")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  test("unlink needs a second click, then posts once and shows the closed state", async () => {
    responder = (c) => c.method === "POST" ? json(200, { link: link({ state: "unlinked" }), changed: true }) : json(200, { link: link({ state: "active", health: { lastStatus: "connected", lastStatusAt: new Date().toISOString() } }) });
    const user = userEvent.setup();
    page("/whatsapp/links/L1", "/whatsapp/links/:id", <LinkDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Unlink WhatsApp" }));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Confirm: Unlink WhatsApp" }));
    expect(await screen.findByText(/Unlinked\. Capture has stopped/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toEqual([{ method: "POST", path: "/whatsapp/links/L1/unlink", body: {} }]);
    expect(screen.queryByRole("button", { name: "Unlink WhatsApp" })).toBeNull();
  });

  test("failure states: expired approval, needs-relink, liveness unknown", async () => {
    responder = () => json(200, { link: link({ state: "approved", approvalExpiresAt: "2020-01-01T00:00:00Z" }) });
    page("/whatsapp/links/L1", "/whatsapp/links/:id", <LinkDetailPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("approval expired");
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
    cleanup();
    responder = () => json(200, { link: link({ state: "active", health: { lastStatus: "logged_out", lastStatusAt: new Date().toISOString(), flags: ["needs-relink"] } }) });
    page("/whatsapp/links/L1", "/whatsapp/links/:id", <LinkDetailPage />);
    expect(await screen.findByRole("link", { name: "Re-link WhatsApp" })).toBeInTheDocument();
    cleanup();
    responder = () => json(200, { link: link({ state: "active" }) });
    page("/whatsapp/links/L1", "/whatsapp/links/:id", <LinkDetailPage />);
    expect(await screen.findByText(/liveness unknown/)).toBeInTheDocument();
    cleanup();
    responder = () => json(404, { error: "not_found", message: "no such link" });
    page("/whatsapp/links/L9", "/whatsapp/links/:id", <LinkDetailPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be found");
  });
});

describe("QR connect (owner only, 3 s floor)", () => {
  const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const connectCalls = () => calls.filter((c) => c.path === "/whatsapp/links/L1/connect");
  const connectView = (over: Record<string, unknown> = {}) => ({ state: "awaiting_qr", linkState: "approved", qr: SEC, expiresAt: "2026-10-30T10:01:00Z", accountHint: null, ...over });

  test("polls no faster than every 3 s, renders the QR, stops and drops it on connected", async () => {
    vi.useFakeTimers();
    let n = 0;
    responder = (c) => c.path.endsWith("/connect") ? (++n < 3 ? json(200, connectView()) : json(200, connectView({ state: "connected", linkState: "active", qr: null }))) : json(200, { link: link({ state: "approved", approvalExpiresAt: "2099-01-01T00:00:00Z" }) });
    page("/whatsapp/links/L1/connect", "/whatsapp/links/:id/connect", <ConnectPage />);
    await settle(0);
    expect(connectCalls()).toHaveLength(1);
    expect(screen.getByTestId("wa-qr")).toBeInTheDocument();
    await settle(QR_POLL_MIN_MS - 1);
    expect(connectCalls()).toHaveLength(1); // 2999 ms: not yet
    await settle(1);
    expect(connectCalls()).toHaveLength(2);
    await settle(QR_POLL_MIN_MS - 1);
    expect(connectCalls()).toHaveLength(2);
    await settle(1);
    expect(connectCalls()).toHaveLength(3);
    expect(screen.queryByTestId("wa-qr")).toBeNull(); // connected: the QR is discarded
    expect(screen.getByRole("link", { name: "choose which groups to capture" })).toHaveAttribute("href", "/whatsapp/links/L1/choose");
    await settle(60_000);
    expect(connectCalls()).toHaveLength(3); // terminal: no further polling
    expect(document.body.innerHTML).not.toContain("CANARY");
    expect(JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)])).not.toContain("CANARY");
  });

  test("the poll stops when the page is left", async () => {
    vi.useFakeTimers();
    responder = (c) => c.path.endsWith("/connect") ? json(200, connectView()) : json(200, { link: link({ state: "approved", approvalExpiresAt: "2099-01-01T00:00:00Z" }) });
    const { unmount } = page("/whatsapp/links/L1/connect", "/whatsapp/links/:id/connect", <ConnectPage />);
    await settle(0);
    expect(connectCalls()).toHaveLength(1);
    unmount();
    await settle(30_000);
    expect(connectCalls()).toHaveLength(1);
  });

  test("a 429 waits at least its Retry-After, a transient 503 backs off and never goes faster than 3 s", async () => {
    vi.useFakeTimers();
    let n = 0;
    responder = (c) => {
      if (!c.path.endsWith("/connect")) return json(200, { link: link({ state: "approved", approvalExpiresAt: "2099-01-01T00:00:00Z" }) });
      n += 1;
      return n === 1 ? json(429, { error: "rate_limited", message: "x" }, { "retry-after": "20" }) : n === 2 ? json(503, { error: "archiver_api_unavailable", message: "x" }) : json(200, connectView());
    };
    page("/whatsapp/links/L1/connect", "/whatsapp/links/:id/connect", <ConnectPage />);
    await settle(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Too many requests");
    await settle(19_999);
    expect(connectCalls()).toHaveLength(1);
    await settle(1);
    expect(connectCalls()).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable");
    await settle(QR_POLL_MIN_MS * 4 - 1); // second consecutive failure: 3 s doubled twice
    expect(connectCalls()).toHaveLength(2);
    await settle(1);
    expect(connectCalls()).toHaveLength(3);
    expect(screen.getByTestId("wa-qr")).toBeInTheDocument();
  });

  test("a terminal refusal (409 approval_expired) stops polling with a sentence", async () => {
    vi.useFakeTimers();
    responder = (c) => c.path.endsWith("/connect") ? json(409, { error: "approval_expired", message: "x" }) : json(200, { link: link({ state: "approved", approvalExpiresAt: "2099-01-01T00:00:00Z" }) });
    page("/whatsapp/links/L1/connect", "/whatsapp/links/:id/connect", <ConnectPage />);
    await settle(0);
    expect(screen.getByRole("alert")).toHaveTextContent("approval expired");
    await settle(60_000);
    expect(connectCalls()).toHaveLength(1);
  });

  test("an admin on someone else's link, and a link that is not approved, never request the QR", async () => {
    responder = () => json(200, { link: link({ userId: "bob", state: "approved", approvalExpiresAt: "2099-01-01T00:00:00Z" }) });
    page("/whatsapp/links/L1/connect", "/whatsapp/links/:id/connect", <ConnectPage />, { role: "admin", id: "root" });
    expect(await screen.findByText(/Only the person who requested this link/)).toBeInTheDocument();
    expect(connectCalls()).toHaveLength(0);
    expect(screen.queryByTestId("wa-qr")).toBeNull();
    cleanup(); calls = [];
    responder = () => json(200, { link: link({ state: "requested" }) });
    page("/whatsapp/links/L1/connect", "/whatsapp/links/:id/connect", <ConnectPage />);
    expect(await screen.findByText(/not waiting to be connected/)).toBeInTheDocument();
    expect(connectCalls()).toHaveLength(0);
  });
});

describe("group and people selection", () => {
  const putPaths = () => calls.filter((c) => c.method === "PUT");
  test("marking a group sends marked:true only and reloads the list", async () => {
    let marked = false;
    responder = (c) => c.method === "PUT" ? ((marked = true), json(200, { changed: true, group: g(1, { marked: true }), capture: "all", markedCount: 1 })) : json(200, groupList([g(1, { marked })], { markedCount: marked ? 1 : 0 }));
    const user = userEvent.setup();
    page("/whatsapp/links/L1/choose", "/whatsapp/links/:id/choose", <ChoosePage />);
    await user.click(await screen.findByLabelText("Capture this group"));
    await waitFor(() => expect(screen.getByLabelText("Capture this group")).toBeChecked());
    expect(putPaths()).toEqual([{ method: "PUT", path: "/whatsapp/links/L1/groups/12036301%40g.us", body: { marked: true } }]);
    expect(document.body.textContent).toContain("1 of 1 groups marked");
  });

  test("ISS-WASEL-002: choosing people on an 'all' group sends trackAllSenders:false first, then the people, and shows the capture read back", async () => {
    responder = (c) => {
      if (c.method === "PUT" && c.path.endsWith("/people")) return json(200, { changed: true, count: 1, capture: "selected" });
      if (c.method === "PUT") return json(200, { changed: true, group: g(1, { marked: true }), capture: "all", markedCount: 1 });
      if (c.path.endsWith("/people")) return json(200, { source: "live", people: [{ personId: "p1", label: "Asha", selected: false, hasName: true }, { personId: "p2", label: "Ravi", selected: false, hasName: true }] });
      return json(200, groupList([g(1, { marked: true, trackAllSenders: true })], { markedCount: 1 }));
    };
    const user = userEvent.setup();
    page("/whatsapp/links/L1/choose", "/whatsapp/links/:id/choose", <ChoosePage />);
    await user.click(await screen.findByRole("button", { name: "Choose people" }));
    await user.click(await screen.findByLabelText("Ravi"));
    await user.click(screen.getByRole("button", { name: "Save people" }));
    expect(await screen.findByText(/now captures only the chosen people/)).toBeInTheDocument();
    expect(putPaths()).toEqual([
      { method: "PUT", path: "/whatsapp/links/L1/groups/12036301%40g.us", body: { marked: true, trackAllSenders: false } },
      { method: "PUT", path: "/whatsapp/links/L1/groups/12036301%40g.us/people", body: { personIds: ["p2"] } },
    ]);
    // the order is a hard requirement: the unrestrict PUT is call index 0, the people PUT call index 1
    expect(paths().filter((p) => p.startsWith("PUT")).map((p) => p.endsWith("/people"))).toEqual([false, true]);
  });

  test("a group that is not 'all' skips the first PUT; a restriction the archiver did not apply is reported, not assumed", async () => {
    responder = (c) => {
      if (c.method === "PUT") return json(200, { changed: true, count: 1, capture: "all" });
      if (c.path.endsWith("/people")) return json(200, { source: "live", people: [{ personId: "p1", label: "Asha", selected: true, hasName: true }] });
      return json(200, groupList([g(1, { marked: true, trackAllSenders: false })], { markedCount: 1 }));
    };
    const user = userEvent.setup();
    page("/whatsapp/links/L1/choose", "/whatsapp/links/:id/choose", <ChoosePage />);
    await user.click(await screen.findByRole("button", { name: "Choose people" }));
    expect(await screen.findByLabelText("Asha")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save people" }));
    expect(await screen.findByText(/still captures everyone in the group/)).toBeInTheDocument();
    expect(putPaths()).toHaveLength(1);
    expect(putPaths()[0]!.path.endsWith("/people")).toBe(true);
  });

  test("an admin gets the read-only view: no capture checkbox, no people button, no write", async () => {
    responder = () => json(200, groupList([g(1, { marked: true })], { view: "admin", canEdit: false, markedCount: 1 }));
    page("/whatsapp/links/L1/choose", "/whatsapp/links/:id/choose", <ChoosePage />, { role: "admin", id: "root" });
    expect(await screen.findByText("Group 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Capture this group")).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose people" })).toBeNull();
    expect(putPaths()).toHaveLength(0);
  });

  test("no message text is requested: only the list, mark and people routes are ever called", async () => {
    responder = () => json(200, groupList([g(1)]));
    page("/whatsapp/links/L1/choose", "/whatsapp/links/:id/choose", <ChoosePage />);
    await screen.findByText("Group 1");
    expect(paths()).toEqual(["GET /whatsapp/links/L1/groups"]);
    // the archiver being down is one sentence
    cleanup();
    responder = () => json(503, { error: "archiver_api_unavailable", message: "x" });
    page("/whatsapp/links/L1/choose", "/whatsapp/links/:id/choose", <ChoosePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
  });
});

describe("routing", () => {
  test("the five screens are routed once each, behind the login gate and inside the shell, with a nav entry", async () => {
    for (const p of ["/whatsapp/links", "/whatsapp/links/new", "/whatsapp/links/:id", "/whatsapp/links/:id/connect", "/whatsapp/links/:id/choose"]) {
      expect(appSource.match(new RegExp(`<Route path="${p}"`, "g"))).toHaveLength(1);
    }
    responder = () => json(200, { links: [] });
    localStorage.setItem("lkbApiKey", "k");
    window.history.pushState({}, "", "/whatsapp/links");
    const { container } = render(<App />);
    expect(await screen.findByRole("heading", { name: "WhatsApp links" })).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).not.toBeNull();
    expect(container.querySelector("#nav-links a[href='/whatsapp/links']")).not.toBeNull();
  });
});

/**
 * ua-web A7 acceptance 2, client side: a viewer account sees no ENABLED write control on any page that issues POST/PUT/PATCH/DELETE,
 * while a member/admin keeps them. One shared guard (`useCanWrite` / `WriteScope` from AuthContext); the server still refuses a viewer's write
 * with 403 `read_only_role` (proved by the A3/A6 suites and the live devtools write). Pages render through the real `App` routes with a
 * cookie session of the given role and a fake API that answers 404 to everything but the session probe (a page shows its error state).
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App.js";
import { setCsrfToken } from "./api/client.js";

type Role = "admin" | "member" | "viewer";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeApi(role: Role, fixtures: Record<string, unknown> = {}) {
  return vi.fn(async (input: string) => {
    const path = input.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api/, "").split("?")[0]!;
    if (path === "/auth/session") return json(200, { state: "active", user: { id: `u-${role}`, displayName: role, role }, csrfToken: "proof" });
    if (path in fixtures) return json(200, fixtures[path]);
    return json(404, { error: "not_found", message: "not found" });
  });
}

const visit = (path: string) => { window.history.pushState({}, "", path); return render(<App />); };
const mount = async (path: string, role: Role, fixtures?: Record<string, unknown>) => {
  vi.stubGlobal("fetch", fakeApi(role, fixtures));
  const view = visit(path);
  await screen.findByRole("link", { name: "Your account" }); // the signed-in shell is up
  return view;
};
const scopes = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>("fieldset[data-read-only]"));
const controls = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>("button, input, select, textarea"));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); setCsrfToken(null);
  (window as unknown as { __LKB_CONFIG__: unknown }).__LKB_CONFIG__ = { basePath: "", apiBase: "", userAccounts: true };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as unknown as { __LKB_CONFIG__?: unknown }).__LKB_CONFIG__; });

/** Pages that draw nothing until their data loads (the fake answers 404): for these the scope itself is asserted, not its contents. */
const DATA_GATED = new Set(["/connectors", "/label-review", "/answer-review"]);

/** Pages whose whole body is a write surface: the page sits inside one disabled scope. */
const WRITE_PAGES = [
  "/ingest", "/settings", "/connectors", "/knowledge-outputs", "/accounts", "/automation", "/automation/forms", "/championship",
  "/calibration-review", "/extraction-review", "/label-review", "/answer-review", "/answer-policy", "/answer-policies", "/knowledge/collections",
];

describe("write pages (viewer vs member)", () => {
  test.each(WRITE_PAGES)("%s: viewer has the page inside a disabled scope with no enabled control; member has no scope", async (path) => {
    await mount(path, "viewer");
    await screen.findByText(/Read-only account/);
    const found = scopes(document.body);
    expect(found.length).toBeGreaterThan(0);
    const inside = found.flatMap((s) => controls(s));
    if (!DATA_GATED.has(path)) expect(inside.length).toBeGreaterThan(0); // the scope really holds the page's write controls
    expect(inside.filter((el) => !el.matches(":disabled"))).toEqual([]);
    cleanup();
    await mount(path, "member");
    expect(scopes(document.body)).toEqual([]);
  });

  test("an admin keeps the controls too (Ingest button enabled)", async () => {
    await mount("/ingest", "admin");
    expect(screen.getByRole("button", { name: "Ingest" })).toBeEnabled();
  });
});

/** Mixed pages: only the write section is scoped; the page's read controls stay usable. Each probe is a control that exists without server data. */
const MIXED: Array<{ path: string; probe: string | RegExp; fixtures?: Record<string, unknown> }> = [
  { path: "/whatsapp", probe: "Refresh review queue" },
  { path: "/meeting-bot", probe: "Send bot now" },
  { path: "/operations", probe: /Inspect saved progress/ },
  { path: "/join-rules", probe: /registration policy/i },
  { path: "/knowledge/documents", probe: "Import", fixtures: { "/knowledge/documents": { documents: [], truncated: false } } },
];

describe("mixed pages (viewer vs member)", () => {
  test.each(MIXED)("$path: the write control is disabled inside a scope for a viewer and outside any scope for a member", async ({ path, probe, fixtures }) => {
    await mount(path, "viewer", fixtures);
    const viewerControl = await screen.findByRole("button", { name: probe });
    expect(viewerControl).toBeDisabled();
    expect(viewerControl.closest("fieldset[data-read-only]")).not.toBeNull();
    cleanup();
    await mount(path, "member", fixtures);
    const memberControl = await screen.findByRole("button", { name: probe });
    expect(memberControl.closest("fieldset[data-read-only]")).toBeNull();
  });

  test("/calendar: Scan Gmail is disabled for a viewer and enabled for a member", async () => {
    await mount("/calendar", "viewer");
    expect(await screen.findByRole("button", { name: "Scan Gmail" })).toBeDisabled();
    cleanup();
    await mount("/calendar", "member");
    await waitFor(() => expect(screen.getByRole("button", { name: "Scan Gmail" })).toBeEnabled());
  });

  test("/watch: Poll now is disabled for a viewer and enabled for a member", async () => {
    await mount("/watch", "viewer");
    expect(await screen.findByTestId("poll-now-button")).toBeDisabled();
    cleanup();
    await mount("/watch", "member");
    await waitFor(() => expect(screen.getByTestId("poll-now-button")).toBeEnabled());
  });
});

describe("read-only pages stay usable for a viewer", () => {
  test("/ask is not scoped: the question box and Ask button stay enabled (looking things up is allowed)", async () => {
    await mount("/ask", "viewer");
    const boxes = await screen.findAllByLabelText("Question");
    expect(boxes[0]).toBeEnabled();
    expect(scopes(document.body)).toEqual([]);
    expect(within(document.body).getByRole("button", { name: /^Ask/ })).toBeDefined();
  });
});

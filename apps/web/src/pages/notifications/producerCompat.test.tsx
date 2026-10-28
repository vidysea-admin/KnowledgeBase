import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { loadNotifications } from "./notificationsClient.js";
import { NotificationsPage } from "./NotificationsPage.js";
const producerShape = { notifications: [{ id: "file-queue:dead-1", source: "file-queue", severity: "error", title: "Pipeline run failed", detail: "Kind: pipeline-run; reason: worker lease expired", occurredAt: "2026-10-14T00:00:00.000Z" }], limit: 50, truncated: false, sources: { uploadQueue: "unavailable", providerJobs: "ok", watcher: "ok", fileQueue: "ok" } };
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
test("accepted actual file-queue producer shape survives public client and current page", async () => {
  localStorage.setItem("lkbApiKey", "fixture-key"); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(producerShape))));
  const data = await loadNotifications("fixture-key"); expect(data).toEqual(producerShape);
  render(<AuthProvider><NotificationsPage /></AuthProvider>); await screen.findByText("Pipeline run failed"); expect(screen.getByText(/Upload queue unavailable/)).toBeInTheDocument();
});
test("optional file-queue outage is labelled and malformed availability is refused", async () => {
  localStorage.setItem("lkbApiKey", "fixture-key"); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...producerShape, notifications: [], sources: { ...producerShape.sources, fileQueue: "unavailable" } }))));
  render(<AuthProvider><NotificationsPage /></AuthProvider>); await screen.findByText(/File job queue unavailable/);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...producerShape, sources: { ...producerShape.sources, fileQueue: "wrong" } })))); await expect(loadNotifications("fixture-key")).rejects.toThrow("Invalid notifications response");
});
test("unknown sources/payload fields are never retained by public projection", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...producerShape, secret: "PRIVATE", sources: { ...producerShape.sources, PRIVATE: "unavailable" }, notifications: producerShape.notifications.map(row => ({ ...row, rawError: "PRIVATE" })) }))));
  const data = await loadNotifications("fixture-key"); expect(JSON.stringify(data)).not.toContain("PRIVATE");
});
function AuthControls() {
  const { setApiKey, clearApiKey } = useAuth();
  return <><button onClick={() => setApiKey("fixture-key")}>Reauthenticate</button><button onClick={() => setApiKey("new-key")}>Rotate key</button><button onClick={clearApiKey}>Log out</button></>;
}
test.each(["success", "failure", "401"])("same-key new login and refresh fence obsolete notification %s", async outcome => {
  localStorage.setItem("lkbApiKey", "fixture-key"); let resolve!: (response: Response) => void, reject!: (error: unknown) => void;
  const old = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
  const fetch = vi.fn(async () => new Response(JSON.stringify(producerShape))); vi.stubGlobal("fetch", fetch);
  render(<AuthProvider><AuthControls /><NotificationsPage /></AuthProvider>); await screen.findByText("Pipeline run failed");
  fetch.mockImplementation(() => old); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); expect(screen.queryByText("Pipeline run failed")).not.toBeInTheDocument();
  fetch.mockImplementation(async () => new Response(JSON.stringify(producerShape))); fireEvent.click(screen.getByRole("button", { name: "Reauthenticate" })); await screen.findByText("Pipeline run failed");
  await act(async () => { if (outcome === "failure") reject(new Error("PRIVATE")); else resolve(new Response(JSON.stringify({ ...producerShape, notifications: [] }), { status: outcome === "401" ? 401 : 200 })); });
  expect(screen.getByText("Pipeline run failed")).toBeInTheDocument(); expect(localStorage.getItem("lkbApiKey")).toBe("fixture-key");
});
test("rotation/logout hide old notification data before the next request and anonymous page does not fetch", async () => {
  localStorage.setItem("lkbApiKey", "fixture-key"); const fetch = vi.fn(async () => new Response(JSON.stringify(producerShape))); vi.stubGlobal("fetch", fetch);
  render(<AuthProvider><AuthControls /><NotificationsPage /></AuthProvider>); await screen.findByText("Pipeline run failed");
  fetch.mockImplementation(() => new Promise<Response>(() => {})); fireEvent.click(screen.getByRole("button", { name: "Rotate key" })); expect(screen.queryByText("Pipeline run failed")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Log out" })); expect(screen.getByText(/Sign in with an API key to view notifications/)).toBeInTheDocument(); cleanup(); fetch.mockClear(); render(<AuthProvider><NotificationsPage /></AuthProvider>); expect(fetch).not.toHaveBeenCalled();
});

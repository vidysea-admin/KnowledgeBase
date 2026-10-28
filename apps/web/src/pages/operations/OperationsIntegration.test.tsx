import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { graph, sessions } from "../explorer/explorerFixtures.js";
import { integrationPayload } from "../operations-integrations/integrationFixtures.js";
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
test("actual protected App/sidebar consumes workspace and navigates to scoped Explorer", async () => {
  localStorage.setItem("lkbApiKey", "integration-key"); window.history.replaceState({}, "", "/operations?view=ready");
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(integrationPayload(url) ?? (url.endsWith("/sources") ? { sources: [] } : url.endsWith("/watch-state") ? { state: [], heartbeats: [] } : url.endsWith("/sessions") ? { sessions } : url.endsWith("/graph") ? graph : url.includes("activity-health") ? { jobs: [], limit: 50, truncated: false, observedAt: "2026-10-14T00:00:00.000Z" } : { notifications: [], limit: 50, truncated: false, sources: { uploadQueue: "ok", providerJobs: "ok", watcher: "ok" } })), { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch); const { container } = render(<App />);
  await screen.findByText("1 shown of 3 returned session rows; 0 with unknown status.");
  expect(screen.getByRole("navigation", { name: "Main" })).toContainElement(screen.getByRole("link", { name: "Operations workspace" }));
  expect(container.querySelector("main.app-main")).toContainElement(screen.getByRole("heading", { name: "Operations workspace" }));
  fireEvent.click(screen.getByRole("link", { name: "Explore knowledge" })); await screen.findByText("Recorded date: 2026-07-30");
  expect(window.location.pathname).toBe("/explorer"); expect(new URLSearchParams(window.location.search).get("session")).toBe("s/1");
  fireEvent.click(screen.getByRole("tab", { name: "Topics" })); expect(screen.getByRole("link", { name: "Scholarships" })).toBeInTheDocument(); expect(screen.queryByText("Unrelated topic")).not.toBeInTheDocument();
  expect(fetch.mock.calls.every(call => !String(call[0]).includes("integration-key"))).toBe(true);
}, 30000);
test("actual operations route remains behind the login gate", () => {
  localStorage.clear(); window.history.replaceState({}, "", "/operations"); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); render(<App />);
  expect(screen.getByLabelText("API key")).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "Operations workspace" })).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});

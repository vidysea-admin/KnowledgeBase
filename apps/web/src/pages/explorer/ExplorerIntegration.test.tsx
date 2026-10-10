import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { graph, sessions } from "./explorerFixtures.js";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
test("actual protected App/sidebar -> explorer clients -> selected session and graph links", async () => {
  localStorage.setItem("lkbApiKey", "integration-key"); window.history.replaceState(null, "", "/explorer");
  const fetchMock = vi.fn((url: string) => Promise.resolve({ ok: true, status: 200, json: async () => url.endsWith("/sessions") ? { sessions } : graph }));
  vi.stubGlobal("fetch", fetchMock); render(<App />); await screen.findByText("2026-07");
  const nav = screen.getByRole("link", { name: "Knowledge explorer" }); expect(nav).toHaveAttribute("href", "/explorer"); expect(nav).toHaveClass("active");
  fireEvent.change(screen.getByLabelText("Session scope"), { target: { value: "s/1" } }); fireEvent.click(screen.getByRole("tab", { name: "Topics" }));
  expect(screen.getByRole("link", { name: "Scholarships" })).toHaveAttribute("href", "/brain?node=topic%3Aone");
  expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Topics"); expect(fetchMock).toHaveBeenCalledTimes(2);
});
test("direct explorer route remains behind existing login gate without any read", () => {
  localStorage.clear(); window.history.replaceState(null, "", "/explorer"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<App />);
  expect(screen.getByLabelText("API key")).toBeInTheDocument(); expect(screen.queryByRole("tablist")).not.toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});

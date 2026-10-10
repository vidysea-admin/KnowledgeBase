import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { gapsResponse } from "./gapsFixtures.js";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
test("actual protected App/navigation -> gap read client -> filtered dashboard inspection", async () => {
  localStorage.setItem("lkbApiKey", "integration-key"); window.history.replaceState(null, "", "/gaps");
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => gapsResponse })); vi.stubGlobal("fetch", fetchMock); render(<App />);
  await screen.findByRole("heading", { name: "Knowledge gaps" }); expect(screen.getByRole("link", { name: "Knowledge gaps" })).toHaveAttribute("href", "/gaps"); expect(screen.getByRole("link", { name: "Knowledge gaps" })).toHaveClass("active");
  await screen.findByText(/5 returned gaps:/); fireEvent.change(screen.getByLabelText("Status"), { target: { value: "received" } }); fireEvent.click(screen.getByRole("button", { name: "Inspect gap-b" }));
  expect(screen.getByRole("region", { name: "Gap inspection" })).toHaveTextContent("Source reference: source:b"); expect(screen.getByText("Showing 1 of 5 returned gaps.")).toBeInTheDocument(); expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "Knowledge explorer" })).toHaveAttribute("href", "/explorer"); expect(screen.getByRole("link", { name: "Confidence graph" })).toHaveAttribute("href", "/graph-confidence");
});
test("direct gap dashboard route retains current LoginGate and performs no anonymous read", () => {
  window.history.replaceState(null, "", "/gaps"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<App />);
  expect(screen.getByLabelText("API key")).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "Knowledge gaps" })).not.toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});

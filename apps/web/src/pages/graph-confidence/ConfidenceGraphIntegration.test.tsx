import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { graph } from "./confidenceFixtures.js";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
test("actual protected App/navigation -> graph client -> confidence graph and evidence consumer", async () => {
  localStorage.setItem("lkbApiKey", "integration-key"); window.history.replaceState(null, "", "/graph-confidence?minConfidence=0.8&node=session%3As%2F1");
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => graph })); vi.stubGlobal("fetch", fetchMock); render(<App />);
  await screen.findByRole("heading", { name: "First session" }); expect(screen.getByRole("link", { name: "Confidence graph" })).toHaveAttribute("href", "/graph-confidence");
  expect(screen.getByRole("link", { name: "Confidence graph" })).toHaveClass("active"); expect(screen.getByTestId("confidence-counts")).toHaveTextContent("Showing 2 of 2 matching relationships (5 returned)");
  fireEvent.change(screen.getByLabelText("Minimum confidence"), { target: { value: "1" } }); expect(screen.getByTestId("confidence-counts")).toHaveTextContent("Showing 1 of 1 matching relationships (5 returned)");
  expect(screen.getByRole("link", { name: "Evidence: t/high" })).toHaveAttribute("href", "/sessions/s%2F1#turn-t%2Fhigh"); expect(screen.queryByRole("link", { name: "Evidence: t/topic" })).not.toBeInTheDocument(); expect(fetchMock).toHaveBeenCalledTimes(1);
});
test("direct confidence route remains behind existing login gate with no read", () => {
  localStorage.clear(); window.history.replaceState(null, "", "/graph-confidence"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<App />);
  expect(screen.getByLabelText("API key")).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "Confidence graph" })).not.toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});

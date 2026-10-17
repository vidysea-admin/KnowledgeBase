import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { AnswerPolicySimulator } from "./AnswerPolicySimulator.js";
import * as client from "./client.js";

function response(): client.PolicySimulationResponse {
  return { draft: { policyId: "browser-draft", version: 1, mode: "internal-only" },
    simulation: { policyId: "browser-draft", version: 1, decision: "review", reason: "insufficient-coverage", internalSources: 1, webSources: 1 },
    result: { answer: "Forms open in October.", verdict: "ambiguous", reason: "partial", scored: [], auditLog: [],
      insufficient_coverage: true, web_used: true, sources: { internal: [{ node_id: "n", evidence: { sessionRef: "s1" } }],
        web: [{ url: "javascript:alert(1)", title: "Unsafe source" }] } } };
}
function mount(): void {
  localStorage.setItem("lkbApiKey", "test-key");
  render(<AuthProvider><MemoryRouter><AnswerPolicySimulator /></MemoryRouter></AuthProvider>);
}
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

test("uses a fresh trimmed Ask simulation and renders decision separately from candidate", async () => {
  const spy = vi.spyOn(client, "simulateDraftPolicy").mockResolvedValue(response()); mount();
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: " When? " } });
  fireEvent.click(screen.getByRole("button", { name: "Simulate policy" }));
  await waitFor(() => expect(screen.getByText("Forms open in October.")).toBeInTheDocument());
  expect(spy).toHaveBeenCalledWith("test-key", "When?", { policyId: "browser-draft", version: 1, mode: "internal-only" });
  expect(screen.getByRole("heading", { name: "Policy decision: review" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "n" })).toHaveAttribute("href", "/sessions/s1");
  expect(screen.queryByRole("link", { name: "Unsafe source" })).not.toBeInTheDocument();
  expect(screen.getByText("Unsafe source")).toBeInTheDocument();
  expect(screen.getByText(/Coverage is insufficient/)).toBeInTheDocument();
  expect(screen.getByText("Ask used web sources.")).toBeInTheDocument();
});
test("draft changes create a new local version and clear the prior simulation", async () => {
  const spy = vi.spyOn(client, "simulateDraftPolicy").mockResolvedValue(response()); mount();
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "When?" } });
  fireEvent.click(screen.getByRole("button", { name: "Simulate policy" }));
  await waitFor(() => expect(screen.getByText("Forms open in October.")).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("Allowed sources"), { target: { value: "internal-and-web" } });
  expect(screen.queryByText("Forms open in October.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Simulate policy" }));
  await waitFor(() => expect(spy).toHaveBeenLastCalledWith("test-key", "When?", { policyId: "browser-draft", version: 2, mode: "internal-and-web" }));
});
test("real API errors remain visible and blank questions produce no request", async () => {
  const spy = vi.spyOn(client, "simulateDraftPolicy").mockRejectedValue(new ApiError(404, "No index available.")); mount();
  expect(screen.getByRole("button", { name: "Simulate policy" })).toBeDisabled(); expect(spy).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "When?" } });
  fireEvent.click(screen.getByRole("button", { name: "Simulate policy" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No index available."));
});

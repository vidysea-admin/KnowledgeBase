import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
import { directoryGraph as graph, directorySessions as sessions, directorySources as sources } from "./knowledgeDirectoryFixtures.js";
const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/");
  if (originalScroll) Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll); else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});
test("protected actual App/Nav -> directory -> exact session transcript anchor", async () => {
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
  localStorage.setItem("lkbApiKey", "directory-integration-key");
  window.history.replaceState(null, "", "/knowledge?entity=topic%3Acareer");
  const fetchMock = vi.fn((url: string, _options?: RequestInit) => {
    const path = new URL(url, "http://localhost").pathname;
    const body = path === "/sessions" ? { sessions } : path === "/sources" ? { sources } : path === "/graph" ? graph :
      path === "/sessions/session%2Fone/grounded-content" ? { sessionId: "session/one", notes: [], qa: [], claims: [] } :
      path.endsWith("/speaker-suggestions") ? { suggestions: [] } : path === "/sessions/session%2Fone" ? {
        session: sessions[0], page: { summary: "Source summary" }, claims: [], turns: [{ _id: "turn /#one", speakerRef: "speaker:unknown", tStart: 12, tEnd: 15, text: "Original career statement." }],
      } : null;
    if (!body) throw new Error(`Unexpected route: ${path}`);
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  });
  vi.stubGlobal("fetch", fetchMock); render(<App />);
  const evidence = await screen.findByRole("link", { name: "Source turn turn /#one" });
  expect(screen.getByRole("link", { name: "Knowledge directory" })).toHaveAttribute("href", "/knowledge");
  fireEvent.click(evidence); await screen.findByText("Original career statement.");
  await screen.findByText("No grounded notes or Q&A published for this session.");
  await waitFor(() => expect(document.getElementById("turn-turn /#one")).toBeInTheDocument());
  expect(window.location.pathname).toBe("/sessions/session%2Fone");
  expect(decodeURIComponent(window.location.hash)).toBe("#turn-turn /#one");
  expect(screen.queryByText("This cited passage was not found in this session.")).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.every(call => (call[1]?.headers as Record<string, string> | undefined)?.authorization === "Bearer directory-integration-key")).toBe(true);
});
test("direct directory URL stays behind actual login gate with no reads", () => {
  window.history.replaceState(null, "", "/knowledge"); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<App />);
  expect(screen.getByLabelText("API key")).toBeInTheDocument(); expect(screen.queryByRole("tablist")).not.toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});

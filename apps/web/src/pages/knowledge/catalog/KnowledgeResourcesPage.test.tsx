import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext.js";
import { KnowledgeResourcesPage } from "./KnowledgeResourcesPage.js";
const mock = vi.fn();
beforeEach(() => { mock.mockReset(); vi.stubGlobal("fetch", mock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
test("resource/program consumers render safe URL/source sessions and explicit unverified semantics", async () => {
  mock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ resources: [{ id: "r", kind: "url", createdAt: "now", url: "https://example.org/resource" }], programs: [{ id: "p", name: "Recorded program", classification: "unclassified", organization: "unverified", sessions: [{ id: "s", title: "Source session" }] }], truncated: false }) });
  render(<MemoryRouter><AuthProvider><KnowledgeResourcesPage /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Recorded program" })).toBeInTheDocument(); expect(screen.getByText("Unclassified · organization unverified")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Public source" })).toHaveAttribute("rel", "noopener noreferrer"); expect(screen.getByRole("link", { name: "Source session" })).toHaveAttribute("href", "/sessions/s");
});

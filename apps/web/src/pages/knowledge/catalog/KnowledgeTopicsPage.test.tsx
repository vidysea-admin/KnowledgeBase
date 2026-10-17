import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext.js";
import { KnowledgeTopicsPage } from "./KnowledgeTopicsPage.js";
const mock = vi.fn();
beforeEach(() => { mock.mockReset(); vi.stubGlobal("fetch", mock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
test("topic consumer exact ID retains claim origin/confidence and document character offset", async () => {
  mock.mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: async () => url.endsWith("/a%3Avisas") ? { id: "a:visas", name: "Visas", classification: "unclassified", sessions: [], documents: [{ id: "a:doc", sourceId: "a:doc", version: "a".repeat(64), title: "Source document", pageCount: 2, collectionId: "collection", association: "co-curated-unverified" }], withheldClaims: 1, truncated: false,
    claims: [{ id: "c", text: "Admissions evidence", status: "needs-review", confidence: 0.7, evidence: [{ sessionId: "s", turnId: "t", title: "Source", quote: "Exact source text", speaker: "document", tStart: 400, origin: "unclassified", coordinate: "character-offset" }] }] } : { topics: [{ id: "a:visas", name: "Visas" }], truncated: false } }));
  render(<MemoryRouter initialEntries={["/knowledge/topics/a%3Avisas"]}><AuthProvider><Routes><Route path="/knowledge/topics/:id" element={<KnowledgeTopicsPage />} /></Routes></AuthProvider></MemoryRouter>);
  expect(await screen.findByText("Admissions evidence")).toBeInTheDocument(); expect(screen.getByText(/confidence 0.7/)).toBeInTheDocument(); expect(screen.getByText("Origin: unclassified")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /character offset 400/ })).toHaveAttribute("href", "/sessions/s#turn-t"); expect(screen.queryByText(/400s/)).toBeNull(); expect(screen.getByText(/1 claims withheld/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Source document" })).toHaveAttribute("href", "/knowledge/documents/a%3Adoc"); expect(screen.getByText(/Co-curated association unverified/)).toBeInTheDocument();
});

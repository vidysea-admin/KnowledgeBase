import { existsSync, readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext.js";
import { KnowledgeDocumentsPage } from "./KnowledgeDocumentsPage.js";
const mock = vi.fn();
// The existence gate and read share the same Node filesystem URL, independent of jsdom globals.
const syntheticArtifactUrl = new NodeURL("../../../../../qa/evidence/goal-t055/actual-api-output.json", import.meta.url);
const syntheticArtifactAvailable = existsSync(syntheticArtifactUrl);
beforeEach(() => { mock.mockReset(); vi.stubGlobal("fetch", mock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
test.skipIf(!syntheticArtifactAvailable)(`immediate UI consumer replays actual authenticated API output from the real PDF producer/storage check${syntheticArtifactAvailable ? "" : " [SKIP/HOLD: required public synthetic PDF/API artifact unavailable]"}`, async () => {
  // Generated synthetic output may be regenerated or included publicly; absence leaves downstream readiness on HOLD.
  // When present, consume actual producer output without substituting a hand-authored DTO.
  const artifact = JSON.parse(readFileSync(syntheticArtifactUrl, "utf8"));
  const id = artifact.documentDetail.id;
  mock.mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: async () => url.endsWith("/pages/2") ? artifact.page : url.endsWith(`/${encodeURIComponent(id)}`) ? artifact.documentDetail : artifact.documentsList }));
  render(<MemoryRouter initialEntries={[`/knowledge/documents/${encodeURIComponent(id)}/pages/2`]}><AuthProvider><Routes><Route path="/knowledge/documents/:id/pages/:page" element={<KnowledgeDocumentsPage />} /></Routes></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Sample admissions document · Page 2" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sample admissions document · Page 2" })).toHaveAttribute("href", `/knowledge/documents/${encodeURIComponent(id)}/pages/2`);
  expect(screen.getByText("Scholarships need evidence.", { selector: "blockquote" })).toBeInTheDocument(); expect(screen.getByText(/meaning unverified/)).toBeInTheDocument();
});

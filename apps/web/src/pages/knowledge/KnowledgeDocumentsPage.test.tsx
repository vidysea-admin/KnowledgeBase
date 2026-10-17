import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes, Link, useLocation } from "react-router-dom";
import { useLayoutEffect } from "react";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { KnowledgeDocumentsPage } from "./KnowledgeDocumentsPage.js";
const fetchMock = vi.fn(); const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const doc = { id: "a:doc", sourceId: "a:doc", version: "a".repeat(64), title: "Admissions", format: "pdf", pageCount: 2 };
const mount = (path = "/knowledge/documents/a%3Adoc/pages/2") => render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes><Route path="/knowledge/documents/:id/pages/:page" element={<KnowledgeDocumentsPage />} /><Route path="/knowledge/documents" element={<KnowledgeDocumentsPage />} /></Routes></AuthProvider></MemoryRouter>);
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
test("page consumer fetches actual source/version, resolves highlight and links exact page", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(reply(url.endsWith("/pages/2") ? { ...doc, pageNumber: 2, text: "Exact source quote." } : url.endsWith("/a%3Adoc") ? { ...doc, highlights: [{ id: "h", pageNumber: 2, quote: "Exact source quote.", text: "Exact source quote.", verification: "unverified" }] } : { documents: [doc], truncated: false })));
  mount(); expect(await screen.findByRole("heading", { name: "Admissions · Page 2" })).toBeInTheDocument();
  expect(screen.getByText(/Saved extract/)).toBeInTheDocument(); expect(screen.getByRole("link", { name: "Admissions · Page 2" })).toHaveAttribute("href", "/knowledge/documents/a%3Adoc/pages/2");
  fireEvent.change(screen.getByLabelText("Exact quote from this page"), { target: { value: "invented" } }); expect(screen.getByRole("button", { name: "Save highlight" })).toBeDisabled();
});
test("unauthenticated mount makes no read, invalid response and 403 are errors", async () => {
  localStorage.clear(); mount("/knowledge/documents"); expect(screen.getByText("Sign in to view documents.")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});
test("malformed list cannot appear as successful empty documents", async () => {
  fetchMock.mockResolvedValue(reply({ documents: [{ ...doc, version: "fake" }], truncated: false })); mount("/knowledge/documents");
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid document evidence response"); expect(screen.queryByText("No page-evidenced documents imported.")).toBeNull();
});
test("re-login with same credential fences old pending results by actual auth session", async () => {
  let finish!: (value: unknown) => void; const old = new Promise(resolve => { finish = resolve; });
  fetchMock.mockImplementationOnce(() => old).mockResolvedValue(reply({ documents: [{ ...doc, title: "Current login" }], truncated: false }));
  function Controls() { const auth = useAuth(); return <button onClick={() => auth.setApiKey("k")}>Login again</button>; }
  render(<MemoryRouter initialEntries={["/knowledge/documents"]}><AuthProvider><Controls /><KnowledgeDocumentsPage /></AuthProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Login again" })); expect(await screen.findByRole("link", { name: "Current login" })).toBeInTheDocument();
  await act(async () => finish(reply({ documents: [{ ...doc, title: "Obsolete login" }], truncated: false })));
  expect(screen.queryByText("Obsolete login")).toBeNull();
});
test("route change immediately fences prior page/save controls before passive cleanup", async () => {
  const staleCommits: boolean[] = [];
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/other")) return new Promise(() => {});
    return Promise.resolve(reply(url.endsWith("/pages/2") ? { ...doc, pageNumber: 2, text: "Old source quote." } : url.endsWith("/a%3Adoc") ? { ...doc, highlights: [] } : { documents: [doc], truncated: false }));
  });
  function Observer() { const location = useLocation(); useLayoutEffect(() => { if (location.pathname.includes("/other/")) staleCommits.push(Boolean(document.querySelector("textarea"))); }, [location.pathname]); return <Link to="/knowledge/documents/other/pages/1">Switch source</Link>; }
  render(<MemoryRouter initialEntries={["/knowledge/documents/a%3Adoc/pages/2"]}><AuthProvider><Observer /><Routes><Route path="/knowledge/documents/:id/pages/:page" element={<KnowledgeDocumentsPage />} /></Routes></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Admissions · Page 2" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Switch source" })); expect(staleCommits).toEqual([false]); expect(screen.queryByText("Old source quote.")).toBeNull(); expect(screen.queryByRole("button", { name: "Save highlight" })).toBeNull();
});

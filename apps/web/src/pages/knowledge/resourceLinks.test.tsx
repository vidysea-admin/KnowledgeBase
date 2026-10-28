import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext.js";
import { safePublicResourceUrl } from "../../safe-url.js";
import { KnowledgeDirectoryPage } from "./KnowledgeDirectoryPage.js";
import { KnowledgeResourcesPage } from "./catalog/KnowledgeResourcesPage.js";
import { directoryGraph, directorySessions } from "./knowledgeDirectoryFixtures.js";

const REFUSED = ["javascript:alert(1)", "data:text/html,<b>x</b>", "file:///C:/private/path.txt", "vbscript:msgbox(1)", "//evil.example/x",
  "https://user:pass@example.com/x", "https://user@example.com/x", " https://example.com/x", "https://example.com/x\n"];
const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test.each(REFUSED)("sanitizer refuses %j", url => { expect(safePublicResourceUrl(url)).toBeNull(); });
test("sanitizer accepts https and http, reports host", () => {
  expect(safePublicResourceUrl("https://example.com/a?b=1")).toEqual({ href: "https://example.com/a?b=1", host: "example.com" });
  expect(safePublicResourceUrl("http://example.org/")?.host).toBe("example.org");
  expect(safePublicResourceUrl(undefined)).toBeNull();
});

const mountDirectory = (sources: unknown[]) => {
  fetchMock.mockImplementation((u: string) => Promise.resolve({ ok: true, status: 200, json: async () => u.endsWith("/sessions") ? { sessions: directorySessions } : u.endsWith("/sources") ? { sources } : directoryGraph }));
  return render(<MemoryRouter initialEntries={["/knowledge"]}><AuthProvider><KnowledgeDirectoryPage /></AuthProvider></MemoryRouter>);
};

test("directory: valid https link renders safely; refused schemes and credentials render no link; no path leak", async () => {
  const sources = [{ _id: "ok", kind: "a-doc", createdAt: "2026-10-13", path: "C:/private/path.txt", url: "https://example.com/document" },
    ...REFUSED.map((url, i) => ({ _id: `bad${i}`, kind: "z-doc", createdAt: "2026-10-13", path: "C:/secret/dir/file.txt", url })),
    { _id: "pathonly", kind: "z-doc", createdAt: "2026-10-13", path: "/home/u/secret.txt" }];
  const { container } = mountDirectory(sources);
  fireEvent.click(await screen.findByRole("tab", { name: "Resources" }));
  const link = await screen.findByRole("link", { name: /Open source \(example\.com\)/ });
  expect(link).toHaveAttribute("href", "https://example.com/document");
  expect(link).toHaveAttribute("rel", "noopener noreferrer"); expect(link).toHaveAttribute("target", "_blank");
  const external = [...container.querySelectorAll("a")].filter(a => !(a.getAttribute("href") ?? "").startsWith("/"));
  expect(external).toHaveLength(1);
  expect(screen.getAllByText("No public source link available")).toHaveLength(REFUSED.length + 1);
  for (const needle of ["C:/private", "C:/secret", "/home/u", "secret.txt", "javascript:", "file:///", "pass@"]) expect(container.innerHTML).not.toContain(needle);
});

test("resources catalog: valid link renders; hostile url makes the whole response fail with no link and no path", async () => {
  const body = (url: unknown) => ({ ok: true, status: 200, json: async () => ({ resources: [{ id: "r", kind: "url", createdAt: "now", url, path: "C:/leak/p.txt" }], programs: [], truncated: false }) });
  fetchMock.mockResolvedValue(body("https://example.org/resource"));
  const first = render(<MemoryRouter><AuthProvider><KnowledgeResourcesPage /></AuthProvider></MemoryRouter>);
  const link = await screen.findByRole("link", { name: "Public source" });
  expect(link).toHaveAttribute("href", "https://example.org/resource"); expect(link).toHaveAttribute("rel", "noopener noreferrer"); expect(link).toHaveAttribute("target", "_blank");
  expect(first.container.innerHTML).not.toContain("C:/leak");
  cleanup();
  for (const url of REFUSED) {
    fetchMock.mockResolvedValue(body(url));
    const { container, unmount } = render(<MemoryRouter><AuthProvider><KnowledgeResourcesPage /></AuthProvider></MemoryRouter>);
    await screen.findByRole("alert");
    expect(container.querySelector("a")).toBeNull(); expect(container.innerHTML).not.toContain("C:/leak");
    unmount();
  }
});

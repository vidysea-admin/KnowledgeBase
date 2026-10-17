import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { App } from "../../App.js";
const mock = vi.fn();
beforeEach(() => { mock.mockReset(); vi.stubGlobal("fetch", mock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState({}, "", "/"); });
test("actual protected App mounts document source-page target and exposes knowledge navigation", async () => {
  const doc = { id: "a:doc", sourceId: "a:doc", version: "a".repeat(64), title: "Actual mounted page", format: "pdf", pageCount: 1 };
  window.history.replaceState({}, "", "/knowledge/documents/a%3Adoc/pages/1");
  mock.mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: async () => url.endsWith("/pages/1") ? { ...doc, pageNumber: 1, text: "Exact page quote." } : url.endsWith("/a%3Adoc") ? { ...doc, highlights: [{ id: "h", pageNumber: 1, quote: "Exact page quote.", text: "Exact page quote.", verification: "unverified" }] } : url.endsWith("/knowledge/documents") ? { documents: [doc], truncated: false } : {} }));
  render(<App />); expect(await screen.findByRole("heading", { name: "Actual mounted page · Page 1" })).toBeInTheDocument();
  for (const href of ["/knowledge/documents", "/knowledge/collections", "/knowledge/topics", "/knowledge/speakers", "/knowledge/resources"]) expect(document.querySelector(`a[href='${href}']`)).not.toBeNull();
  expect(screen.getByRole("link", { name: "Actual mounted page · Page 1" })).toHaveAttribute("href", "/knowledge/documents/a%3Adoc/pages/1");
});

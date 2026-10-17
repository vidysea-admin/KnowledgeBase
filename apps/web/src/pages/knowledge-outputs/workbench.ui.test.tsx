import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error jsdom is a test runtime dependency with no bundled declarations in this workspace.
import { JSDOM } from "jsdom";
// Direct node/jsdom harness avoids starting the Vitest worker pool in this shared-CPU lane.
// @ts-expect-error coordination runtime is a local .mjs harness without TypeScript declarations.
import { configureTestViteEnv } from "../../../../../.cache/coordination/safe-test-runtime/register.mjs";

test("UI creates, cites, saves, reopens, revalidates and exports through authenticated API", async () => {
  configureTestViteEnv({ PROD: true });
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/knowledge-outputs" });
  const keys = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "CustomEvent", "Event", "Node", "MutationObserver"] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const key of keys) { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] }); }
  dom.window.localStorage.setItem("lkbApiKey", "fixture-key");
  const originalFetch = globalThis.fetch;
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL, oldClick = dom.window.HTMLAnchorElement.prototype.click;
  let downloads = 0;
  URL.createObjectURL = () => "blob:fixture"; URL.revokeObjectURL = () => undefined;
  dom.window.HTMLAnchorElement.prototype.click = () => { downloads++; };
  const requests: { url: string; method: string; body: unknown }[] = [];
  let draft = { _id: "o1", tenantId: "a", kind: "faq", title: "Admissions FAQ", purpose: "Prepare Monday applications", sessionIds: ["s1"], revision: 1,
    createdAt: "2026-10-14T12:00:00Z", updatedAt: "2026-10-14T12:00:00Z", sourceDigest: "fixture", sourceCoverage: { status: "ready", withheldClaims: 0 }, provider: "fixture", model: "fixture", reviewState: "draft",
    sections: [{ key: "faq", title: "Questions and answers", missing: "", items: [{ id: "faq-1", kind: "fact", text: "Q: When?\nA: Monday.", citationIds: ["e1"], validation: "ai-supported", assessmentDigest: "fixture-http-only" }] }],
    citations: [{ id: "e1", claimId: "c1", turnId: "t1", sessionId: "s1", speakerRef: "speaker:1", start: 3, end: 9, unit: "seconds", quote: "Applications open Monday.", href: "/sessions/s1#turn-t1" }] };
  globalThis.fetch = async (url, opts) => {
    const method = opts?.method ?? "GET", body = opts?.body ? JSON.parse(String(opts.body)) : undefined;
    assert.equal((opts?.headers as Record<string, string>).authorization, "Bearer fixture-key");
    requests.push({ url: String(url), method, body });
    let response: unknown;
    if (url === "/sessions") response = { sessions: [{ _id: "s1", title: "Source session", date: "2026-10-14", status: { transcribe: "done", index: "done" } }] };
    else if (url === "/knowledge-outputs" && method === "GET") response = { outputs: requests.some((r) => r.method === "POST") ? [{ id: "o1", title: draft.title, kind: draft.kind, revision: draft.revision, updatedAt: draft.updatedAt }] : [] };
    else if (url === "/knowledge-outputs" && method === "POST") response = draft;
    else if (String(url).endsWith("/export")) response = { markdown: "# AI draft", filename: "faq-o1.md" };
    else if (String(url).endsWith("/revalidate")) { draft = { ...draft, revision: draft.revision + 1, sections: draft.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, validation: "ai-supported" })) })) }; response = draft; }
    else if (method === "PUT") { draft = { ...draft, revision: draft.revision + 1, title: body.title, sections: draft.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, text: body.edits[0]?.text ?? i.text, validation: "needs-review" })) })) }; response = draft; }
    else response = draft;
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  };
  const React = await import("react");
  const { render, screen, fireEvent, waitFor, cleanup } = await import("@testing-library/react");
  const { MemoryRouter } = await import("react-router-dom");
  const { AuthProvider } = await import("../../auth/AuthContext.js");
  const { KnowledgeOutputsPage } = await import("./KnowledgeOutputsPage.js");
  try {
    render(<AuthProvider><MemoryRouter><KnowledgeOutputsPage /></MemoryRouter></AuthProvider>);
    await screen.findByText("Source session");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Admissions FAQ" } });
    fireEvent.change(screen.getByLabelText("Audience and purpose"), { target: { value: "Prepare Monday applications" } });
    fireEvent.click(screen.getByLabelText("Source session")); fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    await screen.findByRole("button", { name: "Edit draft" });
    assert.equal(screen.getByRole("link", { name: /speaker:1/u }).getAttribute("href"), "/sessions/s1#turn-t1");
    assert.match(screen.getByText(/Model grounding assessment completed/u).textContent ?? "", /human review required/u);
    fireEvent.click(screen.getByRole("button", { name: "Edit draft" }));
    fireEvent.change(screen.getByLabelText("Draft title"), { target: { value: "Updated admissions FAQ" } });
    fireEvent.change(screen.getByLabelText("Edit faq-1 (saved edits need revalidation)"), { target: { value: "Q: When do applications open?\nA: Applications open Monday." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Item withheld — needs grounding review.");
    assert.match(screen.getByRole("button", { name: "Updated admissions FAQ" }).closest("li")?.textContent ?? "", /revision 2/u);
    assert.equal((screen.getByRole("button", { name: "Download Markdown" }) as HTMLButtonElement).disabled, true);
    fireEvent.click(screen.getByRole("button", { name: "Revalidate grounding" }));
    await waitFor(() => assert.equal((screen.getByRole("button", { name: "Download Markdown" }) as HTMLButtonElement).disabled, false));
    assert.match(screen.getByRole("button", { name: "Updated admissions FAQ" }).closest("li")?.textContent ?? "", /revision 3/u);
    fireEvent.click(screen.getByRole("button", { name: "Download Markdown" })); await waitFor(() => assert.equal(downloads, 1));
    fireEvent.click(screen.getByRole("button", { name: "Updated admissions FAQ" }));
    await waitFor(() => assert.ok(requests.some((r) => r.url === "/knowledge-outputs/o1" && r.method === "GET")));
    assert.ok(requests.some((r) => r.method === "PUT")); assert.ok(requests.some((r) => r.url.endsWith("/revalidate")));
  } finally {
    cleanup(); globalThis.fetch = originalFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; dom.window.HTMLAnchorElement.prototype.click = oldClick;
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
});

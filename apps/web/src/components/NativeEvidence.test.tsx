import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NativeEvidence } from "./NativeEvidence.js";
import { AuthProvider, useAuth } from "../auth/AuthContext.js";
import type { NativeSourceLocator } from "../api/nativeEvidence.js";

const doc: NativeSourceLocator = { kind: "document-page", documentId: "doc", sourceId: "source", documentSourceId: "body",
  headRevision: 1, revisionHash: "a".repeat(64), pageNumber: 7, passage: { start: 0, end: 5, sha256: "b".repeat(64) } };
const message: NativeSourceLocator = { kind: "message", sourceId: "chat", revisionHash: "c".repeat(64), threadId: "thread",
  messageId: "message", passage: { start: 0, end: 5, sha256: "d".repeat(64) } };
const reply = (sourceLocator: NativeSourceLocator = doc, quote = "hello") => new Response(JSON.stringify({ evidence: { sourceLocator, quote, title: "Current source" } }), { headers: { "content-type": "application/json" } });
function Controls() { const auth = useAuth(); return <><button onClick={() => auth.setApiKey("new")}>Replace owner</button>
  <button onClick={() => auth.setApiKey("key")}>Reset same key</button><button onClick={auth.clearApiKey}>Sign out</button></>; }
function show(sourceLocator: NativeSourceLocator = doc, key: string | null = "key") {
  if (key) localStorage.setItem("lkbApiKey", key);
  return render(<AuthProvider><Controls /><NativeEvidence sourceLocator={sourceLocator} /></AuthProvider>);
}
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(r => { resolve = r; }), resolve: (v: Response) => resolve(v) }; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test.each([doc, message])("$kind shows native location but no quote until explicit authenticated recheck", async sourceLocator => {
  const fetcher = vi.fn().mockResolvedValue(reply(sourceLocator)); vi.stubGlobal("fetch", fetcher); show(sourceLocator);
  expect(screen.queryByText("hello")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByText(/Characters 0–5/)).toHaveTextContent(sourceLocator.kind === "document-page" ? "Document page 7" : "Message message in thread thread");
  fireEvent.click(screen.getByRole("button", { name: "Open cited passage" }));
  expect(await screen.findByText("hello")).toBeInTheDocument(); expect(screen.queryByText(/00:00/)).toBeNull();
  expect(document.querySelector("audio")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
});
test("signed out never resolves evidence", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); show(doc, null);
  expect(screen.getByText("Sign in to open this source passage.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open cited passage" })).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
});
test.each(["Replace owner", "Reset same key", "Sign out"])("%s immediately hides completed quote and never refetches automatically", async label => {
  const fetcher = vi.fn().mockResolvedValue(reply()); vi.stubGlobal("fetch", fetcher); show();
  fireEvent.click(screen.getByRole("button", { name: "Open cited passage" })); await screen.findByText("hello");
  fireEvent.click(screen.getByRole("button", { name: label })); expect(screen.queryByText("hello")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
});
test("pending old-owner response is ignored after same-key reset", async () => {
  const pending = deferred(), fetcher = vi.fn().mockReturnValue(pending.promise); vi.stubGlobal("fetch", fetcher); show();
  fireEvent.click(screen.getByRole("button", { name: "Open cited passage" })); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Reset same key" }));
  await act(async () => pending.resolve(reply())); expect(screen.queryByText("hello")).toBeNull();
});
test("changed locator hides old evidence and A→B→A cannot restore it without another recheck", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply()));
  const view = show(); fireEvent.click(screen.getByRole("button", { name: "Open cited passage" })); await screen.findByText("hello");
  view.rerender(<AuthProvider><Controls /><NativeEvidence sourceLocator={message} /></AuthProvider>); expect(screen.queryByText("hello")).toBeNull();
  view.rerender(<AuthProvider><Controls /><NativeEvidence sourceLocator={doc} /></AuthProvider>); expect(screen.queryByText("hello")).toBeNull();
});
test.each([403, 404, 503])("HTTP %s hides the quote and exposes safe explicit retry", async status => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply()).mockResolvedValueOnce(new Response(JSON.stringify({ message: "PRIVATE" }), { status }));
  vi.stubGlobal("fetch", fetcher); show(); fireEvent.click(screen.getByRole("button", { name: "Open cited passage" })); await screen.findByText("hello");
  fireEvent.click(screen.getByRole("button", { name: "Recheck cited passage" })); expect(screen.queryByText("hello")).toBeNull();
  await screen.findByRole("status"); expect(document.body.textContent).not.toContain("PRIVATE"); expect(screen.queryByText("hello")).toBeNull();
});

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../../apps/web/src/auth/AuthContext.js";
import { PolicyAskPage } from "../../../apps/web/src/pages/answer-policy/PolicyAskPage.js";
import { searchTranscripts } from "../../../apps/web/src/api/search/client.js";

const answer = (text: string) => ({ answer: text, verdict: "correct", scored: [], web_used: false,
  insufficient_coverage: false, sources: { internal: [], web: [] }, auditLog: [],
  runId: "independent-run", state: "allowed", policy: null, candidateDigest: "candidate", evidenceDigest: "evidence",
  confidence: { basis: "retrieval", score: null, calibrated: false }, followUps: [], sourceEvidence: [] });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
function Controls() {
  const navigate = useNavigate(), auth = useAuth();
  return <><button onClick={() => navigate("/ask?q=other")}>Different URL</button>
    <button onClick={() => navigate("/ask?q=first")}>Original URL</button>
    <button onClick={() => auth.setApiKey("new-owner")}>New owner</button>
    <button onClick={() => auth.setApiKey("old-owner")}>Reset same key</button></>;
}
function show() {
  localStorage.setItem("lkbApiKey", "old-owner");
  return render(<AuthProvider><MemoryRouter initialEntries={["/ask?q=first"]}>
    <Controls /><Routes><Route path="/ask" element={<PolicyAskPage />} /></Routes>
  </MemoryRouter></AuthProvider>);
}
// The actual composed /ask consumer loads tenant metadata. Only explicit POSTs use the pending answer fixture.
function install(post: (input: string, options: RequestInit) => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(async (input: string, options: RequestInit) => {
    const path = new URL(input, "http://fixture").pathname;
    if (path === "/answer-policies") return response({ policies: [] });
    if (path === "/answer-history") return response({ history: [] });
    if (path === "/answer-history/suggestions") return response({ questions: [] });
    if (path === "/ask" && options.method === "POST") return post(input, options);
    throw new Error(`Unexpected independent request: ${path}`);
  }));
}
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

test("question A -> B -> A cannot resurrect the first pending A response", async () => {
  const old = deferred();
  const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(answer("New A answer")));
  install(fetcher); show();
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Different URL" }));
  fireEvent.click(screen.getByRole("button", { name: "Original URL" }));
  expect(screen.getByLabelText("Question")).toHaveValue("first");
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await screen.findByText("New A answer");
  await act(async () => { old.resolve(response(answer("Stale A answer"))); });
  expect(screen.queryByText("Stale A answer")).toBeNull();
  expect(screen.getByText("New A answer")).toBeInTheDocument();
});

test("a completed old-owner answer disappears on owner replacement before another request", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(answer("Tenant private answer")));
  install(fetcher); show();
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await screen.findByText("Tenant private answer");
  fireEvent.click(screen.getByRole("button", { name: "New owner" }));
  expect(screen.queryByText("Tenant private answer")).toBeNull();
  expect(screen.getByLabelText("Question")).toHaveValue("");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("same-key auth reset invalidates pending Ask evidence through the auth session generation", async () => {
  const pending = deferred();
  const fetcher = vi.fn().mockReturnValue(pending.promise);
  install(fetcher); show();
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Reset same key" }));
  expect(screen.getByLabelText("Question")).toHaveValue("");
  await act(async () => { pending.resolve(response(answer("Prior auth-session answer"))); });
  expect(screen.queryByText("Prior auth-session answer")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each(["sessionId", "turnId"])("lexical client refuses unencodable %s before a citation can crash rendering", async field => {
  const sessionId = field === "sessionId" ? "bad\ud800" : "session";
  const turnId = field === "turnId" ? "bad\ud800" : "turn";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ query: "query", hits: [{
    sessionId, turnId, score: 0.5,
    session: { _id: sessionId, title: "Session", date: "2026-10-14", status: { transcribe: "done", index: "done" } },
    turn: { _id: turnId, sessionId, speakerRef: "speaker", text: "literal", tStart: 1, tEnd: 2 },
  }] })));
  await expect(searchTranscripts("key", "query")).rejects.toMatchObject({ status: 503 });
});

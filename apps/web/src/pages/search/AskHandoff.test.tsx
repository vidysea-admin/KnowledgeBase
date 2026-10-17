import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { AskPage } from "../AskPage.js";
import { SearchPage } from "./SearchPage.js";
import { App } from "../../App.js";

const answer = { answer: "Current answer", verdict: "correct", scored: [], web_used: false,
  insufficient_coverage: false, sources: { internal: [], web: [] }, auditLog: [] };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function Controls() {
  const auth = useAuth(), navigate = useNavigate();
  return <><button onClick={() => auth.setApiKey("replacement")}>Replace key</button>
    <button onClick={() => auth.setApiKey("original")}>Reset same key</button>
    <button onClick={() => navigate("/ask?q=next")}>Next question</button></>;
}
function show(route: string) {
  localStorage.setItem("lkbApiKey", "original");
  return render(<AuthProvider><MemoryRouter initialEntries={[route]}><Controls /><Routes>
    <Route path="/ask" element={<AskPage />} /><Route path="/search" element={<SearchPage />} />
  </Routes></MemoryRouter></AuthProvider>);
}
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(r => { resolve = r; }), resolve: (value: Response) => resolve(value) }; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); window.history.replaceState({}, "", "/"); });

test("final composed App sends the Search question to its actual Ask consumer without automatic POST", async () => {
  const question = "नमस्ते & 50% # 世界";
  const fetcher = vi.fn(async (input: string, options: RequestInit) => {
    const url = new URL(input, "http://x");
    if (url.pathname === "/search") return response({ query: question, hits: [] });
    if (url.pathname === "/answer-policies") return response({ policies: [] });
    if (url.pathname === "/answer-history") return response({ history: [] });
    if (url.pathname === "/answer-history/suggestions") return response({ questions: [] });
    if (url.pathname === "/ask" && options.method === "POST") return response({ ...answer, runId: "run-1", state: "allowed",
      policy: null, candidateDigest: "candidate", evidenceDigest: "evidence", confidence: { basis: "maximum retrieval score", score: 0.9, calibrated: false },
      followUps: [], sourceEvidence: [] });
    throw new Error(`Unexpected composed request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetcher); localStorage.setItem("lkbApiKey", "original");
  window.history.replaceState({}, "", `/search?q=${encodeURIComponent(question)}`); render(<App />);
  fireEvent.click(await screen.findByRole("link", { name: "Send to Ask" }));
  expect(await screen.findByLabelText("Question")).toHaveValue(question);
  expect(fetcher.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Ask" })); await screen.findByText("Current answer");
  const posts = fetcher.mock.calls.filter(([, options]) => options.method === "POST"); expect(posts).toHaveLength(1);
  const [url, options] = posts[0]!; expect(new URL(url, "http://x").pathname).toBe("/ask");
  expect(JSON.parse(String(options.body)).query).toBe(question); expect(options.headers).toMatchObject({ authorization: "Bearer original" });
});

test("real Search handoff prefills actual Ask once; POST needs explicit action and uses authenticated key", async () => {
  const question = "नमस्ते & 50% # 世界";
  const fetcher = vi.fn(async (input: string, options: RequestInit) => new URL(input, "http://x").pathname === "/search"
    ? response({ query: question, hits: [] }) : response(answer));
  vi.stubGlobal("fetch", fetcher); show(`/search?q=${encodeURIComponent(question)}`);
  fireEvent.click(await screen.findByRole("link", { name: "Send to Ask" }));
  expect(screen.getByLabelText("Question")).toHaveValue(question); expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Ask" })); await screen.findByText("Current answer");
  expect(fetcher).toHaveBeenCalledTimes(2);
  const [url, options] = fetcher.mock.calls[1]!;
  expect(new URL(url, "http://x").pathname).toBe("/ask"); expect(options.method).toBe("POST");
  expect(options.headers).toMatchObject({ authorization: "Bearer original" }); expect(JSON.parse(String(options.body))).toEqual({ query: question });
});

test("URL text is decoded once, bounded and inert without any automatic request", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  show(`/ask?q=${encodeURIComponent('<script>alert(1)</script>\u202e' + "x".repeat(1000))}`);
  const value = (screen.getByLabelText("Question") as HTMLInputElement).value;
  expect(Array.from(value)).toHaveLength(512); expect(value).not.toContain("\u202e");
  expect(document.querySelector("script")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
});

test.each(["key", "session", "url", "draft"])("late answer cannot cross a %s change", async boundary => {
  const pending = deferred(), fetcher = vi.fn().mockReturnValue(pending.promise); vi.stubGlobal("fetch", fetcher); show("/ask?q=first");
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  if (boundary === "key") fireEvent.click(screen.getByRole("button", { name: "Replace key" }));
  if (boundary === "session") fireEvent.click(screen.getByRole("button", { name: "Reset same key" }));
  if (boundary === "url") fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  if (boundary === "draft") fireEvent.change(screen.getByLabelText("Question"), { target: { value: "edited" } });
  expect(screen.queryByText("Current answer")).toBeNull();
  await act(async () => { pending.resolve(response(answer)); });
  expect(screen.queryByText("Current answer")).toBeNull();
  expect(screen.getByLabelText("Question")).toHaveValue(boundary === "key" || boundary === "session" ? "" : boundary === "url" ? "next" : "edited");
});

test("late old-key denial preserves replacement key; current missing scope has safe retry", async () => {
  const pending = deferred(); const fetcher = vi.fn().mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(response({ message: "SECRET provider details" }, 403)).mockResolvedValueOnce(response(answer));
  vi.stubGlobal("fetch", fetcher); show("/ask?q=first"); fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Replace key" }));
  await act(async () => { pending.resolve(response({}, 401)); });
  expect(localStorage.getItem("lkbApiKey")).toBe("replacement"); expect(document.body.textContent).not.toContain("Sign in to ask");
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "new" } }); fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await screen.findByText("This API key needs ask access."); expect(document.body.textContent).not.toContain("SECRET");
  fireEvent.click(screen.getByRole("button", { name: "Ask" })); await screen.findByText("Current answer");
});

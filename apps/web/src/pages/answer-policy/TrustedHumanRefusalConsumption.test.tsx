import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthContext.js";
import { AnswerReviewPage } from "./AnswerReviewPage.js";
import { PolicyAskPage } from "./PolicyAskPage.js";
import type { AnswerReview, AppliedAnswer, HistoryItem } from "./client.js";

// Synthetic transport receipt for an unavailable authority, never human acceptance.
const query = "Which fee is supported?";
const held: AppliedAnswer = {
  runId: "pending-run", state: "review", answer: "", verdict: "ambiguous", reason: "partial",
  scored: [], auditLog: [], web_used: false, insufficient_coverage: true,
  sources: { internal: [], web: [] }, policy: null, candidateDigest: "candidate-revision",
  evidenceDigest: "evidence-revision", confidence: { basis: "retrieval coverage", score: null, calibrated: false },
  followUps: [], sourceEvidence: [],
};
const history: HistoryItem = { id: held.runId, query, questionClass: "fees", createdAt: "2026-10-15",
  reason: "insufficient-coverage", filters: { sessionIds: [], sources: "internal" }, evidenceMode: true, result: held };
const pending: AnswerReview = { id: held.runId, query, questionClass: "fees", createdAt: history.createdAt,
  state: "review", reason: history.reason, candidate: { ...held, answer: "Unapproved fee candidate." },
  policy: null, candidateDigest: held.candidateDigest, evidenceDigest: held.evidenceDigest, evidence: [] };
function mount(page: React.ReactElement, route: string): void {
  localStorage.setItem("lkbApiKey", "synthetic-review-key");
  render(<AuthProvider><MemoryRouter initialEntries={[route]}>{page}</MemoryRouter></AuthProvider>);
}
function transport() {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(input), "http://fixture.invalid").pathname;
    const method = init?.method ?? "GET";
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-review-key");
    calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "POST" && ["/answer-reviews/pending-run/resolve", "/answer-history/pending-run/feedback"].includes(path)) {
      return new Response(JSON.stringify({ error: "human_review_unavailable" }), { status: 503 });
    }
    const reads: Record<string, unknown> = {
      "/answer-reviews": { items: [pending] }, "/answer-evidence-conflicts": { conflicts: [] },
      "/answer-policies": { policies: [] }, "/answer-history": { history: [history] },
      "/answer-history/suggestions": { questions: [] },
    };
    if (method !== "GET" || !(path in reads)) throw new Error(`Unexpected fixture request: ${method} ${path}`);
    return new Response(JSON.stringify(reads[path]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test("authority-unavailable approval keeps the candidate pending and saved Ask history withheld", async () => {
  const calls = transport();
  mount(<AnswerReviewPage />, "/answer-review");
  await screen.findByRole("heading", { name: query });
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Attempted review" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve exact candidate" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 503");
  expect(screen.getByText("review · insufficient-coverage · 2026-10-15")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve exact candidate" })).toBeEnabled();
  expect(screen.queryByText(/approved by verified tenant actor/)).not.toBeInTheDocument();
  expect(calls.filter(c => c.method === "POST")).toEqual([{ path: "/answer-reviews/pending-run/resolve", method: "POST",
    body: { decision: "approved", note: "Attempted review", candidateDigest: held.candidateDigest, evidenceDigest: held.evidenceDigest } }]);
  cleanup();
  mount(<PolicyAskPage />, "/ask");
  fireEvent.click(await screen.findByRole("button", { name: query }));
  await screen.findByRole("heading", { name: "Answer status: review" });
  expect(screen.getByText(/Candidate withheld: review/)).toBeInTheDocument();
  expect(screen.queryByText("Unapproved fee candidate.")).not.toBeInTheDocument();
  expect(calls.filter(c => c.method === "POST")).toHaveLength(1);
});

test("authority-unavailable usefulness feedback reports refusal without a saved-feedback notice", async () => {
  const calls = transport();
  mount(<PolicyAskPage />, "/ask");
  fireEvent.click(await screen.findByRole("button", { name: query }));
  await screen.findByRole("heading", { name: "Answer status: review" });
  fireEvent.change(screen.getByLabelText("Feedback note"), { target: { value: "Requires human evaluation" } });
  fireEvent.click(screen.getByRole("button", { name: "helpful" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 503");
  await waitFor(() => expect(screen.getByRole("button", { name: "helpful" })).toBeEnabled());
  expect(screen.queryByText("Feedback saved for this answer revision.")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Answer status: review" })).toBeInTheDocument();
  expect(screen.getByText(/Candidate withheld: review/)).toBeInTheDocument();
  expect(calls.filter(c => c.method === "POST")).toEqual([{ path: "/answer-history/pending-run/feedback", method: "POST",
    body: { rating: "helpful", note: "Requires human evaluation" } }]);
});

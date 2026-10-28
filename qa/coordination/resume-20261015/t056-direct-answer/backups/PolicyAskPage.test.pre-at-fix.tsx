import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { ApiError } from "../../api/client.js";
import { PolicyAskPage } from "./PolicyAskPage.js";
import { PolicyManager } from "./PolicyManager.js";
import { AnswerReviewPage } from "./AnswerReviewPage.js";
import * as client from "./client.js";

const policy: client.SavedPolicy = { tenantId: "tenant-a", policyId: "fees", version: 3, questionClass: "fees", mode: "internal-only", style: "detailed", onInsufficient: "review", citations: "required", retired: false, note: "Initial", changedAt: "2026-10-14", changedBy: { actor: "api-key:tenant-a" } };
function response(state = "allowed"): client.AppliedAnswer {
  return { answer: state === "allowed" ? "Fee is 100." : "", verdict: "correct", reason: "supported", scored: [], auditLog: [],
    insufficient_coverage: false, web_used: false, sources: { internal: [{ node_id: "n1", evidence: { sessionRef: "s1", sourceQuotes: [{ id: "q1", quote: "Fee is 100.", turnId: "t1", speakerRef: "spk:1", tStart: 10, tEnd: 15, origin: "speech" }] } }], web: [{ title: "Unsafe", url: "javascript:alert(1)" }] },
    runId: "run-1", state, policy, candidateDigest: "candidate-digest", evidenceDigest: "evidence-digest", sourceEvidence: [], confidence: { basis: "maximum retrieval score", score: .9, calibrated: false }, followUps: ["What evidence supports the fee?"] };
}
function Controls(): React.ReactElement {
  const auth = useAuth(), navigate = useNavigate();
  return <><button onClick={() => auth.setApiKey("replacement")}>Replace key</button><button onClick={() => auth.setApiKey("original")}>Reuse key session</button><button onClick={() => navigate("/ask?q=next")}>Next URL</button></>;
}
function mount(page: React.ReactElement = <PolicyAskPage />, route = "/ask?q=first"): void {
  localStorage.setItem("lkbApiKey", "original");
  render(<AuthProvider><MemoryRouter initialEntries={[route]}><Controls />{page}</MemoryRouter></AuthProvider>);
}
beforeEach(() => {
  vi.spyOn(client, "listPolicies").mockResolvedValue({ policies: [policy] });
  vi.spyOn(client, "answerHistory").mockResolvedValue({ history: [] });
  vi.spyOn(client, "answerSuggestions").mockResolvedValue({ questions: ["Ask saved query"] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

test("URL handoff is prefill only; explicit current-key Ask submits selected immutable version and effective filters", async () => {
  const ask = vi.spyOn(client, "askWithPolicy").mockResolvedValue(response()); mount();
  await screen.findByRole("option", { name: "fees v3 (fees)" });
  expect(screen.getByLabelText("Question")).toHaveValue("first"); expect(ask).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Saved policy"), { target: { value: "fees" } });
  fireEvent.change(screen.getByLabelText("Limit to session IDs (comma-separated)"), { target: { value: " s1, s2 " } });
  fireEvent.change(screen.getByLabelText("Source filter"), { target: { value: "internal" } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await screen.findByRole("heading", { name: "Answer status: allowed" });
  expect(ask).toHaveBeenCalledWith("original", { query: "first", questionClass: "fees", policyId: "fees", policyVersion: 3, evidenceMode: true, filters: { sessionIds: ["s1", "s2"], sources: "internal" } });
  expect(screen.getByText(/uncalibrated, not factual certainty/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open cited turn and available recording evidence" })).toHaveAttribute("href", "/sessions/s1#turn-t1");
  expect(screen.queryByRole("link", { name: "Unsafe" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "What evidence supports the fee?" }));
  expect(screen.getByLabelText("Question")).toHaveValue("What evidence supports the fee?");
  expect(screen.queryByRole("heading", { name: "Answer status: allowed" })).not.toBeInTheDocument();
});
test.each(["key", "same-key", "url", "draft"])("late candidate cannot cross a %s ownership change", async (boundary) => {
  let resolve!: (value: client.AppliedAnswer) => void;
  const ask = vi.spyOn(client, "askWithPolicy").mockImplementation(() => new Promise((r) => { resolve = r; })); mount();
  await screen.findByRole("option", { name: "fees v3 (fees)" });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  if (boundary === "key") fireEvent.click(screen.getByRole("button", { name: "Replace key" }));
  if (boundary === "same-key") fireEvent.click(screen.getByRole("button", { name: "Reuse key session" }));
  if (boundary === "url") fireEvent.click(screen.getByRole("button", { name: "Next URL" }));
  if (boundary === "draft") fireEvent.change(screen.getByLabelText("Question"), { target: { value: "edited" } });
  await act(async () => { resolve(response()); });
  expect(screen.queryByRole("heading", { name: "Answer status: allowed" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Question")).toHaveValue(boundary === "key" || boundary === "same-key" ? "" : boundary === "url" ? "next" : "edited");
});
test("review hold releases no candidate text; feedback persists against the correct run ID", async () => {
  const held = response("review"); held.sources.internal = [];
  vi.spyOn(client, "askWithPolicy").mockResolvedValue(held);
  const feedback = vi.spyOn(client, "saveAnswerFeedback").mockResolvedValue({ saved: true }); mount();
  await screen.findByRole("option", { name: "fees v3 (fees)" });
  fireEvent.click(screen.getByRole("button", { name: "Ask" })); await screen.findByRole("heading", { name: "Answer status: review" });
  expect(screen.queryByText("Fee is 100.")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Feedback note"), { target: { value: "Needs more evidence" } });
  fireEvent.click(screen.getByRole("button", { name: "unhelpful" }));
  await waitFor(() => expect(feedback).toHaveBeenCalledWith("original", "run-1", "unhelpful", "Needs more evidence"));
});
test("actual consumer preserves typed draft on policy/filter change and clears obsolete answer", async () => {
  vi.spyOn(client, "askWithPolicy").mockResolvedValue(response()); mount();
  await screen.findByRole("option", { name: "fees v3 (fees)" });
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: "My typed fee question" } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" })); await screen.findByRole("heading", { name: "Answer status: allowed" });
  fireEvent.change(screen.getByLabelText("Saved policy"), { target: { value: "fees" } });
  expect(screen.getByLabelText("Question")).toHaveValue("My typed fee question");
  expect(screen.queryByRole("heading", { name: "Answer status: allowed" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Source filter"), { target: { value: "internal" } });
  expect(screen.getByLabelText("Question")).toHaveValue("My typed fee question");
});
test("restoring authenticated history cancels pending answer atomically in the actual consumer", async () => {
  const saved = { ...response(), runId: "saved-run", answer: "Restored reviewed answer", state: "approved" };
  const item: client.HistoryItem = { id: saved.runId, query: "Saved history query", questionClass: "fees", createdAt: "2026-10-14", reason: "reviewed", filters: { sessionIds: [], sources: "all" }, evidenceMode: true, result: saved };
  vi.mocked(client.answerHistory).mockResolvedValue({ history: [item] });
  let resolve!: (value: client.AppliedAnswer) => void;
  const ask = vi.spyOn(client, "askWithPolicy").mockImplementation(() => new Promise((r) => { resolve = r; })); mount();
  await screen.findByRole("button", { name: "Saved history query" });
  fireEvent.click(screen.getByRole("button", { name: "Ask" })); await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Saved history query" })); await screen.findByText("Restored reviewed answer");
  await act(async () => { resolve({ ...response(), answer: "STALE OLD REPLY" }); });
  expect(screen.queryByText("STALE OLD REPLY")).not.toBeInTheDocument(); expect(screen.getByText("Restored reviewed answer")).toBeInTheDocument();
  expect(screen.getByLabelText("Question")).toHaveValue("Saved history query");
});
test("synchronous adapter failure is caught by the actual guarded hook and permits retry", async () => {
  const ask = vi.spyOn(client, "askWithPolicy").mockImplementation(() => { throw new Error("Private provider failure"); }); mount();
  await screen.findByRole("option", { name: "fees v3 (fees)" }); fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await screen.findByText("Ask is unavailable. Try again."); expect(document.body.textContent).not.toContain("Private provider failure");
  ask.mockResolvedValue(response()); fireEvent.click(screen.getByRole("button", { name: "Ask" })); await screen.findByRole("heading", { name: "Answer status: allowed" });
});

test("explicit policy questions and saved history preserve their full question beyond the URL handoff bound", async () => {
  const longQuestion = `${"Reviewed fee context. ".repeat(50)}What is the full fee at the end?`;
  const saved = { ...response(), runId: "long-history-run", answer: "Answer to the full saved question", state: "approved" };
  const item: client.HistoryItem = { id: saved.runId, query: longQuestion, questionClass: "fees", createdAt: "2026-10-14", reason: "reviewed",
    filters: { sessionIds: [], sources: "all" }, evidenceMode: true, result: saved };
  vi.mocked(client.answerHistory).mockResolvedValue({ history: [item] });
  const ask = vi.spyOn(client, "askWithPolicy").mockResolvedValue(response()); mount();
  await screen.findByRole("option", { name: "fees v3 (fees)" });
  expect(screen.getByLabelText("Question")).toHaveAttribute("maxLength", "4000");
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: longQuestion } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" })); await screen.findByRole("heading", { name: "Answer status: allowed" });
  expect(ask.mock.calls[0]![1].query).toBe(longQuestion); expect(screen.getByLabelText("Question")).toHaveValue(longQuestion);
  fireEvent.click(screen.getByRole("button", { name: longQuestion })); await screen.findByText("Answer to the full saved question");
  expect(screen.getByLabelText("Question")).toHaveValue(longQuestion);
  expect(ask).toHaveBeenCalledTimes(1);
});
test("current policy conflict has a distinct safe explanation; late specific errors cannot cross auth ownership", async () => {
  const ask = vi.spyOn(client, "askWithPolicy").mockRejectedValue(new ApiError(409, "Private policy details", { code: "policy_conflict" })); mount();
  await screen.findByRole("option", { name: "fees v3 (fees)" }); fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await screen.findByText("Resolve conflicting saved policies by editing or retiring them before asking.");
  expect(document.body.textContent).not.toContain("Private policy details");
  let reject!: (error: unknown) => void;
  ask.mockImplementation(() => new Promise((_resolve, r) => { reject = r; }));
  fireEvent.click(screen.getByRole("button", { name: "Ask" })); await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "Replace key" }));
  await act(async () => { reject(new ApiError(409, "Old tenant private details", { code: "policy_conflict" })); });
  expect(screen.queryByText("Resolve conflicting saved policies by editing or retiring them before asking.")).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain("Old tenant private details");
});
test("saved YAML manager saves bounded user definition and reloads immutable history", async () => {
  vi.spyOn(client, "listPolicyConflicts").mockResolvedValue({ conflicts: [] });
  vi.spyOn(client, "policyHistory").mockResolvedValue({ history: [policy] });
  const save = vi.spyOn(client, "savePolicyYaml").mockResolvedValue({ revision: policy });
  mount(<PolicyManager />, "/answer-policy");
  await screen.findByText(/fees v3/);
  fireEvent.change(screen.getByLabelText("Policy ID"), { target: { value: "fees" } });
  fireEvent.change(screen.getByLabelText("YAML definition"), { target: { value: 'questionClass: fees\nmode: internal-only\nstyle: detailed\nonInsufficient: review\nnote: revised\nexpectedVersion: 3' } });
  fireEvent.click(screen.getByRole("button", { name: "Save policy revision" }));
  await screen.findByText(/verified tenant actor api-key:tenant-a/);
  expect(save).toHaveBeenCalledWith("original", "fees", expect.stringContaining("expectedVersion: 3"));
});
test("older direct answer reopens exact filters and evidence mode outside bounded history", async () => {
  const item: client.HistoryItem = { id: "older", query: "Older saved fee query", questionClass: "fees", createdAt: "2026-10-14", reason: "reviewed",
    evidenceMode: false, filters: { sessionIds: ["s1"], sources: "internal", topicRefs: ["topic:fees"] }, result: { ...response(), runId: "older", answer: "Older reviewed answer" } };
  const direct = vi.spyOn(client, "directAnswer").mockResolvedValue(item);
  const ask = vi.spyOn(client, "askWithPolicy").mockResolvedValue(response()); mount(<PolicyAskPage />, "/ask?run=older");
  await screen.findByText("Older reviewed answer"); expect(direct).toHaveBeenCalledWith("original", "older");
  expect(screen.getByLabelText("Question")).toHaveValue(item.query); expect(screen.getByLabelText("Source filter")).toHaveValue("internal");
  expect(screen.getByLabelText("Limit to session IDs (comma-separated)")).toHaveValue("s1");
  expect(screen.getByLabelText("Show original evidence excerpts and moments")).not.toBeChecked();
  expect(screen.getByText(/Saved graph filters retained/)).toHaveTextContent("topic:fees"); expect(ask).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(ask).toHaveBeenCalledWith("original", expect.objectContaining({ query: item.query, evidenceMode: false, filters: item.filters })));
});

test.each(["key", "same-key"])("old direct response cannot cross %s login boundary", async boundary => {
  let finish!: (value: client.HistoryItem) => void;
  const direct = vi.spyOn(client, "directAnswer").mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValue(new ApiError(404, "Saved answer unavailable."));
  mount(<PolicyAskPage />, "/ask?run=older"); await waitFor(() => expect(direct).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: boundary === "key" ? "Replace key" : "Reuse key session" }));
  await act(async () => finish({ id: "older", query: "Old tenant query", questionClass: "fees", createdAt: "2026-10-14", reason: "reviewed",
    evidenceMode: true, filters: { sessionIds: [], sources: "all" }, result: { ...response(), runId: "older", answer: "OLD TENANT ANSWER" } }));
  expect(screen.queryByText("OLD TENANT ANSWER")).not.toBeInTheDocument(); expect(screen.getByLabelText("Question")).not.toHaveValue("Old tenant query");
});

test("missing older direct answer has recovery text and never starts Ask", async () => {
  vi.spyOn(client, "directAnswer").mockRejectedValue(new ApiError(404, "Saved answer unavailable. Return to history or ask a new question."));
  const ask = vi.spyOn(client, "askWithPolicy").mockResolvedValue(response()); mount(<PolicyAskPage />, "/ask?run=deleted");
  await screen.findByText("Saved answer unavailable. Return to history or ask a new question."); expect(ask).not.toHaveBeenCalled();
});

test.each([false, true])("older conflict rebuild reads direct original inputs and fences old auth (%s)", async changeLogin => {
  const binding: client.EvidenceBinding = { id: "internal:a", origin: "internal", fingerprint: "a", excerpt: "Fee is 100.", source: { node_id: "n1", evidence: { sessionRef: "s1" } } };
  const conflict: client.SourceConflict = { id: "conflict-older", runId: "older", explanation: "Older conflicting fee", evidenceDigest: "digest", status: "resolved",
    a: binding, b: { ...binding, id: "internal:b" }, resolution: { keepSourceId: binding.id, excludeSourceId: "internal:b", note: "Checked evidence", by: { actor: "human:fixture" } } };
  vi.spyOn(client, "answerReviews").mockResolvedValue({ items: [] }); vi.spyOn(client, "sourceConflicts").mockResolvedValue({ conflicts: [conflict] });
  let finish!: (value: client.HistoryItem) => void;
  const direct = vi.spyOn(client, "directAnswer").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const ask = vi.spyOn(client, "askWithPolicy").mockResolvedValue(response()); mount(<AnswerReviewPage />, "/answer-review");
  fireEvent.click(await screen.findByRole("button", { name: "Rebuild using source resolution" }));
  await waitFor(() => expect(direct).toHaveBeenCalledWith("original", "older"));
  if (changeLogin) fireEvent.click(screen.getByRole("button", { name: "Reuse key session" }));
  const original: client.HistoryItem = { id: "older", query: "Older fee?", questionClass: "fees", createdAt: "2026-10-14", reason: "reviewed", evidenceMode: false,
    filters: { sessionIds: ["s1"], sources: "internal", topicRefs: ["topic:fees"] }, result: { ...response(), runId: "older" } };
  await act(async () => finish(original));
  if (changeLogin) expect(ask).not.toHaveBeenCalled();
  else await waitFor(() => expect(ask).toHaveBeenCalledWith("original", { query: original.query, questionClass: "fees", evidenceMode: false, filters: original.filters, resolutionId: conflict.id, policyId: "fees", policyVersion: 3 }));
});

test("candidate review sends exact candidate/evidence digests and an attributed reason", async () => {
  const r = response();
  const candidate: client.AnswerReview = { id: r.runId, query: "What is the fee?", questionClass: "fees", createdAt: "2026-10-14", state: "review", reason: "insufficient-coverage", candidate: r, policy, candidateDigest: r.candidateDigest, evidenceDigest: r.evidenceDigest, evidence: [] };
  vi.spyOn(client, "answerReviews").mockResolvedValue({ items: [candidate] });
  vi.spyOn(client, "sourceConflicts").mockResolvedValue({ conflicts: [] });
  const review = vi.spyOn(client, "resolveAnswerReview").mockResolvedValue({}); mount(<AnswerReviewPage />, "/answer-review");
  await screen.findByText("What is the fee?");
  fireEvent.change(screen.getByLabelText("Review reason"), { target: { value: "Verified source excerpt" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve exact candidate" }));
  await waitFor(() => expect(review).toHaveBeenCalledWith("original", candidate, "approved", "Verified source excerpt"));
});

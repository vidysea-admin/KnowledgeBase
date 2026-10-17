import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "../../api/client.js";
import { EvaluationFlywheelPanel } from "./EvaluationFlywheelPanel.js";
import { loadFlywheel, openFlywheel, retestFlywheel, type FlywheelView, type RetestView } from "./evaluationFlywheelModel.js";

vi.mock("./evaluationFlywheelModel.js", () => ({ loadFlywheel: vi.fn(), openFlywheel: vi.fn(), retestFlywheel: vi.fn() }));
const head: FlywheelView = { gapId: "gap-1", originalEvalRunId: "eval-1", question: "Which course?", gapStatus: "received", stage: "captured", revision: 3, originalScore: { ai: 2, counsellor: 4 }, credibility: "internal", captureSessionId: "session/1", failure: { stage: "index", requestId: "try-1", at: "2026-10-15T10:00:00Z" } };
const result: RetestView = { childEvalRunId: "child-1", originalEvalRunId: "eval-1", gapId: "gap-1", requestId: "try-1", question: head.question, answer: "Insufficient evidence.", sources: { citations: [] }, comparison: "needs-review", credibility: "internal" };
const mount = () => render(<MemoryRouter><EvaluationFlywheelPanel apiKey="key-a" /></MemoryRouter>);
function chooseId() { fireEvent.change(screen.getByLabelText("Original evaluation ID"), { target: { value: "eval-1" } }); }
afterEach(() => { cleanup(); vi.resetAllMocks(); });

test("reads persisted failure and source receipt distinctly without automatic writes", async () => {
  vi.mocked(loadFlywheel).mockResolvedValue(head);
  mount(); expect(loadFlywheel).not.toHaveBeenCalled(); expect(openFlywheel).not.toHaveBeenCalled();
  chooseId(); fireEvent.click(screen.getByRole("button", { name: "Inspect saved progress" }));
  await screen.findByText("captured");
  expect(loadFlywheel).toHaveBeenCalledWith("key-a", "eval-1");
  expect(screen.getByText("received")).toBeInTheDocument();
  expect(screen.getByText(/Last recorded failure: index/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "session/1" })).toHaveAttribute("href", "/explorer?session=session%2F1&tab=Overview");
  expect(screen.getByRole("button", { name: "Capture source and retest" })).toBeDisabled();
  expect(retestFlywheel).not.toHaveBeenCalled();
});

test("explicit capture uses the stable request and presents unscored answer pending review", async () => {
  vi.mocked(openFlywheel).mockResolvedValue(head);
  vi.mocked(retestFlywheel).mockResolvedValue(result);
  vi.mocked(loadFlywheel).mockResolvedValue({ ...head, stage: "retested", childEvalRunId: "child-1" });
  mount(); chooseId(); fireEvent.click(screen.getByRole("button", { name: "Record loss gap" }));
  await screen.findByText("captured"); expect(openFlywheel).toHaveBeenCalledWith("key-a", "eval-1");
  fireEvent.change(screen.getByLabelText("Provided source URL"), { target: { value: "https://example.test/notes" } });
  fireEvent.change(screen.getByLabelText("Recovery request ID"), { target: { value: "invalid request" } });
  expect(screen.getByRole("button", { name: "Capture source and retest" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Recovery request ID"), { target: { value: "try-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Capture source and retest" }));
  await screen.findByText("Insufficient evidence.");
  expect(retestFlywheel).toHaveBeenCalledWith("key-a", "eval-1", "https://example.test/notes", "try-1");
  expect(screen.getByText("Unscored internal answer. No improvement judgment is recorded here.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /approve|score|resolve/i })).not.toBeInTheDocument();
});

test("safe unavailable response discloses no provider text and makes no follow-up writes", async () => {
  vi.mocked(loadFlywheel).mockRejectedValue(new ApiError(503, "PRIVATE_PROVIDER_FAILURE"));
  mount(); chooseId(); fireEvent.click(screen.getByRole("button", { name: "Inspect saved progress" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable on this server");
  expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER_FAILURE");
  expect(retestFlywheel).not.toHaveBeenCalled(); expect(openFlywheel).not.toHaveBeenCalled();
});

test("credential change clears evidence and ignores the previous credential's late response", async () => {
  let resolve!: (value: FlywheelView) => void;
  vi.mocked(loadFlywheel).mockReturnValue(new Promise(done => { resolve = done; }));
  const view = mount(); chooseId(); fireEvent.click(screen.getByRole("button", { name: "Inspect saved progress" }));
  view.rerender(<MemoryRouter><EvaluationFlywheelPanel apiKey="key-b" /></MemoryRouter>);
  await act(async () => { resolve(head); });
  expect(screen.getByLabelText("Original evaluation ID")).toHaveValue("");
  expect(screen.queryByText("Which course?")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Saved evaluation recovery evidence")).not.toBeInTheDocument();
});

test("retained internal scores and a failed progress refresh keep the child pending review", async () => {
  vi.mocked(openFlywheel).mockResolvedValue(head);
  vi.mocked(retestFlywheel).mockResolvedValue({ ...result, score: { ai: 4, counsellor: 4 } });
  vi.mocked(loadFlywheel).mockRejectedValue(new ApiError(503, "private refresh"));
  mount(); chooseId(); fireEvent.click(screen.getByRole("button", { name: "Record loss gap" }));
  await screen.findByText("captured");
  fireEvent.change(screen.getByLabelText("Provided source URL"), { target: { value: "https://example.test/notes" } });
  fireEvent.change(screen.getByLabelText("Recovery request ID"), { target: { value: "try-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Capture source and retest" }));
  await screen.findByRole("alert");
  expect(screen.getByText(/Recorded internal scores: AI 4; counsellor 4/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Retest answer — needs review" })).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("private refresh");
});

test("a child from another gap is refused before any answer or follow-up is shown", async () => {
  vi.mocked(openFlywheel).mockResolvedValue(head);
  vi.mocked(retestFlywheel).mockResolvedValue({ ...result, gapId: "foreign-gap", answer: "FOREIGN_ANSWER" });
  mount(); chooseId(); fireEvent.click(screen.getByRole("button", { name: "Record loss gap" }));
  await screen.findByText("captured");
  fireEvent.change(screen.getByLabelText("Provided source URL"), { target: { value: "https://example.test/notes" } });
  fireEvent.change(screen.getByLabelText("Recovery request ID"), { target: { value: "try-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Capture source and retest" }));
  await screen.findByRole("alert");
  expect(document.body.textContent).not.toContain("FOREIGN_ANSWER");
  expect(screen.queryByLabelText("Retest evidence")).not.toBeInTheDocument();
  expect(loadFlywheel).not.toHaveBeenCalled();
});

test("same-turn duplicate write events dispatch only one operation", async () => {
  let resolve!: (value: FlywheelView) => void;
  vi.mocked(openFlywheel).mockReturnValue(new Promise(done => { resolve = done; }));
  mount(); chooseId(); const button = screen.getByRole("button", { name: "Record loss gap" });
  act(() => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(openFlywheel).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(head); });
  expect(screen.getByText("captured")).toBeInTheDocument();
});

test("uncertain retest failure preserves inputs for an inspected, explicit same-ID retry", async () => {
  vi.mocked(openFlywheel).mockResolvedValue(head); vi.mocked(loadFlywheel).mockResolvedValue(head);
  vi.mocked(retestFlywheel).mockRejectedValueOnce(new ApiError(503, "private timeout")).mockResolvedValueOnce(result);
  mount(); chooseId(); fireEvent.click(screen.getByRole("button", { name: "Record loss gap" }));
  await screen.findByText("captured");
  fireEvent.change(screen.getByLabelText("Provided source URL"), { target: { value: "https://example.test/notes" } });
  fireEvent.change(screen.getByLabelText("Recovery request ID"), { target: { value: "try-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Capture source and retest" }));
  await screen.findByRole("alert"); expect(retestFlywheel).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Inspect saved progress" }));
  await screen.findByText("captured");
  expect(screen.getByLabelText("Provided source URL")).toHaveValue("https://example.test/notes");
  expect(screen.getByLabelText("Recovery request ID")).toHaveValue("try-1");
  expect(retestFlywheel).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Capture source and retest" }));
  await screen.findByText("Insufficient evidence.");
  expect(retestFlywheel).toHaveBeenCalledTimes(2);
  expect(vi.mocked(retestFlywheel).mock.calls[1]).toEqual(vi.mocked(retestFlywheel).mock.calls[0]);
});

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, test, expect, afterEach } from "vitest";
import { GroundedContentPanel } from "./GroundedContentPanel.js";
import { getGroundedContent, type GroundedContentView } from "./client.js";
vi.mock("./client.js", () => ({ getGroundedContent: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const ref = { turnId: "turn 1", sessionId: "s", quote: "Keep evidence.", available: true, tStart: 12, tEnd: 19, speaker: "Expert" };
const data: GroundedContentView = { sessionId: "s", notes: [{ id: "n", kind: "insight", text: "Keep evidence.", origin: "screen-ocr", verification: "unverified", evidence: [ref] }],
  qa: [{ id: "q", question: "Question?", answer: null, status: "unanswered", questionEvidence: [ref], answerEvidence: [] }], claims: [] };
test("shows source origins, unverified status, unanswered question and exact turn link", async () => {
  vi.mocked(getGroundedContent).mockResolvedValue(data);
  render(<MemoryRouter><GroundedContentPanel apiKey="key" sessionId="s" /></MemoryRouter>);
  expect(await screen.findByText("insight · Screen text")).toBeInTheDocument();
  expect(screen.getByText("Unverified")).toBeInTheDocument();
  expect(screen.getByText("Unanswered in the source")).toBeInTheDocument();
  expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/sessions/s#turn-turn%201");
  expect(getGroundedContent).toHaveBeenCalledWith("key", "s");
});
test("unresolved evidence has no navigation link; failures are visible", async () => {
  vi.mocked(getGroundedContent).mockResolvedValue({ ...data, qa: [], notes: [{ ...data.notes[0]!, evidence: [{ ...ref, available: false }] }] });
  const view = render(<MemoryRouter><GroundedContentPanel apiKey="key" sessionId="s" /></MemoryRouter>);
  expect(await screen.findByText("Source unavailable or quote could not be resolved")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  vi.mocked(getGroundedContent).mockRejectedValue(new Error("Read unavailable"));
  view.rerender(<MemoryRouter><GroundedContentPanel apiKey="key" sessionId="new" /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Read unavailable");
});
test("replacing key or session hides previous content and ignores late responses", async () => {
  let finish!: (data: GroundedContentView) => void;
  vi.mocked(getGroundedContent).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce({ sessionId: "new", notes: [], qa: [], claims: [] });
  const view = render(<MemoryRouter><GroundedContentPanel apiKey="old" sessionId="s" /></MemoryRouter>);
  view.rerender(<MemoryRouter><GroundedContentPanel apiKey="new-key" sessionId="new" /></MemoryRouter>);
  expect(await screen.findByText("No grounded notes or Q&A published for this session.")).toBeInTheDocument();
  finish(data);
  await waitFor(() => expect(screen.queryByText("insight · Screen text")).not.toBeInTheDocument());
});
test("answered questions retain separately labelled answer evidence", async () => {
  vi.mocked(getGroundedContent).mockResolvedValue({ ...data, notes: [], qa: [{ ...data.qa[0]!, status: "answered", answer: "Keep evidence.", answerEvidence: [ref] }] });
  render(<MemoryRouter><GroundedContentPanel apiKey="key" sessionId="s" /></MemoryRouter>);
  expect(await screen.findByText("Answer evidence · Unverified")).toBeInTheDocument();
  expect(screen.getByText("Question evidence")).toBeInTheDocument();
});

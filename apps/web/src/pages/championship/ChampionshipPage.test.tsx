import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ChampionshipPage } from "./ChampionshipPage.js";
import { createChampionship, loadChampionship, startChampionshipTrial, scoreChampionshipTrial, importChampionshipTrial } from "./client.js";
let auth = { apiKey: "tenant-a-key", sessionVersion: 1 };
vi.mock("../../auth/AuthContext.js", () => ({ useAuth: () => auth }));
vi.mock("./client.js", () => ({ loadChampionship: vi.fn(), createChampionship: vi.fn(), freezeChampionshipBank: vi.fn(), startChampionshipTrial: vi.fn(), scoreChampionshipTrial: vi.fn(), importChampionshipTrial: vi.fn() }));
const view = { event: { _id: "event", revision: 1, bankDigest: "a".repeat(64), frozenAt: "2026-10-14T00:01:00Z", questions: [{ id: "q", text: "Exact question" }], counsellors: [{ id: "c", name: "Counsellor" }] },
  report: { status: "incomplete", recordedPairs: 0, plannedPairs: 1, notice: "Internal tenant-a-only evidence", unresolvedGates: ["Real judges required"], trials: [], credibility: "internal" as const, publicResult: false as const } };
beforeEach(() => { cleanup(); vi.clearAllMocks(); auth = { apiKey: "tenant-a-key", sessionVersion: 1 }; vi.mocked(loadChampionship).mockResolvedValue(view); });
async function load() { fireEvent.change(screen.getByLabelText("Event ID"), { target: { value: "event" } }); fireEvent.click(screen.getByText("Reload event")); await screen.findByText("Internal tenant-a-only evidence"); }
test("usable proposed plan form submits actual source question/roster/review references without approval claims", async () => {
  vi.mocked(createChampionship).mockResolvedValue(view); render(<ChampionshipPage />);
  for (const [label, value] of [["Event title", "Proposed event"], ["Question text 1", "Actual source question?"], ["Source evidence reference 1", "session:one/turn:42"],
    ["Counsellor name 1", "Proposed person"], ["Participation evidence reference 1", "participation-pending"], ["Panel rubric reference", "panel-pending"], ["Human bank-review evidence reference", "review-pending"]]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  }
  fireEvent.click(screen.getByText("Save proposed event plan")); await waitFor(() => expect(createChampionship).toHaveBeenCalled());
  expect(createChampionship).toHaveBeenCalledWith("tenant-a-key", { title: "Proposed event", questions: [{ id: "q1", text: "Actual source question?", source: { kind: "toc", reference: "session:one/turn:42" } }],
    counsellors: [{ id: "c1", name: "Proposed person", evidenceReference: "participation-pending" }], judges: [], rubric: { version: "draft", reference: "panel-pending" }, reviewReference: "review-pending" });
});
test("actual matched trial preserves selected question and captures existing Compete score before snapshot", async () => {
  vi.mocked(startChampionshipTrial).mockResolvedValue({ evalRunId: "run", aiAnswer: { text: "Original AI response", sources: { internal: ["citation"] } } });
  vi.mocked(scoreChampionshipTrial).mockResolvedValue({ ok: true }); vi.mocked(importChampionshipTrial).mockResolvedValue(view);
  render(<ChampionshipPage />); await load(); fireEvent.click(screen.getByText("Start matched Compete trial")); await screen.findByText("Original AI response");
  expect(startChampionshipTrial).toHaveBeenCalledWith("tenant-a-key", "Exact question", "Counsellor");
  fireEvent.change(screen.getByLabelText("Original counsellor answer"), { target: { value: "Original human response" } });
  fireEvent.change(screen.getByLabelText("AI score"), { target: { value: "4" } }); fireEvent.change(screen.getByLabelText("Counsellor score"), { target: { value: "3" } });
  fireEvent.click(screen.getByText("Save internal score and retain trial")); await waitFor(() => expect(importChampionshipTrial).toHaveBeenCalled());
  expect(scoreChampionshipTrial).toHaveBeenCalledWith("tenant-a-key", "run", "Original human response", 4, 3);
  expect(importChampionshipTrial).toHaveBeenCalledWith("tenant-a-key", view.event, "q", "c", "run");
});
test("changing selected event invalidates prior evidence and auth change suppresses late old tenant completion", async () => {
  const ui = render(<ChampionshipPage />); await load(); fireEvent.change(screen.getByLabelText("Event ID"), { target: { value: "other" } });
  expect(screen.queryByText("Internal tenant-a-only evidence")).toBeNull(); expect(screen.queryByText("Start matched Compete trial")).toBeNull();
  let release!: (value: typeof view) => void; vi.mocked(loadChampionship).mockReturnValue(new Promise(resolve => { release = resolve; }));
  fireEvent.click(screen.getByText("Reload event")); auth = { apiKey: "tenant-b-key", sessionVersion: 2 }; ui.rerender(<ChampionshipPage />);
  release(view); await waitFor(() => expect(screen.queryByText("Internal tenant-a-only evidence")).toBeNull());
  expect(screen.queryByText("Start matched Compete trial")).toBeNull();
});
test("recovery imports the existing scored run without rewriting upstream original score", async () => {
  vi.mocked(importChampionshipTrial).mockResolvedValue(view); render(<ChampionshipPage />); await load();
  fireEvent.change(screen.getByLabelText("Existing scored Compete evaluation ID"), { target: { value: "retained-run" } });
  fireEvent.click(screen.getByText("Retain existing scored trial")); await waitFor(() => expect(importChampionshipTrial).toHaveBeenCalledWith("tenant-a-key", view.event, "q", "c", "retained-run"));
  expect(scoreChampionshipTrial).not.toHaveBeenCalled(); expect(startChampionshipTrial).not.toHaveBeenCalled();
});
test("retry after scoring succeeded and snapshot conflicted does not rewrite original score", async () => {
  vi.mocked(startChampionshipTrial).mockResolvedValue({ evalRunId: "run", aiAnswer: { text: "Original AI response" } });
  vi.mocked(scoreChampionshipTrial).mockResolvedValue({ ok: true }); vi.mocked(importChampionshipTrial).mockRejectedValueOnce(new Error("revision conflict")).mockResolvedValue(view);
  render(<ChampionshipPage />); await load(); fireEvent.click(screen.getByText("Start matched Compete trial")); await screen.findByText("Original AI response");
  fireEvent.change(screen.getByLabelText("Original counsellor answer"), { target: { value: "Original human response" } });
  fireEvent.change(screen.getByLabelText("AI score"), { target: { value: "4" } }); fireEvent.change(screen.getByLabelText("Counsellor score"), { target: { value: "3" } });
  fireEvent.click(screen.getByText("Save internal score and retain trial")); await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Save internal score and retain trial")); await waitFor(() => expect(importChampionshipTrial).toHaveBeenCalledTimes(2));
  expect(scoreChampionshipTrial).toHaveBeenCalledTimes(1);
});

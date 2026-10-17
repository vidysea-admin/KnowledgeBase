import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionReviewPage } from "./ExtractionReviewPage.js";
import type { ExtractionReviewView } from "./client.js";

const mocks = vi.hoisted(() => ({ key: "synthetic-key", session: 1, get: vi.fn(), save: vi.fn(), export: vi.fn() }));
vi.mock("../../auth/AuthContext.js", () => ({ useAuth: () => ({ apiKey: mocks.key, sessionVersion: mocks.session }) }));
vi.mock("./client.js", () => ({ getExtractionReview: mocks.get, saveExtractionReview: mocks.save, exportExtractionReview: mocks.export }));
function fixture(reviewed = false): ExtractionReviewView {
  return { format: "extraction-review-view-v1", tenantId: "synthetic", packetSha256: "a".repeat(64), total: 2,
    reviewedCount: reviewed ? 1 : 0, humanGoldVerified: false, bindingThresholds: null, items: [0, 1].map(i => ({
      id: `synthetic-${i}`, caseId: `case-${i}`, inputSha256: "b".repeat(64), revision: reviewed && i === 0 ? 8 : 7,
      context: { candidate: `Fictional candidate ${i} <script>literal</script>`, source: `Fictional source ${i}` }, labelField: i === 0 ? "factLabels" : "entityLabels",
      options: i === 0 ? [{ supported: true }, { supported: false }] : [{ correct: true }, { correct: false }],
      review: reviewed && i === 0 ? { label: { supported: false }, rationale: "Synthetic reason", actorId: "trusted-synthetic-reviewer", at: "2026-10-15T00:00:00.000Z" } : null,
      audit: reviewed && i === 0 ? [{ revision: 8, itemId: "synthetic-0", inputSha256: "b".repeat(64), actorId: "trusted-synthetic-reviewer", at: "2026-10-15T00:00:00.000Z", label: { supported: false }, rationale: "Synthetic reason" }] : [],
    })) };
}
beforeEach(() => { mocks.key = "synthetic-key"; mocks.session = 1; vi.clearAllMocks(); mocks.get.mockResolvedValue(fixture()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("individual extraction gold review", () => {
  it("shows exact source/candidate and native choices, initially unset with no writes", async () => {
    render(<ExtractionReviewPage />); await screen.findByText("Fictional source 0");
    expect(screen.getByText(/Fictional candidate 0/)).toHaveTextContent("<script>literal</script>");
    expect(screen.getByLabelText("Native evaluator label")).toHaveValue("");
    expect(screen.getByRole("option", { name: '{"supported":false}' })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save this individual label" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Review item"), { target: { value: "1" } });
    expect(screen.getByRole("option", { name: '{"correct":false}' })).toBeInTheDocument();
    expect(screen.getByLabelText("Native evaluator label")).toHaveValue("");
  });
  it("requires fresh affirmation and stores one native label against current revision/input", async () => {
    mocks.save.mockResolvedValue(fixture(true)); render(<ExtractionReviewPage />); await screen.findByText("Fictional source 0");
    fireEvent.change(screen.getByLabelText("Native evaluator label"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Reason for this judgment"), { target: { value: "Synthetic reason" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Reason for this judgment"), { target: { value: "Synthetic amended reason" } });
    expect(screen.getByRole("button", { name: "Save this individual label" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Save this individual label" }));
    await screen.findByText(/synthetic-0 stored with its authenticated audit/);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith("synthetic-key", expect.objectContaining({ id: "synthetic-0", revision: 7, inputSha256: "b".repeat(64) }), { supported: false }, "Synthetic amended reason");
    expect(screen.getByText(/1\/2 item reviews stored/)).toBeVisible();
    expect(screen.getByLabelText("Native evaluator label")).toHaveValue("");
    expect(screen.getByText("Authenticated review audit")).toBeVisible();
  });
  it("shows CAS/source refusal without advancing coverage or preserving affirmation", async () => {
    mocks.save.mockRejectedValue(new Error("extraction_review_sources_changed"));
    render(<ExtractionReviewPage />); await screen.findByText("Fictional source 0");
    fireEvent.change(screen.getByLabelText("Native evaluator label"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Reason for this judgment"), { target: { value: "Synthetic reason" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Save this individual label" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your judgment was not accepted");
    expect(screen.getByText(/0\/2 item reviews stored/)).toBeVisible();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("fails closed for trusted-human refusal and discards a previous tenant response", async () => {
    let finish!: (view: ExtractionReviewView) => void;
    mocks.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const page = render(<ExtractionReviewPage />);
    mocks.key = "foreign"; mocks.session = 2; mocks.get.mockRejectedValue(new Error("extraction_review_forbidden")); page.rerender(<ExtractionReviewPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("trusted human reviewer"); finish(fixture(true));
    await waitFor(() => expect(screen.queryByText("Fictional source 0")).not.toBeInTheDocument());
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.export).not.toHaveBeenCalled();
  });
  it("consumes authoritative evaluator export and discloses partial coverage with no gold or threshold promotion", async () => {
    const create = vi.fn(() => "blob:synthetic"); vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mocks.export.mockResolvedValue({ format: "extraction-authorized-export-v1", tenantId: "synthetic", packetSha256: "a".repeat(64), humanGoldVerified: false,
      bindingThresholds: null, reviewedCount: 1, total: 2, cases: [{ synthetic: true }], measurement: { cases: [], summary: { measured: 1 } }, remainingGate: "Actual complete human gold and thresholds remain required." });
    render(<ExtractionReviewPage />); await screen.findByText("Fictional source 0");
    fireEvent.click(screen.getByRole("button", { name: /Export reviewed coverage/ }));
    await screen.findByRole("region", { name: "Evaluator export coverage" });
    expect(screen.getByText(/1\/2 reviewed; 1 pending/)).toBeVisible();
    expect(screen.getByText(/Actual complete human gold/)).toBeVisible();
    expect(screen.getByText(/"measured": 1/)).toBeVisible(); expect(create).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("refuses foreign or changed-source exports before constructing a download", async () => {
    const create = vi.fn(); vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    mocks.export.mockResolvedValue({ tenantId: "foreign", packetSha256: "a".repeat(64) });
    render(<ExtractionReviewPage />); await screen.findByText("Fictional source 0");
    fireEvent.click(screen.getByRole("button", { name: /Export reviewed coverage/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("source or review revision changed");
    expect(create).not.toHaveBeenCalled(); expect(screen.queryByRole("region", { name: "Evaluator export coverage" })).not.toBeInTheDocument();
  });
});

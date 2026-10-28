import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalibrationReviewPage } from "./CalibrationReviewPage.js";
import { createHash, webcrypto } from "node:crypto";

const mocks = vi.hoisted(() => ({ key: "key", session: 1, get: vi.fn(), submit: vi.fn(), export: vi.fn() }));
vi.mock("../../auth/AuthContext.js", () => ({ useAuth: () => ({ apiKey: mocks.key, sessionVersion: mocks.session }) }));
vi.mock("./client.js", () => ({ getCalibrationReview: mocks.get, submitCalibrationItem: mocks.submit, exportCalibrationReview: mocks.export }));
function data(approved = false) {
  return { packet: { rubric: "Judge only this title and summary; conservative0to1.", limitations: [] }, packetSha256: "a".repeat(64),
    approvedCount: approved ? 1 : 0, total: 30, humanGoldVerified: false, remainingGate: "Actual30Umesh judgments and live calibration required",
    items: [{ id: "review-001", batch: 1, questionId: "q1", query: "What is the visa policy?", sessionId: "session-1", inputSha256: "b".repeat(64),
      node: { title: "Visa discussion", summary: "Full judge-visible summary with <script> literal text", node_id: "session-1" }, revision: approved ? 1 : 0,
      humanReview: { score: approved ? 0.375 : null, rationale: approved ? "My individual judgment" : null, approvedBy: approved ? "Umesh" : null,
        approvedAt: approved ? "2026-10-14T00:00:00.000Z" : null }, audit: [] }] };
}
beforeEach(() => { mocks.key = "key"; mocks.session = 1; vi.clearAllMocks(); mocks.get.mockResolvedValue(data()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("calibration review", () => {
  it("renders neutral fullinputs and requires explicit individual confirmation", async () => {
    render(<CalibrationReviewPage />);
    await screen.findByText("What is the visa policy?");
    expect(screen.getByText(/Full judge-visible summary/)).toHaveTextContent("<script> literal text");
    expect(screen.getByLabelText(/Relevance score/)).toHaveValue(null);
    expect(screen.getByLabelText(/Reason for this judgment/)).toHaveValue("");
    expect(screen.getByRole("button", { name: /Save this individual judgment/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Export all thirty/ })).toBeDisabled();
    expect(screen.getByText(/Human gold has not been independently verified/)).toBeVisible();
  });
  it("saves one fractional judgment, shows persisted progress and resumes after reload", async () => {
    mocks.submit.mockResolvedValue(data(true));
    render(<CalibrationReviewPage />); await screen.findByText("What is the visa policy?");
    fireEvent.change(screen.getByLabelText(/Relevance score/), { target: { value: "0.375" } });
    fireEvent.change(screen.getByLabelText(/Reason for this judgment/), { target: { value: "My individual judgment" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Save this individual/ }));
    await screen.findByText(/review-001 saved with its audit receipt/);
    expect(mocks.submit).toHaveBeenCalledWith("key", expect.objectContaining({ id: "review-001", revision: 0 }), 0.375, "My individual judgment");
    expect(screen.getByText(/1\/30 individual review assertions stored/)).toBeVisible();
    mocks.get.mockResolvedValue(data(true)); fireEvent.click(screen.getByRole("button", { name: /Reload stored reviews/ }));
    await waitFor(() => expect(screen.getByLabelText(/Relevance score/)).toHaveValue(0.375));
  });
  it("failed writes never show success or advance pending counts", async () => {
    mocks.submit.mockRejectedValue(new Error("calibration_revision_conflict"));
    render(<CalibrationReviewPage />); await screen.findByText("What is the visa policy?");
    fireEvent.change(screen.getByLabelText(/Relevance score/), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText(/Reason for this judgment/), { target: { value: "Reason" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Save this individual/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your judgment has not been accepted");
    expect(screen.getByText(/0\/30 individual review assertions stored/)).toBeVisible();
    expect(screen.queryByText(/saved with its audit receipt/)).not.toBeInTheDocument();
  });
  it("old tenant responses cannot reveal previous reviews after login changes", async () => {
    let complete!: (value: unknown) => void;
    mocks.get.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const page = render(<CalibrationReviewPage />);
    mocks.key = "other"; mocks.session = 2; mocks.get.mockRejectedValue(new Error("calibration_not_found"));
    page.rerender(<CalibrationReviewPage />); await screen.findByRole("alert"); complete(data(true));
    await waitFor(() => expect(screen.queryByText("What is the visa policy?")).not.toBeInTheDocument());
  });
  it("stages a synthetic draft without writes and saves only a freshly confirmed item with current CAS", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const current = data() as any;
    current.packet.tenantId = "synthetic-t022";
    current.items = Array.from({ length: 30 }, (_, i) => ({ ...current.items[0], id: `review-${i}`, revision: 7 }));
    const packet = { ...current.packet, items: current.items.map((i: any) => ({ id: i.id, inputSha256: i.inputSha256 })) };
    current.packetSha256 = createHash("sha256").update(JSON.stringify(packet)).digest("hex");
    const draft = { format: "calibration-offline-draft-v1", packet, packetSha256: current.packetSha256, tenantId: "synthetic-t022",
      generatedAt: "2026-10-15T00:00:00.000Z", humanGoldVerified: false, serverAuditAuthoritative: false,
      identityBasis: "Offline personal-review assertions; identity and browser time are not authenticated.", submittedCount: 1, pendingCount: 29, completeAssertions: false,
      items: current.items.map((i: any, n: number) => ({ id: i.id, inputSha256: i.inputSha256, localRevision: n === 0 ? 99 : 0, serverExpectedRevision: null,
        score: n === 0 ? 0.375 : null, rationale: n === 0 ? "Synthetic offline reason" : null, affirmIndividualReview: n === 0,
        assertedBy: n === 0 ? "Umesh" : null, assertedAt: n === 0 ? "2026-10-15T00:00:00.000Z" : null })) };
    mocks.get.mockResolvedValue(current); mocks.submit.mockResolvedValue(current);
    render(<CalibrationReviewPage />); await screen.findByText("What is the visa policy?");
    const file = { size: 1000, text: async () => JSON.stringify(draft) };
    fireEvent.change(screen.getByLabelText("Stage local offline draft"), { target: { files: [file] } });
    await screen.findByText(/1 offline assertions staged/); expect(mocks.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Use this item's offline assertion/ }));
    expect(screen.getByLabelText(/Relevance score/)).toHaveValue(0.375);
    expect(screen.getByRole("button", { name: /Save this individual/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText(/Reason for this judgment/), { target: { value: "Synthetic amended reason" } });
    expect(screen.getByRole("button", { name: /Save this individual/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Save this individual/ }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith("key", expect.objectContaining({ id: "review-0", revision: 7 }), 0.375, "Synthetic amended reason"));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
  it("discards an in-flight local draft when authentication changes", async () => {
    let finish!: (value: string) => void;
    const page = render(<CalibrationReviewPage />); await screen.findByText("What is the visa policy?");
    fireEvent.change(screen.getByLabelText("Stage local offline draft"), { target: { files: [{ size: 100, text: () => new Promise<string>(resolve => { finish = resolve; }) }] } });
    mocks.key = "foreign"; mocks.session = 2; mocks.get.mockRejectedValue(new Error("calibration_not_found")); page.rerender(<CalibrationReviewPage />);
    await screen.findByRole("alert"); finish("{}");
    await waitFor(() => expect(screen.queryByText(/offline assertions staged/)).not.toBeInTheDocument());
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LabelReviewPage, arrange } from "./LabelReviewPage.js";
import type { LabelReviewView, LabelRow } from "./client.js";

const mocks = vi.hoisted(() => ({ key: "synthetic-key", session: 1, get: vi.fn(), accept: vi.fn(), override: vi.fn(), bulk: vi.fn() }));
vi.mock("../../auth/AuthContext.js", () => ({ useAuth: () => ({ apiKey: mocks.key, sessionVersion: mocks.session }) }));
vi.mock("./client.js", async orig => ({ ...(await orig<typeof import("./client.js")>()), getLabelReview: mocks.get, acceptAiLabel: mocks.accept, overrideLabel: mocks.override, acceptHighConfidence: mocks.bulk }));

function row(over: Partial<LabelRow> & { id: string }): LabelRow {
  const base: LabelRow = { id: over.id, set: "u22", tenantId: "t", inputSha256: "a".repeat(64), prompt: `Claim ${over.id}`, passage: `Passage ${over.id} <b>literal</b>`, aiLabel: "supported",
    confidence: "high", agreement: "agree", flags: [], validVotes: 2, tally: { supported: 2 }, rationale: "r", perModel: [{ model: "m1", label: "supported", rationale: "why" }], revision: 0, audit: [],
    effective: { label: "supported", labelSource: "ai-consensus", reviewedBy: null, reviewedAt: null, note: null } };
  return { ...base, ...over };
}
const reviewed = (r: LabelRow, source: "ai-consensus" | "human", label: LabelRow["aiLabel"]): LabelRow => ({ ...r, revision: 1, effective: { label, labelSource: source, reviewedBy: "trusted-reviewer", reviewedAt: "2026-10-19T00:00:00.000Z", note: source === "human" ? "my note" : null } });
function view(items: LabelRow[]): LabelReviewView {
  const by = { high: 0, medium: 0, low: 0 }; items.forEach(i => by[i.confidence]++);
  return { format: "label-review-view-v1", tenantId: "t", humanGold: false, metricLabel: "AI-consensus", counts: { total: items.length, reviewed: items.filter(i => i.revision > 0).length, humanOverrides: items.filter(i => i.effective.labelSource === "human").length, byConfidence: by }, items };
}
const HIGH = row({ id: "u22:high" }), MED = row({ id: "u22:med", confidence: "medium", agreement: "majority", aiLabel: "partially_supported" });
const LOW = row({ id: "u22:low", confidence: "low", agreement: "disagree", aiLabel: null, flags: ["models-disagree"] });
const T = row({ id: "t022:item", set: "t022", aiLabel: 0.9, prompt: "Is it safe?", passage: "Title\nSummary", tally: null, confidence: "high" });
const order = () => screen.getAllByTestId(/^row-/).map(el => el.getAttribute("data-testid")!.replace("row-", ""));

beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(view([HIGH, T, MED, LOW])); });
afterEach(() => cleanup());

describe("label review window", () => {
  it("renders both sets: T-022 question, excerpt, AI score; U2.2 claim, passage, AI label, agreement; confidence badges", async () => {
    render(<LabelReviewPage />); await screen.findByText("Claim u22:high");
    const t = within(screen.getByTestId("row-t022:item"));
    expect(t.getByText("Is it safe?")).toBeVisible(); expect(t.getByText(/Summary/)).toBeVisible(); expect(t.getByText("0.90")).toBeVisible(); expect(t.getByLabelText("confidence")).toHaveTextContent("high confidence");
    const u = within(screen.getByTestId("row-u22:med"));
    expect(u.getByText("Claim u22:med")).toBeVisible(); expect(u.getByText(/Passage u22:med/)).toHaveTextContent("<b>literal</b>");
    expect(u.getByText("partially supported", { selector: "strong" })).toBeVisible(); expect(u.getByText(/Model agreement: majority/)).toBeVisible(); expect(u.getByLabelText("confidence")).toHaveTextContent("medium confidence");
    expect(within(screen.getByTestId("row-u22:low")).getByText(/no AI label/)).toBeVisible();
    expect(screen.getByText(/neither is human gold|Neither is human gold/i)).toBeVisible(); expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("defaults to low confidence first, then All keeps the source order", async () => {
    render(<LabelReviewPage />); await screen.findByText("Claim u22:high");
    expect(order()).toEqual(["u22:low", "u22:med", "u22:high", "t022:item"]);
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "all" } });
    expect(order()).toEqual(["u22:high", "t022:item", "u22:med", "u22:low"]);
  });
  it("filters Reviewed and by set; arrange puts unreviewed ahead of reviewed within a band", async () => {
    mocks.get.mockResolvedValue(view([reviewed(HIGH, "ai-consensus", "supported"), T, MED, LOW]));
    render(<LabelReviewPage />); await screen.findByText("Claim u22:high");
    expect(order()).toEqual(["u22:low", "u22:med", "t022:item", "u22:high"]);
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "reviewed" } });
    expect(order()).toEqual(["u22:high"]);
    expect(screen.getByTestId("source")).toHaveTextContent("Label source: ai-consensus · AI label accepted by trusted-reviewer");
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "low-first" } }); fireEvent.change(screen.getByLabelText("Set"), { target: { value: "t022" } });
    expect(order()).toEqual(["t022:item"]);
    expect(arrange([HIGH, LOW], "reviewed", "both")).toEqual([]);
  });
  it("Accept AI posts the current revision and input hash and keeps the label ai-consensus", async () => {
    mocks.accept.mockResolvedValue(view([reviewed(HIGH, "ai-consensus", "supported"), T, MED, LOW]));
    render(<LabelReviewPage />); await screen.findByText("Claim u22:high");
    fireEvent.click(within(screen.getByTestId("row-u22:high")).getByRole("button", { name: "Accept AI" }));
    await screen.findByText(/u22:high: AI label accepted \(still AI-consensus\)/);
    expect(mocks.accept).toHaveBeenCalledWith("synthetic-key", expect.objectContaining({ id: "u22:high", revision: 0, inputSha256: "a".repeat(64) }));
    expect(screen.getByTestId("row-u22:high")).toHaveTextContent("Label source: ai-consensus"); expect(screen.queryByText(/human override by/)).toBeNull();
    expect(mocks.override).not.toHaveBeenCalled();
  });
  it("Accept AI is unavailable when the models produced no label", async () => {
    render(<LabelReviewPage />); await screen.findByText("Claim u22:low");
    expect(within(screen.getByTestId("row-u22:low")).getByRole("button", { name: "Accept AI" })).toBeDisabled();
  });
  it("Override sends the chosen label and optional note and shows a human label", async () => {
    mocks.override.mockResolvedValue(view([reviewed(HIGH, "human", "unsupported"), T, MED, LOW]));
    render(<LabelReviewPage />); await screen.findByText("Claim u22:high");
    const r = within(screen.getByTestId("row-u22:high")), button = r.getByRole("button", { name: "Override" });
    expect(button).toBeDisabled();
    fireEvent.change(r.getByLabelText("Label"), { target: { value: "unsupported" } }); fireEvent.change(r.getByLabelText("Note (optional)"), { target: { value: "  my note " } });
    fireEvent.click(button);
    await screen.findByText(/u22:high: human label recorded/);
    expect(mocks.override).toHaveBeenCalledWith("synthetic-key", expect.objectContaining({ id: "u22:high" }), "unsupported", "  my note ");
    expect(screen.getByTestId("row-u22:high")).toHaveTextContent("Label source: human · human override by trusted-reviewer · my note · current label unsupported");
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("T-022 override needs a score from 0 to 1", async () => {
    mocks.override.mockResolvedValue(view([HIGH, reviewed(T, "human", 0.2), MED, LOW]));
    render(<LabelReviewPage />); await screen.findByText("Claim u22:high");
    const r = within(screen.getByTestId("row-t022:item")), input = r.getByLabelText("Score 0 to 1");
    fireEvent.change(input, { target: { value: "1.5" } }); expect(r.getByRole("button", { name: "Override" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "0.2" } }); fireEvent.click(r.getByRole("button", { name: "Override" }));
    await waitFor(() => expect(mocks.override).toHaveBeenCalledWith("synthetic-key", expect.objectContaining({ id: "t022:item" }), 0.2, ""));
  });
  it("bulk Accept all high-confidence counts only unreviewed high items and reports the accepted count", async () => {
    mocks.bulk.mockResolvedValue({ ...view([reviewed(HIGH, "ai-consensus", "supported"), reviewed(T, "ai-consensus", 0.9), MED, LOW]), acceptedCount: 2 });
    render(<LabelReviewPage />); await screen.findByText("Claim u22:high");
    const button = screen.getByRole("button", { name: "Accept all high-confidence (2)" });
    fireEvent.click(button); await screen.findByText(/Accepted 2 high-confidence AI labels\. They stay AI-consensus labels/);
    expect(mocks.bulk).toHaveBeenCalledWith("synthetic-key", undefined);
    expect(screen.getByRole("button", { name: "Accept all high-confidence (0)" })).toBeDisabled();
  });
  it("shows a refusal without changing state", async () => {
    mocks.get.mockRejectedValue(new Error("label_review_forbidden"));
    render(<LabelReviewPage />); expect(await screen.findByRole("alert")).toHaveTextContent("trusted human reviewer");
    expect(screen.queryByTestId("row-u22:high")).toBeNull();
  });
});

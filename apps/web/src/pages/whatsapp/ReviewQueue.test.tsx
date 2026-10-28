import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../../api/client.js";
import * as api from "../../api/whatsapp.js";
import type { WhatsAppCandidate } from "../../api/whatsapp.js";
import { ReviewQueue } from "./ReviewQueue.js";

const candidate = (extra: Partial<WhatsAppCandidate> = {}): WhatsAppCandidate => ({
  _id: "wa-review:one", groupJid: "group", sessionId: "s/1", kind: "claim", text: "Admissions close in May", status: "needs-review", flags: [],
  evidence: [{ sessionId: "s/1", turnId: "t/1", speakerRef: "person1", speakerLabel: "Asha", quote: "Admissions close in May", occurredAt: "2026-10-14T10:00:00Z" }], ...extra,
});
const tree = (apiKey = "key-one", revision = 0) => <MemoryRouter><ReviewQueue apiKey={apiKey} revision={revision} /></MemoryRouter>;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((accept) => { resolve = accept; }); return { promise, resolve }; };

describe("WhatsApp review queue", () => {
  beforeEach(() => { vi.spyOn(api, "listWhatsAppCandidates").mockResolvedValue({ candidates: [candidate()] }); });
  afterEach(() => { vi.restoreAllMocks(); });

  test("shows state, flags and exact attributed source evidence", async () => {
    vi.mocked(api.listWhatsAppCandidates).mockResolvedValue({ candidates: [candidate({ kind: "attachment", attachment: { name: "deadlines.pdf", mimeType: "application/pdf" }, flags: [
      { kind: "sensitive", reason: "Email in file metadata", turnId: "t/1" }, { kind: "duplicate", reason: "Same tenant content", turnId: "t/1", duplicateOf: "known-claim" },
    ] })] });
    render(tree());
    expect(await screen.findByText("1 pending review")).toBeInTheDocument();
    expect(screen.getByText("attachment · needs-review")).toBeInTheDocument();
    expect(screen.getByText(/deadlines.pdf/)).toBeInTheDocument();
    expect(screen.getByText("sensitive")).toBeInTheDocument(); expect(screen.getByText("duplicate")).toBeInTheDocument();
    expect(screen.getByText(/Asha/)).toBeInTheDocument(); expect(screen.getByText("2026-10-14T10:00:00Z")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open exact source message" })).toHaveAttribute("href", "/whatsapp/review/wa-review%3Aone/source#turn-t%2F1");
  });

  test("approval updates only the selected candidate without a reload", async () => {
    const first = candidate(), second = candidate({ _id: "wa-review:two", kind: "decision" });
    vi.mocked(api.listWhatsAppCandidates).mockResolvedValue({ candidates: [first, second] });
    const decide = vi.spyOn(api, "decideWhatsAppCandidate").mockResolvedValue({ changed: true, candidate: { ...first, status: "approved" } });
    render(tree()); const card = await screen.findByRole("article", { name: "claim candidate" });
    await userEvent.click(within(card).getByRole("button", { name: "Approve" }));
    expect(decide).toHaveBeenCalledWith("key-one", first._id, "approve");
    expect(await screen.findByText("claim · approved")).toBeInTheDocument();
    expect(screen.getByText("1 pending review")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.getByText("decision · needs-review")).toBeInTheDocument();
    vi.mocked(api.listWhatsAppCandidates).mockResolvedValue({ candidates: [second] });
    await userEvent.click(screen.getByRole("button", { name: "Refresh review queue" }));
    await waitFor(() => expect(screen.queryByText("claim · approved")).not.toBeInTheDocument());
    expect(screen.getByText("1 pending review")).toBeInTheDocument();
    expect(api.listWhatsAppCandidates).toHaveBeenCalledTimes(2);
  });

  test("personal excluded cannot approve but can reject with decision confirmation", async () => {
    const row = candidate({ flags: [{ kind: "personal-excluded", reason: "Private family detail", turnId: "t/1" }] });
    vi.mocked(api.listWhatsAppCandidates).mockResolvedValue({ candidates: [row] });
    const decide = vi.spyOn(api, "decideWhatsAppCandidate").mockResolvedValue({ changed: false, candidate: { ...row, status: "rejected", decision: { action: "rejected", actor: "reviewer", at: "2026-10-14T11:00:00Z" } } });
    render(tree()); expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(decide).toHaveBeenCalledWith("key-one", row._id, "reject");
    expect(await screen.findByText("claim · rejected")).toBeInTheDocument();
    expect(screen.getByText("0 pending review")).toBeInTheDocument();
    expect(screen.getByText(/Previously recorded decision confirmed/)).toBeInTheDocument();
  });

  test.each([new ApiError(403, "forbidden"), new ApiError(409, "conflict"), new ApiError(503, "publish unavailable"), new ApiError(502, "evidence unavailable")])("failed decision is visible and never claims approval: %s", async (failure) => {
    vi.spyOn(api, "decideWhatsAppCandidate").mockRejectedValue(failure); render(tree());
    await userEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot review|changed|Publication is unavailable|failed/);
    expect(screen.getByText("claim · needs-review")).toBeInTheDocument(); expect(screen.queryByText("claim · approved")).not.toBeInTheDocument();
  });

  test("an unavailable review endpoint is honest and retry reloads", async () => {
    vi.mocked(api.listWhatsAppCandidates).mockRejectedValueOnce(new ApiError(404, "Not found")).mockResolvedValue({ candidates: [] });
    render(tree()); expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.queryByText(/pending review/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Refresh review queue" }));
    expect(await screen.findByText("No candidates awaiting review.")).toBeInTheDocument();
  });

  test("missing and mismatched evidence disable decisions and expose no false link", async () => {
    vi.mocked(api.listWhatsAppCandidates).mockResolvedValue({ candidates: [candidate({ evidence: [] }), candidate({ _id: "wa-review:two", kind: "topic", evidence: [{ ...candidate().evidence[0]!, sessionId: "other" }] })] });
    render(tree()); await screen.findByText("2 pending review");
    for (const button of screen.getAllByRole("button", { name: "Approve" })) expect(button).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "Reject" })) expect(button).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Open exact source message" })).not.toBeInTheDocument();
  });

  test("ingest revision refreshes pending candidates", async () => {
    const view = render(tree()); await screen.findByText("1 pending review");
    vi.mocked(api.listWhatsAppCandidates).mockResolvedValue({ candidates: [candidate(), candidate({ _id: "new", kind: "topic" })] });
    view.rerender(tree("key-one", 1)); expect(await screen.findByText("2 pending review")).toBeInTheDocument();
  });

  test("a late private load cannot appear after credential change", async () => {
    const old = deferred<{ candidates: WhatsAppCandidate[] }>();
    vi.mocked(api.listWhatsAppCandidates).mockReturnValueOnce(old.promise).mockResolvedValue({ candidates: [] });
    const view = render(tree()); view.rerender(tree("key-two")); await screen.findByText("No candidates awaiting review.");
    await act(async () => { old.resolve({ candidates: [candidate()] }); });
    expect(screen.queryByText("Admissions close in May")).not.toBeInTheDocument();
  });

  test("a late private decision cannot appear after credential change", async () => {
    const old = deferred<{ candidate: WhatsAppCandidate; changed: boolean }>();
    vi.spyOn(api, "decideWhatsAppCandidate").mockReturnValue(old.promise);
    const view = render(tree()); await userEvent.click(await screen.findByRole("button", { name: "Approve" }));
    vi.mocked(api.listWhatsAppCandidates).mockResolvedValue({ candidates: [] }); view.rerender(tree("key-two"));
    await screen.findByText("No candidates awaiting review."); await act(async () => { old.resolve({ candidate: { ...candidate(), status: "approved" }, changed: true }); });
    expect(screen.queryByText("claim · approved")).not.toBeInTheDocument(); expect(screen.queryByText(/Decision recorded/)).not.toBeInTheDocument();
  });

  test("client uses real protected endpoints with no client tenant or actor", async () => {
    vi.mocked(api.listWhatsAppCandidates).mockRestore();
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [candidate()] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ candidate: { ...candidate(), status: "approved" }, changed: true }) });
    vi.stubGlobal("fetch", fetcher);
    try {
      render(tree()); await userEvent.click(await screen.findByRole("button", { name: "Approve" })); await screen.findByText("claim · approved");
      expect(fetcher.mock.calls[0]![0]).toMatch(/\/whatsapp\/review$/);
      expect(fetcher.mock.calls[1]![0]).toMatch(/\/whatsapp\/review\/wa-review%3Aone\/approve$/);
      expect(fetcher.mock.calls[1]![1]).toMatchObject({ method: "POST", body: "{}", headers: { authorization: "Bearer key-one" } });
    } finally { vi.unstubAllGlobals(); }
  });
});

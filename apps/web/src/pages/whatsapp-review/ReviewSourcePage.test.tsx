import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/AuthContext.js";
import { ReviewQueue } from "../whatsapp/ReviewQueue.js";
import ReviewSourcePage from "./ReviewSourcePage.js";
import { getReviewSource, type ReviewSource } from "./client.js";

const id = `wa-review:${"a".repeat(64)}`;
const source: ReviewSource = { candidateId: id, sessionId: "session/1", kind: "claim", status: "needs-review", text: "Scholarship closes Friday.",
  evidence: [{ turnId: "turn/248", sessionId: "session/1", speakerRef: "expert", speakerLabel: "Asha", occurredAt: "2026-10-14T10:00:00.000Z", quote: "Scholarship closes Friday." }] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function Controls() {
  const auth = useAuth(), navigate = useNavigate();
  return <><button onClick={() => auth.setApiKey("same-key")}>Fresh login</button><button onClick={() => navigate(`/whatsapp/review/${encodeURIComponent(`wa-review:${"b".repeat(64)}`)}/source`)}>Other candidate</button></>;
}
function mount(path = `/whatsapp/review/${encodeURIComponent(id)}/source#turn-turn%2F248`) {
  return render(<AuthProvider><MemoryRouter initialEntries={[path]}><Controls /><Routes>
    <Route path="/whatsapp" element={<ReviewQueue apiKey="same-key" revision={0} />} />
    <Route path="/whatsapp/review/:id/source" element={<ReviewSourcePage />} />
  </Routes></MemoryRouter></AuthProvider>);
}
beforeEach(() => { localStorage.setItem("lkbApiKey", "same-key"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

test("actual review queue link opens candidate-bound HTTP evidence with encoded target and private auth", async () => {
  const scroll = vi.fn(); Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer same-key");
    expect(init?.method).toBe("GET"); expect(init?.body).toBeUndefined();
    return String(url).endsWith("/source") ? response({ source }) : response({ candidates: [{ _id: id, groupJid: "group", ...source, evidence: source.evidence, flags: [] }] });
  });
  vi.stubGlobal("fetch", fetcher); mount("/whatsapp");
  const link = await screen.findByRole("link", { name: "Open exact source message" });
  expect(link).toHaveAttribute("href", `/whatsapp/review/${encodeURIComponent(id)}/source#turn-turn%2F248`);
  await userEvent.click(link);
  const selected = await screen.findByRole("group", { name: "Selected source message" });
  expect(within(selected).getByText(source.evidence[0]!.quote)).toBeInTheDocument();
  expect(selected).toHaveAttribute("id", "turn-turn%2F248"); expect(selected).toHaveClass("highlighted");
  expect(within(selected).getByText(/Asha/)).toBeInTheDocument(); expect(within(selected).getByText(/turn\/248/)).toBeInTheDocument();
  await waitFor(() => expect(scroll).toHaveBeenCalled());
  expect(String(fetcher.mock.calls[1]![0])).toContain(`/whatsapp/review/${encodeURIComponent(id)}/source`);
  expect(screen.queryByText("PRIVATE unrelated sibling")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
});
test.each([403, 404, 409, 503])("source HTTP %s is honest and exposes no old evidence", async status => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ error: "unavailable" }, status))); mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(/cannot view|no longer available|could not be verified|could not be loaded/);
  expect(screen.queryByText(source.text)).not.toBeInTheDocument();
});
test("fresh login with reused key discards the earlier private source response", async () => {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(accept => { resolve = accept; });
  vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending).mockResolvedValue(response({ source: { ...source, text: "New login evidence" } })));
  mount(); await userEvent.click(screen.getByRole("button", { name: "Fresh login" }));
  await screen.findByText("New login evidence");
  await act(async () => { resolve(response({ source: { ...source, text: "OLD PRIVATE SECRET" } })); });
  expect(screen.queryByText("OLD PRIVATE SECRET")).not.toBeInTheDocument();
});
test("candidate route changes discard the earlier response", async () => {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(accept => { resolve = accept; });
  vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending).mockResolvedValue(response({ source: { ...source, candidateId: `wa-review:${"b".repeat(64)}`, text: "Other evidence" } })));
  mount(); await userEvent.click(screen.getByRole("button", { name: "Other candidate" })); await screen.findByText("Other evidence");
  await act(async () => { resolve(response({ source: { ...source, text: "OLD CANDIDATE PRIVATE" } })); });
  expect(screen.queryByText("OLD CANDIDATE PRIVATE")).not.toBeInTheDocument();
});
test("reload clears prior evidence and renders fresh source refusal", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ source })).mockResolvedValue(response({ error: "review_source_stale" }, 409)));
  mount(); await screen.findByRole("group", { name: "Selected source message" });
  await userEvent.click(screen.getByRole("button", { name: "Reload source evidence" })); await screen.findByRole("alert");
  expect(screen.queryByText(source.text)).not.toBeInTheDocument();
});
test("HTTP consumer refuses mismatched candidate/session evidence instead of displaying it", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ source: { ...source, evidence: [{ ...source.evidence[0]!, sessionId: "foreign" }] } })));
  await expect(getReviewSource("same-key", id)).rejects.toThrow("Invalid review source");
});

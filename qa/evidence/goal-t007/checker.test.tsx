import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import * as api from "../../../apps/web/src/api/whatsapp.js";
import * as sessions from "../../../apps/web/src/api/sessions.js";
import { AuthProvider, useAuth } from "../../../apps/web/src/auth/AuthContext.js";
import { WhatsAppPage } from "../../../apps/web/src/pages/WhatsAppPage.js";
import { ReviewQueue } from "../../../apps/web/src/pages/whatsapp/ReviewQueue.js";
import { SessionDetailPage } from "../../../apps/web/src/pages/sessions/SessionDetailPage.js";
vi.mock("../../../apps/web/src/pages/sessions/SpeakerSuggestions.js", () => ({ SpeakerSuggestions: () => null }));
vi.mock("../../../apps/web/src/pages/sessions/grounded/GroundedContentPanel.js", () => ({ GroundedContentPanel: () => null }));
const row = (): api.WhatsAppCandidate => ({ _id: "wa-review:checker", groupJid: "group", sessionId: "s/one", kind: "claim", status: "needs-review", text: "PRIVATE CHECKER PROPOSAL", flags: [],
  evidence: [{ sessionId: "s/one", turnId: "t/%one", speakerRef: "person", speakerLabel: "Checker speaker", quote: "Exact checker source quote", occurredAt: "2026-10-14T10:00:00Z" }] });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test("independent exact evidence click reaches the real session consumer and a turn beyond its first page", async () => {
  vi.spyOn(api, "listWhatsAppCandidates").mockResolvedValue({ candidates: [row()] });
  const turns = Array.from({ length: 250 }, (_, index) => ({ _id: index === 248 ? "t/%one" : `turn-${index}`, speakerRef: "person", speakerLabel: "Checker speaker", text: index === 248 ? "Exact checker source quote" : `Other turn ${index}`, tStart: index, tEnd: index, occurredAt: "2026-10-14T10:00:00Z" }));
  const source = vi.spyOn(sessions, "getSession").mockResolvedValue({ session: { _id: "s/one", title: "Checker source", date: "2026-10-14", status: { transcribe: "done", index: "done" } }, page: null, turns, claims: [] });
  const scroll = vi.fn(); Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
  localStorage.setItem("lkbApiKey", "checker-key");
  render(<AuthProvider><MemoryRouter initialEntries={["/review"]}><Routes><Route path="/review" element={<ReviewQueue apiKey="checker-key" revision={0} />} /><Route path="/sessions/:id" element={<SessionDetailPage />} /></Routes></MemoryRouter></AuthProvider>);
  await userEvent.click(await screen.findByRole("link", { name: "Open exact source message" }));
  await screen.findByText("Checker source");
  expect(source).toHaveBeenCalledWith("checker-key", "s/one");
  const target = document.getElementById("turn-t/%one");
  expect(target).toHaveTextContent("Exact checker source quote");
  expect(target).toHaveAttribute("data-turn-id", "t/%one");
  expect(target?.getAttribute("style")).toContain("--warn");
  expect(scroll).toHaveBeenCalledWith({ block: "center" });
});

test("independent reversed ingest refresh responses retain only the newest pending snapshot", async () => {
  const old = deferred<{ candidates: api.WhatsAppCandidate[] }>();
  vi.spyOn(api, "listWhatsAppCandidates").mockReturnValueOnce(old.promise).mockResolvedValue({ candidates: [] });
  const view = render(<MemoryRouter><ReviewQueue apiKey="key" revision={0} /></MemoryRouter>);
  view.rerender(<MemoryRouter><ReviewQueue apiKey="key" revision={1} /></MemoryRouter>);
  await screen.findByText("No candidates awaiting review.");
  await act(async () => { old.resolve({ candidates: [row()] }); });
  expect(screen.queryByText("PRIVATE CHECKER PROPOSAL")).not.toBeInTheDocument();
  expect(screen.getByText("0 pending review")).toBeInTheDocument();
});

test("independent reused-key login discards an old private decision response in the shipped page", async () => {
  const old = deferred<{ candidate: api.WhatsAppCandidate; changed: boolean }>();
  vi.spyOn(api, "listWhatsAppGroups").mockResolvedValue({ groups: [] });
  vi.spyOn(api, "listWhatsAppCandidates").mockResolvedValueOnce({ candidates: [row()] }).mockResolvedValue({ candidates: [] });
  const decision = vi.spyOn(api, "decideWhatsAppCandidate").mockReturnValue(old.promise);
  const Login = () => { const { setApiKey } = useAuth(); return <button onClick={() => setApiKey("same-key")}>Fresh login</button>; };
  localStorage.setItem("lkbApiKey", "same-key");
  render(<AuthProvider><MemoryRouter><Login /><WhatsAppPage /></MemoryRouter></AuthProvider>);
  await userEvent.click(await screen.findByRole("button", { name: "Approve" }));
  expect(decision).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Fresh login" }));
  await screen.findByText("No candidates awaiting review.");
  await act(async () => { old.resolve({ candidate: { ...row(), status: "approved" }, changed: true }); });
  await waitFor(() => expect(screen.queryByText("PRIVATE CHECKER PROPOSAL")).not.toBeInTheDocument());
  expect(screen.queryByText(/Decision recorded/)).not.toBeInTheDocument();
});

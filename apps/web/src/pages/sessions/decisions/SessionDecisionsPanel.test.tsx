import { existsSync, readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, test, expect, afterEach } from "vitest";
import { SessionDecisionsPanel, type SessionDecisionsPanelProps } from "./SessionDecisionsPanel.js";
import { getSessionDecisions, type SessionDecisionsView } from "./client.js";
import { SessionDetailPage } from "../SessionDetailPage.js";
import { AuthProvider } from "../../../auth/AuthContext.js";
import { AUTH_KEY_STORAGE_KEY } from "../../../api/client.js";

// No fallback fixture: the preceding broker-owned Node stage must produce this actual
// persisted-producer/authenticated-root-route response before these client/panel checks run.
const transportPath = new NodeURL("../../../../../../qa/evidence/goal-u25-consumer/public-transport.json", import.meta.url);
if (!existsSync(transportPath)) {
  test.skip("HOLD: actual public synthetic producer→mounted-route artifact is missing; public consumer acceptance remains unmeasured", () => {});
} else {
const transport = JSON.parse(readFileSync(transportPath, "utf8"));
if (transport.dataClass !== "synthetic-only") throw new Error("Public consumer requires an actual synthetic-only transport artifact");
const recorded = transport.cases[0];
const data: SessionDecisionsView = recorded.response;
const props: SessionDecisionsPanelProps = { apiKey: "transport", sessionId: data.sessionId, sessionVersion: 0, revision: 0 };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const view = (p: SessionDecisionsPanelProps) => <MemoryRouter><SessionDecisionsPanel {...p} /></MemoryRouter>;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear(); });

test("actual stored producer→mounted-route artifact reaches shared client and panel with every source link", async () => {
  expect(transport.scriptedProvider).toBe(true); expect(recorded.semanticMeasured).toBe(false);
  expect(recorded.sourceCount).toBe(3); expect(recorded.producerResult).toEqual({ count: 1, degraded: null });
  const fetcher = vi.fn().mockResolvedValue(response(data)); vi.stubGlobal("fetch", fetcher);
  render(view(props));
  expect(await screen.findByRole("heading", { name: recorded.stored.text })).toBeInTheDocument();
  expect(screen.getByText("Proposed · awaiting review")).toBeInTheDocument();
  const article = screen.getByRole("heading", { name: recorded.stored.text }).closest("article")!;
  expect(article).toHaveAttribute("data-decision-id", recorded.stored._id);
  expect(recorded.stored.status).toBe("proposed");
  for (const ref of data.decisions[0]!.evidence) {
    expect(within(article).getByText(ref.text)).toBeInTheDocument();
    expect(within(article).getByRole("link", { name: `${ref.speaker} · ${ref.tStart}–${ref.tEnd} ${ref.unit}` }))
      .toHaveAttribute("href", `/sessions/${encodeURIComponent(ref.sessionId)}#turn-${encodeURIComponent(ref.turnId)}`);
  }
  expect(String(fetcher.mock.calls[0]![0])).toMatch(`/sessions/${encodeURIComponent(data.sessionId)}/decisions`);
  expect(fetcher.mock.calls[0]![1].headers.authorization).toBe("Bearer transport");
});

test.skipIf(process.env.KB_U25_PRIVATE_TOC_TESTS !== "1")("HOLD unless private opt-in: actual 51-turn source capture flows through the same client/panel without being labeled semantic gold", async () => {
  const privateTransport = JSON.parse(readFileSync(new NodeURL("../../../../../../qa/evidence/goal-u25-consumer/transport.json", import.meta.url), "utf8"));
  const real = privateTransport.cases[1]; expect(real.sourceCount).toBe(51); expect(real.semanticMeasured).toBe(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(real.response)));
  render(view({ ...props, sessionId: real.response.sessionId }));
  const candidate = await screen.findByRole("heading", { name: real.stored.text });
  expect(candidate.closest("article")).toHaveAttribute("data-decision-id", real.stored._id);
  expect(screen.getByText("Proposed · awaiting review")).toBeInTheDocument();
  expect(screen.getByText(/does not certify extraction quality or semantic support/)).toBeInTheDocument();
});

test("actual reachable SessionDetailPage renders the isolated stored-decision consumer", async () => {
  window.localStorage.setItem(AUTH_KEY_STORAGE_KEY, "transport");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = new URL(url, "http://local.invalid").pathname;
    if (path === `/sessions/${data.sessionId}/decisions`) return response(data);
    if (path === `/sessions/${data.sessionId}`) return response(recorded.sessionResponse);
    if (path.endsWith("/grounded-content")) return response({ sessionId: data.sessionId, notes: [], qa: [], claims: [] });
    return response({ error: "unavailable", message: "Other workflow not configured" }, 503);
  }));
  render(<AuthProvider><MemoryRouter initialEntries={[`/sessions/${data.sessionId}`]}><Routes>
    <Route path="/sessions/:id" element={<SessionDetailPage />} />
  </Routes></MemoryRouter></AuthProvider>);
  expect(await screen.findByRole("heading", { name: "Stored decision candidates" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: recorded.stored.text })).toBeInTheDocument();
});

test("empty means no available stored candidate and errors never imply no real decisions", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ sessionId: data.sessionId, decisions: [] }))
    .mockResolvedValueOnce(response({ message: "Stored decisions are unavailable" }, 503));
  vi.stubGlobal("fetch", fetcher); const page = render(view(props));
  expect(await screen.findByText(/This does not establish that no decisions were made/)).toBeInTheDocument();
  page.rerender(view({ ...props, revision: 1 }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Stored decisions are unavailable");
  expect(screen.queryByText(/This does not establish/)).not.toBeInTheDocument();
});

test.each(["apiKey", "sessionId", "sessionVersion", "revision"] as const)("%s change hides old populated state immediately and cancels old callbacks", async (field) => {
  let finish!: (reply: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(response(data)).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher); const page = render(view(props));
  expect(await screen.findByRole("heading", { name: recorded.stored.text })).toBeInTheDocument();
  const next: SessionDecisionsPanelProps = { ...props };
  if (field === "apiKey") next.apiKey = "new-key";
  else if (field === "sessionId") next.sessionId = "new-session";
  else next[field] = 1;
  page.rerender(view(next));
  expect(screen.queryByRole("heading", { name: recorded.stored.text })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Loading stored");
  finish(response({ sessionId: next.sessionId, decisions: [] }));
  expect(await screen.findByText(/No stored decision candidates with current visible evidence/)).toBeInTheDocument();
});

test("same-key re-login invalidates a still-pending old response", async () => {
  let finish!: (reply: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce(response({ sessionId: data.sessionId, decisions: [] })));
  const page = render(view(props)); page.rerender(view({ ...props, sessionVersion: 1 }));
  expect(await screen.findByText(/No stored decision candidates/)).toBeInTheDocument();
  finish(response(data)); await waitFor(() => expect(screen.queryByRole("heading", { name: recorded.stored.text })).not.toBeInTheDocument());
});

test("stored status/absent owner/character positions and unsafe HTML are displayed literally", async () => {
  const candidate = { ...data.decisions[0]!, status: "verified" as const, owner: undefined,
    text: "<script>doNotExecute()</script>", evidence: data.decisions[0]!.evidence.map((e) => ({ ...e, unit: "characters" as const })) };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ sessionId: data.sessionId, decisions: [candidate] })));
  render(view(props)); expect(await screen.findByText(candidate.text)).toBeInTheDocument();
  expect(screen.getByText("Stored review status: verified")).toBeInTheDocument();
  expect(screen.getByText("Owner not recorded")).toBeInTheDocument();
  expect(screen.getAllByRole("link").every((link) => link.textContent!.includes("characters"))).toBe(true);
  expect(document.querySelector("script")).toBeNull();
});

test("client rejects foreign session/evidence, invalid status/spans and malformed records before panel exposure", async () => {
  const cases = [
    { ...data, sessionId: "foreign" },
    { ...data, decisions: [{ ...data.decisions[0]!, evidence: [{ ...data.decisions[0]!.evidence[0]!, sessionId: "foreign" }] }] },
    { ...data, decisions: [{ ...data.decisions[0]!, evidence: data.decisions[0]!.evidence.map((e, i) => i === 0 ? { ...e, sessionId: "foreign" } : e) }] },
    { ...data, decisions: [{ ...data.decisions[0]!, status: "confirmed" }] },
    { ...data, decisions: [{ ...data.decisions[0]!, tEnd: 99 }] },
    { ...data, decisions: [{ ...data.decisions[0]!, evidence: [] }] },
  ];
  for (const body of cases) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body)));
    await expect(getSessionDecisions("transport", data.sessionId)).rejects.toThrow(/unavailable|match/);
  }
  const fetcher = vi.fn().mockResolvedValue(response({ sessionId: "session/with space", decisions: [] }));
  vi.stubGlobal("fetch", fetcher); await getSessionDecisions("transport", "session/with space");
  expect(String(fetcher.mock.calls[0]![0])).toMatch("/sessions/session%2Fwith%20space/decisions");
});
}

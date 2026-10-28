import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SpeakerRelationWorkbench, type SpeakerRelationAuthority } from "./SpeakerRelationWorkbench.js";
const fetchMock = vi.fn();
const revision = "a".repeat(64);
const row = { id: "rel:one", revision: 3, status: "suggested", type: "contradicts", from: { claimId: "claim:a", personId: "person:one" }, to: { claimId: "claim:b", personId: "person:one" }, sourceRevisionDigest: revision, evidence: [{ sessionId: "session:1", turnId: "turn:2", quote: "Exact source words" }] };
const authority: SpeakerRelationAuthority = { personId: "person:one", canReview: true, canPropose: false, reviewerKind: "human", sourceRevisionDigest: revision };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" }); fetchMock.mockImplementation((url: string) => Promise.resolve(response({ relationships: url.includes("status=suggested") ? [row] : [] }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount(a?: SpeakerRelationAuthority) { return render(<MemoryRouter><SpeakerRelationWorkbench apiKey="k" authSession={1} personId="person:one" authority={a} /></MemoryRouter>); }
test("pending and accepted inventories are separate and absent capability grants no decisions", async () => {
  mount(); await screen.findByText("Exact source words");
  expect(screen.getByRole("region", { name: "suggested relationships" })).toHaveTextContent("Pending proposals");
  expect(screen.getByRole("region", { name: "accepted relationships" })).toHaveTextContent("No accepted relationships");
  expect(screen.queryByRole("button", { name: "Accept relationship" })).toBeNull();
  expect(screen.getByText(/Proposal unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open source turn turn:2" })).toHaveAttribute("href", "/sessions/session%3A1#turn-turn%3A2");
});
test("review requires explicit confirmation and submits exact current revision", async () => {
  fetchMock.mockImplementation((url: string, options: RequestInit) => Promise.resolve(options.method === "POST" ? response({ relationship: { id: row.id, revision: 4, status: "accepted", replayed: false } }) : response({ relationships: url.includes("status=suggested") ? [row] : [] })));
  mount(authority); await screen.findByText("Exact source words");
  fireEvent.click(screen.getByRole("button", { name: "Accept relationship" }));
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Confirm accept" }));
  await screen.findByText("Server recorded relationship as accepted.");
  const post = fetchMock.mock.calls.find(([, options]) => options.method === "POST")!;
  expect(post[0]).toContain("/speaker-relations/rel%3Aone/review");
  expect(JSON.parse(post[1].body)).toEqual({ baseRevision: 3, requestId: "review:00000000-0000-4000-8000-000000000001", decision: "accept" });
});
test.each([409, 403, 503])("server refusal %s does not promote a pending relationship", async status => {
  fetchMock.mockImplementation((url: string, options: RequestInit) => Promise.resolve(options.method === "POST" ? response({ error: "speaker_relationship_conflict" }, status) : response({ relationships: url.includes("status=suggested") ? [row] : [] })));
  mount(authority); await screen.findByText("Exact source words"); fireEvent.click(screen.getByRole("button", { name: "Accept relationship" })); fireEvent.click(screen.getByRole("button", { name: "Confirm accept" }));
  await screen.findByRole("alert"); expect(screen.getByText("Status: suggested · revision 3")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Accept relationship" })).toBeDisabled();
});
test("automation cannot review and stale current source blocks human decisions", async () => {
  mount({ ...authority, reviewerKind: "automation" }); await screen.findByText("Exact source words"); expect(screen.queryByRole("button", { name: "Accept relationship" })).toBeNull(); cleanup();
  mount({ ...authority, sourceRevisionDigest: "b".repeat(64) }); await screen.findByText("Exact source words"); expect(screen.getByRole("button", { name: "Accept relationship" })).toBeDisabled();
});
test("proposal sends selected exact evidence and stays suggested", async () => {
  fetchMock.mockImplementation((url: string, options: RequestInit) => Promise.resolve(options.method === "POST" ? response({ relationship: { id: "rel:new", revision: 1, status: "suggested", replayed: false } }, 201) : response({ relationships: [] })));
  const evidence = { sessionId: "s", turnId: "t", quote: "Source quotation", transcriptHash: "c".repeat(64) };
  mount({ ...authority, canPropose: true, claims: [{ id: "a", text: "First claim", evidence: [evidence] }, { id: "b", text: "Second claim", evidence: [{ ...evidence, turnId: "t2" }] }] });
  await screen.findByText("No pending proposals in the current source view.");
  fireEvent.change(screen.getByLabelText("From claim"), { target: { value: "a" } }); fireEvent.change(screen.getByLabelText("To claim"), { target: { value: "b" } });
  fireEvent.click(screen.getAllByRole("checkbox")[0]!); fireEvent.click(screen.getByRole("button", { name: "Submit proposal for human review" }));
  await screen.findByText("Proposal saved for human review. It is not an accepted relationship.");
  const post = fetchMock.mock.calls.find(([, options]) => options.method === "POST")!;
  expect(JSON.parse(post[1].body)).toEqual({ id: "proposal:00000000-0000-4000-8000-000000000001", personId: "person:one", fromClaimId: "a", toClaimId: "b", type: "agrees_with", sourceRevisionDigest: revision, evidence: [evidence] });
});
test("picks survive authority settling but are cleared when a defined digest is replaced by a different one", async () => {
  fetchMock.mockImplementation(() => Promise.resolve(response({ relationships: [] })));
  const evidence = { sessionId: "s", turnId: "t", quote: "Source quotation", transcriptHash: "c".repeat(64) };
  const claims = [{ id: "a", text: "First claim", evidence: [evidence] }, { id: "b", text: "Second claim", evidence: [{ ...evidence, turnId: "t2" }] }];
  const full = { ...authority, canPropose: true, claims };
  const ui = (a: SpeakerRelationAuthority) => <MemoryRouter><SpeakerRelationWorkbench apiKey="k" authSession={1} personId="person:one" authority={a} /></MemoryRouter>;
  const view = render(ui(full));
  await screen.findByText("No pending proposals in the current source view.");
  fireEvent.change(screen.getByLabelText("From claim"), { target: { value: "a" } }); fireEvent.change(screen.getByLabelText("To claim"), { target: { value: "b" } });
  view.rerender(ui({ ...full, sourceRevisionDigest: undefined })); // authority unsettled: form hidden, nothing to compare
  view.rerender(ui({ ...full }));                                  // same digest settles again: picks are kept
  expect((screen.getByLabelText("From claim") as HTMLSelectElement).value).toBe("a");
  expect((screen.getByLabelText("To claim") as HTMLSelectElement).value).toBe("b");
  view.rerender(ui({ ...full, sourceRevisionDigest: "d".repeat(64) })); // real change: fail closed
  await waitFor(() => expect((screen.getByLabelText("From claim") as HTMLSelectElement).value).toBe(""));
  expect((screen.getByLabelText("To claim") as HTMLSelectElement).value).toBe("");
});
test("malformed cross-person inventory fails closed", async () => {
  fetchMock.mockResolvedValue(response({ relationships: [{ ...row, to: { ...row.to, personId: "person:other" } }] })); mount(authority);
  await screen.findByRole("alert"); expect(screen.queryByText("Exact source words")).toBeNull(); expect(screen.queryByRole("button", { name: "Accept relationship" })).toBeNull();
});

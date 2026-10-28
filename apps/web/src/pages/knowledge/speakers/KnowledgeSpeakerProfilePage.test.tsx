import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext.js";
import { KnowledgeSpeakerProfilePage } from "./KnowledgeSpeakerProfilePage.js";
import { existsSync, readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { createHash } from "node:crypto";
import { validCitedSpeakerProfile } from "./speakerProfileClient.js";
const mock = vi.fn();
// Node filesystem paths must use Node's URL constructor, not jsdom's global browser URL.
const scriptedArtifactUrl = new NodeURL("../../../../../../qa/evidence/u24-speaker-profile/broker-run-20261014T210625/scripted-producer-profile-responses.json", import.meta.url);
const scriptedArtifactAvailable = existsSync(scriptedArtifactUrl);
const privateTocReplayEnabled = process.env.KB_U24_PRIVATE_TOC_TESTS === "1";
const cite = { sessionId: "s", sessionTitle: "Source session", turnId: "t", tStart: 12, tEnd: 20, quote: "My name is Anita." };
const profile = { personId: "person:anita", aliases: ["Anita"], identityStatus: "deterministic", ambiguity: { kind: "same-name-cross-session", sessionIds: ["s", "other"] }, recordedConfidence: 0.7,
  identityEvidence: [cite], organizations: [], roles: [], unavailable: ["organizations", "roles"], claims: [], topics: [], sessions: [{ id: "s", title: "Source session", date: "2026-10-14" }],
  attribution: [{ sessionId: "s", speakerRef: "spk:0", startTurnIndex: 4, endTurnIndex: 4, turnIds: ["t"] }], withheld: { claims: 1, identityEvidence: 0, blocks: 1, profileFields: 2 } };
beforeEach(() => { mock.mockReset(); vi.stubGlobal("fetch", mock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test("mounted speaker workbench consumes trusted source and submits a pending proposal with hashed evidence", async () => {
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
  const revision = "a".repeat(64), evidence = { sessionId: "s", turnId: "t", quote: "First source", transcriptHash: "b".repeat(64) };
  const source = { personId: profile.personId, capabilities: { canPropose: true, canReview: true, reviewerKind: "human" }, sourceRevisionDigest: revision,
    statements: [{ id: "claim:a", text: "First claim", evidence: [evidence] }, { id: "claim:b", text: "Second claim", evidence: [{ ...evidence, turnId: "t2", quote: "Second source" }] }] };
  mock.mockImplementation((url: string, options: RequestInit) => Promise.resolve({ ok: true, status: options.method === "POST" ? 201 : 200, json: async () =>
    options.method === "POST" ? { relationship: { id: "rel:new", revision: 1, status: "suggested", replayed: false } } :
    url.includes("/speaker-relations/source?") ? source : url.includes("/speaker-relations?") ? { relationships: [] } : url.includes("/speaker-profiles/") ? { profile } : { members: [], truncated: false } }));
  render(<MemoryRouter initialEntries={["/knowledge/speakers/person%3Aanita"]}><AuthProvider><Routes><Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} /></Routes></AuthProvider></MemoryRouter>);
  await screen.findAllByRole("option", { name: "First claim" });
  expect(mock.mock.calls.some(([url]) => String(url).includes("/speaker-relations/source?personId=person%3Aanita"))).toBe(true);
  // Select inside waitFor so a late source-settle effect on a slow runner cannot wipe the picks before the assertion.
  await waitFor(() => {
    fireEvent.change(screen.getByLabelText("From claim"), { target: { value: "claim:a" } }); fireEvent.change(screen.getByLabelText("To claim"), { target: { value: "claim:b" } });
    expect(screen.getByRole("checkbox", { name: "First source" })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "First source" })); fireEvent.click(screen.getByRole("button", { name: "Submit proposal for human review" }));
  await screen.findByText("Proposal saved for human review. It is not an accepted relationship.");
  const post = mock.mock.calls.find(([, options]) => options.method === "POST")!;
  expect(JSON.parse(post[1].body)).toEqual({ id: "proposal:00000000-0000-4000-8000-000000000001", personId: profile.personId, fromClaimId: "claim:a", toClaimId: "claim:b", type: "agrees_with", evidence: [evidence], sourceRevisionDigest: revision });
  expect(mock.mock.calls.filter(([url]) => String(url).includes("/speaker-relations/source?")).length).toBeGreaterThanOrEqual(2);
});

test.each([403, 503])("mounted speaker workbench refuses unavailable source bootstrap %s", async status => {
  mock.mockImplementation((url: string) => Promise.resolve({ ok: !url.includes("/speaker-relations/source?"), status: url.includes("/speaker-relations/source?") ? status : 200, json: async () => url.includes("/speaker-relations/source?") ? { error: "speaker_relationship_unavailable" } : url.includes("/speaker-relations?") ? { relationships: [] } : url.includes("/speaker-profiles/") ? { profile } : { members: [], truncated: false } }));
  render(<MemoryRouter initialEntries={["/knowledge/speakers/person%3Aanita"]}><AuthProvider><Routes><Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} /></Routes></AuthProvider></MemoryRouter>);
  await screen.findByText(/Relationship actions unavailable:/); expect(screen.queryByRole("button", { name: "Submit proposal for human review" })).toBeNull(); expect(screen.queryByRole("button", { name: "Accept relationship" })).toBeNull();
});

test("mounted speaker workbench never infers review authority from profile identity or malformed capabilities", async () => {
  mock.mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: async () => url.includes("/speaker-relations/source?") ? { personId: profile.personId, sourceRevisionDigest: "a".repeat(64), capabilities: { reviewerKind: "human" }, statements: [] } : url.includes("/speaker-relations?") ? { relationships: [] } : url.includes("/speaker-profiles/") ? { profile: { ...profile, identityStatus: "human-confirmed" } } : { members: [], truncated: false } }));
  render(<MemoryRouter initialEntries={["/knowledge/speakers/person%3Aanita"]}><AuthProvider><Routes><Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} /></Routes></AuthProvider></MemoryRouter>);
  await screen.findByText("Identity: human-confirmed"); await screen.findByText(/Relationship actions unavailable:/); expect(screen.getByText(/Human review unavailable/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Submit proposal for human review" })).toBeNull();
});
test("speaker UI requests bounded vectorless evidence on demand and links exact passage", async () => {
  const revision = "a".repeat(64);
  mock.mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: async () => url.includes("/knowledge?q=") ? {
    knowledge: { personId: "person:anita", identityStatus: "human-confirmed", ambiguity: null, revision, nodes: [{ id: "session:s", kind: "session", label: "Source session" }], edges: [], statements: [{ id: "c", text: "Visa advice", topicIds: [], evidence: [cite] }], withheldRelationships: 0 },
    retrieval: { revision, truncated: false, passages: [{ ...cite, quote: "Prepare visa documents early." }] },
  } : url.includes("/speaker-profiles/") ? { profile } : { members: [], truncated: false } }));
  render(<MemoryRouter initialEntries={["/knowledge/speakers/person%3Aanita"]}><AuthProvider><Routes><Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} /></Routes></AuthProvider></MemoryRouter>);
  await screen.findByText("Identity: deterministic");
  expect(mock.mock.calls.some(([url]) => String(url).includes("/knowledge?q="))).toBe(false);
  fireEvent.change(screen.getByLabelText("Question or topic"), { target: { value: "visa ki advice" } });
  fireEvent.click(screen.getByRole("button", { name: "Find source passages" }));
  expect(await screen.findByText("Prepare visa documents early.")).toBeInTheDocument();
  expect(screen.getByText("1 source-backed statements · 1 sessions · 0 topics")).toBeInTheDocument();
  expect(mock.mock.calls.some(([url]) => String(url).includes("q=visa%20ki%20advice"))).toBe(true);
});
test("actual speaker UI consumes U24 shape and displays conservative identity, ambiguity, confidence, field absence and exact block", async () => {
  mock.mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: async () => url.includes("/speaker-profiles/") ? { profile } : { members: [{ kind: "speaker", id: "speaker-row", personId: "person:anita", title: "Recorded alias" }], truncated: false } }));
  render(<MemoryRouter initialEntries={["/knowledge/speakers/person%3Aanita"]}><AuthProvider><Routes><Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} /></Routes></AuthProvider></MemoryRouter>);
  expect(await screen.findByText("Identity: deterministic")).toBeInTheDocument(); expect(screen.getByText(/Same-name ambiguity/)).toBeInTheDocument(); expect(screen.getByText("Recorded confidence: 0.7")).toBeInTheDocument();
  expect(screen.getByText(/Organization unavailable/)).toBeInTheDocument(); expect(screen.getByText(/Role unavailable/)).toBeInTheDocument(); expect(screen.getByText("My name is Anita.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open exact block" })).toHaveAttribute("href", "/sessions/s#turn-t"); expect(screen.getByRole("link", { name: "Recorded alias" })).toHaveAttribute("href", "/knowledge/speakers/person%3Aanita");
});

test.skipIf(!scriptedArtifactAvailable)(`immediate speaker UI replays actual scripted U24 producer output and withholds pending/stale attribution${scriptedArtifactAvailable ? "" : " [SKIP/HOLD: required public synthetic producer archive unavailable]"}`, async () => {
  // Public scripted output is optional in a publication checkout; missing output leaves downstream readiness on HOLD.
  // When present, its exact producer assertions remain mandatory; never substitute a hand-authored profile.
  const raw = readFileSync(scriptedArtifactUrl, "utf8");
  expect(createHash("sha256").update(raw).digest("hex")).toBe("98948cae1b8f3d812346ac2528b822a616ed81b707fb62f33cd7005b731d2c62");
  const artifact = JSON.parse(raw);
  expect(artifact.proofClass).toBe("synthetic-scripted-provider-in-memory-db"); expect(artifact.liveProviderCalls).toBe(0); expect(artifact.liveDatabaseWrites).toBe(0);
  expect(artifact.pendingProfile).toBeNull();
  expect(artifact.httpResponses.pending.status).toBe(404); expect(artifact.httpResponses.pending.body).toEqual({ error: "not_found" });
  expect(artifact.httpResponses.confirmed.status).toBe(200); expect(artifact.httpResponses.confirmed.body).toEqual({ profile: artifact.confirmedProfile });
  expect(artifact.httpResponses.stale.status).toBe(200); expect(artifact.httpResponses.stale.body).toEqual({ profile: artifact.staleProfile });
  for (const response of Object.values(artifact.httpResponses) as Array<{ cacheControl: string }>) expect(response.cacheControl).toMatch(/private.*no-store/);
  const personId = "person:priya-nair";
  expect(validCitedSpeakerProfile(artifact.confirmedProfile, personId)).toBe(true);
  expect(validCitedSpeakerProfile(artifact.staleProfile, personId)).toBe(true);
  const mountProfile = (response: { status: number; body: unknown }) => {
    mock.mockImplementation((url: string) => Promise.resolve({ ok: !url.includes("/speaker-profiles/") || response.status < 400, status: url.includes("/speaker-profiles/") ? response.status : 200,
      json: async () => url.includes("/speaker-profiles/") ? response.body : { members: [], truncated: false } }));
    render(<MemoryRouter initialEntries={[`/knowledge/speakers/${encodeURIComponent(personId)}`]}><AuthProvider><Routes><Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} /></Routes></AuthProvider></MemoryRouter>);
  };
  mountProfile(artifact.httpResponses.confirmed);
  expect(await screen.findByText("Identity: human-confirmed")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open exact block" })).toHaveAttribute("href", "/sessions/s1#turn-t1");
  expect(screen.getByText("Visas require early preparation", { selector: "section > p" })).toBeInTheDocument();
  expect(screen.queryByText("A different voice on this label")).toBeNull(); cleanup();
  mountProfile(artifact.httpResponses.stale);
  expect(await screen.findByText("Identity: human-confirmed")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open exact block" })).toBeNull();
  expect(screen.queryByText("Reindexed replacement voice")).toBeNull(); cleanup();
  mountProfile(artifact.httpResponses.pending);
  expect(await screen.findByRole("alert")).toBeInTheDocument(); expect(screen.queryByText("Identity: human-confirmed")).toBeNull();
});

test.skipIf(!privateTocReplayEnabled)(`immediate speaker UI consumes the immutable authentic TOC mounted response without promoting deterministic identity or unsupported fields${privateTocReplayEnabled ? "" : " [SKIP/HOLD: private TOC replay requires KB_U24_PRIVATE_TOC_TESTS=1]"}`, async () => {
  // The registration gate defaults off before any private artifact read. Opt-in still requires the exact archive.
  // Authentic transcript-derived output over fixture auth/DB; no live Mongo/provider or human-confirmation claim.
  const raw = readFileSync(new URL("../../../../../../qa/evidence/u24-speaker-profile/broker-run-20261014T210625/actual-toc-api-response.json", import.meta.url), "utf8");
  expect(createHash("sha256").update(raw).digest("hex")).toBe("dedb7726376e3c4ce3e2d7644aa62e46bf115ea675da55930abb32a1aa29613d");
  const response = JSON.parse(raw), actual = response.profile;
  expect(validCitedSpeakerProfile(actual, actual.personId)).toBe(true);
  expect(validCitedSpeakerProfile(actual, `${actual.personId}-different`)).toBe(false);
  expect(actual.identityStatus).toBe("deterministic"); expect(actual.organizations).toEqual([]); expect(actual.roles).toEqual([]);
  mock.mockImplementation((url: string) => Promise.resolve({ ok: true, status: 200, json: async () => url.includes("/speaker-profiles/") ? response : { members: [], truncated: false } }));
  render(<MemoryRouter initialEntries={[`/knowledge/speakers/${encodeURIComponent(actual.personId)}`]}><AuthProvider><Routes><Route path="/knowledge/speakers/:personId" element={<KnowledgeSpeakerProfilePage />} /></Routes></AuthProvider></MemoryRouter>);
  expect(await screen.findByText("Identity: deterministic")).toBeInTheDocument();
  expect(screen.queryByText("Identity: human-confirmed")).toBeNull();
  expect(screen.getByText(actual.identityEvidence[0].quote, { selector: "blockquote" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open exact block" })).toHaveAttribute("href", `/sessions/${encodeURIComponent(actual.attribution[0].sessionId)}#turn-${encodeURIComponent(actual.attribution[0].turnIds[0])}`);
  expect(screen.getByText(/Organization unavailable/)).toBeInTheDocument(); expect(screen.getByText(/Role unavailable/)).toBeInTheDocument();
});

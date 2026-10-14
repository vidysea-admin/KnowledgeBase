import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext.js";
import { listClaims } from "../../api/claims.js";
import { KnowledgeProfilesPage } from "./KnowledgeProfilesPage.js";

// Shapes copied from apps/api/src/fixtures.ts (graph) and promote-entities.ts (topicRefs = `<tenant>:<slug>`).
const st = { transcribe: "done", index: "done" };
const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: `session-${i + 1}`, title: `Session ${i + 1}`, date: "2026-10-01", status: st }));
const graphFor = (n: number) => ({
  nodes: [
    ...mk(n).map(s => ({ id: `session:${s._id}`, label: s.title, kind: "session", ref: s._id, sources: ["tree_index"] })),
    { id: "topic:visas", label: "Visas", kind: "topic", ref: "visas", sources: ["tree_index"] },
    { id: "topic:visas-extra", label: "Visa extras", kind: "topic", ref: "visas-extra", sources: ["tree_index"] },
  ],
  edges: mk(n).map(s => ({ source: `session:${s._id}`, target: "topic:visas", type: "session-topic", inferred: false, origin: "tree_index", sessionRef: s._id, evidence: [{ turnId: "t1", sessionId: s._id }] })),
  stats: { sessionsTotal: n, sessionsInGraph: n, sessionsMissing: [], edgeSources: { treeIndex: n, entityEdges: 0 } },
});
const claim = (id: string, topicRefs: string[], evidence: unknown[]) => ({ _id: id, text: `Text ${id}`, status: "verified", topicRefs, evidence });
const fetchMock = vi.fn();
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
function serve(n: number, claims: unknown[], grounded?: unknown) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/grounded-content")) return Promise.resolve(res(grounded));
    if (url.includes("/claims")) return Promise.resolve(res({ claims, limit: 100, offset: 0, truncated: false }));
    if (url.endsWith("/sessions")) return Promise.resolve(res({ sessions: mk(n) }));
    if (url.includes("/sessions/")) return Promise.resolve(res({ session: mk(1)[0], page: null, claims: [], turns: [{ _id: "t1", speakerRef: "spk:1", speakerLabel: "Anita", tStart: 42, tEnd: 50, text: "A student visa needs a confirmed offer." }] }));
    return Promise.resolve(res(graphFor(n)));
  });
}
const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><KnowledgeProfilesPage /></AuthProvider></MemoryRouter>);
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test("ISS-T055PROFILES-001/002: toc:visas claim renders under topic:visas with quote, speaker, timestamp; other slugs do not", async () => {
  serve(1, [claim("c1", ["toc:visas"], [{ turnId: "t1", sessionId: "session-1", sessionTitle: "Session 1" }]), claim("c2", ["toc:visas-extra"], [{ turnId: "t1", sessionId: "session-1", sessionTitle: "Session 1" }])]);
  mount("/knowledge/profiles?tab=topics&id=topic%3Avisas");
  expect(await screen.findByText("Claim (verified): Text c1")).toBeInTheDocument();
  expect(screen.queryByText(/Text c2/)).toBeNull();
  expect((await screen.findAllByText("A student visa needs a confirmed offer.")).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Session 1 · Anita · 42s/).length).toBeGreaterThan(0);
  expect(screen.getByText("1 tagged claims.")).toBeInTheDocument();
});
test("ISS-T055PROFILES-003: highlights hide claims with empty evidence and never show their text", async () => {
  const ev = [{ turnId: "t1", sessionId: "session-1", quote: "q", available: true, tStart: 1, tEnd: 2, speaker: "Anita" }];
  serve(1, [], { sessionId: "session-1", notes: [], qa: [], claims: [{ _id: "a", text: "Has evidence", status: "verified", evidence: ev }, { _id: "b", text: "Ungrounded secret claim", status: "verified", evidence: [] }] });
  mount("/knowledge/profiles?tab=highlights&id=session-1");
  expect(await screen.findByText("Has evidence")).toBeInTheDocument();
  expect(screen.queryByText(/Ungrounded secret claim/)).toBeNull();
  expect(screen.getByText(/1 claims are hidden: evidence unavailable/)).toBeInTheDocument();
});
test("ISS-T055PROFILES-003: claims client refuses a claim row with empty evidence (pins isRow guard)", async () => {
  fetchMock.mockResolvedValue(res({ claims: [claim("x", [], [])], limit: 25, offset: 0, truncated: false }));
  await expect(listClaims("k")).rejects.toMatchObject({ status: 503 });
});
test("ISS-T055PROFILES-004: rows beyond the 8-session cap say not loaded, never turn not found", async () => {
  serve(10, []);
  mount("/knowledge/profiles?tab=topics&id=topic%3Avisas");
  expect((await screen.findAllByText("Quote not loaded (limit 8 sessions).")).length).toBe(2);
  expect(screen.queryByText(/turn not found/)).toBeNull();
  expect(screen.getByText(/2 more sessions are not loaded \(limit 8 sessions\)/)).toBeInTheDocument();
});

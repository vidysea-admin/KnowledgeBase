import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext.js";
import { KnowledgeProfilesPage } from "./KnowledgeProfilesPage.js";

const st = { transcribe: "done", index: "done" };
const sessions = [{ _id: "s1", title: "Admissions webinar", date: "2026-10-01", status: st }];
const graph = {
  nodes: [
    { id: "topic:study-abroad", label: "Study abroad", kind: "topic", sources: ["graph_edges"] },
    { id: "person:a", label: "Asha", kind: "person", sources: ["graph_edges"] },
  ],
  edges: [{ source: "person:a", target: "topic:study-abroad", type: "discussed", inferred: true, confidence: 0.6, origin: "graph_edges", sessionRef: "s1", evidence: [{ turnId: "t1", tStart: 5 }] }],
  stats: { sessionsTotal: 1, sessionsInGraph: 1, sessionsMissing: [], edgeSources: { treeIndex: 0, entityEdges: 1 } },
};
const claims = { claims: [{ _id: "c1", text: "Deadline is March", status: "verified", topicRefs: ["topic:study-abroad"], evidence: [{ turnId: "t1", sessionId: "s1", sessionTitle: "Admissions webinar" }] }], limit: 100, offset: 0, truncated: false };
const detail = { session: sessions[0], page: null, claims: [], turns: [{ _id: "t1", speakerRef: "spk:1", speakerLabel: "Asha", tStart: 5, tEnd: 9, text: "Apply to three universities before March." }] };
const grounded = { sessionId: "s1", notes: [{ id: "n1", kind: "insight", text: "Apply early", origin: "speaker-statement", verification: "unverified", evidence: [{ turnId: "t1", sessionId: "s1", quote: "Apply to three universities", available: true, tStart: 5, tEnd: 9, speaker: "Asha" }] }], qa: [], claims: [] };
const fetchMock = vi.fn();
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const route = (over: Record<string, () => unknown> = {}) => fetchMock.mockImplementation((url: string) => {
  const hit = Object.keys(over).find(k => url.includes(k)); if (hit) return Promise.resolve(over[hit]!());
  if (url.includes("/grounded-content")) return Promise.resolve(res(grounded));
  if (url.includes("/claims")) return Promise.resolve(res(claims));
  if (url.endsWith("/sessions")) return Promise.resolve(res({ sessions }));
  if (url.includes("/sessions/")) return Promise.resolve(res(detail));
  return Promise.resolve(res(graph));
});
const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><KnowledgeProfilesPage /></AuthProvider></MemoryRouter>);
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); localStorage.setItem("lkbApiKey", "k"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

test("topic profile shows claim, quote, timestamp and exact source link", async () => {
  route(); mount("/knowledge/profiles?tab=topics&id=topic%3Astudy-abroad");
  await screen.findByRole("article", { name: "Topic profile" });
  expect(await screen.findByText("Apply to three universities before March.")).toBeInTheDocument();
  expect(screen.getByText("Deadline is March · verified")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open source turn" })).toHaveAttribute("href", "/sessions/s1#turn-t1");
  expect(screen.getByText(/Inferred discussed/)).toHaveTextContent("confidence 0.60");
});
test("speaker profile never certifies identity or role", async () => {
  route(); mount("/knowledge/profiles?tab=speakers&id=person%3Aa");
  await screen.findByRole("article", { name: "Speaker profile" });
  expect(screen.getByText(/does not confirm identity, role/)).toBeInTheDocument();
});
test("highlights tab lists grounded notes with quote and link", async () => {
  route(); mount("/knowledge/profiles?tab=highlights&id=s1");
  expect(await screen.findByText("Apply early")).toBeInTheDocument();
  expect(screen.getByText("Apply to three universities")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Asha · 5s/ })).toHaveAttribute("href", "/sessions/s1#turn-t1");
});
test("collections tab separates curated unavailability from derived themes", async () => {
  route(); mount("/knowledge/profiles?tab=collections");
  expect(await screen.findByText(/curated collections are not available yet/)).toBeInTheDocument();
  expect(screen.getByText(/Study abroad \(1 sessions, 1 topics\)/)).toBeInTheDocument();
});
test("error, claims failure, graph 404 and unauthenticated states", async () => {
  route({ "/sessions": () => res({}, 500) }); mount("/knowledge/profiles");
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load profiles");
  cleanup(); route({ "/claims": () => res({}, 500) }); mount("/knowledge/profiles?tab=topics&id=topic%3Astudy-abroad");
  expect(await screen.findByText(/Claims could not be loaded/)).toBeInTheDocument();
  cleanup(); route({ "/graph": () => res({}, 404) }); mount("/knowledge/profiles?tab=topics&id=topic%3Aa");
  expect(await screen.findByText(/No graph has been indexed/)).toBeInTheDocument();
  expect(screen.getByText(/selected profile is unavailable/)).toBeInTheDocument();
  cleanup(); fetchMock.mockClear(); localStorage.clear(); mount("/knowledge/profiles");
  expect(screen.getByText(/Sign in with an API key/)).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
});
test("tab switch updates view and no horizontal-overflow-prone fixed widths", async () => {
  route(); mount("/knowledge/profiles"); await screen.findByRole("tab", { name: "Topics" });
  fireEvent.click(screen.getByRole("tab", { name: "Speakers" }));
  expect(await screen.findByRole("link", { name: "Asha" })).toHaveAttribute("href", "/knowledge/profiles?tab=speakers&id=person%3Aa");
  expect(screen.getByRole("tabpanel")).toHaveStyle({ overflowWrap: "anywhere" });
});

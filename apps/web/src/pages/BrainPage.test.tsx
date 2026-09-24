/**
 * apps/web/src/pages/BrainPage.test.tsx — U-BRAIN.
 *
 * This file used to mock `react-force-graph-2d` away and assert on a stand-in `<button>` per
 * node, because the real renderer was a `<canvas>` with no DOM to assert on. That mock is exactly
 * why "13 shapes, 0 labels" was invisible to every existing test: the thing under test was the
 * mock. /brain now renders real SVG, so the mock is gone and the probe the contract asks for —
 * `svg text` count > 0 AND equal to the visible node count ([C2]) — runs here for real.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { AuthProvider } from "../auth/AuthContext.js";
import { BrainPage } from "./BrainPage.js";
import * as graphApi from "../api/graph.js";
import * as sessionsApi from "../api/sessions.js";
import { ApiError } from "../api/client.js";
import type { Graph } from "../api/types.js";

const UNION_GRAPH: Graph = {
  nodes: [
    { id: "session:s1", label: "Study in Hungary", kind: "session", ref: "s1", sources: ["tree_index", "graph_edges"] },
    { id: "topic:scholarships", label: "Scholarships", kind: "topic", ref: "scholarships", sources: ["tree_index"] },
    { id: "person:anita", label: "Anita", kind: "person", ref: "anita", sources: ["graph_edges"] },
    { id: "country:hungary", label: "Hungary", kind: "country", ref: "hungary", sources: ["graph_edges"] },
  ],
  edges: [
    { source: "session:s1", target: "topic:scholarships", type: "session-topic", inferred: false, origin: "tree_index" },
    { source: "person:anita", target: "session:s1", type: "spoke_in", inferred: false, confidence: 1, sessionRef: "s1", evidence: [{ turnId: "t-7", sessionId: "s1" }], origin: "graph_edges" },
    { source: "session:s1", target: "country:hungary", type: "covers", inferred: true, confidence: 0.8, sessionRef: "s1", evidence: [{ turnId: "t-9" }], origin: "graph_edges" },
  ],
  stats: { sessionsTotal: 2, sessionsInGraph: 1, sessionsMissing: [{ id: "ghost", title: "Never Indexed Session" }], edgeSources: { treeIndex: 1, entityEdges: 2 } },
};

function renderWithKey(initialUrl = "/brain") {
  localStorage.setItem("lkbApiKey", "test-key");
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialUrl]}>
        <BrainPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

function svgEl(): SVGSVGElement {
  return screen.getByTestId("brain-graph-svg") as unknown as SVGSVGElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("BrainPage [C2] — the label probe", () => {
  test("renders one <text> label per visible node, and the count is not zero", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());

    const svg = svgEl();
    const nodeGroups = svg.querySelectorAll("[data-node-id]");
    const labels = svg.querySelectorAll("text");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBe(nodeGroups.length);
    expect(nodeGroups.length).toBe(UNION_GRAPH.nodes.length);
    // An EMPTY <text> would satisfy the count alone — found by falsifying this very probe, which
    // stayed green when the label content was deleted and only the element was left behind.
    for (const t of labels) expect((t.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  test("the labels are the real node labels, from both sources", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    const texts = [...svgEl().querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toContain("Study in Hungary"); // tree_index
    expect(texts).toContain("Anita"); // graph_edges only — unreachable before this unit
  });

  test("every node is keyboard-focusable with an accessible name", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    for (const g of svgEl().querySelectorAll("[data-node-id]")) {
      expect(g.getAttribute("tabindex")).toBe("0");
      expect(g.getAttribute("aria-label")).toBeTruthy();
    }
  });
});

describe("BrainPage [C3] — drill-down is two levels and never terminal", () => {
  test("clicking a topic shows its neighbours grouped by edge type, each clickable", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());

    await user.click(svgEl().querySelector('[data-node-id="topic:scholarships"]')!);
    const panel = await screen.findByTestId("node-panel");
    expect(within(panel).getByText("Scholarships")).toBeInTheDocument();
    expect(within(panel).getByText(/session topic \(1\)/i)).toBeInTheDocument();
    expect(panel.querySelector('[data-neighbour-id="session:s1"]')).toBeTruthy();
  });

  test("a neighbour click re-centres on that node and opens ITS panel (topic -> session -> person)", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    vi.spyOn(sessionsApi, "getSession").mockResolvedValue({
      session: { _id: "s1", title: "Study in Hungary", date: "2026-09-24", status: { transcribe: "done", index: "done" } },
      page: { summary: "A real summary." },
      claims: [],
      turns: [],
    });
    renderWithKey();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());

    await user.click(svgEl().querySelector('[data-node-id="topic:scholarships"]')!);
    await user.click((await screen.findByTestId("node-panel")).querySelector('[data-neighbour-id="session:s1"]')!);
    await waitFor(() => expect(screen.getByText("A real summary.")).toBeInTheDocument());
    expect(sessionsApi.getSession).toHaveBeenCalledWith("test-key", "s1");

    // ...and from the session, on to the person who spoke in it.
    await user.click((await screen.findByTestId("node-panel")).querySelector('[data-neighbour-id="person:anita"]')!);
    await waitFor(() => expect(within(screen.getByTestId("node-panel")).getByText("Anita")).toBeInTheDocument());
  });

  test("an edge with evidence exposes a link to that exact turn in the transcript", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    await user.click(svgEl().querySelector('[data-node-id="country:hungary"]')!);
    const link = within(await screen.findByTestId("node-panel")).getByTestId("evidence-link");
    expect(link.getAttribute("href")).toBe("/sessions/s1#turn-t-9");
  });

  test("keyboard: tab to a node and press Enter to open its panel", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    const node = svgEl().querySelector('[data-node-id="person:anita"]') as HTMLElement;
    node.focus();
    await user.keyboard("{Enter}");
    expect(within(await screen.findByTestId("node-panel")).getByText("Anita")).toBeInTheDocument();
  });
});

describe("BrainPage [C4] — derived edges are distinguishable", () => {
  test("an inferred edge is dashed and a stated one is not", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    const covers = svgEl().querySelector('[data-edge-type="covers"]')!;
    const spokeIn = svgEl().querySelector('[data-edge-type="spoke_in"]')!;
    expect(covers.getAttribute("data-inferred")).toBe("true");
    expect(covers.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(spokeIn.getAttribute("data-inferred")).toBe("false");
    expect(spokeIn.getAttribute("stroke-dasharray")).toBeFalsy();
  });

  test("the panel states the confidence of a derived relationship", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    await user.click(svgEl().querySelector('[data-node-id="country:hungary"]')!);
    expect(within(await screen.findByTestId("node-panel")).getByText(/derived · confidence 0\.80/)).toBeInTheDocument();
  });
});

describe("BrainPage [C5] — filters, in the URL", () => {
  test("a kind filter narrows the rendered nodes and their labels with them", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    expect(svgEl().querySelectorAll("text")).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "person" }));
    await waitFor(() => expect(svgEl().querySelectorAll("text")).toHaveLength(1));
    expect(screen.getByTestId("filter-count")).toHaveTextContent("1 filter(s) active");
  });

  test("a filter given in the URL is applied on load, so a filtered view is shareable", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey("/brain?kinds=country");
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    expect(svgEl().querySelectorAll("text")).toHaveLength(1);
    expect([...svgEl().querySelectorAll("text")][0]!.textContent).toBe("Hungary");
  });

  test("a search with no matches says so instead of rendering a blank graph", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey("/brain?q=zzzznothing");
    await waitFor(() => expect(screen.getByTestId("no-match-note")).toBeInTheDocument());
    expect(screen.queryByTestId("brain-graph-svg")).toBeNull();
  });

  test("clearing filters restores the whole graph", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey("/brain?kinds=country");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId("brain-graph-svg")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /clear filters/i }));
    await waitFor(() => expect(svgEl().querySelectorAll("text")).toHaveLength(4));
  });
});

describe("BrainPage [C6]/[C7]/[C8] — freshness and honesty", () => {
  test("a session that exists but is not in the graph is counted on screen, not hidden", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    const note = await screen.findByTestId("staleness-note");
    expect(note).toHaveTextContent("1 session(s) exist but are not in this graph");
    expect(note).toHaveTextContent("Never Indexed Session");
  });

  test("the counts name how much of the graph came from graph_edges", async () => {
    vi.spyOn(graphApi, "loadGraph").mockResolvedValue(UNION_GRAPH);
    renderWithKey();
    await waitFor(() => expect(screen.getByTestId("graph-counts")).toHaveTextContent("2 from graph_edges"));
  });

  test("a 404 becomes an explanatory empty state, not a raw error line", async () => {
    vi.spyOn(graphApi, "loadGraph").mockRejectedValue(new ApiError(404, "no knowledge graph for this tenant yet"));
    renderWithKey();
    const empty = await screen.findByTestId("graph-empty-state");
    expect(empty).toHaveTextContent(/nothing has been indexed/i);
  });

  test("a non-404 failure still surfaces as an error", async () => {
    vi.spyOn(graphApi, "loadGraph").mockRejectedValue(new ApiError(500, "boom"));
    renderWithKey();
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});

/**
 * apps/web/src/pages/brain/GraphSvg.tsx — the /brain graph, rendered as real SVG.
 *
 * THE POINT OF THIS FILE ([C2]). The previous renderer drew to a `<canvas>`, which is why a
 * visible-browser probe on 2026-09-24 found 13 node shapes and **zero** labels: a canvas has no
 * DOM to label. Here every node is a real `<g>` carrying exactly ONE `<text>` and ONE `<title>`,
 * so `svg text` count === visible node count is something a probe can assert — and so a screen
 * reader and the keyboard get the graph too ([C8] floor, mirrored from the calendar contract).
 *
 * Deliberately ONE `<text>` per node and NONE anywhere else in the SVG (the legend and the
 * counters are HTML, next to it) — an extra decorative label inside the SVG would break exactly
 * the equality the contract asks for.
 */
import type { GraphEdge, GraphNode, GraphNodeKind } from "../../api/types.js";
import type { Point } from "./force-layout.js";

export const NODE_COLOR: Record<GraphNodeKind, string> = {
  session: "#2554ff",
  topic: "#0b8a5c",
  org: "#b7791f",
  person: "#a23b8f",
  country: "#0f766e",
  date: "#5b6472",
  month: "#94a3b8",
  user: "#c0362c",
  other: "#64748b",
};

const MAX_LABEL = 22;

function shortLabel(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

function radiusFor(kind: GraphNodeKind, degree: number): number {
  const base = kind === "session" ? 8 : 6;
  return base + Math.min(5, Math.sqrt(degree));
}

export interface GraphSvgProps {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  positions: Map<string, Point>;
  width: number;
  height: number;
  /** Centre of the current viewport; clicking a node re-centres on it ([C3]). */
  viewBox: { x: number; y: number; w: number; h: number };
  selectedId: string | null;
  onSelect(id: string): void;
}

export function GraphSvg(props: GraphSvgProps): React.ReactElement {
  const { nodes, edges, positions, viewBox, selectedId, onSelect } = props;
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  return (
    <svg
      data-testid="brain-graph-svg"
      role="group"
      aria-label={`Knowledge graph, ${nodes.length} nodes and ${edges.length} relationships`}
      width={props.width}
      height={props.height}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      style={{ display: "block", background: "var(--card)" }}
    >
      <g data-testid="graph-edges">
        {edges.map((e) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          const touchesSelection = selectedId !== null && (e.source === selectedId || e.target === selectedId);
          return (
            <line
              key={`${e.source}|${e.target}|${e.type}`}
              data-edge-type={e.type}
              data-inferred={e.inferred ? "true" : "false"}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={touchesSelection ? "var(--accent)" : "rgba(20,24,31,0.35)"}
              strokeOpacity={e.inferred ? 0.45 : 0.8}
              strokeWidth={touchesSelection ? 1.8 : 1}
              /* [C4]: a derived / sub-1-confidence edge is DASHED, a literal one is solid. */
              strokeDasharray={e.inferred ? "4 3" : undefined}
            />
          );
        })}
      </g>
      <g data-testid="graph-nodes">
        {nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const r = radiusFor(n.kind, degree.get(n.id) ?? 0);
          const selected = n.id === selectedId;
          return (
            <g
              key={n.id}
              data-node-id={n.id}
              data-node-kind={n.kind}
              role="button"
              tabIndex={0}
              aria-label={`${n.kind}: ${n.label}`}
              aria-pressed={selected}
              onClick={() => onSelect(n.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onSelect(n.id);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <title>{`${n.kind}: ${n.label}`}</title>
              <circle
                cx={p.x} cy={p.y} r={r}
                fill={NODE_COLOR[n.kind]}
                stroke={selected ? "var(--ink)" : "#ffffff"}
                strokeWidth={selected ? 2.5 : 1.2}
              />
              <text
                x={p.x} y={p.y + r + 11}
                textAnchor="middle"
                fontSize={11}
                fontWeight={selected ? 700 : 500}
                fill="var(--ink)"
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
                style={{ pointerEvents: "none" }}
              >
                {shortLabel(n.label)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

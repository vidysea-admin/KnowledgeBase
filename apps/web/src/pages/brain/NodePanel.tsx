/**
 * apps/web/src/pages/brain/NodePanel.tsx — the /brain drill-down panel ([C3]/[C4]).
 *
 * The pre-U-BRAIN panel was one level deep and terminal: a topic showed "LINKED SESSIONS (1)" and
 * nothing else — no neighbours, no evidence, no way back into the transcript. This one shows the
 * node's kind + label, EVERY neighbour grouped by edge type with each one clickable (which
 * re-centres the graph), the confidence of each relationship, and a link straight to the turn
 * that supports it. Topic -> speaker -> session -> turn, with no URL typing.
 */
import { Link } from "react-router-dom";
import type { GraphNode, SessionDetail } from "../../api/types.js";
import { evidenceFor, evidenceHref, type Neighbour } from "./graph-model.js";
import { NODE_COLOR } from "./GraphSvg.js";

export interface NodePanelProps {
  node: GraphNode;
  neighbours: Map<string, Neighbour[]>;
  detail: SessionDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onSelect(id: string): void;
}

function confidenceNote(confidence: number | undefined, inferred: boolean): string {
  if (confidence === undefined) return inferred ? "derived" : "stated";
  return `${inferred ? "derived" : "stated"} · confidence ${confidence.toFixed(2)}`;
}

export function NodePanel(props: NodePanelProps): React.ReactElement {
  const { node, neighbours, detail, onSelect } = props;
  const allNeighbours = [...neighbours.values()].flat();
  const evidence = evidenceFor(allNeighbours);

  return (
    <div data-testid="node-panel">
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: NODE_COLOR[node.kind], display: "inline-block" }} />
        {node.kind}
      </div>
      <div className="row-title">{node.label}</div>
      <div className="row-meta">
        in {node.sources.join(" + ")} · {allNeighbours.length} relationship(s)
      </div>

      {node.kind === "session" && node.ref && (
        <Link to={`/sessions/${encodeURIComponent(node.ref)}`} className="row-meta" style={{ color: "var(--accent)", display: "inline-block", marginTop: "0.4rem" }}>
          Open full session &rarr;
        </Link>
      )}
      {props.detailLoading && <div className="empty-note">Loading session&hellip;</div>}
      {props.detailError && <div className="error-note">{props.detailError}</div>}
      {detail && (
        <>
          <p style={{ fontSize: "0.85rem" }}>{detail.page?.summary ?? "(no summary yet)"}</p>
          <div className="row-meta">{detail.claims.length} claim(s) · {detail.turns.length} turn(s)</div>
        </>
      )}

      {allNeighbours.length === 0 && (
        <div className="empty-note" style={{ marginTop: "0.6rem" }}>
          No relationships for this node in the current data. That is the data saying so, not a
          rendering gap.
        </div>
      )}

      {[...neighbours.entries()].map(([type, list]) => (
        <div key={type}>
          <div className="section-title">{type.replace(/[-_]/g, " ")} ({list.length})</div>
          {list.map((n) => (
            <button
              key={`${type}|${n.node.id}`}
              type="button"
              onClick={() => onSelect(n.node.id)}
              data-neighbour-id={n.node.id}
              style={{
                display: "block", width: "100%", textAlign: "left", background: "none",
                border: "none", borderLeft: `3px solid ${NODE_COLOR[n.node.kind]}`,
                padding: "0.2rem 0 0.2rem 0.5rem", marginBottom: "0.3rem", cursor: "pointer", font: "inherit",
              }}
            >
              <span style={{ color: "var(--accent)", fontSize: "0.82rem" }}>
                {n.direction === "in" ? "← " : "→ "}{n.node.label}
              </span>
              <span className="row-meta" style={{ display: "block" }}>
                {n.node.kind} · {confidenceNote(n.edge.confidence, n.edge.inferred)}
              </span>
            </button>
          ))}
        </div>
      ))}

      {evidence.length > 0 && (
        <>
          <div className="section-title">Evidence ({evidence.length})</div>
          {evidence.slice(0, 12).map(({ edge, evidence: ev }) => {
            const href = evidenceHref(edge, ev);
            return (
              <div key={ev.turnId} className="row-meta" style={{ marginBottom: "0.25rem" }}>
                {href ? (
                  <Link to={href} data-testid="evidence-link" style={{ color: "var(--accent)" }}>
                    {edge.type.replace(/[-_]/g, " ")} &middot; turn {ev.turnId}
                  </Link>
                ) : (
                  <span>{edge.type} &middot; turn {ev.turnId} (no session on this row)</span>
                )}
              </div>
            );
          })}
          {evidence.length > 12 && <div className="row-meta">+{evidence.length - 12} more</div>}
        </>
      )}
    </div>
  );
}

import { Link } from "react-router-dom";
import { safePageCitationHref, validPageEvidence, type DocumentDetail, type DocumentPageEvidence } from "./documentPageModel.js";
export function DocumentPageEvidenceView({ document, pages }: { document: DocumentDetail; pages: Map<number, DocumentPageEvidence> }): React.ReactElement {
  const valid = document.highlights.filter(h => { const p = pages.get(h.pageNumber); return validPageEvidence(p, document, h.pageNumber) && p.text.includes(h.quote); });
  const hidden = document.highlights.length - valid.length;
  return <section aria-label="Document highlights">
    <h2>Highlights from {document.title}</h2>
    {hidden > 0 && <p role="status">{hidden} highlights unavailable: their exact page quote could not be resolved.</p>}
    {!document.highlights.length && <p>No highlights saved yet.</p>}
    {valid.map(h => <article className="card" key={h.id} style={{ overflowWrap: "anywhere" }}><blockquote>{h.quote}</blockquote>
      <p>Saved extract · meaning unverified</p>{(href => href ? <Link to={href}>{document.title} · Page {h.pageNumber}</Link> : <span>{document.title} · Page {h.pageNumber} (no safe link)</span>)(safePageCitationHref(document.id, h.pageNumber))}</article>)}
  </section>;
}

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { getPageDocument, getDocumentPage, importPageDocument, listPageDocuments, saveDocumentHighlight } from "./documentClient.js";
import { documentPageHref, type DocumentDetail, type DocumentPageEvidence, type DocumentSummary } from "./documentPageModel.js";
import { DocumentPageEvidenceView } from "./DocumentPageEvidence.js";
type View = { key: string; authSession: number; routeId?: string; routePage?: string; generation: number; documents: DocumentSummary[]; truncated: boolean; detail?: DocumentDetail; page?: DocumentPageEvidence; pages: Map<number, DocumentPageEvidence>; error?: string };
export function KnowledgeDocumentsPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const { id, page } = useParams(); const [generation, refresh] = useState(0);
  const [state, setState] = useState<View | null>(null); const [title, setTitle] = useState(""); const [file, setFile] = useState<File | null>(null); const [quote, setQuote] = useState("");
  const [action, setAction] = useState<{ key: string; authSession: number; message: string; busy: boolean } | null>(null);
  const currentView = useRef(""); currentView.current = JSON.stringify([apiKey, sessionVersion, id, page, generation]);
  const cur = state?.key === apiKey && state.authSession === sessionVersion && state.routeId === id && state.routePage === page && state.generation === generation ? state : null;
  useEffect(() => {
    let cancelled = false; setState(null); setAction(null); setQuote(""); setTitle(""); setFile(null);
    if (apiKey) void (async () => {
      const list = await listPageDocuments(apiKey); const data: View = { key: apiKey, authSession: sessionVersion, routeId: id, routePage: page, generation, ...list, pages: new Map() };
      if (id) {
        data.detail = await getPageDocument(apiKey, id);
        const pageNumber = page ? Number(page) : null;
        if (page && (!/^[1-9][0-9]{0,2}$/.test(page) || pageNumber! > data.detail.pageCount)) throw new Error("This page is unavailable.");
        const wanted = [...new Set([...data.detail.highlights.slice(0, 50).map(h => h.pageNumber), ...(pageNumber ? [pageNumber] : [])])];
        await Promise.all(wanted.map(async n => { try { data.pages.set(n, await getDocumentPage(apiKey, data.detail!, n)); } catch { /* exact missing quotes are withheld */ } }));
        if (pageNumber) { data.page = data.pages.get(pageNumber); if (!data.page) throw new Error("The selected page is unavailable."); }
      }
      if (!cancelled) setState(data);
    })().catch(e => { if (!cancelled) setState({ key: apiKey, authSession: sessionVersion, routeId: id, routePage: page, generation, documents: [], truncated: false, pages: new Map(), error: e instanceof Error ? e.message : "Document evidence unavailable." }); });
    return () => { cancelled = true; };
  }, [apiKey, sessionVersion, generation, id, page]);
  const run = async (work: () => Promise<unknown>) => {
    if (!apiKey) return; const key = apiKey, view = currentView.current; setAction({ key, authSession: sessionVersion, message: "Saving…", busy: true });
    try { await work(); if (currentView.current === view) { setAction({ key, authSession: sessionVersion, message: "Saved.", busy: false }); refresh(n => n + 1); } }
    catch (e) { if (currentView.current === view) setAction({ key, authSession: sessionVersion, message: e instanceof Error ? e.message : "Save failed.", busy: false }); }
  };
  const busy = action?.key === apiKey && action.authSession === sessionVersion && action.busy;
  return <div style={{ overflowWrap: "anywhere", maxWidth: "100%" }}><h1>Document pages and highlights</h1><p>Page numbers come from the PDF pages or a rendered DOCX. Plain text and transcripts have no document page number.</p>
    {!apiKey ? <p>Sign in to view documents.</p> : <>
      <button type="button" onClick={() => refresh(n => n + 1)}>Refresh</button>
      {!cur && <p role="status">Loading documents…</p>}{cur?.error && <p role="alert">{cur.error}</p>}
      {action?.key === apiKey && action.authSession === sessionVersion && <p role={action.busy ? "status" : "alert"}>{action.message}</p>}
      {cur && !cur.error && <>
        <p>{cur.documents.length} returned document versions.{cur.truncated ? " More documents are available; this view is bounded to 100." : ""}</p>
        <ul>{cur.documents.map(d => <li key={d.id}><Link to={`/knowledge/documents/${encodeURIComponent(d.id)}`}>{d.title}</Link> ({d.pageCount} pages · {d.format.toUpperCase()})</li>)}</ul>
        {!cur.documents.length && <p>No page-evidenced documents imported.</p>}
        <form onSubmit={e => { e.preventDefault(); if (file) void run(() => importPageDocument(apiKey, file, title)); }}>
          <h2>Import PDF or DOCX</h2><p>Up to 512 KB. DOCX requires the configured document renderer; unavailable rendering fails explicitly.</p>
          <label>Document title <input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label>Document file <input type="file" accept=".pdf,.docx" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><button disabled={busy || !file}>Import</button>
        </form>
        {cur.detail && <><p>Source version: {cur.detail.version}</p><nav aria-label="Document pages" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{Array.from({ length: cur.detail.pageCount }, (_, i) => <Link key={i} to={documentPageHref(cur.detail!.id, i + 1)}>Page {i + 1}</Link>)}</nav>
          <DocumentPageEvidenceView document={cur.detail} pages={cur.pages} />
          {cur.detail.highlights.length > 50 && <p>Quote resolution is limited to the first 50 highlights; unresolved highlights are withheld.</p>}
          {cur.page && <section><h2>{cur.page.title} · Page {cur.page.pageNumber}</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{cur.page.text || "No extractable text on this page."}</pre>
            <form onSubmit={e => { e.preventDefault(); void run(() => saveDocumentHighlight(apiKey, cur.detail!, cur.page!.pageNumber, quote)); }}>
              <label>Exact quote from this page <textarea required maxLength={4000} value={quote} onChange={e => setQuote(e.target.value)} /></label><button disabled={busy || !quote || !cur.page.text.includes(quote)}>Save highlight</button>
            </form></section>}
        </>}
      </>}
    </>}
  </div>;
}

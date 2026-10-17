import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext.js";
import { listCatalogTopics, getCatalogTopic, type CatalogTopic, type CatalogTopicDetail } from "./knowledgeCatalogClient.js";
type Data = { key: string; authSession: number; generation: number; id?: string; topics: CatalogTopic[]; detail?: CatalogTopicDetail; truncated: boolean; error?: string };
export function KnowledgeTopicsPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const { id } = useParams(); const [generation, refresh] = useState(0); const [data, setData] = useState<Data | null>(null); const [filter, setFilter] = useState("");
  const cur = data?.key === apiKey && data.authSession === sessionVersion && data.generation === generation && data.id === id ? data : null;
  useEffect(() => {
    let cancelled = false; setData(null); setFilter("");
    if (apiKey) (async () => { const list = await listCatalogTopics(apiKey); const detail = id ? await getCatalogTopic(apiKey, id) : undefined;
      if (!cancelled) setData({ key: apiKey, authSession: sessionVersion, generation, id, ...list, ...(detail ? { detail } : {}) });
    })().catch(e => { if (!cancelled) setData({ key: apiKey, authSession: sessionVersion, generation, id, topics: [], truncated: false, error: e instanceof Error ? e.message : "Topics unavailable." }); });
    return () => { cancelled = true; };
  }, [apiKey, sessionVersion, generation, id]);
  return <div style={{ overflowWrap: "anywhere", maxWidth: "100%" }}><h1>Topic profiles</h1><p>Profiles use the exact saved topic identity and source evidence. Categories and extraction quality remain unverified.</p>
    {!apiKey ? <p>Sign in to view topics.</p> : <><button type="button" onClick={() => refresh(n => n + 1)}>Refresh topics</button>
      {!cur && <p role="status">Loading topics…</p>}{cur?.error && <p role="alert">{cur.error}</p>}
      {cur && !cur.error && <><label>Find topic <input value={filter} onChange={e => setFilter(e.target.value)} /></label>
        {!cur.topics.length && <p>No saved topics returned.</p>}{cur.truncated && <p>Only the first 100 saved topics are shown.</p>}
        <ul>{cur.topics.filter(t => t.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(t => <li key={t.id}><Link to={`/knowledge/topics/${encodeURIComponent(t.id)}`}>{t.name}</Link></li>)}</ul>
        {cur.detail && <article><h2>{cur.detail.name}</h2><p>Classification: unclassified</p>
          <h3>Linked sessions</h3><ul>{cur.detail.sessions.map(s => <li key={s.id}><Link to={`/sessions/${encodeURIComponent(s.id)}`}>{s.title}</Link></li>)}</ul>
          <h3>Documents grouped with this topic</h3><p>Saved collection co-membership is a curated grouping, not verified topical extraction.</p>
          {!cur.detail.documents.length && <p>No page-evidenced documents have been grouped with this topic.</p>}
          <ul>{cur.detail.documents.map(d => <li key={d.id}><Link to={`/knowledge/documents/${encodeURIComponent(d.id)}`}>{d.title}</Link> · {d.pageCount} source pages · Co-curated association unverified</li>)}</ul>
          <h3>Evidence-backed claims</h3>{cur.detail.withheldClaims > 0 && <p>{cur.detail.withheldClaims} claims withheld: source evidence unavailable.</p>}
          {cur.detail.truncated && <p>Claims, references or sessions were truncated.</p>}{!cur.detail.claims.length && <p>No claims with available evidence.</p>}
          {cur.detail.claims.map(c => <section className="card" key={c.id}><p>{c.text}</p><p>Recorded status: {c.status}{c.confidence === undefined ? "" : ` · confidence ${c.confidence}`}</p>
            {c.evidence.map((e, i) => <div key={i}><blockquote>{e.quote}</blockquote><Link to={`/sessions/${encodeURIComponent(e.sessionId)}#turn-${encodeURIComponent(e.turnId)}`}>{e.title} · {e.speaker} · {e.coordinate === "seconds" ? `${e.tStart}s` : `character offset ${e.tStart}`}</Link><p>Origin: {e.origin}</p></div>)}
          </section>)}
        </article>}
      </>}
    </>}
  </div>;
}

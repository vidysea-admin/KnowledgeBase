import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext.js";
import { safePublicResourceUrl } from "../../../safe-url.js";
import { getCatalogResources, type CatalogResources } from "./knowledgeCatalogClient.js";
type State = { key: string; authSession: number; generation: number; value?: CatalogResources; error?: string };
export function KnowledgeResourcesPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth(); const [generation, refresh] = useState(0); const [state, setState] = useState<State | null>(null); const [filter, setFilter] = useState(""); const [kind, setKind] = useState("all");
  const cur = state?.key === apiKey && state.authSession === sessionVersion && state.generation === generation ? state : null;
  useEffect(() => { let cancelled = false; setState(null); setFilter(""); setKind("all");
    if (apiKey) getCatalogResources(apiKey).then(value => { if (!cancelled) setState({ key: apiKey, authSession: sessionVersion, generation, value }); }).catch(e => { if (!cancelled) setState({ key: apiKey, authSession: sessionVersion, generation, error: e instanceof Error ? e.message : "Resources unavailable." }); });
    return () => { cancelled = true; };
  }, [apiKey, sessionVersion, generation]);
  return <div style={{ overflowWrap: "anywhere", maxWidth: "100%" }}><h1>Resource and program directory</h1><p>Recorded resources and program labels. Classification, institution role and endorsement are unverified; counts do not establish coverage or quality.</p>
    {!apiKey ? <p>Sign in to view resources.</p> : <><button type="button" onClick={() => refresh(n => n + 1)}>Refresh resources</button>
      {!cur && <p role="status">Loading resources…</p>}{cur?.error && <p role="alert">{cur.error}</p>}
      {cur?.value && <><label>Find resource or program <input value={filter} onChange={e => setFilter(e.target.value)} /></label><label>Resource type <select value={kind} onChange={e => setKind(e.target.value)}><option value="all">All</option>{[...new Set(cur.value.resources.map(r => r.kind))].map(k => <option key={k}>{k}</option>)}</select></label>
        {cur.value.truncated && <p>Returned records and session associations are bounded; additional entries may not be shown.</p>}
        <h2>Sources</h2>{!cur.value.resources.length && <p>No recorded resources.</p>}
        <ul>{cur.value.resources.filter(r => (kind === "all" || r.kind === kind) && `${r.id} ${r.kind}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(r => <li key={r.id}>{r.kind} · {r.createdAt} · {safePublicResourceUrl(r.url) ? <a href={safePublicResourceUrl(r.url)!.href} target="_blank" rel="noopener noreferrer">Public source</a> : "No public source URL"}</li>)}</ul>
        <h2>Recorded program labels</h2>{!cur.value.programs.length && <p>No programs have been recorded. A resource is not automatically a program.</p>}
        {cur.value.programs.filter(p => p.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(p => <article className="card" key={p.id}><h3>{p.name}</h3><p>Unclassified · organization unverified</p><p>Associated sessions are source references, not a verified program description.</p><ul>{p.sessions.map(s => <li key={s.id}><Link to={`/sessions/${encodeURIComponent(s.id)}`}>{s.title}</Link></li>)}</ul></article>)}
      </>}
    </>}
  </div>;
}

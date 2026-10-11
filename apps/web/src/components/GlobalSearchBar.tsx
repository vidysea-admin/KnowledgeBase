import { useEffect, useState, type FormEvent } from "react";
import { createSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { MAX_QUERY_CHARS, normalizeQuery } from "../pages/search/query.js";

/** Always-visible search entry: submits to /search?q=..., where the URL is the single source of truth. */
export function GlobalSearchBar(): React.ReactElement | null {
  const { apiKey } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const onSearch = location.pathname === "/search";
  // useLocation().search is read through URLSearchParams, which decodes exactly once and never throws.
  const urlQuery = onSearch ? normalizeQuery(new URLSearchParams(location.search).get("q")) : "";
  const [draft, setDraft] = useState(urlQuery);
  useEffect(() => { setDraft(urlQuery); }, [urlQuery]);
  if (!apiKey) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = normalizeQuery(draft);
    if (!q) return;
    navigate({ pathname: "/search", search: createSearchParams({ q }).toString() });
  }

  return <form role="search" aria-label="Global search" className="global-search" onSubmit={submit}>
    <label htmlFor="global-search-query">Search all sessions</label>
    <input id="global-search-query" type="text" inputMode="search" enterKeyHint="search" autoComplete="off"
      maxLength={MAX_QUERY_CHARS} value={draft} onChange={(event) => setDraft(event.target.value)} />
    <button type="submit">Go</button>
  </form>;
}

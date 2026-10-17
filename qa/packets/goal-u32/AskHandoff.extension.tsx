import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ask } from "../../api/ask.js";
import { ApiError } from "../../api/client.js";
import type { AskResponse } from "../../api/types.js";
import { normalizeQuery } from "./query.js";

/** Carry the submitted question, never a retrieved passage or an automatic paid request. */
export function AskHandoffLink({ query }: { query: string }): React.ReactElement | null {
  const normalized = normalizeQuery(query);
  return normalized ? <Link to={`/ask?${new URLSearchParams({ q: normalized }).toString()}`}>Send to Ask</Link> : null;
}

interface Draft<T extends AskResponse> {
  owner: string; baseOwner: string; query: string; result: T | null; error: string | null; loading: boolean;
}
function empty<T extends AskResponse>(owner: string, baseOwner: string, query: string): Draft<T> {
  return { owner, baseOwner, query, result: null, error: null, loading: false };
}
function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sign in to ask a question.";
  if (error instanceof ApiError && error.status === 403) return "This API key needs ask access.";
  if (error instanceof ApiError && error.status === 404) return "no tree index built for this tenant yet";
  return "Ask is unavailable. Try again.";
}

/** URL prefill only; every response belongs to its auth session, draft and policy context. */
export function useAskHandoff<T extends AskResponse = AskResponse>(options?: {
  execute?: (key: string, query: string) => Promise<T>; contextKey?: string;
}) {
  const { apiKey, sessionVersion } = useAuth();
  const [params, setParams] = useSearchParams();
  const incoming = normalizeQuery(params.get("q"));
  const identity = JSON.stringify([apiKey, sessionVersion]);
  const previousIdentity = useRef(identity);
  const authChanged = previousIdentity.current !== identity;
  const baseOwner = JSON.stringify([identity, incoming]);
  const owner = JSON.stringify([baseOwner, options?.contextKey ?? ""]);
  const activeOwner = useRef(owner);
  activeOwner.current = owner;
  const generation = useRef(0);
  const [draft, setDraft] = useState<Draft<T>>(() => empty<T>(owner, baseOwner, apiKey ? incoming : ""));
  const current = !authChanged && draft.owner === owner ? draft : empty<T>(owner, baseOwner,
    !apiKey || authChanged ? "" : draft.baseOwner === baseOwner ? draft.query : incoming);

  useEffect(() => {
    generation.current++;
    if (previousIdentity.current !== identity) {
      previousIdentity.current = identity;
      setParams({}, { replace: true });
      setDraft(empty<T>(owner, baseOwner, ""));
    } else setDraft(previous => empty<T>(owner, baseOwner,
      !apiKey ? "" : previous.baseOwner === baseOwner ? previous.query : incoming));
    return () => { generation.current++; };
  }, [owner, baseOwner, identity, apiKey, incoming, setParams]);

  function setQuery(query: string): void {
    if (activeOwner.current !== owner) return;
    generation.current++;
    setDraft(empty<T>(owner, baseOwner, query));
  }
  function restore(query: string, result: T): void {
    if (!apiKey || authChanged || activeOwner.current !== owner) return;
    generation.current++;
    setDraft({ ...empty<T>(owner, baseOwner, normalizeQuery(query)), result });
  }
  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const query = normalizeQuery(current.query);
    if (!apiKey || !query || current.loading || authChanged || activeOwner.current !== owner) return;
    const request = ++generation.current;
    setDraft({ ...empty<T>(owner, baseOwner, query), loading: true });
    // Existing Ask keeps the default response; policy consumers supply their validated adapter.
    const pending = Promise.resolve().then(() => {
      if (activeOwner.current !== owner || generation.current !== request) throw new Error("superseded ask");
      return options?.execute ? options.execute(apiKey, query) : ask(apiKey, query) as Promise<T>;
    });
    void pending.then(result => {
      if (activeOwner.current === owner && generation.current === request)
        setDraft({ ...empty<T>(owner, baseOwner, query), result });
    }).catch((error: unknown) => {
      if (activeOwner.current === owner && generation.current === request)
        setDraft({ ...empty<T>(owner, baseOwner, query), error: message(error) });
    });
  }
  return { query: current.query, setQuery, result: current.result, error: current.error,
    loading: current.loading, handleSubmit, restore };
}

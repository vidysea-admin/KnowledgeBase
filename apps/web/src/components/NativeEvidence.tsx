import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client.js";
import { resolveNativeEvidence, type NativeEvidence as Evidence, type NativeSourceLocator } from "../api/nativeEvidence.js";
import { useAuth } from "../auth/AuthContext.js";

export interface NativeEvidenceProps { sourceLocator: NativeSourceLocator }
type State = { owner: string; status: "pending" | "ready" | "error"; evidence?: Evidence; message?: string };
function failure(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Sign in to open this source passage.";
  if (error instanceof ApiError && error.status === 403) return "This API key needs citations access.";
  return "This source passage is unavailable. It may have changed or been deleted.";
}

/** No quote is accepted from callers: only an explicit authenticated current-source read can show it. */
export function NativeEvidence({ sourceLocator }: NativeEvidenceProps) {
  const { apiKey, sessionVersion } = useAuth();
  const owner = JSON.stringify([apiKey, sessionVersion, sourceLocator]);
  const current = useRef(owner), generation = useRef(0);
  const [state, setState] = useState<State | null>(null);
  if (current.current !== owner) { current.current = owner; generation.current++; setState(null); }
  useEffect(() => () => { generation.current++; }, []);
  const visible = state?.owner === owner ? state : null;
  async function open() {
    if (!apiKey || visible?.status === "pending") return;
    const sentOwner = owner, request = ++generation.current;
    setState({ owner, status: "pending" });
    try {
      const evidence = await resolveNativeEvidence(apiKey, sourceLocator);
      if (current.current === sentOwner && generation.current === request) setState({ owner: sentOwner, status: "ready", evidence });
    } catch (error) {
      if (current.current === sentOwner && generation.current === request) setState({ owner: sentOwner, status: "error", message: failure(error) });
    }
  }
  const p = sourceLocator.passage;
  return <section aria-label="Native source citation">
    <p>{sourceLocator.kind === "document-page" ? `Document page ${sourceLocator.pageNumber}` : `Message ${sourceLocator.messageId} in thread ${sourceLocator.threadId}`} · Characters {p.start}–{p.end}</p>
    {!apiKey ? <p>Sign in to open this source passage.</p> : <button type="button" onClick={() => void open()} disabled={visible?.status === "pending"}>
      {visible?.status === "pending" ? "Checking source…" : visible ? "Recheck cited passage" : "Open cited passage"}
    </button>}
    {visible?.status === "error" && <p role="status">{visible.message}</p>}
    {visible?.status === "ready" && visible.evidence && <>
      {visible.evidence.title && <p>{visible.evidence.title}</p>}
      <blockquote>{visible.evidence.quote}</blockquote>
    </>}
  </section>;
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { listWhatsAppGroups, ingestWhatsAppGroup, type WhatsAppGroup, type WhatsAppIngestResult } from "../api/whatsapp.js";
import { ApiError } from "../api/client.js";
import { ReviewQueue } from "./whatsapp/ReviewQueue.js";

export function WhatsAppPage(): React.ReactElement {
  const { apiKey, sessionVersion } = useAuth();
  return <WhatsAppPageState key={`${sessionVersion}:${apiKey}`} apiKey={apiKey} />;
}

function WhatsAppPageState({ apiKey }: { apiKey: string | null }): React.ReactElement {
  const [groups, setGroups] = useState<WhatsAppGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingestingJid, setIngestingJid] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, WhatsAppIngestResult>>({});
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [reviewRevision, setReviewRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listWhatsAppGroups(apiKey)
      .then((data) => { if (!cancelled) setGroups(data.groups); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "failed to load WhatsApp groups"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  function handleIngest(group: WhatsAppGroup): void {
    setIngestingJid(group.groupJid);
    setIngestError(null);
    ingestWhatsAppGroup(apiKey, group.groupJid)
      .then((result) => { setResults((prev) => ({ ...prev, [group.groupJid]: result })); setReviewRevision((revision) => revision + 1); })
      .catch((err: unknown) => setIngestError(err instanceof ApiError ? err.message : "failed to ingest this group"))
      .finally(() => setIngestingJid(null));
  }

  return (
    <>
      <div className="page-header">
        <h1>WhatsApp</h1>
        <p>
          Ingest captured group messages, inspect their source evidence, and explicitly approve
          or reject each knowledge candidate. Messages await review before publication.
        </p>
      </div>

      {error && <div className="card error-note">{error}</div>}
      {!error && groups === null && <div className="card empty-note">Loading&hellip;</div>}
      {groups && groups.length === 0 && (
        <div className="card empty-note">
          No tracked groups found. Link an account and select groups/people to track inside the
          WhatsApp archiver app itself &mdash; that's its own separate tool, not this page.
        </div>
      )}
      {ingestError && <div className="card error-note">{ingestError}</div>}

      {groups && groups.length > 0 && (
        <div className="session-grid">
          {groups.map((g) => {
            const result = results[g.groupJid];
            return (
              <div key={g.groupJid} className="session-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div className="row-title">{g.subject}</div>
                <div className="row-meta">
                  {g.trackedPersonCount} tracked participant{g.trackedPersonCount === 1 ? "" : "s"}
                </div>
                {!result && (
                  <button
                    type="button"
                    onClick={() => handleIngest(g)}
                    disabled={ingestingJid === g.groupJid}
                    style={{ marginTop: "0.6rem", alignSelf: "flex-start" }}
                  >
                    {ingestingJid === g.groupJid ? "Ingesting…" : "Ingest into knowledge base"}
                  </button>
                )}
                {result && (
                  <div className="row-meta" style={{ marginTop: "0.6rem", color: "var(--good)" }}>
                    Ingested {result.turnCount} real message(s).{" "}
                    <Link to={`/sessions/${encodeURIComponent(result.sessionId)}`}>View it</Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ReviewQueue key={apiKey} apiKey={apiKey} revision={reviewRevision} />
    </>
  );
}

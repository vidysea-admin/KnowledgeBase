import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { TranscriptReview } from "./TranscriptReview.js";

/** Both /transcript-review and /transcript-review/:id are real product entry points. */
export function TranscriptReviewPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const { apiKey } = useAuth();
  const [sessionId, setSessionId] = useState("");
  const [opened, setOpened] = useState("");
  const target = id ?? opened;
  return <>
    <h1>Transcript review and speaker mapping</h1>
    <p>Select a session from the <Link to="/sessions">sessions library</Link>, or enter its session identifier.</p>
    {!id && <form onSubmit={(e) => { e.preventDefault(); setOpened(sessionId.trim()); }}>
      <label>Session identifier <input aria-label="Session identifier" value={sessionId} maxLength={400} onChange={(e) => setSessionId(e.target.value)} /></label>
      <button disabled={!sessionId.trim()}>Open transcript</button>
    </form>}
    {target && <TranscriptReview apiKey={apiKey} sessionId={target} />}
  </>;
}

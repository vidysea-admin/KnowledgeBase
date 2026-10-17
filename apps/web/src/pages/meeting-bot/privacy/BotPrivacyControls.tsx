import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../api/client.js";
import { changeRecordingPrivacy, listRecordingPrivacy, type PrivacyAction, type PrivacyCaptureRow } from "./api.js";

const LABEL = {public: "Public capture", private: "Private segment active", conservative: "Entire capture excluded", unavailable: "Privacy status unavailable"};
type View = {revision: number; rows: PrivacyCaptureRow[]; loading: boolean; error?: string; outcome?: string; busy?: string};
function describe(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "This account cannot access or control recording privacy.";
  if (error instanceof ApiError && error.status === 409) return "The recorder changed. Refresh its status before requesting privacy.";
  return "The recorder could not confirm privacy. Avoid private discussion until confirmation is available.";
}
/** Actual ACK plus refreshed state; never optimistically label a recording private. */
export function BotPrivacyControls({apiKey}: {apiKey: string | null}): React.ReactElement {
  const owner = useRef({key: apiKey, revision: 0});
  if (owner.current.key !== apiKey) owner.current = {key: apiKey, revision: owner.current.revision + 1};
  const [view, setView] = useState<View>({revision: -1, rows: [], loading: true});
  const request = useRef(false), read = useRef(0);
  const current: View = view.revision === owner.current.revision ? view : {revision: owner.current.revision, rows: [], loading: true};
  const alive = (revision: number) => owner.current.revision === revision;
  async function refresh(revision: number, confirmed = false): Promise<void> {
    const sequence = ++read.current;
    try {
      const rows = await listRecordingPrivacy(apiKey);
      if (!alive(revision) || sequence !== read.current) return;
      setView({revision, rows, loading: false, ...(confirmed ? {outcome: "Recorder confirmed the privacy request."} : {})});
    } catch (error) {
      if (!alive(revision) || sequence !== read.current) return;
      setView({revision, rows: [], loading: false, error: confirmed
        ? "Recorder confirmed the request, but its current privacy status could not be refreshed."
        : describe(error)});
    }
  }
  useEffect(() => {
    const revision = owner.current.revision; request.current = false; read.current++;
    setView({revision, rows: [], loading: Boolean(apiKey)});
    if (!apiKey) return () => {owner.current.revision++; read.current++;};
    void refresh(revision);
    const timer = setInterval(() => {if (!request.current) void refresh(revision);}, 10000);
    return () => {clearInterval(timer); owner.current.revision++; read.current++;};
  }, [apiKey]);
  async function change(row: PrivacyCaptureRow, action: PrivacyAction): Promise<void> {
    if (request.current || !apiKey) return;
    const revision = owner.current.revision; request.current = true; read.current++;
    setView(previous => ({...previous, revision, busy: row.sessionId, outcome: undefined, error: undefined}));
    try {
      await changeRecordingPrivacy(apiKey, row, action);
      if (!alive(revision)) return;
      setView({revision, rows: [], loading: true});
      await refresh(revision, true);
    } catch (error) {
      if (alive(revision)) setView({revision, rows: [], loading: false, error: describe(error)});
    } finally {if (alive(revision)) request.current = false;}
  }
  return <section className="card" aria-label="Live recording privacy">
    <h2>Live recording privacy</h2>
    <p>Exclude a private discussion from the knowledge base. Wait for the recorder to confirm the request before discussing private information.</p>
    {!apiKey && <p>Sign in to view live recorder privacy.</p>}
    {apiKey && current.loading && <p role="status">Loading recorder privacy…</p>}
    {current.error && <p role="alert">{current.error}</p>}
    {current.outcome && <p role="status">{current.outcome}</p>}
    {apiKey && !current.loading && !current.error && !current.rows.length && <p>No active recorders are available for privacy control.</p>}
    {current.rows.map(row => <div key={`${row.sessionId}:${row.generation}`}>
      <h3>{row.sessionId}</h3><p>{row.status} · {LABEL[row.privacy]}</p>
      {row.privacy === "conservative" && <p>The recorder cannot establish precise private timings. The entire capture will be excluded from knowledge processing.</p>}
      <button disabled={Boolean(current.busy) || row.privacy === "unavailable" || row.privacy !== "public"}
        onClick={() => void change(row, "private-start")}>Start private segment</button>
      <button disabled={Boolean(current.busy) || row.privacy === "unavailable" || (row.privacy !== "private" && row.privacy !== "conservative")}
        onClick={() => void change(row, "private-end")}>End private segment</button>
    </div>)}
    {apiKey && <button disabled={Boolean(current.busy)} onClick={() => void refresh(owner.current.revision)}>Refresh privacy status</button>}
  </section>;
}

import { useRef, useState } from "react";
import { sendBotNow } from "../../api/send-now.js";
import { ApiError } from "../../api/client.js";

const MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

/** Advisory hint only (the API is the authority): returns a short warning, or null when the value looks plausible. */
export function untilHint(raw: string, now: number): string | null {
  const v = raw.trim();
  if (!v) return null;
  let at: number;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (hm) {
    const h = Number(hm[1]), m = Number(hm[2]);
    if (h > 23 || m > 59) return "Use a 24-hour time such as 18:30.";
    const d = new Date(now); d.setHours(h, m, 0, 0); at = d.getTime();
    if (at <= now) return "That time has already passed today; the server refuses past times. Use an ISO date and time with an offset to end tomorrow.";
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.test(v)) {
    at = Date.parse(v);
    if (Number.isNaN(at)) return "That is not a real date and time.";
    if (at <= now) return "That moment is in the past; the server refuses past times.";
  } else return "Use HH:MM (local time) or an ISO date and time with an offset, e.g. 2026-10-13T18:30:00+05:30.";
  return at - now > MAX_AHEAD_MS ? "More than 24 hours ahead; the server refuses that." : null;
}

type Outcome = { kind: "ok" | "error" | "denied"; text: string } | null;

function describe(e: unknown): Outcome {
  if (!(e instanceof ApiError)) return { kind: "error", text: "Could not send the bot: unexpected error. No bot was confirmed." };
  const server = e.message && !/^HTTP \d+$/.test(e.message) ? ` Server said: ${e.message.slice(0, 300)}` : "";
  switch (e.status) {
    case 400: return { kind: "error", text: `Refused (400).${server || " The link or end time was not accepted."} No bot was sent.` };
    case 403: return { kind: "denied", text: "Your key lacks the send-now scope, so this form is disabled. Ask an admin to mint a key with --with-scope send-now. You are still signed in." };
    case 409: return { kind: "error", text: "Already recording: a bot is already covering this meeting. No second bot was sent." };
    case 502: return { kind: "error", text: `The bot launcher failed to start. No bot was sent; you can try again.${server}` };
    case 503: return { kind: "error", text: `Send-now is unavailable on this server (state unreadable or not configured). No bot was sent.${server}` };
    case 401: return { kind: "error", text: "Your key was not accepted (401). Sign in again." };
    case 0: return { kind: "error", text: "Could not reach the API. No bot was confirmed." };
    default: return { kind: "error", text: `Unexpected response (HTTP ${e.status}). No bot was confirmed.` };
  }
}

/** "Send bot now": POST /calendar/send-now. A 202 only means the launcher started; the bot has not joined yet. */
export function SendNowForm({ apiKey }: { apiKey: string | null }): React.ReactElement {
  const [url, setUrl] = useState(""), [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false), [denied, setDenied] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const inFlight = useRef(false);
  const hint = untilHint(until, Date.now());
  const ready = Boolean(apiKey) && url.trim() !== "" && until.trim() !== "";
  async function submit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    if (inFlight.current || denied || !ready) return;
    inFlight.current = true; setBusy(true); setOutcome(null);
    try {
      const r = await sendBotNow(apiKey, url.trim(), until.trim());
      const id = typeof r?.jobId === "string" ? r.jobId.slice(0, 80) : "";
      setOutcome(r?.status === "launching" && id
        ? { kind: "ok", text: `Launching (job id ${id}). The launcher has started; the bot has not joined yet.` }
        : { kind: "error", text: "The server answered without a job id. No bot was confirmed." });
    } catch (e) {
      const o = describe(e);
      if (o?.kind === "denied") setDenied(true);
      setOutcome(o);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="card" aria-label="Send bot now">
    <h2>Send bot now</h2>
    <p>Send the bot to a meeting that is live now. Requires a key with the send-now scope. The server checks the link and end time and has the final say.</p>
    <form onSubmit={submit}>
      <label htmlFor="send-now-url">Meeting URL</label>
      <input id="send-now-url" type="url" value={url} maxLength={2048} autoComplete="off" disabled={denied} onChange={e => setUrl(e.target.value)} />
      <label htmlFor="send-now-until">Record until</label>
      <input id="send-now-until" type="text" value={until} maxLength={64} autoComplete="off" placeholder="HH:MM or 2026-10-13T18:30:00+05:30" disabled={denied} onChange={e => setUntil(e.target.value)} />
      <p role="note" id="send-now-hint">{hint ?? "HH:MM (your local time, today) or an ISO date and time with an offset; in the future, at most 24 hours ahead."}</p>
      <button type="submit" disabled={busy || denied || !ready}>{busy ? "Sending..." : "Send bot now"}</button>
    </form>
    {outcome && <p role={outcome.kind === "ok" ? "status" : "alert"}>{outcome.text}</p>}
  </section>;
}

import { Link } from "react-router-dom";
import { safeHttpUrl } from "../../safe-url.js";
import type { AskResponse } from "../../api/types.js";
import { NativeEvidence } from "../../components/NativeEvidence.js";
import { parseNativeSourceLocator, type NativeSourceLocator } from "../../api/nativeEvidence.js";

export function AnswerSources({ answer, excerpts = true }: { answer: Pick<AskResponse, "sources">; excerpts?: boolean }): React.ReactElement {
  return <><section className="card"><h2>Internal sources ({answer.sources.internal.length})</h2>
    {!answer.sources.internal.length && <p>None.</p>}
    {answer.sources.internal.map((source) => {
      const session = source.evidence?.sessionRef;
      const raw = source.evidence?.sourceQuotes;
      const quotes = Array.isArray(raw) ? raw.filter((q): q is Record<string, unknown> => q !== null && typeof q === "object") : [];
      const candidates = [source.evidence?.sourceLocator, ...quotes.map(q => q.sourceLocator)];
      const isNative = candidates.some(v => v !== undefined && !(v && typeof v === "object" && (v as Record<string, unknown>).kind === "transcript"))
        || quotes.some(q => q.origin === "document-page" || q.origin === "message");
      if (isNative) {
        const locators = new Map<string, NativeSourceLocator>();
        for (const candidate of candidates) {
          const locator = parseNativeSourceLocator(candidate);
          if (locator) locators.set(JSON.stringify(locator), locator);
        }
        return <article key={source.node_id}><h3>{source.node_id}</h3>
          {excerpts && [...locators.values()].map(locator => <NativeEvidence key={JSON.stringify(locator)} sourceLocator={locator} />)}
          {!locators.size && <p>This source passage is unavailable.</p>}
        </article>;
      }
      return <article key={source.node_id}><h3>{typeof session === "string" && session.trim()
        ? <Link to={`/sessions/${encodeURIComponent(session)}`}>{source.node_id}</Link> : source.node_id}</h3>
        {!quotes.length && <p>Original excerpt and moment provenance are unavailable.</p>}
        {excerpts && quotes.map((q, index) => <div key={typeof q.id === "string" ? q.id : index}>
          <blockquote>{typeof q.quote === "string" ? q.quote : "Excerpt unavailable"}</blockquote>
          <p>{typeof q.speakerRef === "string" ? q.speakerRef : "Speaker unavailable"} · {typeof q.tStart === "number" ? `${q.tStart}s` : "Time unavailable"}
            {typeof q.tEnd === "number" ? `–${q.tEnd}s` : ""} · {typeof q.origin === "string" ? q.origin : "Origin unavailable"}</p>
          {typeof session === "string" && typeof q.turnId === "string" && <Link to={`/sessions/${encodeURIComponent(session)}#turn-${encodeURIComponent(q.turnId)}`}>Open cited turn and available recording evidence</Link>}
        </div>)}
      </article>;
    })}</section>
    <section className="card"><h2>Web sources ({answer.sources.web.length})</h2>
      {!answer.sources.web.length && <p>None.</p>}
      {answer.sources.web.map((source, index) => {
        const url = safeHttpUrl(source.url), title = typeof source.title === "string" ? source.title : "Web source";
        const excerpt = [source.content, source.snippet, source.text].filter((v): v is string => typeof v === "string").join("\n");
        return <article key={index}>{url ? <a href={url} target="_blank" rel="noreferrer">{title}</a> : <span>{title} (link unavailable)</span>}
          {excerpts && <blockquote>{excerpt || "Original excerpt unavailable."}</blockquote>}</article>;
      })}</section></>;
}

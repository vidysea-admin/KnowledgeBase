import type { ReactNode } from "react";
import type { Loaded } from "./useLoad.js";
import { describeLoadError } from "./model.js";

interface FrameProps {
  title: string;
  /** Short lower-case name used in messages, e.g. "upcoming meetings". */
  label: string;
  scope: string;
  state: Loaded<unknown>;
  note?: string;
  /** Rendered once data (or stale data) exists. */
  children: ReactNode;
  /** Text shown while loading / without a key. */
  hasData: boolean;
}

/** Shared per-section shell: its own loading, error (with a one-fetch-per-click retry) and no-key states. A section never reads another section's state. */
export function SectionFrame({ title, label, scope, state, note, children, hasData }: FrameProps): React.ReactElement {
  const id = `mb-${label.replace(/\W+/g, "-")}`;
  return <section aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    {note && <p className="row-meta">{note}</p>}
    {state.noKey && <p>Enter an API key to load {label}.</p>}
    {!state.noKey && state.loading && <p>Loading {label}…</p>}
    {!state.noKey && !state.loading && state.error !== null && <div role="alert" className="card error-note">
      <p>{describeLoadError(state.error, scope, label[0]!.toUpperCase() + label.slice(1))}{hasData ? " Previously loaded rows may be stale." : ""}</p>
      <button type="button" onClick={state.reload}>Retry {label}</button>
    </div>}
    {!state.noKey && !state.loading && (hasData || state.error === null) && children}
  </section>;
}

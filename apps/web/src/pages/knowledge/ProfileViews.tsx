import { Link } from "react-router-dom";
import type { SessionSummary } from "../../api/types.js";
import { ProfileEvidenceList } from "./ProfileEvidenceList.js";
import { sessionHref, type Profile } from "./profileModel.js";

const LIMIT = 100;
const href = (tab: string, id: string) => `/knowledge/profiles?${new URLSearchParams({ tab, id })}`;

export function ProfileList({ tab, nodes }: { tab: string; nodes: { id: string; label: string }[] }): React.ReactElement {
  if (!nodes.length) return <p>No {tab === "topics" ? "topics" : "speakers"} were returned in the graph.</p>;
  return <><ul>{nodes.slice(0, LIMIT).map(n => <li key={n.id}><Link to={href(tab, n.id)}>{n.label || "Unnamed"}</Link></li>)}</ul>
    {nodes.length > LIMIT && <p>Showing {LIMIT} of {nodes.length}. Use the filter.</p>}</>;
}

export function ProfileDetail({ profile, tab, sessions, claimsNote }: { profile: Profile; tab: string; sessions: SessionSummary[]; claimsNote: string | null }): React.ReactElement {
  const titles = new Map(sessions.map(s => [s._id, s.title]));
  const speaker = tab === "speakers";
  return <article aria-label={speaker ? "Speaker profile" : "Topic profile"} style={{ overflowWrap: "anywhere" }}>
    <h2>{profile.node.label || "Unnamed"}</h2>
    <p>{speaker ? "Name taken from the graph. It does not confirm identity, role or that this person is a counsellor." : "Topic from the returned graph; relevance to admissions, study abroad or courses is not verified."}</p>
    <h3>Appears in {profile.sessions.length} sessions</h3>
    {!profile.sessions.length && <p>No session could be linked unambiguously.</p>}
    <ul>{profile.sessions.slice(0, LIMIT).map(s => <li key={s._id}><Link to={sessionHref(s._id)}>{s.title || "Untitled session"}</Link> · {s.date.slice(0, 10) || "date unavailable"}</li>)}</ul>
    {!speaker && <><h3>Claims tagged with this topic</h3>
      {claimsNote && <p role="status">{claimsNote}</p>}
      {!profile.claims.length ? <p>No claims are tagged with this topic.</p> : <><p>{profile.claims.length} tagged claims.</p><ProfileEvidenceList refs={profile.claimEvidence} titles={titles} /></>}</>}
    <h3>Evidence ({profile.evidence.length})</h3>
    {profile.unresolvedEvidence > 0 && <p>{profile.unresolvedEvidence} evidence references were withheld because their session could not be determined.</p>}
    <ProfileEvidenceList refs={profile.evidence} titles={titles} />
    <h3>Relationships</h3>
    {!profile.relationships.length && <p>No relationships were returned.</p>}
    <ul>{profile.relationships.slice(0, LIMIT).map(({ edge, neighbour }, i) => <li key={i}>{edge.type} · {neighbour ? neighbour.label || "Unnamed" : "Related entity unavailable"} · {edge.inferred ? "Inferred" : "Stated"}</li>)}</ul>
    <Link to={`/knowledge?${new URLSearchParams({ entity: profile.node.id })}`}>Open in directory</Link>
  </article>;
}

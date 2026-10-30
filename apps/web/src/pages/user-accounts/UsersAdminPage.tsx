/** apps/web/src/pages/user-accounts/UsersAdminPage.tsx -- unit ua-web, UA-5 / UA-8. The approval queue and user list. Authorization is the server's (admin session); this page only renders what it is given. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { describeAuthError, listUsers, ROLES, USER_STATUSES, userAction, type AdminUser, type Role, type UserStatus } from "../../api/user-accounts.js";

export function UsersAdminPage(): ReactNode {
  const [status, setStatus] = useState<UserStatus>("pending");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});

  const load = useCallback(async (cursor?: string) => {
    try {
      const page = await listUsers({ status, ...(cursor ? { cursor } : {}) });
      setUsers((prev) => (cursor && prev ? [...prev, ...page.users] : page.users));
      setNext(page.next); setPendingCount(page.pendingCount); setError(null);
    } catch (err) { setError(describeAuthError(err)); setUsers(null); }
  }, [status]);
  useEffect(() => { setUsers(null); void load(); }, [load]);

  async function decide(id: string, a: "approve" | "reject"): Promise<void> {
    try {
      await (a === "approve" ? userAction(id, { action: "approve", role: roles[id] ?? "member" }) : userAction(id, { action: "reject" }));
      await load();
    } catch (err) { setError(describeAuthError(err)); }
  }

  return (
    <div>
      <div className="page-header"><h1>Users</h1><p>{pendingCount} waiting for approval · these are account roles; API-key (hosting) roles are separate.</p></div>
      <div role="tablist" aria-label="Filter by status">
        {USER_STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={s === status} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      <section className="card">
        {error && <p role="alert" className="error-note">{error}</p>}
        {users === null && !error && <p className="empty-note">Loading…</p>}
        {users?.length === 0 && <p className="empty-note">No {status} users.</p>}
        {users?.map((u) => (
          <div key={u.id} className="row-card">
            <div className="row-title"><Link to={`/admin/users/${encodeURIComponent(u.id)}`}>{u.displayName}</Link> <span className="badge">{u.status}</span></div>
            <div className="row-meta">{u.email}{u.role ? ` · ${u.role}` : ""}{u.mailStatus === "not_sent" ? " · mail not sent" : ""}</div>
            {u.status === "pending" && (
              <div>
                <label>Role for {u.displayName}{" "}
                  <select value={roles[u.id] ?? "member"} onChange={(e) => setRoles((r) => ({ ...r, [u.id]: e.target.value as Role }))}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>{" "}
                <button type="button" onClick={() => void decide(u.id, "approve")}>Approve</button>{" "}
                <button type="button" onClick={() => void decide(u.id, "reject")}>Reject</button>
              </div>
            )}
          </div>
        ))}
        {next && <button type="button" onClick={() => void load(next)}>Load more</button>}
      </section>
    </div>
  );
}
